import { ApiError } from "./http.ts";
import { hmacSha256Base64, sha256Base64, timingSafeEqual } from "./crypto.ts";

type VippsAmount = { currency: string; value: number };

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new ApiError(503, "vipps_not_configured", `${name} is required for Vipps.`);
  return value;
}

function vippsBaseUrl() {
  const environment = Deno.env.get("VIPPS_ENVIRONMENT") ?? "test";
  if (environment === "production") {
    if (Deno.env.get("VIPPS_LIVE_ENABLED") !== "true") {
      throw new ApiError(503, "vipps_live_disabled", "Live Vipps payments have not been explicitly enabled.");
    }
    return "https://api.vipps.no";
  }
  if (environment !== "test") throw new ApiError(503, "vipps_not_configured", "VIPPS_ENVIRONMENT must be test or production.");
  return "https://apitest.vipps.no";
}

async function accessToken() {
  const response = await fetch(`${vippsBaseUrl()}/accesstoken/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "client_id": required("VIPPS_CLIENT_ID"),
      "client_secret": required("VIPPS_CLIENT_SECRET"),
      "Ocp-Apim-Subscription-Key": required("VIPPS_SUBSCRIPTION_KEY"),
      "Merchant-Serial-Number": required("VIPPS_MERCHANT_SERIAL_NUMBER"),
    },
  });
  if (!response.ok) throw new ApiError(502, "vipps_auth_failed", "Vipps authentication failed.");
  const payload = await response.json();
  if (!payload.access_token) throw new ApiError(502, "vipps_auth_failed", "Vipps returned no access token.");
  return payload.access_token as string;
}

async function headers(idempotencyKey?: string) {
  return {
    "Authorization": `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": required("VIPPS_SUBSCRIPTION_KEY"),
    "Merchant-Serial-Number": required("VIPPS_MERCHANT_SERIAL_NUMBER"),
    "Vipps-System-Name": "bata-woodworks",
    "Vipps-System-Version": "1.0.0",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

export async function createVippsPayment(input: {
  reference: string;
  amount: VippsAmount;
  returnUrl: string;
  description: string;
  method: "WALLET" | "CARD";
  idempotencyKey: string;
}) {
  if (input.method === "CARD" && (Deno.env.get("VIPPS_ENVIRONMENT") ?? "test") === "test") {
    throw new ApiError(400, "card_unavailable_in_test", "Vipps card payments are unavailable in the test environment.");
  }

  const response = await fetch(`${vippsBaseUrl()}/epayment/v1/payments`, {
    method: "POST",
    headers: await headers(input.idempotencyKey),
    body: JSON.stringify({
      amount: input.amount,
      paymentMethod: { type: input.method },
      reference: input.reference,
      userFlow: "WEB_REDIRECT",
      returnUrl: input.returnUrl,
      paymentDescription: input.description.slice(0, 100),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.redirectUrl) {
    console.error("Vipps create failed", response.status, JSON.stringify(payload).slice(0, 800));
    throw new ApiError(502, "payment_provider_failed", "Vipps could not create the payment.");
  }
  return payload as { redirectUrl: string; reference: string; pspReference?: string };
}

export async function getVippsPayment(reference: string) {
  const response = await fetch(`${vippsBaseUrl()}/epayment/v1/payments/${encodeURIComponent(reference)}`, {
    headers: await headers(),
  });
  if (!response.ok) throw new ApiError(502, "payment_verification_failed", "Vipps payment state could not be verified.");
  return await response.json();
}

export async function captureVippsPayment(reference: string, amount: VippsAmount, idempotencyKey: string) {
  const response = await fetch(
    `${vippsBaseUrl()}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
    {
      method: "POST",
      headers: await headers(idempotencyKey),
      body: JSON.stringify({ modificationAmount: amount }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  const captured = payload?.aggregate?.capturedAmount;
  if (!response.ok || captured?.value !== amount.value || captured?.currency !== amount.currency) {
    console.error("Vipps capture failed", response.status, JSON.stringify(payload).slice(0, 800));
    throw new ApiError(502, "payment_capture_failed", "Vipps did not confirm the exact capture amount.");
  }
  return payload;
}

export async function verifyVippsWebhook(req: Request, rawBody: string) {
  const secret = required("VIPPS_WEBHOOK_SECRET");
  const date = req.headers.get("x-ms-date");
  const suppliedHash = req.headers.get("x-ms-content-sha256");
  const authorization = req.headers.get("authorization");
  if (!date || !suppliedHash || !authorization) return false;

  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const contentHash = await sha256Base64(rawBody);
  if (!timingSafeEqual(contentHash, suppliedHash)) return false;

  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  const signed = `POST\n${url.pathname}${url.search}\n${date};${host};${contentHash}`;
  const signature = await hmacSha256Base64(secret, signed);
  const expected = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`;
  return timingSafeEqual(expected, authorization);
}

export function assertVippsMerchant(msn: unknown) {
  if (String(msn) !== required("VIPPS_MERCHANT_SERIAL_NUMBER")) {
    throw new ApiError(401, "invalid_webhook_merchant", "Webhook merchant did not match.");
  }
}
