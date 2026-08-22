import { ApiError } from "./http.ts";
import {
  escapeHtml,
  internalEmail,
  sendTransactionalEmail,
  wrapEmailHtml,
} from "./email.ts";
import { ORDERS_EMAIL } from "./identity.ts";

export type PaymentContext = {
  id: string;
  provider: string;
  provider_reference: string;
  idempotency_key: string;
  amount_minor: number;
  currency: string;
  status: string;
  offer: {
    id: string;
    status: string;
    expires_at: string;
    project_title: string;
    production_window: string;
    request: {
      id: string;
      status: string;
      public_reference: string;
      customer_name: string;
      email: string;
    };
  };
};

export async function loadPaymentContext(
  admin: any,
  provider: string,
  reference: string,
) {
  const { data, error } = await admin
    .from("payments")
    .select(`
      id, provider, provider_reference, idempotency_key, amount_minor, currency, status,
      offer:offers!payments_offer_id_fkey!inner(
        id, status, expires_at, project_title, production_window,
        request:requests!inner(id, status, public_reference, customer_name, email)
      )
    `)
    .eq("provider", provider)
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentContext | null;
}

export async function guardPaymentCapture(
  admin: any,
  provider: string,
  reference: string,
) {
  const { data, error } = await admin.rpc("guard_payment_capture", {
    payment_provider: provider,
    payment_reference: reference,
  });
  if (error) throw error;
  const guard = Array.isArray(data) ? data[0] : data;
  if (!guard) {
    throw new ApiError(
      500,
      "capture_guard_failed",
      "Payment capture guard returned no result.",
    );
  }
  return guard as {
    is_allowed: boolean;
    guard_reason: string | null;
    claimed_at: string | null;
    offer_expires_at: string | null;
  };
}

export async function recordVerifiedPaymentEvent(admin: any, input: {
  provider: string;
  eventKey: string;
  reference: string;
  pspReference?: string | null;
  eventName: string;
  amountMinor?: number | null;
  currency?: string | null;
  occurredAt?: string | null;
  success?: boolean;
  payload: unknown;
}) {
  const { data, error } = await admin
    .from("payment_events")
    .insert({
      provider: input.provider,
      event_key: input.eventKey,
      provider_reference: input.reference,
      provider_psp_reference: input.pspReference ?? null,
      event_name: input.eventName,
      amount_minor: input.amountMinor ?? null,
      currency: input.currency ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      signature_verified: true,
      success: input.success ?? true,
      payload: input.payload,
    })
    .select("id, processed_at, processing_error")
    .single();

  if (error?.code === "23505") return { replay: true, event: null };
  if (error) throw error;
  return {
    replay: false,
    event: data as {
      id: number;
      processed_at: string;
      processing_error: string | null;
    },
  };
}

async function deliverNotification(
  admin: any,
  id: string,
  message: Parameters<typeof sendTransactionalEmail>[0],
) {
  const { data: notification } = await admin.from("notifications").select(
    "status, attempts",
  ).eq("id", id).single();
  if (notification?.status === "SENT") return true;
  try {
    const result = await sendTransactionalEmail({
      ...message,
      idempotencyKey: message.idempotencyKey ?? `notification-${id}`,
    });
    await admin.from("notifications").update({
      status: "SENT",
      provider_message_id: result.id,
      attempts: (notification?.attempts ?? 0) + 1,
      last_error: null,
      sent_at: new Date().toISOString(),
    }).eq("id", id);
    return true;
  } catch (error) {
    await admin.from("notifications").update({
      status: "FAILED",
      attempts: (notification?.attempts ?? 0) + 1,
      last_error: error instanceof Error
        ? error.message.slice(0, 1000)
        : "Email failed",
    }).eq("id", id);
    return false;
  }
}

export async function deliverCapturedPaymentNotifications(
  admin: any,
  payment: PaymentContext,
) {
  const request = payment.offer.request;
  const ownerEmail = internalEmail();
  const { data: customerNotification } = await admin
    .from("notifications")
    .select("id")
    .eq("idempotency_key", `payment:${payment.id}:customer-confirmation`)
    .single();
  const { data: internalNotification, error: internalError } = await admin
    .from("notifications")
    .upsert({
      idempotency_key: `payment:${payment.id}:start-production`,
      event_type: "PAYMENT_CAPTURED_INTERNAL",
      request_id: request.id,
      offer_id: payment.offer.id,
      payment_id: payment.id,
      recipient_email: ownerEmail,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (internalError) throw internalError;
  const internalId = internalNotification?.id ?? (
    await admin.from("notifications").select("id")
      .eq("idempotency_key", `payment:${payment.id}:start-production`).single()
  ).data?.id;
  if (!customerNotification?.id || !internalId) {
    throw new ApiError(
      500,
      "notification_missing",
      "Payment notification could not be created.",
    );
  }

  const money = new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: payment.currency,
  })
    .format(payment.amount_minor / 100);
  const results = await Promise.all([
    deliverNotification(admin, customerNotification.id, {
      to: request.email,
      subject: `Payment confirmed ${request.public_reference}`,
      replyTo: ORDERS_EMAIL,
      text:
        `Hello ${request.customer_name},\n\nPayment of ${money} is verified for ${request.public_reference}. Your order and the agreed production period are confirmed: ${payment.offer.production_window}. We will send a separate update when work begins. A fixed delivery date applies only if the private offer expressly states one.\n\nBata Woodworks\n${ORDERS_EMAIL}`,
      html: wrapEmailHtml(
        "Payment confirmed",
        `<p>Hello ${escapeHtml(request.customer_name)},</p><p>Payment of <strong>${escapeHtml(money)}</strong> is verified for ${escapeHtml(request.public_reference)}.</p><p>Your order and agreed production period are confirmed: <strong>${escapeHtml(payment.offer.production_window)}</strong>.</p><p>We will send a separate update when work begins. A fixed delivery date applies only if the private offer expressly states one.</p>`,
      ),
    }),
    deliverNotification(admin, internalId, {
      to: ownerEmail,
      subject: `PAYMENT VERIFIED — schedule ${request.public_reference}`,
      replyTo: request.email,
      text:
        `Verified payment received for ${request.public_reference}. The approved project ${payment.offer.project_title} can now be scheduled within its agreed production period. Move it to PRODUCTION only when work actually begins. Replying to this message replies to the customer.`,
      html: wrapEmailHtml(
        "Payment verified — schedule approved work",
        `<p>Verified payment received for <strong>${escapeHtml(request.public_reference)}</strong>.</p><p>${escapeHtml(payment.offer.project_title)} can now be scheduled within its agreed production period.</p><p>Move it to <strong>PRODUCTION</strong> only when work actually begins. Replying to this message replies to the customer.</p>`,
      ),
    }),
  ]);
  return results.every(Boolean);
}
