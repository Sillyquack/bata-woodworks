import { ApiError } from "./http.ts";
import type { VippsAmount, VippsPaymentSnapshot } from "./vipps.ts";

export type StaleVippsPayment = {
  payment_id: string;
  provider_reference: string;
  idempotency_key: string;
  payment_status: "PENDING" | "AUTHORIZED";
  amount_minor: number;
  currency: string;
  capture_started_at: string | null;
  offer_id: string;
  offer_status: string;
  offer_expires_at: string;
  request_id: string;
  request_status: string;
};

export type ReconciliationPlan =
  | { action: "none" }
  | { action: "capture" }
  | { action: "cancel" }
  | {
    action: "record";
    eventName: "ABORTED" | "CANCELLED" | "CAPTURED" | "EXPIRED" | "TERMINATED";
    amount: VippsAmount;
  };

function amountOrZero(
  value: VippsAmount | undefined,
  currency: string,
): VippsAmount {
  return { currency: value?.currency ?? currency, value: value?.value ?? 0 };
}

function assertSameCurrency(amount: VippsAmount, currency: string) {
  if (amount.currency !== currency) {
    throw new ApiError(
      409,
      "payment_amount_mismatch",
      "Vipps returned a different payment currency.",
    );
  }
}

export function planVippsReconciliation(
  payment: StaleVippsPayment,
  snapshot: VippsPaymentSnapshot,
  now = Date.now(),
): ReconciliationPlan {
  const expected: VippsAmount = {
    currency: payment.currency,
    value: payment.amount_minor,
  };
  const authorized = amountOrZero(
    snapshot.aggregate?.authorizedAmount,
    payment.currency,
  );
  const cancelled = amountOrZero(
    snapshot.aggregate?.cancelledAmount,
    payment.currency,
  );
  const captured = amountOrZero(
    snapshot.aggregate?.capturedAmount,
    payment.currency,
  );
  assertSameCurrency(authorized, payment.currency);
  assertSameCurrency(cancelled, payment.currency);
  assertSameCurrency(captured, payment.currency);

  if (captured.value > 0) {
    if (captured.value !== payment.amount_minor) {
      throw new ApiError(
        409,
        "payment_amount_mismatch",
        "Vipps reported a non-exact captured amount.",
      );
    }
    return { action: "record", eventName: "CAPTURED", amount: expected };
  }

  const state = String(snapshot.state ?? "").toUpperCase();
  if (state === "ABORTED" || state === "EXPIRED" || state === "TERMINATED") {
    return { action: "record", eventName: state, amount: expected };
  }
  if (authorized.value > 0 && cancelled.value >= authorized.value) {
    return { action: "record", eventName: "CANCELLED", amount: expected };
  }

  const offerIsPayable = payment.offer_status === "SENT" &&
    payment.request_status === "OFFER_SENT" &&
    Date.parse(payment.offer_expires_at) > now;
  if (!offerIsPayable) return { action: "cancel" };

  if (state === "AUTHORIZED") {
    if (authorized.value !== payment.amount_minor) {
      throw new ApiError(
        409,
        "payment_amount_mismatch",
        "Vipps did not confirm the exact authorized amount.",
      );
    }
    return { action: "capture" };
  }

  return { action: "none" };
}

export function reconciliationEventKey(
  payment: StaleVippsPayment,
  snapshot: VippsPaymentSnapshot,
  eventName: string,
) {
  const pspReference = String(snapshot.pspReference ?? "snapshot");
  return `reconcile:${payment.provider_reference}:${pspReference}:${eventName}:${payment.amount_minor}`;
}
