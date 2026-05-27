# HanMak Backend

Django + Django REST framework backend for the HanMak document-signing platform.

## Run Locally

```bash
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8003
```

Demo login:

```text
admin / admin123
```

`seed_demo` creates three organizations for local multi-company testing:

```text
Acme Corporation
Beta Ventures
Gamma Holdings
```

Use the sidebar organization switcher in the React app to change the active company. The frontend stores the selected organization in `HANMAK_ORGANIZATION_ID` and sends it to the API as `X-HanMak-Organization`.

Built-in membership roles are `super_admin`, `admin`, `manager`, `signer`, and `viewer`. `seed_demo` creates `admin / admin123` as a Django superuser with a `super_admin` membership and seeds all five system role records for each demo organization. To create only one root operator account, run:

```bash
python manage.py seed_super_admin --username superadmin --email superadmin@example.com --password superadmin123
```

## React Frontend

When using Docker, open the React frontend through Nginx so the frontend and API share one origin:

```text
http://127.0.0.1:8080/
```

By default it uses:

```text
http://127.0.0.1:8080/api/v1
```

If your backend is on another port, run this in the browser console before connecting:

```js
localStorage.setItem('HANMAK_API_BASE_URL', 'http://127.0.0.1:8080/api/v1')
location.reload()
```

To test a public signer link in the React app:

```text
http://127.0.0.1:8080/sign/<signing-session-token>
```

## Useful URLs

```text
Admin:              http://127.0.0.1:8003/admin/
API root:           http://127.0.0.1:8003/api/v1/
Envelopes:          http://127.0.0.1:8003/api/v1/envelopes/
Templates:          http://127.0.0.1:8003/api/v1/templates/
Signing sessions:   http://127.0.0.1:8003/api/v1/signing-sessions/
Approval requests:  http://127.0.0.1:8003/api/v1/approval-requests/
Email messages:     http://127.0.0.1:8003/api/v1/email-messages/
Tasks:              http://127.0.0.1:8003/api/v1/task-runs/
Webhooks:           http://127.0.0.1:8003/api/v1/webhook-endpoints/
API keys:           http://127.0.0.1:8003/api/v1/api-keys/
OAuth apps:         http://127.0.0.1:8003/api/v1/oauth-apps/
Organizations:      http://127.0.0.1:8003/api/v1/organizations/
Audit events:       http://127.0.0.1:8003/api/v1/audit-events/
Search:             http://127.0.0.1:8003/api/v1/search/?q=contract
Signer link:        http://127.0.0.1:8003/api/v1/sign/<token>/
Payment webhooks:   http://127.0.0.1:8003/api/v1/billing/payment-webhook/
Webhook events:     http://127.0.0.1:8003/api/v1/payment-webhook-events/
Readiness:          http://127.0.0.1:8003/api/v1/health-checks/deployment-readiness/
Deployment runbook: http://127.0.0.1:8003/api/v1/health-checks/deployment-runbook/
```

Queued email records include both plain text and branded HTML bodies. Envelope invite and reminder emails expose a `signing_url` field in the email-message API response for easy local testing.

Email templates can be managed through:

```text
/api/v1/email-templates/
```

Supported placeholders include `{{ envelope_name }}`, `{{ recipient_name }}`, `{{ recipient_email }}`, `{{ sender_name }}`, `{{ due_date }}`, `{{ signing_url }}`, and `{{ brand_name }}`.

Provider bounce webhooks can be posted to:

```text
POST /api/v1/email/bounce/
```

Set `HANMAK_EMAIL_BOUNCE_WEBHOOK_SECRET` to require an `X-HanMak-Signature` HMAC-SHA256 signature over the raw request body.

Provider-specific options:

```text
POST /api/v1/email/bounce/?provider=mailgun
POST /api/v1/email/bounce/?provider=sendgrid
```

For Mailgun, set `MAILGUN_WEBHOOK_SIGNING_KEY`; HanMak validates the timestamp/token signature. For SendGrid, set `SENDGRID_WEBHOOK_PUBLIC_KEY`; HanMak rejects unsigned traffic and is ready for full helper-library ECDSA verification.

## Payment Webhooks And Observability

Payment provider webhooks can be posted to:

```text
POST /api/v1/billing/payment-webhook/?provider=stripe
POST /api/v1/billing/payment-webhook/?provider=adyen
POST /api/v1/billing/payment-webhook/?provider=mock
```

Set `STRIPE_WEBHOOK_SECRET`, `ADYEN_WEBHOOK_HMAC_KEY`, or `HANMAK_PAYMENT_WEBHOOK_SECRET` to require signature validation. Processed events are stored in `/api/v1/payment-webhook-events/` and can reconcile checkout sessions, subscriptions, and invoices when provider metadata includes an organization or session reference.

Optional APM bootstrap is controlled with `HANMAK_APM_PROVIDER=sentry|opentelemetry`, `SENTRY_DSN`, or `OTEL_EXPORTER_OTLP_ENDPOINT`. System Health exposes the runtime APM status and deployment readiness checks.

## Passkey Login

The mock login page can start and finish a WebAuthn passkey login:

```text
POST /api/v1/mfa-devices/public_passkey_begin/
POST /api/v1/mfa-devices/public_passkey_finish/
```

On successful assertion verification, the finish endpoint returns normal JWT `access` and `refresh` tokens with HanMak auth-version revocation support.

Evidence bundles can also generate a signed PDF artifact:

```text
POST /api/v1/evidence-bundles/<id>/generate-signed-pdf/
```

The response includes `signed_pdf` and `signed_pdf_sha256`.

HanMak first builds the signed artifact from the same stored page-preview images used by Form Builder and public signing, on a fixed 1040px-wide coordinate basis. A4-style fallback pages are about 1471px tall; uploaded pages keep their aspect ratio. Each `FormField` stores its own `page_width` and `page_height` basis, and the PDF renderer scales filled values from that saved basis onto the actual rendered page image before writing them. This avoids the earlier failure where non-1471px pages were drawn with the wrong Y-axis scale. Submitted typed-signature style metadata is used for readable signature rendering in review views and the image-based signed PDF. Signer-uploaded attachment fields are appended to the end of the generated artifact with metadata cover pages; valid uploaded PDFs are appended as pages when `pypdf` is available. When page previews are unavailable and `pypdf` plus `reportlab` are installed, HanMak falls back to source-PDF stamping, then finally to a valid placement-map PDF.

Documents can be scanned and processed through:

```text
POST /api/v1/documents/<id>/scan/
POST /api/v1/documents/<id>/process/
```

The API currently uses Django session/basic auth and SQLite for local development.

## Run With Docker

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services:

```text
Nginx proxy:         http://127.0.0.1:8080/api/v1/
Nginx API docs:      http://127.0.0.1:8080/api/v1/docs/
Direct backend:      http://127.0.0.1:8003/api/v1/
Direct backend docs: http://127.0.0.1:8003/api/v1/docs/
Mailhog:             http://127.0.0.1:8025/
MinIO:               http://127.0.0.1:9001/
```

The direct backend host port can be changed without editing the compose file:

```bash
BACKEND_PORT=8010 docker compose -f docker-compose.dev.yml up --build
```

## Current Verification Checkpoint

As of the latest pass (2026-05-21):

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py check
docker compose -f docker-compose.dev.yml exec backend python manage.py makemigrations --check --dry-run
docker compose -f docker-compose.dev.yml exec backend python manage.py test --verbosity=1
```

**210 tests OK** — covers `accounts`, `api_keys`, `approvals`, `auditlog`, `billing`, `compliance`, `documents`, `evidence`, `inbox`, `risk`, `tasks`, `workflow`, `analytics`, `signing`, and the security hardening suite (`accounts.tests_security`).

Run only the security suite:

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py test accounts.tests_security --verbosity=2
```

Run only the tenant API suite:

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py test accounts.tests.TenantScopedAPITests --keepdb
```

2026-05-15 frontend live-data checkpoint:

- Dashboard/profile/sidebar shell hydration, Approval Queue analytics/load, Test Lab task-run hydration/report/detail/rerun flow, and SSO SAML preset/toggle persistence were checked in code.
- Relevant frontend files passed `node --check`.
- Docker/Nginx API smoke checks returned `200` for `/api/v1/task-runs/`, `/api/v1/sso-connections/`, `/api/v1/profiles/me/`, `/api/v1/inbox/`, and `/api/v1/analytics/approval-bottlenecks/`.
- `python manage.py check` passed inside the backend container.

2026-05-16 completion pass:

- Inbox/My Tasks gained working document/task/priority/search filters, checkbox selection, and bulk mark-read/snooze/retry/cancel actions.
- Envelope export now downloads a CSV file.
- Public signing supports signer self-delegation through `/api/v1/sign/{token}/`.
- API Docs navigation now has matching content for all listed getting-started and endpoint sections.
- Admin Users/Organizations expose super-admin cross-organization create/invite/create-organization/delete paths, and Branding applies logo/color changes immediately after saving.
- Side-by-side frontend/backend hookup audit added at `docs/FRONTEND_BACKEND_HOOKUP_AUDIT.md`; remaining toast/copy actions are intentionally copy/info/no-file helpers or development-only placeholders blocked in beta mode.
- Public signing/PDF placement pass: field serializers now declare the canonical page basis, signed PDFs scale filled values to the rendered page image, signer attachments are appended to signed artifacts, nav badges hydrate from live inbox/approval/task summaries, and Super Admin membership can manage billing/license records across organizations.

2026-05-21 rate limiting & security hardening pass:

- DRF throttle classes added in `accounts/throttles.py` — `LoginRateThrottle` (10/min), `TokenRefreshRateThrottle` (30/min), `PublicSigningRateThrottle` (30/min), `AccountSetupRateThrottle` (5/min), `PasswordResetRateThrottle` (5/min). All rates are overridable via env vars (see Production Hardening Checklist below).
- Throttles applied: login/refresh token views, public signing GET/POST/download views, invitation accept/inspect, and password-reset request/complete actions.
- Security headers enabled globally via Django's `SecurityMiddleware`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `HttpOnly` session cookie, `SameSite=Lax` session cookie.
- `BasicAuthentication` removed from production — only loaded when `DEBUG=true`.
- `PublicSigningSessionView` now returns `404` on unknown tokens instead of raising an unhandled `DoesNotExist`.
- 8 security tests added in `accounts/tests_security.py` — all green.

Recommended click-through order:

1. Login, setup/invite, profile/security.
2. Dashboard, Inbox, Envelopes, Templates, Form Builder, File Library.
3. Public signing link, Approval Queue, Workflow Builder, Audit Evidence.
4. Admin Users/Organizations/Teams/Roles, Background Tasks, System Health.
5. Developer, Webhooks, API Keys, OAuth Apps, Operations, Billing, License, Settings, Compliance.

## Production Hardening Checklist

- Set a unique `DJANGO_SECRET_KEY` and keep `DEBUG=false`.
- Restrict `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` to real domains.
- Set `HANMAK_EMAIL_BOUNCE_WEBHOOK_SECRET` before exposing `/api/v1/email/bounce/`.
- Set payment webhook secrets before exposing `/api/v1/billing/payment-webhook/`.
- Configure `SECURE_SSL_REDIRECT`, secure cookies, HSTS, and `USE_X_FORWARDED_PROTO` behind TLS.
- Configure Sentry or OpenTelemetry env vars before enabling production APM.
- Use managed Postgres and Redis with backups enabled.
- Configure durable media/object storage with the `AWS_*` variables or a compatible S3/MinIO endpoint.
- Put TLS at the edge proxy/load balancer and keep Nginx security headers enabled.
- Rotate SMTP, SSO, SCIM, storage, and database credentials outside the repository.
- Tune rate limits via env vars (defaults shown — tighten for production):
  ```text
  THROTTLE_ANON=120/min
  THROTTLE_USER=600/min
  THROTTLE_LOGIN=10/min
  THROTTLE_TOKEN_REFRESH=30/min
  THROTTLE_PUBLIC_SIGNING=30/min
  THROTTLE_ACCOUNT_SETUP=5/min
  THROTTLE_PASSWORD_RESET=5/min
  ```

See `PLAN_ALIGNMENT.md` for implementation history and remaining future work.

## Application Guides

Additional documentation lives in:

```text
../docs/USER_GUIDE.md
../docs/DEVELOPER_GUIDE.md
../Project_Overview.md
```

The user guide explains the HanMak product workflow, Release Control, signing, templates, envelopes, admin, compliance, and billing surfaces.

The developer guide explains the frontend/backend architecture, API patterns, feature gating, release-control workflow, testing, and how to add new features.
