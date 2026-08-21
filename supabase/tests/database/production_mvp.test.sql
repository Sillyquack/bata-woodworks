begin;

select plan(24);

select has_table('public', 'requests', 'requests table exists');
select has_table('public', 'offers', 'offers table exists');
select has_table('public', 'payments', 'payments table exists');
select has_table('public', 'payment_events', 'payment events table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.requests'::regclass), 'requests use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.offers'::regclass), 'offers use RLS');
select ok(not has_table_privilege('anon', 'public.requests', 'select'), 'anonymous role cannot read requests');
select ok(has_table_privilege('authenticated', 'public.requests', 'select'), 'authenticated manager path has table privilege');
select ok(not has_function_privilege('anon', 'public.expire_due_offers()', 'execute'), 'anonymous role cannot expire offers');
select ok(has_function_privilege('service_role', 'public.expire_due_offers()', 'execute'), 'service role can run expiry');
select is(
  (select count(*)::integer from storage.buckets where id in ('request-attachments', 'offer-assets') and not public),
  2,
  'attachment buckets are private'
);

insert into public.requests (
  id, public_reference, submission_key, customer_name, email, location,
  request_type, project_description, privacy_version, consent_accepted_at,
  consent_ip_hash, status
) values (
  '10000000-0000-4000-8000-000000000001', 'BW-TESTABCDEF',
  '10000000-0000-4000-8000-000000000002', 'Test Customer', 'customer@example.test',
  'Oslo', 'Custom furniture', 'A sufficiently detailed custom furniture request.',
  'test-v1', now(), repeat('a', 64), 'DESIGN'
);

insert into public.offers (
  id, request_id, version, status, project_title, specification,
  materials_finish, price_minor, delivery_charge_minor, vat_treatment,
  delivery_terms, production_window, expires_at, terms_version, terms_snapshot
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 1, 'DRAFT', 'Test table',
  'Exact immutable specification for the test custom table.', 'Oak, hardwax oil',
  9000, 1000, 'Test VAT wording', 'Pickup in Oslo', 'Four to six weeks',
  now() + interval '7 days', 'test-terms-v1',
  'Test-only terms snapshot long enough for the database constraint.'
);

update public.offers
set status = 'SENT', issued_at = now(), public_token_hash = repeat('b', 64)
where id = '20000000-0000-4000-8000-000000000001';

select is(
  (select status::text from public.requests where id = '10000000-0000-4000-8000-000000000001'),
  'OFFER_SENT',
  'issuing a draft atomically advances the request'
);

select throws_ok(
  $$update public.offers set price_minor = 1 where id = '20000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Issued offer commercial terms are immutable; create a new version',
  'issued commercial terms cannot be edited'
);

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at
) values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 1, 'mock', 'MOCK', 'BW-MOCK-REFERENCE-0001',
  '30000000-0000-4000-8000-000000000002', 'PENDING', 10000, 'NOK', 'test-terms-v1', now()
);

select is(
  (select status::text from public.payments where id = '30000000-0000-4000-8000-000000000001'),
  'PENDING',
  'creating or returning from checkout does not mark payment paid'
);

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  signature_verified, success, payload
) values (
  'mock', 'bad-amount-event', 'BW-MOCK-REFERENCE-0001', 'CAPTURED', 9999, 'NOK',
  true, true, '{"test":"tampered amount"}'::jsonb
);

select ok(
  (select processing_error is not null from public.payment_events where event_key = 'bad-amount-event'),
  'tampered provider amount is rejected'
);
select is(
  (select status::text from public.requests where id = '10000000-0000-4000-8000-000000000001'),
  'OFFER_SENT',
  'tampered amount cannot advance the request'
);

insert into public.payment_events (
  provider, event_key, provider_reference, provider_psp_reference, event_name,
  amount_minor, currency, occurred_at, signature_verified, success, payload
) values (
  'mock', 'valid-capture-event', 'BW-MOCK-REFERENCE-0001', 'psp-test-1', 'CAPTURED',
  10000, 'NOK', now(), true, true, '{"test":"valid capture"}'::jsonb
);

select is((select status::text from public.payments where id = '30000000-0000-4000-8000-000000000001'), 'CAPTURED', 'verified exact payment is captured');
select is((select status::text from public.offers where id = '20000000-0000-4000-8000-000000000001'), 'PAID', 'verified exact payment marks offer paid');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000001'), 'PAID', 'verified exact payment marks request paid');
select is(
  (select count(*)::integer from public.notifications where idempotency_key = 'payment:30000000-0000-4000-8000-000000000001:customer-confirmation'),
  1,
  'payment creates one customer confirmation notification'
);
select throws_ok(
  $$insert into public.payment_events (provider, event_key, provider_reference, event_name, amount_minor, currency, signature_verified, success, payload) values ('mock', 'valid-capture-event', 'BW-MOCK-REFERENCE-0001', 'CAPTURED', 10000, 'NOK', true, true, '{}'::jsonb)$$,
  '23505',
  'duplicate key value violates unique constraint "payment_events_provider_event_key"',
  'webhook replay is blocked by the provider event key'
);

insert into public.requests (
  id, public_reference, submission_key, customer_name, email, location,
  request_type, project_description, privacy_version, consent_accepted_at,
  consent_ip_hash, status
) values (
  '10000000-0000-4000-8000-000000000003', 'BW-EXPIRETEST',
  '10000000-0000-4000-8000-000000000004', 'Expiry Customer', 'expiry@example.test',
  'Bergen', 'Home object', 'A sufficiently detailed request used for expiry testing.',
  'test-v1', now(), repeat('c', 64), 'OFFER_SENT'
);

insert into public.offers (
  id, request_id, version, status, project_title, specification,
  materials_finish, price_minor, delivery_charge_minor, vat_treatment,
  delivery_terms, production_window, expires_at, terms_version, terms_snapshot,
  issued_at, public_token_hash
) values (
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003', 1, 'SENT', 'Expired object',
  'Exact specification for an offer that should be expired by the job.', 'Pine, oil',
  5000, 0, 'Test VAT wording', 'Pickup', 'Two weeks', now() - interval '1 minute',
  'test-terms-v1', 'Test-only expiry terms snapshot with sufficient length.', now() - interval '2 days', repeat('d', 64)
);

select is((select count(*)::integer from public.expire_due_offers()), 1, 'expiry job claims one due offer');
select is((select status::text from public.offers where id = '20000000-0000-4000-8000-000000000003'), 'EXPIRED', 'expiry job marks offer expired');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000003'), 'EXPIRED', 'expiry job releases the request without reserving production');

select * from finish();
rollback;
