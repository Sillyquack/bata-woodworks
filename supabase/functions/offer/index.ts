import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, assertAllowedOrigin, errorResponse, json, options, requireMethod } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import {
  isNonProductionEnvironment,
  legalTradingEnabled,
} from "../_shared/identity.ts";

function paymentMethods() {
  if (!legalTradingEnabled()) return [];
  const provider = Deno.env.get("PAYMENT_PROVIDER") ?? "disabled";
  if (provider === "mock") {
    return isNonProductionEnvironment() && Deno.env.get("ALLOW_MOCK_PAYMENTS") === "true"
      ? ["MOCK"]
      : [];
  }
  if (provider !== "vipps") return [];
  if (
    Deno.env.get("VIPPS_ENVIRONMENT") === "production" &&
    Deno.env.get("VIPPS_LIVE_ENABLED") !== "true"
  ) return [];
  const methods = ["WALLET"];
  if (Deno.env.get("VIPPS_ENVIRONMENT") === "production" && Deno.env.get("VIPPS_CARD_ENABLED") === "true") {
    methods.push("CARD");
  }
  return methods;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return options(req);

    try {
      const admin: any = ctx.supabaseAdmin;
      assertAllowedOrigin(req);
      requireMethod(req, "POST");
      const { token } = await req.json();
      if (typeof token !== "string" || token.length < 40 || token.length > 100) {
        throw new ApiError(404, "offer_not_found", "This offer link is invalid.");
      }

      const tokenHash = await sha256Hex(token);
      const select = `
        id, version, status, project_title, specification, materials_finish,
        price_minor, delivery_charge_minor, total_minor, currency, vat_treatment,
        delivery_terms, production_window, expires_at, terms_version, terms_snapshot,
        issued_at, accepted_at,
        request:requests!inner(public_reference),
        attachments:offer_attachments(id, bucket_id, object_path, original_name, mime_type),
        payments:payments!payments_offer_id_fkey(status, paid_amount_minor, refunded_amount_minor, paid_at)
      `;
      const { data: offerData, error } = await admin
        .from("offers")
        .select(select)
        .eq("public_token_hash", tokenHash)
        .neq("status", "DRAFT")
        .maybeSingle();
      if (error) throw error;
      let offer: any = offerData;
      if (!offer) throw new ApiError(404, "offer_not_found", "This offer link is invalid.");

      if (offer.status === "SENT" && new Date(offer.expires_at).getTime() <= Date.now()) {
        await admin.rpc("expire_due_offers");
        offer = { ...offer, status: "EXPIRED" };
      }

      const attachments = await Promise.all((offer.attachments ?? []).map(async (attachment: any) => {
        const { data, error: signedUrlError } = await admin.storage
          .from(attachment.bucket_id)
          .createSignedUrl(attachment.object_path, 600, { download: false });
        if (signedUrlError) throw signedUrlError;
        return {
          name: attachment.original_name,
          mimeType: attachment.mime_type,
          url: data.signedUrl,
          expiresIn: 600,
        };
      }));

      const latestPayment = [...(offer.payments ?? [])]
        .sort((left: any, right: any) => String(right.paid_at ?? "").localeCompare(String(left.paid_at ?? "")))[0];
      const payable = offer.status === "SENT" && new Date(offer.expires_at).getTime() > Date.now();
      return json(req, {
        reference: offer.request.public_reference,
        version: offer.version,
        status: offer.status,
        projectTitle: offer.project_title,
        specification: offer.specification,
        materialsFinish: offer.materials_finish,
        priceMinor: offer.price_minor,
        deliveryChargeMinor: offer.delivery_charge_minor,
        totalMinor: offer.total_minor,
        currency: offer.currency,
        vatTreatment: offer.vat_treatment,
        deliveryTerms: offer.delivery_terms,
        productionWindow: offer.production_window,
        expiresAt: offer.expires_at,
        termsVersion: offer.terms_version,
        termsSnapshot: offer.terms_snapshot,
        issuedAt: offer.issued_at,
        acceptedAt: offer.accepted_at,
        paymentStatus: latestPayment?.status ?? null,
        paidAmountMinor: latestPayment?.paid_amount_minor ?? 0,
        refundedAmountMinor: latestPayment?.refunded_amount_minor ?? 0,
        attachments,
        payable,
        paymentMethods: payable ? paymentMethods() : [],
      });
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
