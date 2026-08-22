# Production-readiness report

## A. Current status

The repository is code-ready for handoff from the reviewed PR #2 baseline `a1f3c368aab0f960d55209cda570b129f2214934`. The public experience, backend boundaries, transactional messages, production configuration checks and operating documentation have received a full readiness pass.

Transactional production is **not launch-ready**. The intended ENK is unregistered, there is no organisation number, VAT status is unknown, Norwegian privacy/consumer terms are not approved, and hosted Supabase/Resend/Vipps/DNS operations have not been completed. The implementation fails closed around those facts. No production payment, DNS mutation, deployment or merge was performed.

## B. Changes made

- Centralized `batawoodworks.no`, `hello@batawoodworks.no`, `orders@batawoodworks.no` and `robert@batawoodworks.no` identities for the client and Edge Functions.
- Reworked public, offer and email copy around management filtering, affirmative Bata project/period approval, non-guaranteed selection, timing as context, deliberate capacity and a separate payment-versus-production-start event.
- Added explicit legal trading, production environment, mock-payment and intake gates. Missing intake configuration now fails closed.
- Restricted browser roles from direct business-table and private-Storage access; manager work goes through `admin-api` with fresh Auth-role verification.
- Removed the raw offer token from the payment-provider return URL. An ephemeral browser-session mapping restores the hash route using only a provider reference on return.
- Added provider/method allowlists, production mock rejection, production Vipps interlock enforcement, stable email idempotency, Reply-To routing, accessible HTML/plain text templates, sanitized provider logging and failed-notification visibility.
- Added a distinct customer production-start notification and a delivered/closed notification. Payment confirmation no longer claims work has begun.
- Added route-specific metadata/robots, canonical and Open Graph metadata, manifest, sitemap, robots file, static/client 404 handling, payment-return handling, skip link, reduced-motion handling, upload feedback and improved error/pause states.
- Optimized the six production photos from roughly 36 MB to roughly 4.9 MB total while preserving high-resolution source dimensions and visual quality.
- Changed the Pages build to root paths for the canonical custom domain, inject only the exact configured Supabase CSP origin, and reject missing/secret-like public production configuration.
- Added the exact One.com/GitHub Pages, Resend, Supabase, Vipps, monitoring, recovery, rollback and launch sequence in the production runbook.

## C. Test and CI results

Final local evidence:

- Node unit plus real local HTTP lifecycle: 8/8 passed, including request idempotency, private upload, direct browser Data API denial, manager authorization, Bata approval, immutable offer, exact server amount, abort/retry, verified mock webhook, replay, production/ready/delivered messaging, expiry and reconciliation.
- PostgreSQL pgTAP: 48/48 passed.
- Supabase local Security Advisor: no issues. Performance Advisor: no issues.
- Seven Edge Function entry points type-checked; eight Deno decision tests passed.
- Production build passed twice with byte-identical SHA-256 manifests.
- Production configuration check rejected a secret-like key and accepted a valid publishable configuration.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Desktop and 390 px mobile browser passes completed. Axe WCAG A/AA reported zero violations; it could not automatically determine gradient-backed contrast, which was manually inspected. CLS was 0 and the tested local LCP completed at 692 ms.
- Metadata/noindex, not-found, protected-offer error, payment-return recovery, mobile menu focus/Escape, form disablement and intake-paused states were exercised without browser errors.
- `git diff --check` passed and repository/current-PR history secret scanning found placeholders only.

The existing baseline PR run #6 was green. The new readiness commit still requires the PR's GitHub CI checks after push; those hosted results are not substituted by this local evidence.

## D. Owner actions required

- Register the ENK; verify its legal name, organisation number, address and public telephone.
- Verify VAT registration/status and approve the exact VAT wording/calculation used in every offer.
- Have qualified Norwegian review approve privacy, contract formation, purchase acknowledgement, delivery/delay, complaints/reclamation, withdrawal/custom-made-goods, cancellation/refund and any standard withdrawal-form requirements.
- Approve controller/lawful-basis, processor/region, retention, rights-request and supervisory-authority privacy facts.
- Approve privacy/terms version identifiers, Supabase region/plan/backups/recovery objective, access owners/MFA, provider agreements and alert recipients.
- Approve the final low-risk rehearsal and separately authorize opening intake, legal trading and live Vipps. Each is an independent action.

## E. Provider actions required

- **One.com/GitHub:** snapshot both DNS zones, preserve all `.no` mail records, verify the GitHub Pages domain, configure the approved A/AAAA/`www` records, enforce HTTPS after certificate issuance, and configure `.com` as a permanent HTTP redirect rather than a mailbox/domain alias.
- **Resend:** approve account/DPA/region, add the `.no` sending domain, install its exact generated DKIM/SPF/Return-Path records without replacing One.com MX or creating duplicate SPF, verify the exact sender and test all HTML/plain-text/Reply-To/bounce paths.
- **Supabase:** create rehearsal/production projects, approve region/plan/DPA/backups, apply migrations, review advisors/RLS/grants/private buckets/Auth/redirects, create and revoke-test the manager, install secrets, deploy Functions and activate monitored expiry/reconciliation Cron jobs.
- **Vipps MobilePay:** approve the merchant/ePayment account and payment methods; supply separate test/production credentials, merchant serial number and webhook secret; register lifecycle webhooks; complete provider-approved authorize/capture/abort/cancel/expiry/refund/delay/outage evidence; define portal reconciliation and incident ownership.

## F. Legal and ENK blockers

### A — safe to finalize now

Canonical domains/emails, maker-first editorial copy, public portfolio metadata, technical privacy/security controls, fail-closed gates and provider-neutral operational documentation are safe to prepare now. A non-transactional showroom can technically run with request intake, legal trading and all payments disabled.

### B — requires ENK/organisation number

Seller identity on the public terms/footer, private offer, purchase acknowledgement, customer transactional records and business documents cannot be finalized until the registered legal name/address and organisation number exist. VAT surfaces cannot be finalized until status is verified. Brønnøysund assigns the organisation number on registration, and Altinn describes business-identity information required on websites/business documents: [Brønnøysund ENK registration](https://www.brreg.no/enkeltpersonforetak/registrere-et-enkeltpersonforetak/), [Altinn website/business-document information](https://info.altinn.no/starte-og-drive/drive-bedrift/juridiske-og-regulatoriske-krav/krav-til-informasjon-om-foretaket-pa-nettsider-og-forretningsdokumenter/).

Live offer issuance, purchase/payment and request intake remain blocked because those surfaces also depend on the final seller/controller facts. Vipps merchant onboarding may additionally depend on the registered entity and provider verification.

### C — requires owner/counsel approval

The Norwegian privacy notice, contract-formation point, terms version, delivery/delay rules, complaints/reclamation contact/process, cancellation/refund policy and correctly scoped custom-made-goods withdrawal language require approval. The implementation preserves mandatory rights and does not broaden the custom-goods exception. The relevant statutory wording must be reviewed against [Angrerettloven § 8](https://lovdata.no/lov/2014-06-20-27/§8) and [§ 22](https://lovdata.no/lov/2014-06-20-27/§22), not inferred from application code.

### D — requires provider/Vipps facts

Final processor/subprocessor names, regions, DPA references, retention/log behavior, Resend DNS records, Vipps merchant identity/payment methods/credentials/webhook events and the provider-specific cancel/refund process remain provider-supplied facts.

## G. DNS and email plan

Use `batawoodworks.no` as the GitHub Pages custom domain, with `www` CNAME to `sillyquack.github.io` and redirecting to the apex. Re-verify GitHub's published A/AAAA values at cutover. Preserve One.com root MX and every existing mail TXT/DKIM/DMARC/autodiscover record. Configure `batawoodworks.com` apex and `www` through a service that emits a permanent `301`/`308` to the `.no` origin while preserving path/query; DNS alone does not redirect HTTP. Do not provision `.com` mail.

Install only Resend's dashboard-generated DKIM and sending/Return-Path SPF/MX records at the exact supplied hostnames. Never replace One.com MX or create a second SPF record at one hostname. Verify `Bata Woodworks <hello@batawoodworks.no>`, Reply-To behavior, alignment and bounces before opening any transaction. Full values, tests and rollback are in `docs/production-runbook.md`.

## H. Supabase plan

Approve hosted project controls, apply migrations without seed, run both advisors, confirm browser-role revocation/RLS/private buckets, create `robert@batawoodworks.no`, set fresh `app_metadata.role=manager`, test revocation, set exact Site URL/redirect/CORS, install secrets with all trading gates disabled, deploy Functions, then configure one-minute monitored expiry and reconciliation jobs using Cron/`pg_net` and Vault-held authentication. Rehearse the complete flow in a separate project before production.

## I. Vipps plan

Live remains disabled. Mock checkout requires `APP_ENV=local|test` and two explicit mock switches; production rejects it. Production Vipps requires both provider selection and `VIPPS_LIVE_ENABLED=true`. Amount/currency/expiry remain server authoritative, a browser return never pays, capture re-locks/rechecks the offer, abort permits a safe new payment, signed/provider-verified events are replay-safe, and the polling worker handles delayed/missed webhooks idempotently.

Do not enable live until all provider items in section E pass and production credentials are installed with the live interlock still false. `VIPPS_LIVE_ENABLED=true` is the final separately authorized action.

## J. Exact deployment order

1. ENK/organisation/VAT verification.
2. Owner/counsel approval and versioning of Norwegian privacy/consumer terms.
3. Provider contracts, region/access/recovery/merchant approvals.
4. Hosted Supabase rehearsal and production setup, migrations, grants/RLS/Storage/Auth/advisors/manager verification.
5. Resend domain verification and complete message testing without disrupting One.com mail.
6. Production secrets and Functions/Cron with legal, intake and payment gates off.
7. Vipps test rehearsal, production credentials, webhook registration and provider approval with live off.
8. Validated static artifact with intake off; owner-approved Pages deployment.
9. `.no` DNS/HTTPS/`www` cutover, `.com` permanent redirect, and explicit mail regression tests.
10. Final smoke/monitoring sign-off; enable legal trading, then intake only when ready.
11. Enable Vipps provider and live interlock last, under separate authorization and immediate monitoring.

## K. Recommendation

**NO-GO for transactional production or merge-to-launch today.** The code-level work is ready for draft-PR review, but ENK/organisation/VAT, Norwegian legal approval and every hosted provider gate remain material blockers.

**Conditional showroom option:** the owner may separately approve a non-transactional `.no` showroom deployment with `LEGAL_TRADING_ENABLED=false`, both intake switches false, `PAYMENT_PROVIDER=disabled`, `VIPPS_LIVE_ENABLED=false` and `ALLOW_MOCK_PAYMENTS=false`. That option does not authorize request collection, offers, purchases or real payment.
