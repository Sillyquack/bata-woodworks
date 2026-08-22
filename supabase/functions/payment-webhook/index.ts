import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  ApiError,
  errorResponse,
  json,
  requireMethod,
} from "../_shared/http.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import {
  deliverCapturedPaymentNotifications,
  guardPaymentCapture,
  loadPaymentContext,
  recordVerifiedPaymentEvent,
} from "../_shared/payment-events.ts";
import {
  assertVippsMerchant,
  cancelVippsPayment,
  captureVippsPayment,
  getVippsPayment,
  verifyVippsWebhook,
} from "../_shared/vipps.ts";
import { isNonProductionEnvironment } from "../_shared/identity.ts";

const knownEvents = new Set([
  "CREATED",
  "AUTHORIZED",
  "CAPTURED",
  "CANCELLED",
  "REFUNDED",
  "ABORTED",
  "EXPIRED",
  "TERMINATED",
]);

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
        throw new ApiError(
          400,
          "invalid_json",
          "Webhook payload must be JSON.",
        );
      }

      const provider = Deno.env.get("PAYMENT_PROVIDER") ?? "disabled";
      let signatureVerified = false;
      if (provider === "mock") {
        if (
          !isNonProductionEnvironment() ||
          Deno.env.get("ALLOW_MOCK_PAYMENTS") !== "true"
        ) {
          throw new ApiError(
            503,
            "mock_payments_disabled",
            "Mock payments are disabled.",
          );
        }
        const expected = Deno.env.get("MOCK_PAYMENT_SECRET") ?? "";
        const supplied = req.headers.get("x-bata-mock-secret") ?? "";
        signatureVerified = expected.length >= 24 &&
          timingSafeEqual(expected, supplied);
      } else if (provider === "vipps") {
        signatureVerified = await verifyVippsWebhook(req, rawBody);
        if (signatureVerified) assertVippsMerchant(payload.msn);
      } else {
        throw new ApiError(
          503,
          "payment_not_configured",
          "Payments are not configured.",
        );
      }
      if (!signatureVerified) {
        throw new ApiError(
          401,
          "invalid_webhook_signature",
          "Webhook authentication failed.",
        );
      }

      const reference = String(payload.reference ?? "");
      const incomingName = String(payload.name ?? "").toUpperCase();
      if (!reference || !knownEvents.has(incomingName)) {
        throw new ApiError(
          400,
          "invalid_webhook_event",
          "Webhook event is invalid.",
        );
      }
      let payment = await loadPaymentContext(admin, provider, reference);
      if (!payment) return json(req, { accepted: true, matched: false }, 202);

      let eventName = incomingName;
      let amountMinor = Number(payload.amount?.value ?? 0) || null;
      let currency = payload.amount?.currency
        ? String(payload.amount.currency)
        : null;
      let eventKey = provider === "vipps"
        ? `${reference}:${
          String(payload.pspReference ?? "none")
        }:${incomingName}`
        : String(payload.eventId ?? `${reference}:${incomingName}`);
      let storedPayload = payload;

      if (
        provider === "vipps" && incomingName === "AUTHORIZED" &&
        payload.success === true
      ) {
        const guard = await guardPaymentCapture(admin, provider, reference);
        if (guard.is_allowed) {
          const capture = await captureVippsPayment(
            reference,
            { currency: payment.currency, value: payment.amount_minor },
            `${payment.idempotency_key}-capture`.slice(0, 50),
          );
          eventName = "CAPTURED";
          eventKey = `${eventKey}:auto-capture`;
          amountMinor = capture.aggregate.capturedAmount.value;
          currency = capture.aggregate.capturedAmount.currency;
          storedPayload = {
            authorizationEvent: payload,
            captureGuard: guard,
            verifiedCaptureResponse: capture,
          };
        } else {
          payment = await loadPaymentContext(admin, provider, reference);
          if (!payment || !["PENDING", "AUTHORIZED"].includes(payment.status)) {
            return json(req, { accepted: true, matched: true, ignored: true });
          }
          const cancellation = await cancelVippsPayment(
            reference,
            `${payment.idempotency_key}-cancel`.slice(0, 50),
          );
          eventName =
            String(cancellation.state ?? "").toUpperCase() === "TERMINATED"
              ? "TERMINATED"
              : "CANCELLED";
          eventKey = `${eventKey}:offer-not-payable:${eventName}`;
          amountMinor = payment.amount_minor;
          currency = payment.currency;
          storedPayload = {
            authorizationEvent: payload,
            captureGuard: guard,
            verifiedCancellationResponse: cancellation,
          };
        }
      } else if (
        provider === "vipps" && ["CAPTURED", "REFUNDED"].includes(incomingName)
      ) {
        const snapshot = await getVippsPayment(reference);
        if (incomingName === "CAPTURED") {
          const captured = snapshot?.aggregate?.capturedAmount;
          if (
            captured?.value !== payment.amount_minor ||
            captured?.currency !== payment.currency
          ) {
            throw new ApiError(
              409,
              "payment_amount_mismatch",
              "Vipps did not confirm the exact offer amount.",
            );
          }
          amountMinor = payment.amount_minor;
          currency = payment.currency;
        } else {
          const refunded = snapshot?.aggregate?.refundedAmount;
          if (
            !refunded || refunded.value < payment.amount_minor ||
            refunded.currency !== payment.currency
          ) {
            return json(
              req,
              { accepted: true, partialRefundRecorded: false },
              202,
            );
          }
          amountMinor = payment.amount_minor;
          currency = payment.currency;
        }
        storedPayload = {
          webhookEvent: payload,
          verifiedPaymentSnapshot: snapshot,
        };
      }

      const success = provider === "mock"
        ? payload.success === true
        : payload.success === true;
      const occurredAt = payload.timestamp ?? payload.occurredAt ??
        new Date().toISOString();
      const recorded = await recordVerifiedPaymentEvent(admin, {
        provider,
        eventKey,
        reference,
        pspReference: payload.pspReference
          ? String(payload.pspReference)
          : null,
        eventName,
        amountMinor,
        currency,
        occurredAt,
        success,
        payload: storedPayload,
      });
      if (recorded.replay) return json(req, { accepted: true, replay: true });
      const event = recorded.event!;
      if (event.processing_error) {
        throw new ApiError(409, "event_rejected", event.processing_error);
      }

      let notificationsSent: boolean | null = null;
      if (eventName === "CAPTURED" && success) {
        payment = await loadPaymentContext(admin, provider, reference);
        if (!payment) {
          throw new ApiError(
            500,
            "payment_missing",
            "Captured payment could not be reloaded.",
          );
        }
        notificationsSent = await deliverCapturedPaymentNotifications(
          admin,
          payment,
        );
      }

      return json(req, {
        accepted: true,
        replay: false,
        processedAt: event.processed_at,
        notificationsSent,
      });
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
