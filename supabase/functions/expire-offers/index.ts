import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { ApiError, errorResponse, json, requireMethod } from "../_shared/http.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { escapeHtml, sendTransactionalEmail } from "../_shared/email.ts";

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    try {
      const admin: any = ctx.supabaseAdmin;
      requireMethod(req, "POST");
      const expected = Deno.env.get("CRON_SECRET") ?? "";
      const supplied = req.headers.get("x-bata-cron-secret") ?? "";
      if (expected.length < 24 || !timingSafeEqual(expected, supplied)) {
        throw new ApiError(401, "invalid_cron_secret", "Cron authentication failed.");
      }

      const { data: expired, error } = await admin.rpc("expire_due_offers");
      if (error) throw error;
      let emailsSent = 0;
      for (const offer of expired ?? []) {
        await admin.from("status_history").insert({
          request_id: offer.request_id,
          offer_id: offer.offer_id,
          from_status: "OFFER_SENT",
          to_status: "EXPIRED",
          source: "expiry",
        });
        const key = `offer:${offer.offer_id}:expired`;
        const { data: notification, error: notificationError } = await admin
          .from("notifications")
          .upsert({
            idempotency_key: key,
            event_type: "OFFER_EXPIRED_CUSTOMER",
            request_id: offer.request_id,
            offer_id: offer.offer_id,
            recipient_email: offer.customer_email,
          }, { onConflict: "idempotency_key", ignoreDuplicates: true })
          .select("id, status, attempts")
          .maybeSingle();
        if (notificationError) throw notificationError;
        const row = notification ?? (
          await admin.from("notifications").select("id, status, attempts")
            .eq("idempotency_key", key).single()
        ).data;
        if (!row) throw new ApiError(500, "notification_missing", "Expiry notification could not be created.");
        if (row.status === "SENT") continue;

        try {
          const sent = await sendTransactionalEmail({
            to: offer.customer_email,
            subject: `Offer expired — ${offer.public_reference}`,
            text: `The offer for ${offer.project_title} has expired without payment. Production capacity was not reserved.`,
            html: `<p>The offer for <strong>${escapeHtml(offer.project_title)}</strong> (${escapeHtml(offer.public_reference)}) has expired without payment.</p><p>Production capacity was not reserved.</p>`,
          });
          await admin.from("notifications").update({
            status: "SENT",
            provider_message_id: sent.id,
            attempts: (row.attempts ?? 0) + 1,
            sent_at: new Date().toISOString(),
          }).eq("id", row.id);
          emailsSent += 1;
        } catch (emailError) {
          await admin.from("notifications").update({
            status: "FAILED",
            attempts: (row.attempts ?? 0) + 1,
            last_error: emailError instanceof Error ? emailError.message.slice(0, 1000) : "Email failed",
          }).eq("id", row.id);
        }
      }

      return json(req, { expired: expired?.length ?? 0, emailsSent });
    } catch (error) {
      return errorResponse(req, error);
    }
  }),
};
