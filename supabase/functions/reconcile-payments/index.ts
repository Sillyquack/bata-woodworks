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
  planVippsReconciliation,
  reconciliationEventKey,
  type StaleVippsPayment,
} from "../_shared/reconciliation.ts";
import {
  cancelVippsPayment,
  captureVippsPayment,
  getVippsPayment,
} from "../_shared/vipps.ts";

function integerSetting(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(
      503,
      "invalid_reconciliation_config",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    try {
      const admin: any = ctx.supabaseAdmin;
      requireMethod(req, "POST");
      const expected = Deno.env.get("CRON_SECRET") ?? "";
      const supplied = req.headers.get("x-bata-cron-secret") ?? "";
      if (expected.length < 24 || !timingSafeEqual(expected, supplied)) {
        throw new ApiError(
          401,
          "invalid_cron_secret",
          "Cron authentication failed.",
        );
      }

      const batchLimit = integerSetting(
        "PAYMENT_RECONCILIATION_BATCH_SIZE",
        25,
        1,
        100,
      );
      const staleSeconds = integerSetting(
        "PAYMENT_RECONCILIATION_STALE_SECONDS",
        15,
        5,
        3600,
      );
      const { data, error } = await admin.rpc("claim_stale_vipps_payments", {
        batch_limit: batchLimit,
        stale_seconds: staleSeconds,
      });
      if (error) throw error;
      const payments = (data ?? []) as StaleVippsPayment[];
      const result = {
        claimed: payments.length,
        checked: 0,
        captured: 0,
        cancelled: 0,
        terminal: 0,
        pending: 0,
        replayed: 0,
        rejected: 0,
        failed: 0,
      };

      for (const payment of payments) {
        try {
          let snapshot = await getVippsPayment(payment.provider_reference);
          let plan = planVippsReconciliation(payment, snapshot);
          result.checked += 1;

          if (plan.action === "capture") {
            const guard = await guardPaymentCapture(
              admin,
              "vipps",
              payment.provider_reference,
            );
            if (guard.is_allowed) {
              snapshot = await captureVippsPayment(
                payment.provider_reference,
                { currency: payment.currency, value: payment.amount_minor },
                `${payment.idempotency_key}-capture`.slice(0, 50),
              );
              plan = planVippsReconciliation(payment, snapshot);
            } else {
              const current = await loadPaymentContext(
                admin,
                "vipps",
                payment.provider_reference,
              );
              if (
                current && !["PENDING", "AUTHORIZED"].includes(current.status)
              ) {
                await admin.from("payments").update({
                  last_verified_at: new Date().toISOString(),
                  reconciliation_error: null,
                }).eq("id", payment.payment_id);
                result.pending += 1;
                continue;
              }
              snapshot = await cancelVippsPayment(
                payment.provider_reference,
                `${payment.idempotency_key}-cancel`.slice(0, 50),
              );
              plan = planVippsReconciliation(payment, snapshot);
            }
          } else if (plan.action === "cancel") {
            snapshot = await cancelVippsPayment(
              payment.provider_reference,
              `${payment.idempotency_key}-cancel`.slice(0, 50),
            );
            plan = planVippsReconciliation(payment, snapshot);
          }

          if (plan.action === "none") {
            await admin.from("payments").update({
              last_verified_at: new Date().toISOString(),
              reconciliation_error: null,
            }).eq("id", payment.payment_id);
            result.pending += 1;
            continue;
          }
          if (plan.action !== "record") {
            throw new ApiError(
              502,
              "reconciliation_incomplete",
              "Vipps did not return a terminal reconciliation state.",
            );
          }

          const recorded = await recordVerifiedPaymentEvent(admin, {
            provider: "vipps",
            eventKey: reconciliationEventKey(payment, snapshot, plan.eventName),
            reference: payment.provider_reference,
            pspReference: snapshot.pspReference ?? null,
            eventName: plan.eventName,
            amountMinor: plan.amount.value,
            currency: plan.amount.currency,
            occurredAt: new Date().toISOString(),
            payload: {
              source: "scheduled_reconciliation",
              verifiedPaymentSnapshot: snapshot,
            },
          });
          if (recorded.replay) {
            result.replayed += 1;
            continue;
          }
          if (recorded.event?.processing_error) {
            result.rejected += 1;
            continue;
          }

          if (plan.eventName === "CAPTURED") {
            result.captured += 1;
            const context = await loadPaymentContext(
              admin,
              "vipps",
              payment.provider_reference,
            );
            if (context) {
              await deliverCapturedPaymentNotifications(admin, context);
            }
          } else if (["CANCELLED", "TERMINATED"].includes(plan.eventName)) {
            result.cancelled += 1;
          } else {
            result.terminal += 1;
          }
        } catch (paymentError) {
          result.failed += 1;
          const message = paymentError instanceof Error
            ? paymentError.message.slice(0, 1000)
            : "Reconciliation failed";
          await admin.from("payments").update({ reconciliation_error: message })
            .eq("id", payment.payment_id);
          console.error(
            "Payment reconciliation failed",
            payment.provider_reference,
            message,
          );
        }
      }

      return json(req, result);
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
