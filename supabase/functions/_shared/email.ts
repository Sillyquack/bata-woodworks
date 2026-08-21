import { ApiError } from "./http.ts";

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
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
  return Deno.env.get("EMAIL_PROVIDER") ?? "disabled";
}

export function internalEmail() {
  const email = Deno.env.get("INTERNAL_NOTIFICATION_EMAIL");
  if (!email) throw new ApiError(503, "email_not_configured", "Internal notification email is not configured.");
  return email;
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend request failed", response.status, detail.slice(0, 500));
    throw new ApiError(502, "email_delivery_failed", "The transactional email could not be delivered.");
  }

  const result = await response.json();
  return { id: String(result.id), provider };
}
