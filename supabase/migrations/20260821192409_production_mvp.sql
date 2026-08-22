create extension if not exists pgcrypto with schema extensions;

create schema if not exists bata_private;
revoke all on schema bata_private from public, anon, authenticated;

create type public.request_status as enum (
  'NEW',
  'REVIEW',
  'DESIGN',
  'OFFER_SENT',
  'PAID',
  'PRODUCTION',
  'READY',
  'DELIVERED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED'
);

create type public.offer_status as enum (
  'DRAFT',
  'SENT',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED'
);

create type public.payment_status as enum (
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
  'EXPIRED'
);

create type public.notification_status as enum (
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED'
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  submission_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null check (char_length(customer_name) between 2 and 160),
  email text not null check (char_length(email) between 3 and 320),
  phone text check (phone is null or char_length(phone) <= 40),
  location text not null check (char_length(location) between 2 and 240),
  request_type text not null check (char_length(request_type) between 2 and 120),
  project_description text not null check (char_length(project_description) between 20 and 8000),
  rough_dimensions text check (rough_dimensions is null or char_length(rough_dimensions) <= 1000),
  intended_use text check (intended_use is null or char_length(intended_use) <= 2000),
  budget_range text check (budget_range is null or char_length(budget_range) <= 120),
  requested_timeline text check (requested_timeline is null or char_length(requested_timeline) <= 240),
  requested_date date,
  privacy_version text not null check (char_length(privacy_version) between 1 and 80),
  consent_accepted_at timestamptz not null,
  consent_ip_hash text not null check (char_length(consent_ip_hash) = 64),
  consent_user_agent text check (consent_user_agent is null or char_length(consent_user_agent) <= 500),
  status public.request_status not null default 'NEW',
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 20000),
  ready_instructions text check (ready_instructions is null or char_length(ready_instructions) <= 4000),
  constraint requests_reference_format check (public_reference ~ '^BW-[A-Z0-9]{10}$')
);

create index requests_status_created_at_idx on public.requests (status, created_at desc);
create index requests_email_created_at_idx on public.requests (lower(email), created_at desc);

create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  bucket_id text not null default 'request-attachments' check (bucket_id = 'request-attachments'),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (char_length(sha256) = 64)
);

create index request_attachments_request_id_idx on public.request_attachments (request_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  version integer not null check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  public_token_hash text unique check (public_token_hash is null or char_length(public_token_hash) = 64),
  status public.offer_status not null default 'DRAFT',
  project_title text not null check (char_length(project_title) between 2 and 240),
  specification text not null check (char_length(specification) between 20 and 20000),
  materials_finish text not null check (char_length(materials_finish) between 2 and 4000),
  price_minor bigint not null check (price_minor >= 0),
  delivery_charge_minor bigint not null default 0 check (delivery_charge_minor >= 0),
  total_minor bigint generated always as (price_minor + delivery_charge_minor) stored,
  currency text not null default 'NOK' check (currency = 'NOK'),
  vat_treatment text not null check (char_length(vat_treatment) between 2 and 500),
  delivery_terms text not null check (char_length(delivery_terms) between 2 and 4000),
  production_window text not null check (char_length(production_window) between 2 and 1000),
  expires_at timestamptz not null,
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  terms_snapshot text not null check (char_length(terms_snapshot) between 20 and 30000),
  accepted_at timestamptz,
  constraint offers_id_version_key unique (id, version),
  constraint offers_request_version_key unique (request_id, version),
  constraint offers_issued_state check (
    (status = 'DRAFT' and issued_at is null and public_token_hash is null)
    or
    (status <> 'DRAFT' and issued_at is not null and public_token_hash is not null)
  )
);

create index offers_request_id_idx on public.offers (request_id);
create index offers_status_expires_at_idx on public.offers (status, expires_at);

create table public.offer_attachments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  bucket_id text not null default 'offer-assets' check (bucket_id = 'offer-assets'),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (char_length(sha256) = 64)
);

create index offer_attachments_offer_id_idx on public.offer_attachments (offer_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  offer_version integer not null check (offer_version > 0),
  provider text not null check (provider in ('mock', 'vipps')),
  payment_method text not null check (payment_method in ('MOCK', 'WALLET', 'CARD')),
  provider_reference text not null,
  provider_psp_reference text,
  idempotency_key text not null,
  checkout_url text,
  status public.payment_status not null default 'PENDING',
  amount_minor bigint not null check (amount_minor > 0),
  paid_amount_minor bigint not null default 0 check (paid_amount_minor >= 0),
  refunded_amount_minor bigint not null default 0 check (refunded_amount_minor >= 0),
  currency text not null default 'NOK' check (currency = 'NOK'),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  initiated_at timestamptz not null default now(),
  authorized_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  last_verified_at timestamptz,
  failure_reason text,
  constraint payments_provider_reference_key unique (provider, provider_reference),
  constraint payments_provider_idempotency_key unique (provider, idempotency_key),
  constraint payments_offer_version_fk foreign key (offer_id, offer_version)
    references public.offers(id, version) on delete restrict
);

create index payments_offer_id_idx on public.payments (offer_id);
create unique index payments_one_open_per_offer_idx on public.payments (offer_id)
  where status in ('PENDING', 'AUTHORIZED', 'CAPTURED');

create table public.payment_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('mock', 'vipps')),
  event_key text not null,
  provider_reference text not null,
  provider_psp_reference text,
  event_name text not null,
  amount_minor bigint,
  currency text,
  occurred_at timestamptz,
  signature_verified boolean not null default false,
  success boolean not null default false,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  constraint payment_events_provider_event_key unique (provider, event_key)
);

create index payment_events_provider_reference_idx
  on public.payment_events (provider, provider_reference, created_at desc);

create table public.status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  from_status public.request_status,
  to_status public.request_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('request', 'manager', 'offer', 'payment', 'expiry')),
  created_at timestamptz not null default now()
);

create index status_history_request_id_created_at_idx
  on public.status_history (request_id, created_at desc);
create index status_history_offer_id_idx on public.status_history (offer_id);
create index status_history_payment_id_idx on public.status_history (payment_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null,
  request_id uuid references public.requests(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  recipient_email text not null,
  status public.notification_status not null default 'PENDING',
  provider_message_id text,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_status_created_at_idx on public.notifications (status, created_at);
create index notifications_request_id_idx on public.notifications (request_id);
create index notifications_offer_id_idx on public.notifications (offer_id);
create index notifications_payment_id_idx on public.notifications (payment_id);

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  key_hash text not null check (char_length(key_hash) = 64),
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx
  on public.rate_limit_events (key_hash, action, created_at desc);

create or replace function bata_private.is_manager()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'manager', false)
$$;

grant usage on schema bata_private to authenticated;
grant execute on function bata_private.is_manager() to authenticated;

create or replace function bata_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger requests_set_updated_at
before update on public.requests
for each row execute function bata_private.set_updated_at();

create trigger offers_set_updated_at
before update on public.offers
for each row execute function bata_private.set_updated_at();

create or replace function bata_private.protect_issued_offer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' and (
    new.request_id is distinct from old.request_id
    or new.version is distinct from old.version
    or new.project_title is distinct from old.project_title
    or new.specification is distinct from old.specification
    or new.materials_finish is distinct from old.materials_finish
    or new.price_minor is distinct from old.price_minor
    or new.delivery_charge_minor is distinct from old.delivery_charge_minor
    or new.currency is distinct from old.currency
    or new.vat_treatment is distinct from old.vat_treatment
    or new.delivery_terms is distinct from old.delivery_terms
    or new.production_window is distinct from old.production_window
    or new.expires_at is distinct from old.expires_at
    or new.terms_version is distinct from old.terms_version
    or new.terms_snapshot is distinct from old.terms_snapshot
    or new.issued_at is distinct from old.issued_at
  ) then
    raise exception 'Issued offer commercial terms are immutable; create a new version';
  end if;

  return new;
end;
$$;

create trigger offers_protect_issued_terms
before update on public.offers
for each row execute function bata_private.protect_issued_offer();

create or replace function bata_private.issue_offer_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_request_status public.request_status;
begin
  if old.status = 'DRAFT' and new.status = 'SENT' then
    select status into current_request_status
    from public.requests
    where id = new.request_id
    for update;

    if current_request_status is distinct from 'DESIGN'::public.request_status then
      raise exception 'Request must be in DESIGN before an offer can be sent';
    end if;

    update public.requests set status = 'OFFER_SENT' where id = new.request_id;
    insert into public.status_history (
      request_id, offer_id, from_status, to_status, actor_user_id, source
    ) values (
      new.request_id, new.id, current_request_status, 'OFFER_SENT', new.approved_by, 'offer'
    );
  end if;
  return new;
end;
$$;

create trigger offers_issue_lifecycle
before update on public.offers
for each row execute function bata_private.issue_offer_transition();

create or replace function bata_private.protect_offer_attachment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_offer_id uuid;
  target_status public.offer_status;
begin
  target_offer_id := case when tg_op = 'DELETE' then old.offer_id else new.offer_id end;
  select status into target_status from public.offers where id = target_offer_id;

  if target_status is distinct from 'DRAFT'::public.offer_status then
    raise exception 'Attachments on an issued offer are immutable; create a new offer version';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger offer_attachments_protect_issued
before insert or update or delete on public.offer_attachments
for each row execute function bata_private.protect_offer_attachment();

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

  select * into target_offer from public.offers where id = target_payment.offer_id for update;

  if new.event_name in ('AUTHORIZED', 'CAPTURED') and (
    new.amount_minor is distinct from target_payment.amount_minor
    or new.currency is distinct from target_payment.currency
  ) then
    new.processing_error := 'Provider amount or currency did not match the immutable offer';
    return new;
  end if;

  if new.event_name = 'AUTHORIZED' and target_payment.status = 'PENDING' then
    update public.payments
    set status = 'AUTHORIZED',
        authorized_at = coalesce(new.occurred_at, now()),
        provider_psp_reference = coalesce(new.provider_psp_reference, provider_psp_reference),
        last_verified_at = now()
    where id = target_payment.id;
  elsif new.event_name = 'CAPTURED' and target_payment.status in ('PENDING', 'AUTHORIZED') then
    update public.payments
    set status = 'CAPTURED',
        paid_amount_minor = new.amount_minor,
        paid_at = coalesce(new.occurred_at, now()),
        provider_psp_reference = coalesce(new.provider_psp_reference, provider_psp_reference),
        last_verified_at = now()
    where id = target_payment.id;

    update public.offers
    set status = 'PAID', accepted_at = coalesce(new.occurred_at, now())
    where id = target_offer.id and status = 'SENT';

    select status into previous_status from public.requests where id = target_offer.request_id for update;
    update public.requests set status = 'PAID'
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
    set status = 'CANCELLED', last_verified_at = now()
    where id = target_payment.id;

    update public.offers set status = 'CANCELLED'
    where id = target_offer.id and status = 'SENT';

    update public.requests set status = 'CANCELLED'
    where id = target_offer.request_id and status = 'OFFER_SENT';
  elsif new.event_name = 'EXPIRED' and target_payment.status = 'PENDING' then
    update public.payments set status = 'EXPIRED', last_verified_at = now()
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
        last_verified_at = now()
    where id = target_payment.id;

    if target_payment.refunded_amount_minor + coalesce(new.amount_minor, 0) >= target_payment.amount_minor then
      update public.offers set status = 'REFUNDED' where id = target_offer.id;
      update public.requests set status = 'REFUNDED' where id = target_offer.request_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger payment_events_process
before insert on public.payment_events
for each row execute function bata_private.process_payment_event();

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
    where o.status = 'SENT' and o.expires_at <= now()
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

alter table public.requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.offers enable row level security;
alter table public.offer_attachments enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.rate_limit_events enable row level security;

create policy requests_manager_all on public.requests
for all to authenticated
using ((select bata_private.is_manager()))
with check ((select bata_private.is_manager()));

create policy request_attachments_manager_all on public.request_attachments
for all to authenticated
using ((select bata_private.is_manager()))
with check ((select bata_private.is_manager()));

create policy offers_manager_all on public.offers
for all to authenticated
using ((select bata_private.is_manager()))
with check ((select bata_private.is_manager()));

create policy offer_attachments_manager_all on public.offer_attachments
for all to authenticated
using ((select bata_private.is_manager()))
with check ((select bata_private.is_manager()));

create policy payments_manager_select on public.payments
for select to authenticated
using ((select bata_private.is_manager()));

create policy payment_events_manager_select on public.payment_events
for select to authenticated
using ((select bata_private.is_manager()));

create policy status_history_manager_select on public.status_history
for select to authenticated
using ((select bata_private.is_manager()));

create policy notifications_manager_select on public.notifications
for select to authenticated
using ((select bata_private.is_manager()));

grant select, insert, update on public.requests, public.request_attachments,
  public.offers, public.offer_attachments to authenticated;
grant select on public.payments, public.payment_events, public.status_history,
  public.notifications to authenticated;

grant select, insert, update, delete on public.requests, public.request_attachments,
  public.offers, public.offer_attachments, public.payments, public.payment_events,
  public.status_history, public.notifications, public.rate_limit_events to service_role;
grant usage, select on sequence public.payment_events_id_seq,
  public.status_history_id_seq, public.rate_limit_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'request-attachments',
    'request-attachments',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'offer-assets',
    'offer-assets',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_manager_read on storage.objects
for select to authenticated
using (
  bucket_id in ('request-attachments', 'offer-assets')
  and (select bata_private.is_manager())
);

create policy storage_manager_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('request-attachments', 'offer-assets')
  and (select bata_private.is_manager())
);

create policy storage_manager_update on storage.objects
for update to authenticated
using (
  bucket_id in ('request-attachments', 'offer-assets')
  and (select bata_private.is_manager())
)
with check (
  bucket_id in ('request-attachments', 'offer-assets')
  and (select bata_private.is_manager())
);

create policy storage_manager_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('request-attachments', 'offer-assets')
  and (select bata_private.is_manager())
);
