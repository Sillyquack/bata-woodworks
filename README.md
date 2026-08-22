# Bata Woodworks

A production-oriented request-to-purchase MVP for selectively commissioned woodwork. Management filters public requests around Bata's interests, creative direction and capacity; only Bata-approved projects and production periods can become immutable private offers, and server-verified payment advances an accepted offer into production.

The application deliberately fails closed: no request can be submitted until the approved privacy version and intake switches are configured, no offer can be issued or purchased until the legal trading gate is approved, and a browser redirect can never mark an order paid.

## Included

- Responsive, accessible public showroom and structured request form
- Private JPEG, PNG, WebP and PDF uploads with content-signature validation
- Manager-only queue, notes and controlled lifecycle transitions
- Versioned private offers with drawings, exact scope, amount, VAT wording, delivery, agreed production period, expiry and snapshotted terms
- Independent public/server intake switch that pauses new requests without hiding the showroom or existing private offers
- Vipps MobilePay ePayment adapter plus a strictly local/test mock provider
- Signed and provider-verified webhook handling with replay protection and exact-amount enforcement
- Scheduled Vipps polling for stale payments, guarded capture and automatic release after offer expiry
- Atomic `OFFER_SENT → PAID → PRODUCTION → READY → DELIVERED` state changes, auditable history and separate payment/production-start messaging
- Resend transactional email adapter, idempotent notification records and safe retry paths
- Browser-role Data API revocation, PostgreSQL RLS defense in depth, private Storage, manager authorization from fresh Auth metadata, rate limiting and idempotency controls
- Centralized verified `.no` identity plus explicit ENK, VAT, legal, intake and live-payment launch gates

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

The checked-in examples contain no credentials. Never commit `.env.local`, Supabase secret/service-role keys, Vipps secrets, Resend keys, webhook secrets or cron secrets. `APP_ENV=local` is required for the mock checkout; production rejects it independently of the mock switches.

## Verification

```bash
npm test
npm run build
npm audit --audit-level=high
npx --yes supabase@2.115.0 db test --local
npx --yes supabase@2.115.0 db advisors --local --type security --fail-on warn
npx --yes supabase@2.115.0 db advisors --local --type performance --fail-on warn
```

The Pages workflow also runs `npm run check:production-config` with its required `VITE_` repository variables before it can build a deployable artifact.

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

Follow [docs/production-runbook.md](docs/production-runbook.md) in order. It contains the verified `.no`/`.com` DNS plan, One.com mail preservation, ENK/legal gates, Supabase/Vipps/Resend setup, manager creation, deployment commands, scheduling, monitoring, recovery, rollback guidance and the final launch checklist.

Implementation and security invariants are recorded in [docs/implementation-notes.md](docs/implementation-notes.md).

This repository does not contain live credentials and this change does not deploy or enable real payments.
