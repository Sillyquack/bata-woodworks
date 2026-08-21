import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, errorResponse, json, requireMethod } from "../_shared/http.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { escapeHtml, internalEmail, sendTransactionalEmail } from "../_shared/email.ts";
import {
  assertVippsMerchant,
  captureVippsPayment,
  getVippsPayment,
  verifyVippsWebhook,
} from "../_shared/vipps.ts";

const knownEvents = new Set([
  "CREATED", "AUTHORIZED", "CAPTURED", "CANCELLED", "REFUNDED",
  "ABORTED", "EXPIRED", "TERMINATED",
]);

async function deliverNotification(admin: any, id: string, message: Parameters<typeof sendTransactionalEmail>[0]) {
  const { data: notification } = await admin.from("notifications").select("status, attempts").eq("id", id).single();
  if (notification?.status === "SENT") return true;
  try {
    const result = await sendTransactionalEmail(message);
    await admin.from("notifications").update({
      status: "SENT",
      provider_message_id: result.id,
      attempts: (notification?.attempts ?? 0) + 1,
      last_error: null,
      sent_at: new Date().toISOString(),
    }).eq("id", id);
    return true;
  } catch (error) {
    await admin.from("notifications").update({
      status: "FAILED",
      attempts: (notification?.attempts ?? 0) + 1,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Email failed",
    }).eq("id", id);
    return false;
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    try {
      const admin: any = ctx.supabaseAdmin;
      requireMethod(req, "POST");
      const rawBody = await req.text();
      let payload: any;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        throw new ApiError(400, "invalid_json", "Webhook payload must be JSON.");
      }

      const provider = Deno.env.get("PAYMENT_PROVIDER") ?? "disabled";
      let signatureVerified = false;
      if (provider === "mock") {
        if (Deno.env.get("ALLOW_MOCK_PAYMENTS") !== "true") {
          throw new ApiError(503, "mock_payments_disabled", "Mock payments are disabled.");
        }
        const expected = Deno.env.get("MOCK_PAYMENT_SECRET") ?? "";
        const supplied = req.headers.get("x-bata-mock-secret") ?? "";
        signatureVerified = expected.length >= 24 && timingSafeEqual(expected, supplied);
      } else if (provider === "vipps") {
        signatureVerified = await verifyVippsWebhook(req, rawBody);
        if (signatureVerified) assertVippsMerchant(payload.msn);
      } else {
        throw new ApiError(503, "payment_not_configured", "Payments are not configured.");
      }
      if (!signatureVerified) throw new ApiError(401, "invalid_webhook_signature", "Webhook authentication failed.");

      const reference = String(payload.reference ?? "");
      const incomingName = String(payload.name ?? "").toUpperCase();
      if (!reference || !knownEvents.has(incomingName)) {
        throw new ApiError(400, "invalid_webhook_event", "Webhook event is invalid.");
      }
      const { data: paymentData, error: paymentError } = await admin
        .from("payments")
        .select(`
          id, provider, provider_reference, idempotency_key, amount_minor, currency, status,
          offer:offers!payments_offer_id_fkey!inner(id, project_title, production_window, request:requests!inner(id, public_reference, customer_name, email))
        `)
        .eq("provider", provider)
        .eq("provider_reference", reference)
        .maybeSingle();
      if (paymentError) throw paymentError;
      const payment: any = paymentData;
      if (!payment) return json(req, { accepted: true, matched: false }, 202);

      let eventName = incomingName;
      let amountMinor = Number(payload.amount?.value ?? 0) || null;
      let currency = payload.amount?.currency ? String(payload.amount.currency) : null;
      let eventKey = provider === "vipps"
        ? `${reference}:${String(payload.pspReference ?? "none")}:${incomingName}`
        : String(payload.eventId ?? `${reference}:${incomingName}`);
      let storedPayload = payload;

      if (provider === "vipps" && incomingName === "AUTHORIZED" && payload.success === true) {
        const capture = await captureVippsPayment(
          reference,
          { currency: payment.currency, value: payment.amount_minor },
          `${payment.idempotency_key}-capture`.slice(0, 50),
        );
        eventName = "CAPTURED";
        eventKey = `${eventKey}:auto-capture`;
        amountMinor = capture.aggregate.capturedAmount.value;
        currency = capture.aggregate.capturedAmount.currency;
        storedPayload = { authorizationEvent: payload, verifiedCaptureResponse: capture };
      } else if (provider === "vipps" && ["CAPTURED", "REFUNDED"].includes(incomingName)) {
        const snapshot = await getVippsPayment(reference);
        if (incomingName === "CAPTURED") {
          const captured = snapshot?.aggregate?.capturedAmount;
          if (captured?.value !== payment.amount_minor || captured?.currency !== payment.currency) {
            throw new ApiError(409, "payment_amount_mismatch", "Vipps did not confirm the exact offer amount.");
          }
          amountMinor = payment.amount_minor;
          currency = payment.currency;
        } else {
          const refunded = snapshot?.aggregate?.refundedAmount;
          if (refunded?.value < payment.amount_minor || refunded?.currency !== payment.currency) {
            return json(req, { accepted: true, partialRefundRecorded: false }, 202);
          }
          amountMinor = payment.amount_minor;
          currency = payment.currency;
        }
        storedPayload = { webhookEvent: payload, verifiedPaymentSnapshot: snapshot };
      }

      const success = provider === "mock" ? payload.success === true : payload.success === true;
      const occurredAt = payload.timestamp ?? payload.occurredAt ?? new Date().toISOString();
      const { data: eventData, error: eventError } = await admin
        .from("payment_events")
        .insert({
          provider,
          event_key: eventKey,
          provider_reference: reference,
          provider_psp_reference: payload.pspReference ? String(payload.pspReference) : null,
          event_name: eventName,
          amount_minor: amountMinor,
          currency,
          occurred_at: occurredAt,
          signature_verified: true,
          success,
          payload: storedPayload,
        })
        .select("id, processed_at, processing_error")
        .single();

      if (eventError?.code === "23505") return json(req, { accepted: true, replay: true });
      if (eventError) throw eventError;
      const event: any = eventData;
      if (event.processing_error) {
        throw new ApiError(409, "event_rejected", event.processing_error);
      }

      let notificationsSent: boolean | null = null;
      if (eventName === "CAPTURED" && success) {
        const request = payment.offer.request;
        const ownerEmail = internalEmail();
        const { data: customerNotification } = await admin
          .from("notifications")
          .select("id")
          .eq("idempotency_key", `payment:${payment.id}:customer-confirmation`)
          .single();
        const { data: internalNotification, error: internalError } = await admin
          .from("notifications")
          .upsert({
            idempotency_key: `payment:${payment.id}:start-production`,
            event_type: "START_PRODUCTION_INTERNAL",
            request_id: request.id,
            offer_id: payment.offer.id,
            payment_id: payment.id,
            recipient_email: ownerEmail,
          }, { onConflict: "idempotency_key", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();
        if (internalError) throw internalError;
        const internalId = internalNotification?.id ?? (
          await admin.from("notifications").select("id")
            .eq("idempotency_key", `payment:${payment.id}:start-production`).single()
        ).data?.id;
        if (!customerNotification?.id || !internalId) {
          throw new ApiError(500, "notification_missing", "Payment notification could not be created.");
        }
        const money = new Intl.NumberFormat("nb-NO", { style: "currency", currency: payment.currency })
          .format(payment.amount_minor / 100);
        const results = await Promise.all([
          deliverNotification(admin, customerNotification.id, {
            to: request.email,
            subject: `Order confirmed ${request.public_reference}`,
            text: `Payment of ${money} is verified. Your order is confirmed and production can begin. Production window: ${payment.offer.production_window}.`,
            html: `<p>Hello ${escapeHtml(request.customer_name)},</p><p>Payment of <strong>${escapeHtml(money)}</strong> is verified for ${escapeHtml(request.public_reference)}.</p><p>Your order is confirmed and production can begin. Production window: ${escapeHtml(payment.offer.production_window)}.</p>`,
          }),
          deliverNotification(admin, internalId, {
            to: ownerEmail,
            subject: `START PRODUCTION — ${request.public_reference}`,
            text: `Verified payment received for ${request.public_reference}. Start production for ${payment.offer.project_title}.`,
            html: `<p><strong>START PRODUCTION</strong></p><p>Verified payment received for ${escapeHtml(request.public_reference)}.</p><p>${escapeHtml(payment.offer.project_title)}</p>`,
          }),
        ]);
        notificationsSent = results.every(Boolean);
      }

      return json(req, { accepted: true, replay: false, processedAt: event.processed_at, notificationsSent });
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
