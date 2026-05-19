# HanMak MVP Readiness Checklist

Use this checklist before removing `hanmak_demo_mock_directory/` or inviting MVP/beta users to the React frontend.

## Automated Gates

- [x] Backend system check passes: `docker compose -f docker-compose.dev.yml exec -T backend python manage.py check`.
- [x] Backend migrations are clean: `docker compose -f docker-compose.dev.yml exec -T backend python manage.py makemigrations --check --dry-run`.
- [x] Tenant API suite passes: `docker compose -f docker-compose.dev.yml exec -T backend python manage.py test accounts.tests.TenantScopedAPITests`.
- [x] React lint gate runs and passes: `cd react-frontend && npm run lint`.
- [x] React production build runs and passes: `cd react-frontend && npm run build`.
- [x] Vanilla JS syntax check passes while the mock remains in the repo: `for f in hanmak_demo_mock_directory/*.js; do node --check "$f" || exit 1; done`.

## React Parity Gates

- [x] React routes cover the active product surface: dashboard, inbox, envelopes, templates, form builder, documents, public signing, workflow, approvals, audit/evidence, admin, settings, compliance, billing/license, developer tools, release control, system health, and background tasks.
- [x] Template setup and envelope creation from template use the backend `create-from-template` flow.
- [x] Public signing supports field completion, signature capture, submit, decline, and delegation.
- [x] Envelope detail supports signing-link copy, reminders, and recipient delegation.
- [x] Audit Trail includes integrity hash verification, compliance standard cards, IP address, and geolocation display.
- [x] Approvals includes pending, approved, rejected, changes requested, delegated, approver load, and recent delegation views.
- [x] General Settings includes support email, timezone, completion certificates, bulk send, mobile signing, email verification, and audit-trail completion options.
- [x] Branding includes primary, accent, background, link, border, sidebar background, and sidebar text colors.
- [x] Dashboard includes webhook health, workflow snapshot, and quick actions.
- [x] Inbox includes signing, approvals, failed task work, fields remaining, work type filtering, bulk actions, and task cancellation.
- [x] Billing includes plan comparison and payment webhook event visibility.
- [x] Admin Users includes session and MFA device detail in the user drawer.
- [x] Background Tasks includes email reliability and beat scheduler visibility.
- [x] Webhooks includes delivery stats and retry policy information.

## Manual Click-Through Gates

- [ ] Login as an admin through `http://127.0.0.1:8080/`.
- [ ] Create a template from a real PDF document, place fields in Form Builder, and save.
- [ ] Create an envelope from that template, assign recipients, and send.
- [ ] Open a public signer link, fill fields, submit, and confirm the envelope updates.
- [ ] Open a second public signer link, delegate it, and confirm the original link is revoked and the delegate link works.
- [ ] From Envelope Detail, delegate a recipient and confirm the new recipient receives the fields.
- [ ] Generate and download the signed PDF and verify field placement visually.
- [ ] Verify audit/evidence bundle generation and evidence hash verification.
- [ ] Exercise admin/user/session/MFA views, settings saves, billing, webhooks, release control, and system health actions.
- [ ] Test the public signing flow on a mobile-width viewport.

## Mock Removal Criteria

- [ ] All automated gates above are green in a clean checkout.
- [ ] All manual click-through gates above pass against the React frontend.
- [ ] Any remaining mock-only behavior is either implemented in React or explicitly documented as deferred.
- [ ] Documentation no longer points testers to `http://127.0.0.1:8080/mock/`.
- [ ] `nginx/dev.conf`, `docker-compose.dev.yml`, and docs are updated to stop serving and mounting `hanmak_demo_mock_directory/`.
- [ ] `hanmak_demo_mock_directory/` is removed in a dedicated commit after the React click-through sign-off.

## Known MVP Caveats

- Production payment processor checkout/portal creation, taxes, refunds, receipts, disputes, and subscription edge cases remain provider-specific post-MVP work.
- Hosted status-page publishing, external alert delivery provider setup, and deep trace dashboards remain production observability work.
- Advanced search tuning such as synonyms, typo tolerance, and cross-object ranking remains post-MVP work.
- Production SSO/SCIM rollout still requires real provider metadata, certificates, redirect URIs, and account-mapping policy.
