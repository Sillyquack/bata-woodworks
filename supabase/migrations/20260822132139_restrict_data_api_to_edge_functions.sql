-- Managers use admin-api, which validates a fresh Auth user and role before
-- performing service-role operations. No customer/order table or private
-- bucket needs to be reachable directly with a browser JWT. Removing these
-- grants also prevents stale app_metadata claims from retaining data access.
revoke all on table public.requests from anon, authenticated;
revoke all on table public.request_attachments from anon, authenticated;
revoke all on table public.offers from anon, authenticated;
revoke all on table public.offer_attachments from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
revoke all on table public.status_history from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.rate_limit_events from anon, authenticated;

drop policy if exists requests_manager_all on public.requests;
drop policy if exists request_attachments_manager_all on public.request_attachments;
drop policy if exists offers_manager_all on public.offers;
drop policy if exists offer_attachments_manager_all on public.offer_attachments;
drop policy if exists payments_manager_select on public.payments;
drop policy if exists payment_events_manager_select on public.payment_events;
drop policy if exists status_history_manager_select on public.status_history;
drop policy if exists notifications_manager_select on public.notifications;

drop policy if exists storage_manager_read on storage.objects;
drop policy if exists storage_manager_insert on storage.objects;
drop policy if exists storage_manager_update on storage.objects;
drop policy if exists storage_manager_delete on storage.objects;

revoke execute on function bata_private.is_manager() from authenticated;
revoke usage on schema bata_private from authenticated;

-- These Auth foreign keys are used for SET NULL when a manager is removed.
create index if not exists offers_created_by_idx on public.offers (created_by)
where created_by is not null;
create index if not exists offers_approved_by_idx on public.offers (approved_by)
where approved_by is not null;
