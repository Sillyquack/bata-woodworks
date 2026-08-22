# Production runbook

This is an operational handoff, not an authorization to launch. The application is code-ready only after the checks in this document pass. Transactional production remains blocked while the ENK is unregistered, the business has no organisation number, VAT treatment is unknown, and the legal text is not approved. Keep `LEGAL_TRADING_ENABLED=false`, `REQUEST_INTAKE_OPEN=false`, `PAYMENT_PROVIDER=disabled`, `VIPPS_LIVE_ENABLED=false` and `ALLOW_MOCK_PAYMENTS=false` until the applicable gates are signed off.

## 1. Verified facts and unresolved decisions

Verified production identity:

- Canonical site: `https://batawoodworks.no`
- Defensive domain: `https://batawoodworks.com`
- Public and sending mailbox: `hello@batawoodworks.no`
- Orders alias: `orders@batawoodworks.no` → `hello@batawoodworks.no`
- Manager/operations mailbox: `robert@batawoodworks.no`

The intended Norwegian sole proprietorship is not registered. Do not describe it as registered, publish an invented organisation number or choose a VAT treatment by assumption.

Record these approvals outside the repository:

- Registered legal name, organisation number, business address, telephone and verified VAT status/treatment
- Privacy controller identity/address, lawful bases, retention schedule, processor/subprocessor list and regions, rights-request process and supervisory-authority wording
- Norwegian terms covering order formation, price/VAT, delivery and delay, complaints/reclamation, cancellation/refunds, the correctly scoped custom-made-goods withdrawal exception and any required standard withdrawal form
- Final privacy and terms version identifiers
- Supabase region/plan, DPA, backups/PITR, recovery objective, organization owners/MFA and alert destinations
- Resend DPA/region, sending-domain records and deliverability ownership
- Vipps MobilePay merchant approval, merchant serial number, payment-method scope, test evidence and production enablement approval

Norwegian legal/privacy review is an owner gate. This repository deliberately does not manufacture the missing identity or legal conclusions.

## 2. Domain and DNS plan

### Snapshot first

Export or screenshot the complete One.com zones for both domains. Record current TTLs and all A, AAAA, CNAME, MX, TXT, DKIM, DMARC, autodiscover and mail-host records. If One.com permits it, lower only the web-record TTL to 300 seconds at least 24 hours before cutover. Do not edit the existing `.no` mail records as part of the web cutover.

### `batawoodworks.no` — canonical GitHub Pages domain

1. In repository Settings → Pages, configure the custom domain `batawoodworks.no` and verify ownership before changing DNS. The custom-domain value in repository settings is authoritative for a custom Actions deployment; do not rely on a generated `CNAME` file.
2. At One.com, set the apex A records to GitHub Pages' currently documented addresses:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
3. If IPv6 is retained, set the apex AAAA records to GitHub's currently documented values:
   - `2606:50c0:8000::153`
   - `2606:50c0:8001::153`
   - `2606:50c0:8002::153`
   - `2606:50c0:8003::153`
4. Set `www` as a CNAME to `sillyquack.github.io`. GitHub Pages will redirect it to the configured apex canonical domain.
5. Do not create a wildcard record. Re-check the values against [GitHub's current custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) at cutover.
6. After DNS and certificate issuance settle, enable Enforce HTTPS. Verify the apex and `www` both end at `https://batawoodworks.no/`, paths work, the certificate is valid, and the canonical/OG/sitemap URLs are `.no`.

The GitHub A/AAAA/CNAME records and One.com email can coexist because they serve different names/services. Preserve the existing root MX, mail-related TXT, DKIM selectors, DMARC and any One.com mail CNAMEs. SPF must remain a single valid policy record; merge only with provider-approved syntax if a new sender requires a root include.

### `batawoodworks.com` — defensive redirect only

DNS does not itself perform an HTTP redirect. Configure One.com web forwarding, or another verified redirect service, to return permanent `301` or `308` redirects from both apex and `www` to `https://batawoodworks.no`, preserving path and query where supported. Do not point `.com` at the GitHub Pages custom domain, and do not create or require a `.com` mailbox. Test HTTP/HTTPS, apex/`www`, paths and query strings with `curl -I` and a browser.

### DNS rollback

If the GitHub certificate or routing fails, restore only the snapshotted web A/AAAA/CNAME/forwarding records, restore the prior Pages custom-domain setting if it changed, and wait for the recorded TTL. Do not touch mail records. Keep `REQUEST_INTAKE_OPEN=false` and payments disabled throughout rollback.

## 3. Prepare Supabase

Create separate rehearsal and production projects in the approved region. Review Supabase's [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), plan, DPA, backups/PITR, SSL enforcement, network restrictions, organization owners, MFA enforcement, Auth email configuration, log retention, alert destinations and spending controls.

From a clean checkout of the reviewed commit, rehearse first and then repeat against production:

```bash
npx --yes supabase@2.115.0 login
npx --yes supabase@2.115.0 link --project-ref '<project-ref>'
npx --yes supabase@2.115.0 db push --linked --dry-run
npx --yes supabase@2.115.0 db push --linked
npx --yes supabase@2.115.0 db advisors --linked --type security --fail-on warn
npx --yes supabase@2.115.0 db advisors --linked --type performance --fail-on warn
```

Do not use `--include-seed` in production. Confirm all migrations are present, both Storage buckets are private, `anon` and `authenticated` have no business-table grants or app-private-bucket Storage policies, and only Edge Functions with the server key cross that boundary. Verify Auth email confirmation, secure password change and allowed redirect URLs. The production Auth Site URL is `https://batawoodworks.no`; any additional redirect URL must be exact and owner reviewed.

## 4. Create and test the manager account

In Dashboard → Authentication → Users, invite exactly `robert@batawoodworks.no`. Require a unique strong password and MFA under the organization policy. Copy the inspected UUID and run:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"manager"}'::jsonb
where id = '<verified-user-uuid>'::uuid;
```

Verify exactly one row changed. Sign out and back in, then test the queue and all permitted transitions. The manager API loads fresh Auth metadata on every request, so removing the role takes effect without trusting a stale browser claim. Rehearse revocation by removing `role`, revoking sessions and confirming the API rejects the old session.

## 5. Configure production secrets fail-closed

Create a secret file outside the repository. Generate independent random `RATE_LIMIT_SALT`, `CRON_SECRET` and unused `MOCK_PAYMENT_SECRET` values of at least 32 characters. Supabase injects its own server credentials; never put a secret/service-role key in Vite, GitHub Pages or any `VITE_` value.

Initial production configuration:

```dotenv
APP_ENV=production
ALLOWED_ORIGINS=https://batawoodworks.no
SITE_URL=https://batawoodworks.no
PRIVACY_VERSION=<approved-version>
LEGAL_TRADING_ENABLED=false
REQUEST_INTAKE_OPEN=false
RATE_LIMIT_SALT=<random-secret>
CRON_SECRET=<random-secret>
PAYMENT_RECONCILIATION_STALE_SECONDS=15
PAYMENT_RECONCILIATION_BATCH_SIZE=25
EMAIL_PROVIDER=resend
EMAIL_FROM=Bata Woodworks <hello@batawoodworks.no>
INTERNAL_NOTIFICATION_EMAIL=robert@batawoodworks.no
RESEND_API_KEY=<least-privilege-key>
PAYMENT_PROVIDER=disabled
ALLOW_MOCK_PAYMENTS=false
MOCK_PAYMENT_SECRET=<unused-random-secret>
VIPPS_ENVIRONMENT=test
VIPPS_LIVE_ENABLED=false
VIPPS_CARD_ENABLED=false
VIPPS_CLIENT_ID=<not-configured-until-rehearsal>
VIPPS_CLIENT_SECRET=<not-configured-until-rehearsal>
VIPPS_SUBSCRIPTION_KEY=<not-configured-until-rehearsal>
VIPPS_MERCHANT_SERIAL_NUMBER=<not-configured-until-rehearsal>
VIPPS_WEBHOOK_SECRET=<not-configured-until-rehearsal>
```

Install with:

```bash
npx --yes supabase@2.115.0 secrets set \
  --project-ref '<project-ref>' \
  --env-file '/absolute/path/outside/repository/bata-production.env'
```

`LEGAL_TRADING_ENABLED` blocks offer issuance/resend and payment initiation; it stays false until the identity and terms gate is approved. `PAYMENT_PROVIDER` and `VIPPS_LIVE_ENABLED` are independent payment interlocks. Mock checkout is rejected whenever `APP_ENV` is not `local` or `test`, even if its other switches are accidentally set.

## 6. Configure Resend without breaking One.com mail

1. Add `batawoodworks.no` in Resend. Copy the exact provider-generated records; do not invent selector names or record values.
2. Add Resend's DKIM TXT record at its supplied selector.
3. Add the supplied SPF TXT and bounce/Return-Path MX record at the exact subdomain Resend assigns (often a sending subdomain, but the dashboard is authoritative). Do not replace One.com's root MX. Do not create a second SPF policy at the same hostname.
4. Review the existing DMARC record. Change its policy/reporting addresses only with owner approval; a strict policy should follow successful alignment tests.
5. Wait for Resend verification, then verify the exact sender `Bata Woodworks <hello@batawoodworks.no>`. Templates set Reply-To to `hello@batawoodworks.no`, `orders@batawoodworks.no` or the customer address according to the conversation.
6. Send request, offer, payment, production, ready and decline/closed tests to real `.no` mailboxes. Check mobile HTML, plain text, Reply-To, SPF, DKIM, DMARC, links, bounce handling and `notifications` records.

Resend documents the required SPF/DKIM setup in its [domain guide](https://resend.com/docs/dashboard/domains/introduction). Its generated DNS values, not this repository, are authoritative.

## 7. Deploy Edge Functions and schedules

Deploy from the reviewed commit:

```bash
npx --yes supabase@2.115.0 functions deploy --project-ref '<project-ref>'
```

Confirm `admin-api` verifies a user JWT; the public request/offer/payment functions apply their own origin/token checks; webhook and cron endpoints apply their own HMAC/secret checks.

Create two one-minute Cron jobs for `expire-offers` and `reconcile-payments`. Supabase supports invoking Edge Functions with Cron/`pg_cron` and `pg_net`; store the authentication material in Vault rather than embedding it in SQL or a URL. Follow the current [Scheduling Edge Functions guide](https://supabase.com/docs/guides/functions/schedule-functions). These functions require an `x-bata-cron-secret` header containing `CRON_SECRET`. Keep the secret out of query strings and logs.

Verify both jobs in the Cron run history. Alert on a non-2xx response, expiry-job failure, any reconciliation `failed`/`rejected` count, and payments that remain non-terminal beyond the agreed threshold.

## 8. Rehearse Vipps MobilePay; keep live off

Required from Vipps before enablement:

- Approved merchant/ePayment agreement, correct merchant serial number and production payment-method scope
- Separate test and production client ID, client secret, subscription key and webhook-signing secret stored only in Supabase
- Registered webhook endpoint `https://<project-ref>.supabase.co/functions/v1/payment-webhook` and all required ePayment lifecycle subscriptions
- Verified production return URL allowlisting if required by the merchant configuration
- Provider-approved test/certification evidence for authorize, exact capture, abort, cancel, expiry/termination, refund, duplicate/delayed webhook and API outage recovery
- Operational ownership for Vipps portal reconciliation, capture/cancel/refund decisions and incident escalation

In rehearsal, use `PAYMENT_PROVIDER=vipps`, `VIPPS_ENVIRONMENT=test`, `VIPPS_LIVE_ENABLED=false`, `VIPPS_CARD_ENABLED=false` and `ALLOW_MOCK_PAYMENTS=false`. Exercise wallet checkout using only provider-approved test users/funds. The server controls amount/currency/expiry; the browser return remains pending; signed webhook or scheduled provider verification drives idempotent capture and `PAID`.

Before production, replace every test credential, set `VIPPS_ENVIRONMENT=production`, keep `VIPPS_LIVE_ENABLED=false`, and repeat the approved production smoke procedure. `VIPPS_CARD_ENABLED` remains false unless Vipps explicitly enables that method. Setting `VIPPS_LIVE_ENABLED=true` is the final, separately approved payment action; this runbook does not authorize it.

## 9. Configure and deploy the static site

In GitHub Actions repository variables, configure:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
VITE_PRIVACY_VERSION=<same approved version as the server>
VITE_REQUEST_INTAKE_OPEN=false
```

The workflow validates these values before building. Publishable values are intentionally public; secrets are forbidden. The static build uses root-relative assets for the custom domain and includes canonical metadata, route-specific robots handling, `404.html`, `robots.txt`, `sitemap.xml` and the manifest.

To pause intake, set both `VITE_REQUEST_INTAKE_OPEN=false` and server `REQUEST_INTAKE_OPEN=false`, then rebuild the site and redeploy the `submit-request` configuration. Verify the calm paused state and direct-API rejection. Existing private offers and accepted/paid records remain accessible. Reopening requires both flags to be true and a rehearsal submission.

## 10. Launch smoke test

- Desktop/mobile navigation, menu, skip link, visible focus, keyboard operation, reduced motion, legal links, 404, loading/error/success and paused states
- Client and server validation, upload type/count/size feedback, private Storage and anonymous/authenticated table denial
- Request idempotency: a retry creates one request and one acknowledgement
- Manager sign-in, failed-notification visibility, fresh-role revocation and illegal transition rejection
- Offer issuance blocked unless legal trading is enabled and the manager confirms Bata approved both project and production period
- Issued terms/assets immutable; resend rotates the link and invalidates the old link
- Exact server-stored amount/currency; browser return alone cannot pay
- Signed webhook replay, abort/retry, expiry race, delayed webhook and stale-payment reconciliation
- Customer payment confirmation does not claim production has started; the manager starts production explicitly and that transition sends its own customer notice
- `PRODUCTION → READY → DELIVERED`, with READY and closed/decline messaging tested
- Database security/performance advisors, Supabase Auth/Function/Database/Storage logs, Resend events and Vipps ledger reviewed

## 11. Recovery and observability

- **Failed request email:** the request remains stored and a `FAILED` notification is visible to the manager. Do not resubmit and create a duplicate. Verify the customer address/provider event, contact the customer manually from `hello@batawoodworks.no` using the request reference, repair Resend, and record the recovery. There is no generic automatic notification retry in this MVP.
- **Failed offer email:** the offer remains issued but delivery failed. Repair email, use manager resend to rotate the private token, and confirm the prior link no longer works.
- **Failed payment/production/ready/decline email:** state remains authoritative in the database. Never recapture or roll state back merely to resend mail. Contact the customer manually, repair the provider and record the recovery; the manager queue exposes failures.
- **Webhook delay:** allow the one-minute reconciliation job to query Vipps. Compare `payments`, `payment_events`, function logs and the Vipps portal. Never mark paid from a browser return.
- **Stale payment:** inspect the job result and provider snapshot; allow the idempotent worker to capture/cancel as appropriate. Escalate repeated failures.
- **Failed capture:** keep the order unpaid, inspect the exact amount/expiry/reservation in Vipps, and follow the merchant cancel/refund process. Do not force a database status.
- **Provider outage:** set `PAYMENT_PROVIDER=disabled` or `VIPPS_LIVE_ENABLED=false` and redeploy secrets/functions. Existing offers remain viewable; cron/webhook recovery should continue for outstanding provider records.
- **Emergency payment stop:** set both `PAYMENT_PROVIDER=disabled` and `VIPPS_LIVE_ENABLED=false`; leave `ALLOW_MOCK_PAYMENTS=false`. Verify no method is offered before communicating the stop.
- **Intake pause:** set both intake flags false as described above. Do not use the privacy-version or legal-trading gate as a capacity switch.
- **Offer-link leak:** manager resend rotates the link. A leaked credential requires provider disablement, rotation and event/log review.
- **Manager compromise:** remove the role, revoke sessions, rotate affected credentials and inspect audit/event history.
- **Static rollback:** redeploy the previous reviewed artifact/commit. Database migrations are forward-only; use a corrective migration rather than reset/delete production data.

Logs use record/provider IDs and sanitized failure summaries. Do not add raw offer tokens, request payloads, customer content, authorization headers, provider bodies or credentials to logs. Alert on Edge Function 5xx/latency, repeated webhook 401/409, failed notifications, overdue active offers, Cron failures and stuck/rejected payments. During initial launch, reconcile captured Vipps payments to database records and customer/internal notifications daily.

## 12. Exact deployment order

1. Register the ENK and verify organisation number, legal name/address/telephone and VAT status.
2. Obtain owner/counsel approval for Norwegian privacy/terms/withdrawal/complaint text and assign matching version identifiers.
3. Approve Supabase/Resend/Vipps contracts, regions, access owners, recovery objectives and merchant responsibilities.
4. Create Supabase rehearsal/production projects; apply migrations; verify advisors, grants/RLS, private buckets, Auth settings, backups, MFA and manager revocation.
5. Verify the Resend domain without disturbing One.com mail; test every HTML/plain-text message and Reply-To path.
6. Install production secrets with legal, intake and payment gates still false/disabled; deploy and smoke-test Edge Functions and Cron.
7. Rehearse Vipps test end to end; install production credentials with `VIPPS_LIVE_ENABLED=false` and complete provider approval.
8. Configure GitHub variables with intake false; verify the production build artifact and deploy only after owner approval.
9. Configure/verify GitHub Pages custom domain; change `.no` web DNS; enforce HTTPS; configure/test `www` and the `.com` permanent redirect; verify One.com mail still works.
10. After the final legal/privacy smoke test, set `LEGAL_TRADING_ENABLED=true` and deploy functions. Open intake by setting both intake flags true only when management is ready.
11. Enable Vipps by setting `PAYMENT_PROVIDER=vipps` and, as the last independently approved action, `VIPPS_LIVE_ENABLED=true`. Run only the merchant-approved low-risk production smoke test and monitor continuously.

## Final gate

No transactional launch until every owner/legal/provider item above is evidenced, production configuration passes fail-closed validation, all local/hosted verification and smoke tests are green, schedules/alerts are live, and the owner explicitly signs off. A non-transactional showroom may be deployed with request intake and all trading/payment gates disabled, but that does not make the legal draft or purchase flow production-approved.
