import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, assertAllowedOrigin, errorResponse, json, options, requireMethod } from "../_shared/http.ts";
import { generateOfferToken, sha256Hex } from "../_shared/crypto.ts";
import { validateFile } from "../_shared/files.ts";
import { emailProviderMode, escapeHtml, sendTransactionalEmail } from "../_shared/email.ts";

const transitions: Record<string, string[]> = {
  NEW: ["REVIEW", "DECLINED"],
  REVIEW: ["DESIGN", "DECLINED"],
  DESIGN: ["DECLINED"],
  PAID: ["PRODUCTION"],
  PRODUCTION: ["READY"],
  READY: ["DELIVERED"],
};

function stringValue(value: unknown, name: string, min: number, max: number) {
  const normalized = String(value ?? "").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, "invalid_offer", `${name} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function uuid(value: unknown, name: string) {
  const normalized = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ApiError(400, "invalid_id", `${name} is invalid.`);
  }
  return normalized;
}

async function manager(ctx: any) {
  const { data, error } = await ctx.supabase.auth.getUser();
  if (error || data.user?.app_metadata?.role !== "manager") {
    throw new ApiError(403, "manager_required", "Manager access is required.");
  }
  return data.user;
}

async function signedAttachment(admin: any, attachment: any) {
  const { data, error } = await admin.storage
    .from(attachment.bucket_id)
    .createSignedUrl(attachment.object_path, 900, { download: false });
  if (error) throw error;
  return {
    id: attachment.id,
    name: attachment.original_name,
    mimeType: attachment.mime_type,
    url: data.signedUrl,
    expiresIn: 900,
  };
}

async function listQueue(admin: any) {
  const { data, error } = await admin.from("requests").select(`
    id, public_reference, created_at, updated_at, customer_name, email, phone, location,
    request_type, project_description, rough_dimensions, intended_use, budget_range,
    requested_timeline, requested_date, privacy_version, consent_accepted_at, status,
    internal_notes, ready_instructions,
    attachments:request_attachments(id, bucket_id, object_path, original_name, mime_type),
    offers(
      id, version, created_at, updated_at, issued_at, status, project_title, specification,
      materials_finish, price_minor, delivery_charge_minor, total_minor, currency,
      vat_treatment, delivery_terms, production_window, expires_at, terms_version,
      terms_snapshot, accepted_at,
      attachments:offer_attachments(id, bucket_id, object_path, original_name, mime_type),
      payments:payments!payments_offer_id_fkey(id, provider, payment_method, provider_reference, status, amount_minor,
        paid_amount_minor, refunded_amount_minor, currency, initiated_at, paid_at, refunded_at)
    )
  `).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;

  return await Promise.all(data.map(async (request: any) => ({
    ...request,
    attachments: await Promise.all((request.attachments ?? []).map((item: any) => signedAttachment(admin, item))),
    offers: await Promise.all((request.offers ?? []).map(async (offer: any) => ({
      ...offer,
      attachments: await Promise.all((offer.attachments ?? []).map((item: any) => signedAttachment(admin, item))),
    }))),
  })));
}

async function recordEmailResult(admin: any, notificationId: string, email: Parameters<typeof sendTransactionalEmail>[0]) {
  try {
    const result = await sendTransactionalEmail(email);
    await admin.from("notifications").update({
      status: "SENT", provider_message_id: result.id, attempts: 1,
      last_error: null, sent_at: new Date().toISOString(),
    }).eq("id", notificationId);
    return true;
  } catch (error) {
    await admin.from("notifications").update({
      status: "FAILED", attempts: 1,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Email failed",
    }).eq("id", notificationId);
    return false;
  }
}

async function updateRequest(admin: any, user: any, body: any) {
  const requestId = uuid(body.requestId, "requestId");
  const { data: current, error } = await admin.from("requests")
    .select("id, status, public_reference, customer_name, email")
    .eq("id", requestId).single();
  if (error) throw error;

  const nextStatus = body.status ? String(body.status) : current.status;
  if (nextStatus !== current.status && !(transitions[current.status] ?? []).includes(nextStatus)) {
    throw new ApiError(409, "invalid_transition", `${current.status} cannot transition to ${nextStatus}.`);
  }
  const internalNotes = body.internalNotes == null ? null : String(body.internalNotes).trim().slice(0, 20000);
  const readyInstructions = body.readyInstructions == null ? null : String(body.readyInstructions).trim().slice(0, 4000);
  if (nextStatus === "READY" && !readyInstructions) {
    throw new ApiError(400, "ready_instructions_required", "Pickup or delivery instructions are required for READY.");
  }
  if (["READY", "DECLINED"].includes(nextStatus) && emailProviderMode() === "disabled") {
    throw new ApiError(503, "email_not_configured", "Transactional email is required for this status update.");
  }

  const { data: updated, error: updateError } = await admin.from("requests").update({
    status: nextStatus,
    internal_notes: internalNotes,
    ready_instructions: readyInstructions,
  }).eq("id", requestId).eq("status", current.status).select("*").single();
  if (updateError) throw updateError;

  if (nextStatus !== current.status) {
    await admin.from("status_history").insert({
      request_id: requestId,
      from_status: current.status,
      to_status: nextStatus,
      actor_user_id: user.id,
      source: "manager",
    });
  }

  let notificationSent: boolean | null = null;
  if (["READY", "DECLINED"].includes(nextStatus) && nextStatus !== current.status) {
    const eventType = nextStatus === "READY" ? "ORDER_READY_CUSTOMER" : "REQUEST_DECLINED_CUSTOMER";
    const { data: notification, error: notificationError } = await admin.from("notifications").upsert({
      idempotency_key: `request:${requestId}:${eventType.toLowerCase()}`,
      event_type: eventType,
      request_id: requestId,
      recipient_email: current.email,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
    if (notificationError) throw notificationError;
    const notificationId = notification?.id ?? (
      await admin.from("notifications").select("id")
        .eq("idempotency_key", `request:${requestId}:${eventType.toLowerCase()}`).single()
    ).data.id;
    const ready = nextStatus === "READY";
    notificationSent = await recordEmailResult(admin, notificationId, {
      to: current.email,
      subject: ready ? `Your order is ready — ${current.public_reference}` : `Request update — ${current.public_reference}`,
      text: ready
        ? `Your order ${current.public_reference} is ready. ${readyInstructions}`
        : `Thank you for request ${current.public_reference}. We are unable to accept this project.`,
      html: ready
        ? `<p>Hello ${escapeHtml(current.customer_name)},</p><p>Your order <strong>${escapeHtml(current.public_reference)}</strong> is ready.</p><p>${escapeHtml(readyInstructions)}</p>`
        : `<p>Hello ${escapeHtml(current.customer_name)},</p><p>Thank you for request <strong>${escapeHtml(current.public_reference)}</strong>. We are unable to accept this project.</p>`,
    });
  }

  return { request: updated, notificationSent };
}

function offerValues(body: any) {
  const priceMinor = Number(body.priceMinor);
  const deliveryChargeMinor = Number(body.deliveryChargeMinor ?? 0);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || !Number.isSafeInteger(deliveryChargeMinor) || deliveryChargeMinor < 0) {
    throw new ApiError(400, "invalid_offer_amount", "Offer amounts must be non-negative integer minor units.");
  }
  const expiresAt = new Date(String(body.expiresAt ?? ""));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_offer_expiry", "Offer expiry must be in the future.");
  }
  return {
    project_title: stringValue(body.projectTitle, "projectTitle", 2, 240),
    specification: stringValue(body.specification, "specification", 20, 20000),
    materials_finish: stringValue(body.materialsFinish, "materialsFinish", 2, 4000),
    price_minor: priceMinor,
    delivery_charge_minor: deliveryChargeMinor,
    currency: "NOK",
    vat_treatment: stringValue(body.vatTreatment, "vatTreatment", 2, 500),
    delivery_terms: stringValue(body.deliveryTerms, "deliveryTerms", 2, 4000),
    production_window: stringValue(body.productionWindow, "productionWindow", 2, 1000),
    expires_at: expiresAt.toISOString(),
    terms_version: stringValue(body.termsVersion, "termsVersion", 1, 80),
    terms_snapshot: stringValue(body.termsSnapshot, "termsSnapshot", 20, 30000),
  };
}

async function saveOffer(admin: any, user: any, body: any) {
  const requestId = uuid(body.requestId, "requestId");
  const values = offerValues(body);
  const { data: request, error: requestError } = await admin.from("requests").select("status").eq("id", requestId).single();
  if (requestError) throw requestError;
  if (request.status !== "DESIGN") {
    throw new ApiError(409, "request_not_in_design", "Move the request to DESIGN before preparing an offer.");
  }

  if (body.offerId) {
    const offerId = uuid(body.offerId, "offerId");
    const { data, error } = await admin.from("offers").update(values)
      .eq("id", offerId).eq("request_id", requestId).eq("status", "DRAFT")
      .select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(409, "offer_immutable", "Only draft offers can be edited.");
    return data;
  }

  const { data: previous } = await admin.from("offers").select("version")
    .eq("request_id", requestId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("offers").insert({
    request_id: requestId,
    version: (previous?.version ?? 0) + 1,
    created_by: user.id,
    ...values,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function uploadOfferAsset(admin: any, form: FormData) {
  const offerId = uuid(form.get("offerId"), "offerId");
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "file_required", "Choose one file.");
  const { data: offer, error } = await admin.from("offers").select("id, status").eq("id", offerId).single();
  if (error) throw error;
  if (offer.status !== "DRAFT") throw new ApiError(409, "offer_immutable", "Issued offer files cannot be changed.");
  const prepared = await validateFile(file);
  const path = `${offerId}/${crypto.randomUUID()}.${prepared.extension}`;
  const { error: uploadError } = await admin.storage.from("offer-assets")
    .upload(path, prepared.bytes, { contentType: prepared.mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { data: attachment, error: insertError } = await admin.from("offer_attachments").insert({
    offer_id: offerId,
    object_path: path,
    original_name: prepared.originalName,
    mime_type: prepared.mimeType,
    size_bytes: prepared.sizeBytes,
    sha256: prepared.sha256,
  }).select("*").single();
  if (insertError) {
    await admin.storage.from("offer-assets").remove([path]);
    throw insertError;
  }
  return await signedAttachment(admin, attachment);
}

async function sendOffer(admin: any, user: any, body: any) {
  if (body.bataApprovalConfirmed !== true) {
    throw new ApiError(
      400,
      "bata_approval_required",
      "Confirm that Bata approved this project and production period before sending the offer.",
    );
  }
  if (emailProviderMode() === "disabled") {
    throw new ApiError(503, "email_not_configured", "Transactional email must be configured before sending an offer.");
  }
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) throw new ApiError(503, "site_url_missing", "SITE_URL is required.");
  const offerId = uuid(body.offerId, "offerId");
  const { data: offer, error } = await admin.from("offers").select(`
    id, request_id, version, status, project_title, production_window, total_minor, currency, expires_at,
    request:requests!inner(public_reference, customer_name, email, status)
  `).eq("id", offerId).single();
  if (error) throw error;
  if (offer.status !== "DRAFT") throw new ApiError(409, "offer_immutable", "Only a draft offer can be sent.");
  if (offer.request.status !== "DESIGN") throw new ApiError(409, "request_not_in_design", "Request must be in DESIGN.");
  if (new Date(offer.expires_at).getTime() <= Date.now()) throw new ApiError(409, "offer_expired", "Set a future expiry first.");
  if (offer.total_minor <= 0) throw new ApiError(409, "invalid_offer_amount", "Offer total must be greater than zero.");

  const token = generateOfferToken();
  const tokenHash = await sha256Hex(token);
  const { data: issuedOffer, error: issueError } = await admin.from("offers").update({
    status: "SENT",
    issued_at: new Date().toISOString(),
    approved_by: user.id,
    public_token_hash: tokenHash,
  }).eq("id", offerId).eq("status", "DRAFT").select("id").maybeSingle();
  if (issueError) throw issueError;
  if (!issuedOffer) throw new ApiError(409, "offer_immutable", "The offer was already issued or changed.");

  const offerUrl = `${siteUrl.replace(/\/$/, "")}/#/offer/${encodeURIComponent(token)}`;
  const { data: notification, error: notificationError } = await admin.from("notifications").insert({
    idempotency_key: `offer:${offerId}:v${offer.version}:sent`,
    event_type: "OFFER_SENT_CUSTOMER",
    request_id: offer.request_id,
    offer_id: offerId,
    recipient_email: offer.request.email,
  }).select("id").single();
  if (notificationError) throw notificationError;
  const money = new Intl.NumberFormat("nb-NO", { style: "currency", currency: offer.currency }).format(offer.total_minor / 100);
  const emailSent = await recordEmailResult(admin, notification.id, {
    to: offer.request.email,
    subject: `Private offer ${offer.request.public_reference}`,
    text: `Hello ${offer.request.customer_name}. Your private offer for ${offer.project_title} is ready: ${offerUrl} Total: ${money}. Agreed production period: ${offer.production_window}. Expires ${offer.expires_at}.`,
    html: `<p>Hello ${escapeHtml(offer.request.customer_name)},</p><p>Your private offer for <strong>${escapeHtml(offer.project_title)}</strong> is ready.</p><p><a href="${escapeHtml(offerUrl)}">Review the private offer</a></p><p>Total: ${escapeHtml(money)}. Agreed production period: ${escapeHtml(offer.production_window)}. Expires ${escapeHtml(offer.expires_at)}.</p>`,
  });
  return {
    issued: true,
    emailSent,
    previewUrl: emailProviderMode() === "log" ? offerUrl : undefined,
  };
}

async function resendOffer(admin: any, body: any) {
  if (emailProviderMode() === "disabled") {
    throw new ApiError(503, "email_not_configured", "Transactional email must be configured before resending an offer.");
  }
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) throw new ApiError(503, "site_url_missing", "SITE_URL is required.");
  const offerId = uuid(body.offerId, "offerId");
  const { data: offer, error } = await admin.from("offers").select(`
    id, request_id, version, status, project_title, total_minor, currency, expires_at,
    request:requests!inner(public_reference, customer_name, email)
  `).eq("id", offerId).single();
  if (error) throw error;
  if (offer.status !== "SENT" || new Date(offer.expires_at).getTime() <= Date.now()) {
    throw new ApiError(409, "offer_not_active", "Only an active sent offer can be resent.");
  }

  const token = generateOfferToken();
  const offerUrl = `${siteUrl.replace(/\/$/, "")}/#/offer/${encodeURIComponent(token)}`;
  const { data: rotatedOffer, error: rotateError } = await admin.from("offers")
    .update({ public_token_hash: await sha256Hex(token) })
    .eq("id", offerId).eq("status", "SENT")
    .select("id").maybeSingle();
  if (rotateError) throw rotateError;
  if (!rotatedOffer) throw new ApiError(409, "offer_not_active", "The offer is no longer active.");

  const attempt = crypto.randomUUID();
  const { data: notification, error: notificationError } = await admin.from("notifications").insert({
    idempotency_key: `offer:${offerId}:resend:${attempt}`,
    event_type: "OFFER_RESENT_CUSTOMER",
    request_id: offer.request_id,
    offer_id: offerId,
    recipient_email: offer.request.email,
  }).select("id").single();
  if (notificationError) throw notificationError;
  const money = new Intl.NumberFormat("nb-NO", { style: "currency", currency: offer.currency }).format(offer.total_minor / 100);
  const emailSent = await recordEmailResult(admin, notification.id, {
    to: offer.request.email,
    subject: `Private offer ${offer.request.public_reference}`,
    text: `Your current private offer link is: ${offerUrl} Total: ${money}. Expires ${offer.expires_at}. Previous links no longer work.`,
    html: `<p>Hello ${escapeHtml(offer.request.customer_name)},</p><p>Use this current private link for <strong>${escapeHtml(offer.project_title)}</strong>. Previous links no longer work.</p><p><a href="${escapeHtml(offerUrl)}">Review the private offer</a></p><p>Total: ${escapeHtml(money)}. Expires ${escapeHtml(offer.expires_at)}.</p>`,
  });
  return { emailSent, previewUrl: emailProviderMode() === "log" ? offerUrl : undefined };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return options(req);
    try {
      assertAllowedOrigin(req);
      requireMethod(req, "POST");
      const user = await manager(ctx);
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.startsWith("multipart/form-data")) {
        const form = await req.formData();
        if (form.get("action") !== "upload_offer_asset") {
          throw new ApiError(400, "unknown_action", "Unknown admin action.");
        }
        return json(req, { attachment: await uploadOfferAsset(ctx.supabaseAdmin, form) }, 201);
      }

      const body = await req.json();
      switch (body.action) {
        case "list":
          return json(req, { requests: await listQueue(ctx.supabaseAdmin) });
        case "set_request":
          return json(req, await updateRequest(ctx.supabaseAdmin, user, body));
        case "save_offer":
          return json(req, { offer: await saveOffer(ctx.supabaseAdmin, user, body) });
        case "send_offer":
          return json(req, await sendOffer(ctx.supabaseAdmin, user, body));
        case "resend_offer":
          return json(req, await resendOffer(ctx.supabaseAdmin, body));
        default:
          throw new ApiError(400, "unknown_action", "Unknown admin action.");
      }
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
