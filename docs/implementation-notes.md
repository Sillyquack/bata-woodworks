# Implementation notes

## System boundary

The React/Vite application is a public client. It receives only a Supabase project URL and publishable key. All authority-bearing operations run in Supabase Edge Functions with the service role and all customer/business records are denied to browser roles by PostgreSQL RLS.

| Boundary | Responsibility | Trust rule |
| --- | --- | --- |
| Public site | Show content and submit a structured request | Inputs are untrusted; the server repeats every validation |
| Private offer link | Display one token-selected offer and initiate its exact payment | The raw token is stored only in the URL fragment and email; the database stores SHA-256 only |
| Manager UI | Review requests, edit draft offers and advance permitted states | Every call requires a valid user JWT and fresh `app_metadata.role = manager` |
| Edge Functions | Validate, authorize, sign URLs, call email/payment providers | Secrets and the service role never enter the browser |
| PostgreSQL | Enforce data model, immutability and atomic state transitions | Triggers reject illegal transitions and payment mismatches even if an application path regresses |
| Private Storage | Hold request attachments and offer assets | No anonymous access; customer access uses short-lived signed URLs for the selected offer only |

## State and commercial invariants

- A request is not a purchase. Submission creates `NEW` only.
- Management filters requests through `NEW → REVIEW → DESIGN`; requests may be held or declined before Bata is involved. Only a project Bata wants to make and that fits his interests, creative direction and capacity should enter `DESIGN`.
- Issuing a valid draft offer atomically sets `OFFER_SENT` and requires an explicit per-send confirmation that Bata approved the project and its production period. The API enforces the confirmation without persisting it as a fabricated permanent fact.
- Issued scope, materials, amount, VAT wording, delivery, agreed production period, expiry, terms snapshot and assets are immutable. A change requires a new offer version.
- The payment amount and currency come from the active offer on the server. Client-supplied prices are ignored.
- Payment initiation is idempotent and one open payment is allowed per offer version.
- Provider return URLs are display-only. Only an authenticated webhook event plus a provider snapshot/capture for the exact amount can produce `PAID`.
- Payment events are unique by provider event key. Replays return success without reapplying state or emails.
- `PAID` is advanced atomically from the payment event trigger; no manager endpoint can set it manually.
- After payment, the customer gets a confirmation and management gets `START PRODUCTION`. Manager progression is then `PAID → PRODUCTION → READY → DELIVERED`.
- Expired offers become non-payable; any outstanding Vipps reservation is cancelled, and stale private links and rotated links do not reveal another record.

## Security decisions

- Public functions use explicit origin allowlists, narrow methods, generic customer-facing errors and no ambient table access.
- Uploads are capped at five files, 5 MB each and 15 MB total. Extensions are derived from allowlisted MIME types only after magic-byte validation.
- Request IP addresses are HMAC-pseudonymized with `RATE_LIMIT_SALT`; raw IP addresses are not stored.
- `VITE_REQUEST_INTAKE_OPEN=false` disables the public form while leaving the showroom and private offer routes available. Matching `REQUEST_INTAKE_OPEN=false` makes the Edge Function reject direct submissions; neither setting affects accepted or paid offers.
- Submission, payment and notification side effects use idempotency keys.
- Vipps webhook verification checks request freshness, body hash, HMAC, merchant serial number and provider state. Immediately before exact capture, a service-only RPC locks and re-checks the payment, offer expiry/status and request status. A short-lived capture claim prevents the expiry worker racing an in-flight provider call.
- Webhooks are the fast path. A scheduled worker polls stale Vipps `PENDING`/`AUTHORIZED` payments, cancels reservations for non-payable offers and feeds verified snapshots through the same idempotent `payment_events` trigger used by webhooks.
- `VIPPS_LIVE_ENABLED=true` is a separate production interlock. Mock payments also require both `PAYMENT_PROVIDER=mock` and `ALLOW_MOCK_PAYMENTS=true`.
- The app uses a restrictive CSP, `no-referrer`, token-in-fragment routes and `Cache-Control: no-store` for protected responses.
- Payment credentials are handled by Vipps; the application stores provider references and amounts, never wallet/card credentials.
- Transactional email records survive provider failure and explicit resend actions use new, rotatable offer tokens.

## Important files

- `supabase/migrations/20260821192409_production_mvp.sql` — schema, grants, RLS, buckets, triggers and expiry RPC
- `supabase/migrations/20260821203607_harden_payment_lifecycle.sql` — capture guard, retry-safe cancellation and reconciliation claims
- `supabase/functions/submit-request` — validation, rate limit, storage and request emails
- `supabase/functions/admin-api` — manager queue, state changes and offers
- `supabase/functions/offer` — token-safe offer projection and signed assets
- `supabase/functions/create-payment` — idempotent server-priced checkout
- `supabase/functions/payment-webhook` — signature/provider verification, capture and fulfillment signal
- `supabase/functions/expire-offers` — authenticated scheduled expiry
- `supabase/functions/reconcile-payments` — authenticated stale Vipps polling and missed-webhook recovery
- `supabase/tests/database/production_mvp.test.sql` — pgTAP invariants
- `tests/edge-flow.test.js` — real local HTTP flow

## Deliberate MVP limits

- Refund/cancellation states are represented and audited. Automated cancellation is limited to releasing uncaptured Vipps reservations for expired/non-payable offers; staff refund/cancel actions remain unavailable until policy is approved.
- The manager queue is single-role and intentionally small; there is no granular staff permission matrix.
- Customer status is communicated transactionally; there is no customer account or general order portal.
- Legal pages are structured launch gates, not fabricated legal advice. They remain visibly blocked on `needs_owner` values until the business owner approves final text.
