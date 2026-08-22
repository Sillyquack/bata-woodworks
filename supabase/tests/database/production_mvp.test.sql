begin;

select plan(48);

select has_table('public', 'requests', 'requests table exists');
select has_table('public', 'offers', 'offers table exists');
select has_table('public', 'payments', 'payments table exists');
select has_table('public', 'payment_events', 'payment events table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.requests'::regclass), 'requests use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.offers'::regclass), 'offers use RLS');
select ok(not has_table_privilege('anon', 'public.requests', 'select'), 'anonymous role cannot read requests');
select ok(not has_table_privilege('authenticated', 'public.requests', 'select'), 'browser JWT cannot query customer requests directly');
select ok(not has_function_privilege('anon', 'public.expire_due_offers()', 'execute'), 'anonymous role cannot expire offers');
select ok(has_function_privilege('service_role', 'public.expire_due_offers()', 'execute'), 'service role can run expiry');
select ok(not has_function_privilege('anon', 'public.guard_payment_capture(text,text)', 'execute'), 'anonymous role cannot guard capture');
select ok(has_function_privilege('service_role', 'public.guard_payment_capture(text,text)', 'execute'), 'service role can guard capture');
select ok(not has_function_privilege('anon', 'public.claim_stale_vipps_payments(integer,integer)', 'execute'), 'anonymous role cannot claim reconciliation work');
select ok(has_function_privilege('service_role', 'public.claim_stale_vipps_payments(integer,integer)', 'execute'), 'service role can claim reconciliation work');
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

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at
) values (
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000003', 1, 'mock', 'MOCK', 'BW-LATE-AUTH-0003',
  '30000000-0000-4000-8000-000000000004', 'PENDING', 5000, 'NOK', 'test-terms-v1', now() - interval '2 minutes'
);

select is((select count(*)::integer from public.expire_due_offers()), 1, 'expiry job claims one due offer');
select is((select status::text from public.offers where id = '20000000-0000-4000-8000-000000000003'), 'EXPIRED', 'expiry job marks offer expired');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000003'), 'EXPIRED', 'expiry job releases the request without reserving production');

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'mock', 'late-authorization-event', 'BW-LATE-AUTH-0003', 'AUTHORIZED', 5000, 'NOK',
  now(), true, true, '{"test":"late authorization"}'::jsonb
);

select ok(
  (select processing_error is not null from public.payment_events where event_key = 'late-authorization-event'),
  'authorization arriving after commercial expiry is rejected'
);
select is(
  (select status::text from public.payments where id = '30000000-0000-4000-8000-000000000003'),
  'EXPIRED',
  'late authorization terminalizes the payment without capture'
);

insert into public.requests (
  id, public_reference, submission_key, customer_name, email, location,
  request_type, project_description, privacy_version, consent_accepted_at,
  consent_ip_hash, status
) values (
  '10000000-0000-4000-8000-000000000005', 'BW-RETRYTEST1',
  '10000000-0000-4000-8000-000000000006', 'Retry Customer', 'retry@example.test',
  'Oslo', 'Custom furniture', 'A sufficiently detailed request for retry testing.',
  'test-v1', now(), repeat('e', 64), 'OFFER_SENT'
);

insert into public.offers (
  id, request_id, version, status, project_title, specification,
  materials_finish, price_minor, delivery_charge_minor, vat_treatment,
  delivery_terms, production_window, expires_at, terms_version, terms_snapshot,
  issued_at, public_token_hash
) values (
  '20000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005', 1, 'SENT', 'Retry object',
  'Exact specification for an offer that permits a second payment attempt.', 'Oak, oil',
  7000, 0, 'Test VAT wording', 'Pickup', 'Three weeks', now() + interval '1 day',
  'test-terms-v1', 'Test-only retry terms snapshot with sufficient length.', now(), repeat('f', 64)
);

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at
) values (
  '30000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000005', 1, 'mock', 'MOCK', 'BW-RETRY-FIRST-0005',
  '30000000-0000-4000-8000-000000000006', 'PENDING', 7000, 'NOK', 'test-terms-v1', now()
);

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'mock', 'retry-aborted-event', 'BW-RETRY-FIRST-0005', 'ABORTED', 7000, 'NOK',
  now(), true, true, '{"test":"customer aborted"}'::jsonb
);

select is((select status::text from public.payments where id = '30000000-0000-4000-8000-000000000005'), 'CANCELLED', 'aborted checkout cancels only its payment attempt');
select is((select status::text from public.offers where id = '20000000-0000-4000-8000-000000000005'), 'SENT', 'aborted checkout leaves a valid commercial offer sent');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000005'), 'OFFER_SENT', 'aborted checkout leaves the request payable');

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at
) values (
  '30000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000005', 1, 'mock', 'MOCK', 'BW-RETRY-SECOND-0007',
  '30000000-0000-4000-8000-000000000008', 'PENDING', 7000, 'NOK', 'test-terms-v1', now()
);

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'mock', 'retry-captured-event', 'BW-RETRY-SECOND-0007', 'CAPTURED', 7000, 'NOK',
  now(), true, true, '{"test":"verified retry capture"}'::jsonb
);

select is((select status::text from public.payments where id = '30000000-0000-4000-8000-000000000007'), 'CAPTURED', 'second payment attempt can be captured');
select is((select status::text from public.offers where id = '20000000-0000-4000-8000-000000000005'), 'PAID', 'successful retry marks the offer paid');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000005'), 'PAID', 'successful retry marks the request paid');

insert into public.requests (
  id, public_reference, submission_key, customer_name, email, location,
  request_type, project_description, privacy_version, consent_accepted_at,
  consent_ip_hash, status
) values (
  '10000000-0000-4000-8000-000000000007', 'BW-LATECAPT01',
  '10000000-0000-4000-8000-000000000008', 'Late Capture', 'late-capture@example.test',
  'Oslo', 'Home object', 'A sufficiently detailed request for late capture testing.',
  'test-v1', now(), repeat('1', 64), 'OFFER_SENT'
);

insert into public.offers (
  id, request_id, version, status, project_title, specification,
  materials_finish, price_minor, delivery_charge_minor, vat_treatment,
  delivery_terms, production_window, expires_at, terms_version, terms_snapshot,
  issued_at, public_token_hash
) values (
  '20000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000007', 1, 'SENT', 'Late capture object',
  'Exact specification for a capture that arrives after commercial expiry.', 'Pine, oil',
  8000, 0, 'Test VAT wording', 'Pickup', 'Three weeks', now() - interval '1 second',
  'test-terms-v1', 'Test-only late capture terms snapshot with sufficient length.', now() - interval '1 day', repeat('2', 64)
);

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at
) values (
  '30000000-0000-4000-8000-000000000009',
  '20000000-0000-4000-8000-000000000007', 1, 'mock', 'MOCK', 'BW-LATE-CAPTURE-0009',
  '30000000-0000-4000-8000-000000000010', 'PENDING', 8000, 'NOK', 'test-terms-v1', now() - interval '1 minute'
);

select is(
  (select is_allowed from public.guard_payment_capture('mock', 'BW-LATE-CAPTURE-0009')),
  false,
  'capture guard rejects an expired commercial offer'
);

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'mock', 'late-capture-event', 'BW-LATE-CAPTURE-0009', 'CAPTURED', 8000, 'NOK',
  now(), true, true, '{"test":"late capture"}'::jsonb
);

select ok((select processing_error is not null from public.payment_events where event_key = 'late-capture-event'), 'capture arriving after commercial expiry is rejected');
select is((select status::text from public.payments where id = '30000000-0000-4000-8000-000000000009'), 'FAILED', 'late provider capture becomes a terminal payment incident');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000007'), 'OFFER_SENT', 'late capture cannot advance the request to paid');

insert into public.requests (
  id, public_reference, submission_key, customer_name, email, location,
  request_type, project_description, privacy_version, consent_accepted_at,
  consent_ip_hash, status
) values (
  '10000000-0000-4000-8000-000000000009', 'BW-RECONCIL01',
  '10000000-0000-4000-8000-000000000010', 'Reconcile Customer', 'reconcile@example.test',
  'Oslo', 'Custom furniture', 'A sufficiently detailed request for reconciliation testing.',
  'test-v1', now(), repeat('3', 64), 'OFFER_SENT'
);

insert into public.offers (
  id, request_id, version, status, project_title, specification,
  materials_finish, price_minor, delivery_charge_minor, vat_treatment,
  delivery_terms, production_window, expires_at, terms_version, terms_snapshot,
  issued_at, public_token_hash
) values (
  '20000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000009', 1, 'SENT', 'Reconcile object',
  'Exact specification for a stale Vipps payment reconciliation test.', 'Oak, oil',
  9000, 0, 'Test VAT wording', 'Pickup', 'Three weeks', now() + interval '1 day',
  'test-terms-v1', 'Test-only reconciliation terms snapshot with sufficient length.', now(), repeat('4', 64)
);

insert into public.payments (
  id, offer_id, offer_version, provider, payment_method, provider_reference,
  idempotency_key, status, amount_minor, currency, terms_version, terms_accepted_at,
  initiated_at
) values (
  '30000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000009', 1, 'vipps', 'WALLET', 'BW-STALE-VIPPS-0011',
  '30000000-0000-4000-8000-000000000012', 'PENDING', 9000, 'NOK', 'test-terms-v1', now() - interval '1 minute',
  now() - interval '1 minute'
);

select is((select count(*)::integer from public.claim_stale_vipps_payments(10, 5)), 1, 'reconciliation worker claims a stale Vipps payment');
select is((select reconciliation_attempts from public.payments where id = '30000000-0000-4000-8000-000000000011'), 1, 'claim records the reconciliation attempt');
select is((select is_allowed from public.guard_payment_capture('vipps', 'BW-STALE-VIPPS-0011')), true, 'stale authorized payment is capture-guarded while offer remains valid');
select ok((select capture_started_at is not null from public.payments where id = '30000000-0000-4000-8000-000000000011'), 'capture guard records an in-flight capture claim');

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'vipps', 'reconcile:BW-STALE-VIPPS-0011:CAPTURED:9000', 'BW-STALE-VIPPS-0011', 'CAPTURED', 9000, 'NOK',
  now(), true, true, '{"source":"scheduled_reconciliation","verified":true}'::jsonb
);

select is((select status::text from public.payments where id = '30000000-0000-4000-8000-000000000011'), 'CAPTURED', 'reconciled provider event uses the normal payment transition');
select is((select status::text from public.requests where id = '10000000-0000-4000-8000-000000000009'), 'PAID', 'missed webhook recovery advances the request exactly once');

insert into public.payment_events (
  provider, event_key, provider_reference, event_name, amount_minor, currency,
  occurred_at, signature_verified, success, payload
) values (
  'vipps', 'delayed-webhook-after-reconciliation', 'BW-STALE-VIPPS-0011', 'CAPTURED', 9000, 'NOK',
  now(), true, true, '{"source":"delayed_webhook","verified":true}'::jsonb
);

select ok((select processing_error is null from public.payment_events where event_key = 'delayed-webhook-after-reconciliation'), 'delayed webhook after reconciliation is an idempotent no-op');
select is((select count(*)::integer from public.status_history where payment_id = '30000000-0000-4000-8000-000000000011' and to_status = 'PAID'), 1, 'cross-path duplicate capture advances status exactly once');

select * from finish();
rollback;
