import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, assertAllowedOrigin, errorResponse, json, options, requireMethod } from "../_shared/http.ts";
import { generatePublicReference, hmacSha256Hex } from "../_shared/crypto.ts";
import { MAX_FILES, validateFile, validateFileBatch } from "../_shared/files.ts";
import {
  emailProviderMode,
  escapeHtml,
  internalEmail,
  sendTransactionalEmail,
} from "../_shared/email.ts";

const requestTypes = new Set([
  "Custom furniture",
  "Artistic wood piece",
  "Wood burning / burned design",
  "Home object",
  "Gift / personal piece",
  "Selected carpentry request",
  "Other",
]);

function textField(form: FormData, name: string, options: { required?: boolean; max?: number; min?: number } = {}) {
  const value = String(form.get(name) ?? "").trim();
  const { required = false, max = 1000, min = required ? 1 : 0 } = options;
  if (required && !value) throw new ApiError(400, "invalid_form", `${name} is required.`);
  if (value.length < min || value.length > max) {
    throw new ApiError(400, "invalid_form", `${name} must be between ${min} and ${max} characters.`);
  }
  return value || null;
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function updateNotification(admin: any, id: string, promise: Promise<{ id: string }>) {
  try {
    const result = await promise;
    await admin.from("notifications").update({
      status: "SENT",
      provider_message_id: result.id,
      attempts: 1,
      sent_at: new Date().toISOString(),
    }).eq("id", id);
    return true;
  } catch (error) {
    await admin.from("notifications").update({
      status: "FAILED",
      attempts: 1,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Email failed",
    }).eq("id", id);
    return false;
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return options(req);

    try {
      const admin: any = ctx.supabaseAdmin;
      assertAllowedOrigin(req);
      requireMethod(req, "POST");

      const contentType = req.headers.get("content-type") ?? "";
      if (!contentType.startsWith("multipart/form-data")) {
        throw new ApiError(415, "invalid_content_type", "Use multipart/form-data.");
      }

      const privacyVersion = Deno.env.get("PRIVACY_VERSION");
      const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");
      if (!privacyVersion || !rateLimitSalt || emailProviderMode() === "disabled") {
        throw new ApiError(503, "service_not_configured", "The request service is not configured for live use.");
      }

      const submissionKey = req.headers.get("idempotency-key") ?? "";
      if (!validUuid(submissionKey)) {
        throw new ApiError(400, "invalid_idempotency_key", "A valid idempotency key is required.");
      }

      const { data: existing } = await admin
        .from("requests")
        .select("public_reference")
        .eq("submission_key", submissionKey)
        .maybeSingle();
      if (existing) return json(req, { reference: existing.public_reference, duplicate: true }, 200);

      const forwardedIp = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown")
        .split(",")[0]
        .trim();
      const ipHash = await hmacSha256Hex(rateLimitSalt, forwardedIp);
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await admin
        .from("rate_limit_events")
        .select("id", { count: "exact", head: true })
        .eq("key_hash", ipHash)
        .eq("action", "submit-request")
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count ?? 0) >= 5) throw new ApiError(429, "rate_limited", "Too many requests. Please try again later.");

      const form = await req.formData();
      const customerName = textField(form, "name", { required: true, min: 2, max: 160 })!;
      const email = textField(form, "email", { required: true, min: 3, max: 320 })!.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "invalid_email", "Enter a valid email address.");
      }
      const requestType = textField(form, "requestType", { required: true, max: 120 })!;
      if (!requestTypes.has(requestType)) throw new ApiError(400, "invalid_request_type", "Choose a valid request type.");

      const acceptedPrivacyVersion = textField(form, "privacyVersion", { required: true, max: 80 });
      if (form.get("privacyAccepted") !== "true" || acceptedPrivacyVersion !== privacyVersion) {
        throw new ApiError(400, "privacy_consent_required", "Current privacy consent is required.");
      }

      const requestedDateRaw = textField(form, "requestedDate", { max: 10 });
      if (requestedDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDateRaw)) {
        throw new ApiError(400, "invalid_requested_date", "Requested date must use YYYY-MM-DD.");
      }

      const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
      validateFileBatch(files);
      if (files.length > MAX_FILES) throw new ApiError(400, "too_many_attachments", "Too many attachments.");
      const preparedFiles = await Promise.all(files.map(validateFile));

      await admin.from("rate_limit_events").insert({ key_hash: ipHash, action: "submit-request" });

      let createdRequest: any = null;
      for (let attempt = 0; attempt < 3 && !createdRequest; attempt += 1) {
        const { data, error } = await admin.from("requests").insert({
          public_reference: generatePublicReference(),
          submission_key: submissionKey,
          customer_name: customerName,
          email,
          phone: textField(form, "phone", { max: 40 }),
          location: textField(form, "location", { required: true, min: 2, max: 240 }),
          request_type: requestType,
          project_description: textField(form, "description", { required: true, min: 20, max: 8000 }),
          rough_dimensions: textField(form, "dimensions", { max: 1000 }),
          intended_use: textField(form, "intendedUse", { max: 2000 }),
          budget_range: textField(form, "budget", { max: 120 }),
          requested_timeline: textField(form, "timeline", { max: 240 }),
          requested_date: requestedDateRaw,
          privacy_version: privacyVersion,
          consent_accepted_at: new Date().toISOString(),
          consent_ip_hash: ipHash,
          consent_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500) || null,
        }).select("id, public_reference, created_at").single();

        if (!error) createdRequest = data;
        else if (error.code === "23505") {
          const { data: concurrent } = await admin.from("requests")
            .select("id, public_reference, created_at")
            .eq("submission_key", submissionKey)
            .maybeSingle();
          if (concurrent) return json(req, { reference: concurrent.public_reference, duplicate: true }, 200);
        } else throw error;
      }
      if (!createdRequest) throw new ApiError(409, "reference_collision", "Please retry the request.");

      const uploadedPaths: string[] = [];
      try {
        for (const file of preparedFiles) {
          const path = `${createdRequest.id}/${crypto.randomUUID()}.${file.extension}`;
          const { error: uploadError } = await admin.storage
            .from("request-attachments")
            .upload(path, file.bytes, { contentType: file.mimeType, upsert: false });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);

          const { error: attachmentError } = await admin.from("request_attachments").insert({
            request_id: createdRequest.id,
            object_path: path,
            original_name: file.originalName,
            mime_type: file.mimeType,
            size_bytes: file.sizeBytes,
            sha256: file.sha256,
          });
          if (attachmentError) throw attachmentError;
        }
      } catch (error) {
        if (uploadedPaths.length) {
          await admin.storage.from("request-attachments").remove(uploadedPaths);
        }
        await admin.from("requests").delete().eq("id", createdRequest.id);
        throw error;
      }

      await admin.from("status_history").insert({
        request_id: createdRequest.id,
        from_status: null,
        to_status: "NEW",
        source: "request",
      });

      const ownerEmail = internalEmail();
      const { data: notificationRows, error: notificationError } = await admin
        .from("notifications")
        .insert([
          {
            idempotency_key: `request:${createdRequest.id}:customer-confirmation`,
            event_type: "REQUEST_RECEIVED_CUSTOMER",
            request_id: createdRequest.id,
            recipient_email: email,
          },
          {
            idempotency_key: `request:${createdRequest.id}:internal-notification`,
            event_type: "REQUEST_RECEIVED_INTERNAL",
            request_id: createdRequest.id,
            recipient_email: ownerEmail,
          },
        ])
        .select("id, event_type");
      if (notificationError) throw notificationError;

      const safeReference = escapeHtml(createdRequest.public_reference);
      const safeName = escapeHtml(customerName);
      const customerRow = notificationRows.find((row: any) => row.event_type === "REQUEST_RECEIVED_CUSTOMER");
      const internalRow = notificationRows.find((row: any) => row.event_type === "REQUEST_RECEIVED_INTERNAL");
      if (!customerRow?.id || !internalRow?.id) {
        throw new ApiError(500, "notification_missing", "Request notifications could not be created.");
      }
      const deliveries = await Promise.all([
        updateNotification(admin, customerRow.id, sendTransactionalEmail({
          to: email,
          subject: `We received request ${createdRequest.public_reference}`,
          text: `Hello ${customerName}, we received request ${createdRequest.public_reference}. Every request is reviewed individually; submission does not guarantee acceptance. We will send one offer link if the project is selected.`,
          html: `<p>Hello ${safeName},</p><p>We received request <strong>${safeReference}</strong>.</p><p>Every request is reviewed individually; submission does not guarantee acceptance. If selected, you will receive one private offer link.</p>`,
        })),
        updateNotification(admin, internalRow.id, sendTransactionalEmail({
          to: ownerEmail,
          subject: `New request ${createdRequest.public_reference}`,
          text: `New ${requestType} request from ${customerName}. Review it in the Bata order queue.`,
          html: `<p>New <strong>${escapeHtml(requestType)}</strong> request from ${safeName}.</p><p>Reference: ${safeReference}. Review it in the Bata order queue.</p>`,
        })),
      ]);

      return json(req, {
        reference: createdRequest.public_reference,
        receivedAt: createdRequest.created_at,
        confirmationEmailSent: deliveries[0],
      }, 201);
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
