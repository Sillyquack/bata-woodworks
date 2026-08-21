alter table public.payments
  add column capture_started_at timestamptz,
  add column reconciliation_started_at timestamptz,
  add column reconciliation_attempts integer not null default 0
    check (reconciliation_attempts >= 0),
  add column reconciliation_error text
    check (reconciliation_error is null or char_length(reconciliation_error) <= 1000);

create index payments_vipps_reconciliation_due_idx
  on public.payments (coalesce(reconciliation_started_at, initiated_at))
  where provider = 'vipps' and status in ('PENDING', 'AUTHORIZED');

create or replace function public.guard_payment_capture(
  payment_provider text,
  payment_reference text
)
returns table (
  is_allowed boolean,
  guard_reason text,
  claimed_at timestamptz,
  offer_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  target_offer public.offers%rowtype;
  target_request_status public.request_status;
  capture_time timestamptz;
begin
  select * into target_payment
  from public.payments
  where provider = payment_provider and provider_reference = payment_reference
  for update;

  if not found then
    return query select false, 'Unknown payment reference'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into target_offer
  from public.offers
  where id = target_payment.offer_id
  for update;

  select status into target_request_status
  from public.requests
  where id = target_offer.request_id
  for update;

  if target_payment.status not in ('PENDING', 'AUTHORIZED') then
    return query select false, 'Payment is not awaiting capture'::text,
      target_payment.capture_started_at, target_offer.expires_at;
    return;
  end if;

  if target_offer.status <> 'SENT'
    or target_request_status <> 'OFFER_SENT'
    or target_offer.expires_at <= clock_timestamp() then
    return query select false, 'Commercial offer is no longer payable'::text,
      target_payment.capture_started_at, target_offer.expires_at;
    return;
  end if;

  capture_time := clock_timestamp();
  update public.payments
  set capture_started_at = coalesce(capture_started_at, capture_time),
      reconciliation_error = null
  where id = target_payment.id
  returning capture_started_at into capture_time;

  return query select true, null::text, capture_time, target_offer.expires_at;
end;
$$;

revoke all on function public.guard_payment_capture(text, text) from public, anon, authenticated;
grant execute on function public.guard_payment_capture(text, text) to service_role;

create or replace function public.claim_stale_vipps_payments(
  batch_limit integer default 25,
  stale_seconds integer default 15
)
returns table (
  payment_id uuid,
  provider_reference text,
  idempotency_key text,
  payment_status public.payment_status,
  amount_minor bigint,
  currency text,
  capture_started_at timestamptz,
  offer_id uuid,
  offer_status public.offer_status,
  offer_expires_at timestamptz,
  request_id uuid,
  request_status public.request_status
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if batch_limit < 1 or batch_limit > 100 then
    raise exception 'batch_limit must be between 1 and 100';
  end if;
  if stale_seconds < 5 or stale_seconds > 3600 then
    raise exception 'stale_seconds must be between 5 and 3600';
  end if;

  return query
  with due as (
    select p.id
    from public.payments p
    join public.offers o on o.id = p.offer_id
    where p.provider = 'vipps'
      and p.status in ('PENDING', 'AUTHORIZED')
      and (
        o.status <> 'SENT'
        or o.expires_at <= clock_timestamp()
        or coalesce(p.reconciliation_started_at, p.initiated_at)
          <= clock_timestamp() - make_interval(secs => stale_seconds)
      )
    order by
      (o.status <> 'SENT' or o.expires_at <= clock_timestamp()) desc,
      coalesce(p.reconciliation_started_at, p.initiated_at),
      p.id
    for update of p skip locked
    limit batch_limit
  ), claimed as (
    update public.payments p
    set reconciliation_started_at = clock_timestamp(),
        reconciliation_attempts = reconciliation_attempts + 1,
        reconciliation_error = null
    from due
    where p.id = due.id
    returning p.*
  )
  select
    p.id,
    p.provider_reference,
    p.idempotency_key,
    p.status,
    p.amount_minor,
    p.currency,
    p.capture_started_at,
    o.id,
    o.status,
    o.expires_at,
    r.id,
    r.status
  from claimed p
  join public.offers o on o.id = p.offer_id
  join public.requests r on r.id = o.request_id
  order by p.reconciliation_started_at, p.id;
end;
$$;

revoke all on function public.claim_stale_vipps_payments(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_stale_vipps_payments(integer, integer) to service_role;

create or replace function bata_private.process_payment_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  target_offer public.offers%rowtype;
  previous_status public.request_status;
  offer_is_payable boolean;
  capture_was_claimed boolean;
begin
  new.processed_at := now();

  if not new.signature_verified or not new.success then
    new.processing_error := 'Event was not verified or did not succeed';
    return new;
  end if;

  select * into target_payment
  from public.payments
  where provider = new.provider and provider_reference = new.provider_reference
  for update;

  if not found then
    new.processing_error := 'Unknown payment reference';
    return new;
  end if;

  select * into target_offer
  from public.offers
  where id = target_payment.offer_id
  for update;

  select status into previous_status
  from public.requests
  where id = target_offer.request_id
  for update;

  if new.event_name in ('AUTHORIZED', 'CAPTURED') and (
    new.amount_minor is distinct from target_payment.amount_minor
    or new.currency is distinct from target_payment.currency
  ) then
    new.processing_error := 'Provider amount or currency did not match the immutable offer';
    return new;
  end if;

  offer_is_payable := target_offer.status = 'SENT'
    and previous_status = 'OFFER_SENT'
    and target_offer.expires_at > clock_timestamp()
    and coalesce(new.occurred_at, clock_timestamp()) <= target_offer.expires_at;
  capture_was_claimed := target_payment.capture_started_at is not null
    and target_payment.capture_started_at <= target_offer.expires_at
    and target_payment.capture_started_at > clock_timestamp() - interval '2 minutes'
    and target_offer.status = 'SENT'
    and previous_status = 'OFFER_SENT';

  if new.event_name = 'AUTHORIZED' then
    if target_payment.status = 'CAPTURED' then
      update public.payments
      set last_verified_at = now(), reconciliation_error = null
      where id = target_payment.id;
      return new;
    end if;
    if target_payment.status not in ('PENDING', 'AUTHORIZED') then
      new.processing_error := 'Payment is not awaiting authorization';
      return new;
    end if;
    if not offer_is_payable then
      update public.payments
      set status = 'EXPIRED',
          failure_reason = 'Authorization arrived after the commercial offer expired',
          last_verified_at = now(),
          reconciliation_error = null
      where id = target_payment.id;
      new.processing_error := 'Commercial offer expired before authorization could be captured';
      return new;
    end if;

    update public.payments
    set status = 'AUTHORIZED',
        authorized_at = coalesce(new.occurred_at, now()),
        provider_psp_reference = coalesce(new.provider_psp_reference, provider_psp_reference),
        last_verified_at = now(),
        reconciliation_error = null
    where id = target_payment.id;
  elsif new.event_name = 'CAPTURED' then
    if target_payment.status = 'CAPTURED'
      and target_payment.paid_amount_minor = new.amount_minor then
      update public.payments
      set last_verified_at = now(),
          provider_psp_reference = coalesce(new.provider_psp_reference, provider_psp_reference),
          reconciliation_error = null
      where id = target_payment.id;
      return new;
    end if;
    if target_payment.status not in ('PENDING', 'AUTHORIZED') then
      new.processing_error := 'Payment is not awaiting capture';
      return new;
    end if;
    if not offer_is_payable and not capture_was_claimed then
      update public.payments
      set status = 'FAILED',
          failure_reason = 'Provider reported capture after the commercial offer expired; manual refund review required',
          last_verified_at = now(),
          reconciliation_error = null
      where id = target_payment.id;
      new.processing_error := 'Commercial offer expired before payment capture';
      return new;
    end if;

    update public.payments
    set status = 'CAPTURED',
        paid_amount_minor = new.amount_minor,
        paid_at = coalesce(new.occurred_at, now()),
        provider_psp_reference = coalesce(new.provider_psp_reference, provider_psp_reference),
        last_verified_at = now(),
        failure_reason = null,
        reconciliation_error = null
    where id = target_payment.id;

    update public.offers
    set status = 'PAID', accepted_at = coalesce(target_payment.capture_started_at, new.occurred_at, now())
    where id = target_offer.id and status = 'SENT';

    update public.requests
    set status = 'PAID'
    where id = target_offer.request_id and status = 'OFFER_SENT';

    if found then
      insert into public.status_history (
        request_id, offer_id, payment_id, from_status, to_status, source
      ) values (
        target_offer.request_id, target_offer.id, target_payment.id,
        previous_status, 'PAID', 'payment'
      );

      insert into public.notifications (
        idempotency_key, event_type, request_id, offer_id, payment_id, recipient_email
      )
      select
        'payment:' || target_payment.id::text || ':customer-confirmation',
        'PAYMENT_CONFIRMED_CUSTOMER',
        r.id,
        target_offer.id,
        target_payment.id,
        r.email
      from public.requests r where r.id = target_offer.request_id
      on conflict (idempotency_key) do nothing;
    end if;
  elsif new.event_name in ('ABORTED', 'CANCELLED', 'TERMINATED')
    and target_payment.status in ('PENDING', 'AUTHORIZED') then
    update public.payments
    set status = 'CANCELLED',
        failure_reason = 'Payment attempt ended with provider event ' || new.event_name,
        last_verified_at = now(),
        reconciliation_error = null
    where id = target_payment.id;
  elsif new.event_name = 'EXPIRED'
    and target_payment.status in ('PENDING', 'AUTHORIZED') then
    update public.payments
    set status = 'EXPIRED',
        failure_reason = 'Payment attempt expired at the provider',
        last_verified_at = now(),
        reconciliation_error = null
    where id = target_payment.id;
  elsif new.event_name = 'REFUNDED' and target_payment.status = 'CAPTURED' then
    update public.payments
    set refunded_amount_minor = least(
          target_payment.amount_minor,
          target_payment.refunded_amount_minor + coalesce(new.amount_minor, 0)
        ),
        status = case
          when target_payment.refunded_amount_minor + coalesce(new.amount_minor, 0) >= target_payment.amount_minor
            then 'REFUNDED'::public.payment_status
          else status
        end,
        refunded_at = case
          when target_payment.refunded_amount_minor + coalesce(new.amount_minor, 0) >= target_payment.amount_minor
            then coalesce(new.occurred_at, now())
          else refunded_at
        end,
        last_verified_at = now(),
        reconciliation_error = null
    where id = target_payment.id;

    if target_payment.refunded_amount_minor + coalesce(new.amount_minor, 0) >= target_payment.amount_minor then
      update public.offers set status = 'REFUNDED' where id = target_offer.id;
      update public.requests set status = 'REFUNDED' where id = target_offer.request_id;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.expire_due_offers()
returns table (
  offer_id uuid,
  request_id uuid,
  customer_email text,
  public_reference text,
  project_title text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id, o.request_id
    from public.offers o
    where o.status = 'SENT'
      and o.expires_at <= clock_timestamp()
      and not exists (
        select 1
        from public.payments p
        where p.offer_id = o.id
          and p.status in ('PENDING', 'AUTHORIZED')
          and p.capture_started_at is not null
          and p.capture_started_at <= o.expires_at
          and p.capture_started_at > clock_timestamp() - interval '2 minutes'
      )
    order by o.id
    for update skip locked
  ), changed_offers as (
    update public.offers o
    set status = 'EXPIRED'
    from due
    where o.id = due.id
    returning o.id, o.request_id, o.project_title
  ), changed_requests as (
    update public.requests r
    set status = 'EXPIRED'
    from changed_offers co
    where r.id = co.request_id and r.status = 'OFFER_SENT'
    returning r.id, r.email, r.public_reference
  )
  select co.id, co.request_id, cr.email, cr.public_reference, co.project_title
  from changed_offers co
  join changed_requests cr on cr.id = co.request_id;
end;
$$;

revoke all on function public.expire_due_offers() from public, anon, authenticated;
grant execute on function public.expire_due_offers() to service_role;
