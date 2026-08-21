import {
  planVippsReconciliation,
  type StaleVippsPayment,
} from "./reconciliation.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        )
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    }
    return value;
  };
  if (
    JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))
  ) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

const now = Date.parse("2026-08-21T20:00:00Z");
const payment: StaleVippsPayment = {
  payment_id: "30000000-0000-4000-8000-000000000001",
  provider_reference: "BW-RECONCILE-0001",
  idempotency_key: "30000000-0000-4000-8000-000000000002",
  payment_status: "PENDING",
  amount_minor: 10000,
  currency: "NOK",
  capture_started_at: null,
  offer_id: "20000000-0000-4000-8000-000000000001",
  offer_status: "SENT",
  offer_expires_at: "2026-08-21T21:00:00Z",
  request_id: "10000000-0000-4000-8000-000000000001",
  request_status: "OFFER_SENT",
};

Deno.test("stale authorized payment is captured only while its offer remains payable", () => {
  const plan = planVippsReconciliation(payment, {
    state: "AUTHORIZED",
    aggregate: {
      authorizedAmount: { value: 10000, currency: "NOK" },
      capturedAmount: { value: 0, currency: "NOK" },
      cancelledAmount: { value: 0, currency: "NOK" },
    },
  }, now);
  assertEquals(plan, { action: "capture" });
});

Deno.test("missed captured webhook is recovered from the verified aggregate", () => {
  const plan = planVippsReconciliation(payment, {
    state: "AUTHORIZED",
    aggregate: {
      authorizedAmount: { value: 10000, currency: "NOK" },
      capturedAmount: { value: 10000, currency: "NOK" },
      cancelledAmount: { value: 0, currency: "NOK" },
    },
  }, now);
  assertEquals(plan, {
    action: "record",
    eventName: "CAPTURED",
    amount: { value: 10000, currency: "NOK" },
  });
});

Deno.test("authorized payment is cancelled rather than captured after offer expiry", () => {
  const plan = planVippsReconciliation({
    ...payment,
    offer_expires_at: "2026-08-21T19:59:59Z",
  }, {
    state: "AUTHORIZED",
    aggregate: {
      authorizedAmount: { value: 10000, currency: "NOK" },
      capturedAmount: { value: 0, currency: "NOK" },
      cancelledAmount: { value: 0, currency: "NOK" },
    },
  }, now);
  assertEquals(plan, { action: "cancel" });
});

Deno.test("missed abort and provider cancellation become terminal events", () => {
  assertEquals(
    planVippsReconciliation(payment, {
      state: "ABORTED",
      aggregate: {},
    }, now),
    {
      action: "record",
      eventName: "ABORTED",
      amount: { value: 10000, currency: "NOK" },
    },
  );
  assertEquals(
    planVippsReconciliation(payment, {
      state: "AUTHORIZED",
      aggregate: {
        authorizedAmount: { value: 10000, currency: "NOK" },
        capturedAmount: { value: 0, currency: "NOK" },
        cancelledAmount: { value: 10000, currency: "NOK" },
      },
    }, now),
    {
      action: "record",
      eventName: "CANCELLED",
      amount: { value: 10000, currency: "NOK" },
    },
  );
});

Deno.test("partial or wrong-value capture is rejected during reconciliation", () => {
  let error: unknown;
  try {
    planVippsReconciliation(payment, {
      state: "AUTHORIZED",
      aggregate: {
        authorizedAmount: { value: 10000, currency: "NOK" },
        capturedAmount: { value: 5000, currency: "NOK" },
      },
    }, now);
  } catch (caught) {
    error = caught;
  }
  if (
    !(error instanceof Error) ||
    !error.message.includes("non-exact captured amount")
  ) {
    throw new Error("Expected a non-exact capture to be rejected");
  }
});
