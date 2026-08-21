# Production runbook

No production deployment or real payment should occur until every `needs_owner` item and launch check below is complete.

## 1. Owner decisions and accounts

Record these outside the repository in the approved password/secret manager:

- `needs_owner`: verified legal business name, organization number, registered address, public email, public telephone and VAT registration/treatment
- `needs_owner`: privacy controller/contact, retention schedule, processor list, processing regions, data-subject request process and supervisory authority wording
- `needs_owner`: final custom-order terms, withdrawal-exception wording, delivery/delay rules, complaint/reclamation contact, cancellation/refund policy and terms version identifier
- `needs_owner`: production domain and final GitHub Pages/custom-domain URL
- `needs_owner`: internal operational email and the manager user email(s)
- A production Supabase project in the intended region with billing, backups, MFA and organization access reviewed
- A verified Resend sending domain and least-privilege API key
- An approved Vipps MobilePay merchant/ePayment account, first in the test environment and then production

Have Norwegian consumer/privacy counsel review the final public wording. The application does not invent identity, VAT or consumer-rights claims.

## 2. Prepare Supabase

Use a separate non-production project for the complete rehearsal. From a clean checkout of the reviewed commit:

```bash
npx --yes supabase@2.115.0 login
npx --yes supabase@2.115.0 link --project-ref '<project-ref>'
npx --yes supabase@2.115.0 db push --linked --dry-run
npx --yes supabase@2.115.0 db push --linked
```

Do not use `--include-seed` in production. Then run the hosted database advisors and inspect every result:

```bash
npx --yes supabase@2.115.0 db advisors --linked --type security --fail-on warn
npx --yes supabase@2.115.0 db advisors --linked --type performance --fail-on warn
```

Confirm in the dashboard that both Storage buckets are private and that public/anonymous users cannot query any business table.

## 3. Create the manager account

In Supabase Dashboard → Authentication → Users, invite the exact owner-approved manager email. Require a strong unique password and MFA under the organization's access policy.

After the user exists, copy its exact UUID and, in the SQL editor, run the following with the inspected UUID only:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"manager"}'::jsonb
where id = '<verified-user-uuid>'::uuid;
```

Verify exactly one row changed. Sign out and back in before testing; the API also loads fresh user metadata on each manager call so removing this role revokes access without waiting for an old browser claim.

## 4. Configure server secrets

Create a secret file outside this repository from `supabase/.env.example`. Generate independent random values of at least 32 characters for `RATE_LIMIT_SALT` and `CRON_SECRET`. Never reuse them.

For the rehearsal environment use Vipps test and these safety gates:

```dotenv
ALLOWED_ORIGINS=https://<rehearsal-site>
SITE_URL=https://<rehearsal-site>
PRIVACY_VERSION=<owner-approved-version>
RATE_LIMIT_SALT=<random-secret>
CRON_SECRET=<random-secret>
EMAIL_PROVIDER=resend
EMAIL_FROM=Bata Woodworks <orders@verified-domain.example>
INTERNAL_NOTIFICATION_EMAIL=<approved-operations-email>
RESEND_API_KEY=<resend-key>
PAYMENT_PROVIDER=vipps
ALLOW_MOCK_PAYMENTS=false
MOCK_PAYMENT_SECRET=<unused-random-secret>
VIPPS_ENVIRONMENT=test
VIPPS_LIVE_ENABLED=false
VIPPS_CARD_ENABLED=false
VIPPS_CLIENT_ID=<vipps-test-client-id>
VIPPS_CLIENT_SECRET=<vipps-test-client-secret>
VIPPS_SUBSCRIPTION_KEY=<vipps-test-subscription-key>
VIPPS_MERCHANT_SERIAL_NUMBER=<vipps-test-msn>
VIPPS_WEBHOOK_SECRET=<vipps-webhook-hmac-secret>
```

Set them without copying values into shell history:

```bash
npx --yes supabase@2.115.0 secrets set \
  --project-ref '<project-ref>' \
  --env-file '/absolute/path/outside/repository/bata-production.env'
```

Supabase injects its own URL and role keys; do not add a service-role key to Vite, GitHub Pages variables or any public client configuration.

## 5. Deploy Edge Functions

Deploy from the reviewed commit:

```bash
npx --yes supabase@2.115.0 functions deploy --project-ref '<project-ref>'
```

Confirm the deployed authorization settings match `supabase/config.toml`: `admin-api` verifies a JWT; public offer/request/payment functions perform their own explicit token, origin or webhook authentication.

## 6. Configure transactional email

In Resend, verify the production sending domain and its DNS records. Send test messages to the customer and internal addresses. Confirm SPF, DKIM and DMARC alignment, sender display/name, reply handling and that failures appear in the `notifications` table without exposing secrets.

The offer resend action rotates the private token. Use it when a link may have been disclosed; previous links stop working.

## 7. Configure Vipps MobilePay

In Vipps test:

1. Enable ePayment for the correct merchant serial number and supply the test credentials above.
2. Register `https://<project-ref>.supabase.co/functions/v1/payment-webhook` as the HTTPS webhook destination using the same HMAC secret as `VIPPS_WEBHOOK_SECRET`.
3. Subscribe to the ePayment lifecycle events required by the integration, including authorization, capture, cancellation, expiry/termination and refund events.
4. Run the complete wallet redirect flow. The offer must remain unpaid on browser return and become paid only after the signed webhook and provider verification.
5. Test duplicate events, a rejected/tampered amount, abandoned checkout, expiry and email-provider failure/retry.

The test environment exposes wallet only. Do not set `VIPPS_CARD_ENABLED=true` there. Before production, replace every test credential, set `VIPPS_ENVIRONMENT=production`, repeat the smoke tests against the production merchant's approved test process, then set `VIPPS_LIVE_ENABLED=true` only as the final payment interlock. Leave `ALLOW_MOCK_PAYMENTS=false` everywhere outside local development.

## 8. Schedule offer expiry

Use Supabase Cron or another trusted scheduler to make a daily authenticated `POST` to:

```text
https://<project-ref>.supabase.co/functions/v1/expire-offers
```

Send the secret only as `x-cron-secret: <CRON_SECRET>`. Do not place it in a URL. A successful response reports the count of newly expired offers. Monitor non-2xx responses and verify an expired offer is not payable.

## 9. Configure the public site

In GitHub → repository Settings → Secrets and variables → Actions → Variables, set:

- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`
- `VITE_PRIVACY_VERSION=<same approved version as the Edge Function secret>`

These are intentionally public values. Do not put any secret/service-role/Vipps/Resend value in an Actions variable beginning with `VITE_`.

Review the GitHub Pages custom domain and HTTPS enforcement. The `main` deployment workflow will build the static client after merge; this PR does not deploy it.

## 10. Launch smoke test

Use a low-risk real request and an explicitly approved payment test:

- Desktop and mobile: navigation, focus visibility, legal links, request validation and upload limits
- Submit once and retry the same request; only one record and one customer acknowledgement should exist
- Confirm uploaded files are private and anonymous table/storage reads fail
- Manager login; queue visibility; illegal state transitions rejected
- Draft and send one offer; capture the exact terms/version shown in the email link
- Confirm an edited issued offer is rejected and a resend invalidates the old link
- Confirm the checkout amount is identical to the stored offer and cannot be overridden by the browser
- Confirm browser return alone remains pending; only verified exact provider state produces `PAID`
- Confirm one customer order confirmation and one internal `START PRODUCTION` message
- Move through `PRODUCTION → READY → DELIVERED`; confirm the READY message
- Exercise webhook replay, expired offer and failed email retry monitoring
- Run database advisors again and review Supabase Auth, Function, Database, Storage, Vipps and Resend logs

## 11. Monitoring, rollback and incident response

- Alert on Edge Function 5xx/latency, repeated webhook 401/409, failed notifications, overdue `OFFER_SENT`, payments stuck outside a terminal state and expiry job failures.
- Reconcile captured Vipps payments against `payments`, `payment_events` and internal production notifications daily during initial launch.
- To stop new commerce safely, set `VIPPS_LIVE_ENABLED=false` or `PAYMENT_PROVIDER=disabled`; this preserves records and makes offers non-payable.
- To stop new requests, change/remove the deployed `PRIVACY_VERSION` or public matching version; the client disables submission and the server rejects mismatches.
- Revoke a manager by removing `app_metadata.role`, revoking sessions and rotating any exposed operational credentials.
- Roll back the static site through the previous GitHub Pages artifact/commit. Treat database migrations as forward-only: make a reviewed corrective migration rather than deleting or resetting production data.
- For a suspected offer-link leak, use manager resend to rotate the token. For a secret leak, disable the affected integration first, rotate at the provider and Supabase, then review audit/event logs.

## Final launch gate

Launch is blocked until all of the following are true:

- Every `needs_owner` value is supplied and approved
- Privacy and terms versions match client, server and offer snapshots
- Supabase region, backups, access, MFA, RLS, private buckets and advisors are reviewed
- Manager access and revocation are tested
- Resend domain and customer/internal messages are verified
- Vipps test certification/rehearsal passes, production credentials are installed and mock payments are off
- Webhook authenticity, exact amount, replay and browser-return-negative tests pass
- Expiry schedule and operational alerts are active
- Owner signs off the smoke-test evidence and deliberate MVP limits
