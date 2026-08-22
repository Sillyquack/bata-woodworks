import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, assertAllowedOrigin, errorResponse, json, options, requireMethod } from "../_shared/http.ts";
import { generateProviderReference, sha256Hex } from "../_shared/crypto.ts";
import { createVippsPayment } from "../_shared/vipps.ts";
import { emailProviderMode } from "../_shared/email.ts";
import {
  isNonProductionEnvironment,
  legalTradingEnabled,
} from "../_shared/identity.ts";

function frontendUrl(providerReference: string) {
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) throw new ApiError(503, "site_url_missing", "SITE_URL is required for payment returns.");
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/#/payment-return?reference=${encodeURIComponent(providerReference)}`;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return options(req);

    try {
      const admin: any = ctx.supabaseAdmin;
      assertAllowedOrigin(req);
      requireMethod(req, "POST");
      const { token, termsVersion, method } = await req.json();
      if (typeof token !== "string" || token.length < 40 || token.length > 100) {
        throw new ApiError(404, "offer_not_found", "This offer link is invalid.");
      }
      if (typeof termsVersion !== "string" || termsVersion.length > 80) {
        throw new ApiError(400, "terms_required", "The exact offer terms must be acknowledged.");
      }
      if (!legalTradingEnabled()) {
        throw new ApiError(503, "legal_trading_disabled", "Purchasing is disabled until the registered business identity and consumer terms are approved.");
      }

      const provider = Deno.env.get("PAYMENT_PROVIDER") ?? "disabled";
      if (!new Set(["mock", "vipps"]).has(provider)) {
        throw new ApiError(503, "payment_not_configured", "Payments are not configured.");
      }
      if (emailProviderMode() === "disabled") {
        throw new ApiError(503, "email_not_configured", "Order confirmation email is not configured.");
      }
      if (
        provider === "mock" &&
        (!isNonProductionEnvironment() || Deno.env.get("ALLOW_MOCK_PAYMENTS") !== "true")
      ) {
        throw new ApiError(503, "mock_payments_disabled", "Mock payments are disabled.");
      }

      const normalizedMethod = provider === "mock" ? "MOCK" : String(method ?? "WALLET");
      const allowedMethods = provider === "mock"
        ? new Set(["MOCK"])
        : new Set([
          "WALLET",
          ...(
              Deno.env.get("VIPPS_ENVIRONMENT") === "production" &&
                Deno.env.get("VIPPS_CARD_ENABLED") === "true"
            ? ["CARD"]
            : []
          ),
        ]);
      if (!allowedMethods.has(normalizedMethod)) {
        throw new ApiError(400, "invalid_payment_method", "Choose a supported payment method.");
      }

      const tokenHash = await sha256Hex(token);
      const { data: offer, error: offerError } = await admin
        .from("offers")
        .select("id, request_id, version, status, project_title, total_minor, currency, expires_at, terms_version, request:requests!inner(public_reference)")
        .eq("public_token_hash", tokenHash)
        .maybeSingle();
      if (offerError) throw offerError;
      if (!offer) throw new ApiError(404, "offer_not_found", "This offer link is invalid.");
      if (offer.status !== "SENT") throw new ApiError(409, "offer_not_payable", "This offer is not payable.");
      if (new Date(offer.expires_at).getTime() <= Date.now()) {
        await admin.rpc("expire_due_offers");
        throw new ApiError(410, "offer_expired", "This offer has expired and cannot be paid.");
      }
      if (termsVersion !== offer.terms_version) {
        throw new ApiError(409, "terms_changed", "The offer terms changed. Reload the offer before paying.");
      }
      if (!Number.isSafeInteger(offer.total_minor) || offer.total_minor <= 0) {
        throw new ApiError(409, "invalid_offer_amount", "The server-side offer amount is invalid.");
      }

      const { data: activePayment } = await admin
        .from("payments")
        .select("provider_reference, checkout_url, status")
        .eq("offer_id", offer.id)
        .in("status", ["PENDING", "AUTHORIZED", "CAPTURED"])
        .maybeSingle();
      if (activePayment?.status === "CAPTURED") {
        throw new ApiError(409, "already_paid", "This offer has already been paid.");
      }
      if (activePayment?.checkout_url) {
        return json(req, {
          checkoutUrl: activePayment.checkout_url,
          providerReference: activePayment.provider_reference,
          reused: true,
        });
      }

      const providerReference = generateProviderReference();
      const idempotencyKey = crypto.randomUUID();
      const acceptedAt = new Date().toISOString();
      const returnUrl = frontendUrl(providerReference);
      const paymentRow = {
        offer_id: offer.id,
        offer_version: offer.version,
        provider,
        payment_method: normalizedMethod,
        provider_reference: providerReference,
        idempotency_key: idempotencyKey,
        status: "PENDING",
        amount_minor: offer.total_minor,
        currency: offer.currency,
        terms_version: offer.terms_version,
        terms_accepted_at: acceptedAt,
      };

      const { data: createdPayment, error: insertError } = await admin
        .from("payments")
        .insert(paymentRow)
        .select("id")
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: concurrent } = await admin
            .from("payments")
            .select("provider_reference, checkout_url, status")
            .eq("offer_id", offer.id)
            .in("status", ["PENDING", "AUTHORIZED", "CAPTURED"])
            .maybeSingle();
          if (concurrent?.checkout_url) {
            return json(req, {
              checkoutUrl: concurrent.checkout_url,
              providerReference: concurrent.provider_reference,
              reused: true,
            });
          }
        }
        throw insertError;
      }

      try {
        let checkoutUrl = returnUrl;
        let pspReference: string | null = null;
        if (provider === "vipps") {
          const result = await createVippsPayment({
            reference: providerReference,
            amount: { currency: offer.currency, value: offer.total_minor },
            returnUrl,
            description: `${offer.request.public_reference}: ${offer.project_title}`,
            method: normalizedMethod as "WALLET" | "CARD",
            idempotencyKey,
          });
          checkoutUrl = result.redirectUrl;
          pspReference = result.pspReference ?? null;
        }

        const { error: updateError } = await admin.from("payments").update({
          checkout_url: checkoutUrl,
          provider_psp_reference: pspReference,
        }).eq("id", createdPayment.id);
        if (updateError) throw updateError;

        return json(req, {
          checkoutUrl,
          providerReference,
          reused: false,
          message: provider === "mock"
            ? "Mock checkout created. A verified mock webhook is still required before this offer becomes paid."
            : undefined,
        }, 201);
      } catch (error) {
        await admin.from("payments").update({
          status: "FAILED",
          failure_reason: error instanceof Error ? error.message.slice(0, 1000) : "Provider error",
        }).eq("id", createdPayment.id).eq("status", "PENDING");
        throw error;
      }
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
