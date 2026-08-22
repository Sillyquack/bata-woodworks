import { ApiError } from "./http.ts";
import {
  MANAGER_EMAIL,
  PREFERRED_EMAIL_FROM,
  PUBLIC_EMAIL,
  CANONICAL_SITE_URL,
  isNonProductionEnvironment,
} from "./identity.ts";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function emailProviderMode() {
  const provider = Deno.env.get("EMAIL_PROVIDER") ?? "disabled";
  if (provider === "log" && !isNonProductionEnvironment()) return "disabled";
  return provider;
}

export function internalEmail() {
  return Deno.env.get("INTERNAL_NOTIFICATION_EMAIL") ?? MANAGER_EMAIL;
}

export function wrapEmailHtml(title: string, body: string, preheader = title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${
    escapeHtml(title)
  }</title></head><body style="margin:0;background:#f3eee6;color:#211d18;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${
    escapeHtml(preheader)
  }</div><main style="width:100%;padding:24px 12px;box-sizing:border-box"><section style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ded4c8;border-radius:16px;overflow:hidden"><header style="padding:20px 24px;border-bottom:1px solid #ded4c8"><p style="margin:0;color:#9a5f2d;font-size:12px;font-weight:700;letter-spacing:2px">BATA WOODWORKS</p></header><div style="padding:24px;line-height:1.65"><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:28px;line-height:1.15;color:#211d18">${
    escapeHtml(title)
  }</h1>${body}</div><footer style="padding:18px 24px;border-top:1px solid #ded4c8;color:#6f6559;font-size:13px;line-height:1.5">Questions? Reply to this email or contact <a href="mailto:${PUBLIC_EMAIL}" style="color:#9a5f2d">${PUBLIC_EMAIL}</a>.<br><a href="${CANONICAL_SITE_URL}" style="color:#9a5f2d">batawoodworks.no</a></footer></section></main></body></html>`;
}

export async function sendTransactionalEmail(email: Email) {
  const provider = emailProviderMode();
  if (provider === "log") {
    return { id: `log-${crypto.randomUUID()}`, provider };
  }

  if (provider !== "resend") {
    throw new ApiError(503, "email_not_configured", "Transactional email is not configured.");
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) {
    throw new ApiError(503, "email_not_configured", "Resend credentials and sender identity are required.");
  }
  if (!isNonProductionEnvironment() && from !== PREFERRED_EMAIL_FROM) {
    throw new ApiError(503, "email_sender_invalid", `EMAIL_FROM must be ${PREFERRED_EMAIL_FROM}.`);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": (email.idempotencyKey ?? crypto.randomUUID()).slice(0, 256),
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo ?? PUBLIC_EMAIL,
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: "resend_request_failed", status: response.status }));
    throw new ApiError(502, "email_delivery_failed", "The transactional email could not be delivered.");
  }

  const result = await response.json();
  return { id: String(result.id), provider };
}
