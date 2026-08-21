# Bata Woodworks

A production-oriented request-to-purchase MVP for custom woodwork. The public site accepts structured requests, the private manager queue turns selected requests into immutable offers, and a server-verified payment advances the accepted offer into production.

The application deliberately fails closed: no request can be submitted until the approved privacy version is configured, no offer can be purchased without transactional email and a payment provider, and a browser redirect can never mark an order paid.

## Included

- Responsive, accessible public showroom and structured request form
- Private JPEG, PNG, WebP and PDF uploads with content-signature validation
- Manager-only queue, notes and controlled lifecycle transitions
- Versioned private offers with drawings, exact scope, amount, VAT wording, delivery, production window, expiry and snapshotted terms
- Vipps MobilePay ePayment adapter plus a strictly local/test mock provider
- Signed and provider-verified webhook handling with replay protection and exact-amount enforcement
- Scheduled Vipps polling for stale payments, guarded capture and automatic release after offer expiry
- Atomic `OFFER_SENT → PAID → PRODUCTION → READY → DELIVERED` state changes and auditable history
- Resend transactional email adapter, idempotent notification records and safe retry paths
- PostgreSQL RLS, private Storage buckets, manager authorization from fresh Auth metadata, rate limiting and idempotency controls
- Legal/privacy launch gates that identify every unresolved owner decision as `needs_owner`

## Local development

Prerequisites: Node.js 22+, Docker, Deno 2.9.2 and the Supabase CLI 2.115.0.

```bash
npm ci
cp .env.example .env.local
cp supabase/.env.example supabase/.env.local
npx --yes supabase@2.115.0 start
npx --yes supabase@2.115.0 functions serve --env-file supabase/.env.local
npm run dev
```

Use the local publishable key printed by `supabase status` in `.env.local`. Local ports are intentionally namespaced under `5632x` in [supabase/config.toml](supabase/config.toml).

The checked-in examples contain no credentials. Never commit `.env.local`, Supabase service-role keys, Vipps secrets, Resend keys, webhook secrets or cron secrets.

## Verification

```bash
npm test
npm run build
npm audit --audit-level=high
npx --yes supabase@2.115.0 db test --local
npx --yes supabase@2.115.0 db advisors --local --type security --fail-on warn
npx --yes supabase@2.115.0 db advisors --local --type performance --fail-on warn
```

Run the full HTTP integration test while the local stack and Edge Functions are running:

```bash
TEST_SUPABASE_URL=http://127.0.0.1:56321 \
TEST_SUPABASE_PUBLISHABLE_KEY='<local publishable key>' \
TEST_SUPABASE_SECRET_KEY='<local service-role key>' \
TEST_MOCK_PAYMENT_SECRET='<value from supabase/.env.local>' \
TEST_CRON_SECRET='<value from supabase/.env.local>' \
npm test
```

The database suite covers RLS and Storage isolation, offer immutability, exact payment amounts, webhook replay, guarded/atomic paid transitions, retry-safe cancellation, stale-payment claims, notifications and expiry. The HTTP suite covers the customer, manager, offer and payment flow across the real local API boundary. Deno tests cover Vipps reconciliation decisions for missed and delayed webhooks.

## Production handoff

Follow [docs/production-runbook.md](docs/production-runbook.md) in order. It contains the owner-supplied values, Supabase/Vipps/Resend setup, manager creation, deployment commands, webhook/expiry/reconciliation scheduling, smoke tests, rollback guidance and the final launch checklist.

Implementation and security invariants are recorded in [docs/implementation-notes.md](docs/implementation-notes.md).

This repository does not contain live credentials and this change does not deploy or enable real payments.
