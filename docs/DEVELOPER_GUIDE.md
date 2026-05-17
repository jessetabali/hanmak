# HanMak Developer Guide

This guide explains how HanMak is structured, how to run it, how to test it, and how to extend it safely.

## 1. Project Structure

HanMak has three main parts:

```text
backend/                    Django + DRF API
react-frontend/             React 18 production frontend (Vite + TanStack Query + Zustand)
hanmak_demo_mock_directory/  Vanilla JS beta prototype (fully live-wired reference)
docs/                       Application documentation
```

Important frontend files:

```text
app.js          Router, page registry, feature gating, toasts, modals, icons
api-client.js   API client, JWT storage, refresh handling
live-wiring.js  Most live API integrations and public signing flow
developer.js    Developer tools, Operations Console, Release Control
admin.js        Users, organizations, teams, roles
settings.js     Settings pages
system.js       Background tasks and system health
```

Important backend apps:

```text
accounts      Tenancy, users, teams, memberships, RBAC, sessions, passkeys
envelopes     Templates, template versions, parties, envelopes, recipients, fields
signing       Signing sessions, consent, signatures, field values, attachments
documents     Stored files, documents, pages, scans, envelope documents
workflow      Workflow definitions, stages, runs, events
approvals     Approval requests and approval actions
evidence      Evidence bundles, verification, signed PDF generation
configcenter  Settings, feature/release controls, health checks, incidents
messaging     Emails, email templates, reminders, SMTP delivery
tasks         Task definitions, runs, events, task actions
identity      SSO, SCIM, LDAP, JIT, social login
compliance    Legal holds, retention, data residency, compliance exports
billing       Plans, subscriptions, usage, invoices, payment portal sessions, license
```

## 2. Running the React Frontend

```bash
cd react-frontend
cp .env.example .env     # VITE_API_BASE_URL defaults to empty (uses Vite proxy)
npm install
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api` and `/media` to the Django backend at `http://127.0.0.1:8003`. Start the backend first (see section 3).

**Production build:**
```bash
npm run build            # Output: react-frontend/dist/
```

Serve `dist/` from Nginx at `/` and proxy `/api/` to Gunicorn (see `docs/REACT_FRONTEND_ARCHITECTURE.md` for Nginx config).

Key source files:

```text
src/router.jsx           All routes — matches every vanilla JS page ID
src/api/client.js        Axios + JWT attach + 401-refresh interceptors
src/api/endpoints.js     Central EP constant registry (~80 API paths)
src/hooks/useApi.js      useApiQuery + useApiMutation wrappers
src/store/authStore.js   Zustand — user, org, JWT lifecycle
src/components/layout/   AppShell, AuthGuard, Sidebar, Topbar
src/pages/               One component per route
```

See `docs/REACT_FRONTEND_ARCHITECTURE.md` for the full guide.

## 3. Running Locally Without Docker (Backend)

```bash
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8003
```

Then start the React frontend (section 2) or the vanilla JS beta via Nginx:

```text
http://127.0.0.1:8003/mock/   # Direct (no Nginx)
http://127.0.0.1:8080/mock/   # Via Docker/Nginx
```

For beta testing the vanilla JS frontend, see `docs/BETA_FRONTEND_READINESS.md`.

Demo login:

```text
admin / admin123
```

## 4. Running With Docker

From the repo root:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Useful URLs:

```text
Mock UI:             http://127.0.0.1:8080/mock/
Nginx API:           http://127.0.0.1:8080/api/v1/
Nginx API docs:      http://127.0.0.1:8080/api/v1/docs/
Direct backend:      http://127.0.0.1:8003/api/v1/
Direct backend docs: http://127.0.0.1:8003/api/v1/docs/
Mailhog:             http://127.0.0.1:8025/
MinIO:               http://127.0.0.1:9001/
```

## 5. Frontend Architecture

The mock uses a simple page registry:

```js
registerPage('dashboard', () => `...html...`);
navigate('dashboard');
```

After rendering, the router calls an init hook if it exists:

```text
dashboard_init()
settings_general_init()
release_control_init()
```

The API client is:

```js
hanmakApi('/envelopes/')
```

It automatically attaches JWT access tokens and attempts a refresh on `401`.

## 6. Release Control And Feature Gating

Release controls are stored in `configcenter.FeatureFlag`.

The model stores:

- `key`
- `name`
- `module`
- `is_enabled`
- `release_stage`
- `rollout_percentage`
- `owner`
- `description`
- `qa_checklist`
- `release_notes`
- `last_reviewed_at`
- `released_at`
- `config`

Default controls are seeded through:

```text
POST /api/v1/feature-flags/seed-defaults/
```

Review and release endpoints:

```text
POST /api/v1/feature-flags/{id}/review/
POST /api/v1/feature-flags/{id}/release/
GET  /api/v1/feature-flags/summary/
```

The mock router maps pages to feature keys in `hanmak_demo_mock_directory/app.js`.

When Release Control loads, it caches flags in:

```text
localStorage.HANMAK_RELEASE_FLAGS
```

If a mapped feature is disabled or unreleased, the router displays a gated screen.

Backend enforcement is centralized in `backend/accounts/permissions.py`. `OrganizationScopedQuerySetMixin.initial()` checks `feature_flag_key` on viewsets and blocks direct API access when the organization flag is disabled, planned, internal, paused, retired, or outside the rollout percentage.

To gate a tenant-scoped endpoint, set a feature key on the viewset:

```python
class WorkflowDefinitionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'workflow_builder'
```

For non-org-scoped `APIView`s or global viewsets, call `feature_flag_allows_request()` from `initial()`. Health checks keep public `live`, `ready`, and `public_status` open, but authenticated System Health actions are gated.

## 6. Backend API Patterns

Most API resources are DRF `ModelViewSet`s registered in `backend/hanmak/urls.py`.

Common patterns:

- Use `OrganizationScopedQuerySetMixin` for tenant isolation.
- Use `OrganizationRolePermission` for admin/manager write restrictions.
- Use custom actions for domain workflows such as `send`, `void`, `delegate`, `review`, `release`, `generate`, and `verify`.
- When adding a public signer workflow action, prefer extending `/api/v1/sign/{token}/` with an explicit `action` payload so the signer flow works without authenticated admin APIs. Current public actions include submit, decline, and delegate.
- Keep complex orchestration in service functions.

Important services:

```text
envelopes/services.py
messaging/services.py
auditlog/services.py
```

## 7. Multi-Tenancy

Tenant filtering is centralized in:

```text
backend/accounts/permissions.py
```

`OrganizationScopedQuerySetMixin` restricts querysets to the requesting user's organizations.

`OrganizationRolePermission` allows safe reads and restricts mutations to:

- Organization admins
- Organization managers
- Users with matching custom-role permissions
- Users with valid object grants where supported

## 8. Form Builder And Signing Flow

Template setup flow:

1. Upload, select, or prepare a File Library document through `/documents/{id}/prepare-for-builder/`.
2. Place fields in Form Builder against backend-rendered page previews.
3. Save through `/templates/{id}/setup/`.
4. Backend creates `TemplateVersion`, `TemplateParty`, and `FormField` records.

Field geometry contract:

- The builder stores page-local coordinates, not viewport coordinates.
- Stored page previews use a canonical 1040px-wide coordinate basis. Height is derived from the source page aspect ratio, with the dependency-light A4 fallback using about 1471px.
- Drag, resize, duplicate, and inspector edits are clamped to the selected page.
- Saved template schemas and `FormField` rows include `page_width`, `page_height`, `coordinate_basis`, and percentage coordinates such as `x_pct` and `width_pct`.
- `envelopes.services.normalize_field_geometry()` normalizes template setup fields and copied envelope fields to the canonical public signer page width.
- `FormFieldSerializer` returns persisted `page_width`, `page_height`, and `coordinate_basis` so browser overlays can confirm the same basis the backend will use for PDF output.
- The public signer renders each field from the normalized geometry and uses field type metadata for date pickers, select menus, attachment uploads, and signature method tabs. Typed signature submissions persist `metadata.signature_style` so completed/review overlays and image-based signed PDF generation can preserve font family, color, size, and italic choices.
- The Form Builder toolbar preview uses the same serialized field shape to render a signer-style modal before the template is saved.

File Library bridge:

- `GET /documents/summary/` returns organization-scoped library metrics for the dashboard cards.
- `POST /documents/{id}/prepare-for-builder/` marks the document ready, creates page metadata, creates a clean scan record when needed, renders PNG page previews, and returns the document plus `rendered_pages`.
- `POST /documents/{id}/duplicate/` copies document metadata, source file, page metadata, and rendered page images for reuse.
- The mock frontend stores the selected document id in `HANMAK_BUILDER_DOCUMENT_ID`, then Form Builder loads the document directly instead of requiring a second upload.

Envelope creation flow:

1. Choose a template.
2. Assign recipients to parties.
3. Call `/envelopes/create_from_template/`.
4. Backend copies fields to the envelope and assigns them to recipients.
5. Send the envelope.
6. Recipient signing sessions are created.

Public signing:

```text
GET  /api/v1/sign/{token}/
POST /api/v1/sign/{token}/
```

Multipart uploads are supported for attachment fields. File fields are sent as:

```text
attachment__{field_key}
```

The JSON payload is sent in a `payload` multipart field.

## 9. Evidence

Evidence bundle endpoints:

```text
POST /api/v1/evidence-bundles/{id}/generate/
POST /api/v1/evidence-bundles/{id}/generate-signed-pdf/
POST /api/v1/evidence-bundles/{id}/verify/
GET  /api/v1/evidence-bundles/{id}/visual-qa/
```

Evidence manifests include:

- Envelope metadata
- Recipients
- Signatures
- Field values
- Uploaded field attachments
- Consent records
- Documents and pages
- Email messages
- Approval requests
- Audit events

Generated signed PDFs prefer the stored page-preview image path and scale each filled field from its saved `FormField.page_width/page_height` basis onto the rendered page image before drawing. Signer-uploaded attachment fields are appended to the generated signed PDF as metadata cover pages. If an attachment is a valid PDF, its pages are appended after the cover page when `pypdf` is available.

**PDF rendering paths and coordinate contract**

`evidence/pdf.py` has two rendering paths:

1. `build_image_overlay_pdf()` — primary. Draws field values onto `DocumentPage.image` PNGs and assembles a PDF. Requires page images to exist (populated by `/documents/{id}/render_pages/` which `form-builder.js` calls after saving a template document).
2. `build_stamped_source_pdf()` — fallback. Creates a `reportlab` overlay and merges it onto the source PDF via `pypdf` `merge_page()`.

`pypdf` `merge_page()` concatenates content streams without rescaling. The overlay canvas **must** match the source page's mediabox dimensions exactly. `build_stamped_source_pdf()` always reads `source_page.mediabox` for this reason — do not substitute `DocumentPage.width/height`, which stores the canonical 1040×1471 canvas size.

`field_geometry_for_page(field, page_width, page_height)` scales stored field coordinates from their saved `page_width/page_height` basis to target dimensions and flips Y for PDF bottom-left origin.

`signerFieldGeometry()` in `live-wiring.js` scales `page_height` by `HANMAK_CANONICAL_PAGE_WIDTH / page_width` (same ratio as X/Y) so field top-clamping uses the rendered height and matches what the PDF renderer produces.

## 10. Messaging And SMTP

Email records are stored as `EmailMessage`.

SMTP settings can be managed through:

```text
/api/v1/email-settings/
/api/v1/app-settings/?namespace=email
/api/v1/email-messages/test_smtp/
```

Email templates:

```text
/api/v1/email-templates/
```

Bounce webhook:

```text
POST /api/v1/email/bounce/
```

## 11. Developer, Roadmap, And Licensing Surfaces

OAuth applications are managed through:

```text
/api/v1/oauth-apps/
/api/v1/oauth-apps/{id}/rotate-secret/
/api/v1/oauth-grants/
```

`rotate-secret` returns the plaintext replacement secret once and stores only `client_secret_hash`. Do not log the returned secret.

Webhook endpoints and test deliveries are managed through:

```text
/api/v1/webhook-endpoints/
/api/v1/event-outbox/
/api/v1/webhook-deliveries/
/api/v1/webhook-deliveries/{id}/replay/
```

The visible Webhook Lab creates an event-outbox row plus a pending delivery row so Background Tasks and delivery history have a real backend record to inspect.

Roadmap feedback currently uses `AppSetting` records:

```text
namespace = roadmap
key       = request_*, subscriber_*, vote_*, notify_*
```

This keeps feature requests and subscriptions persistent without adding a heavier product-management schema yet.

License keys expose a backend `features` array. When a development license is created or activated without features, `LicenseKeyViewSet` seeds a default list so the frontend feature checklist is backend-driven.

Built-in membership roles:

- `super_admin`: app-level operator with global organization visibility, cross-organization user, billing, and license management, and direct organization cleanup where permitted.
- `admin`: organization administrator.
- `manager`: organization manager with operational write access.
- `signer`: signing/task participant.
- `viewer`: read-oriented organization member.

API Docs should keep sidebar navigation and content sections in sync. The beta API reference currently documents Authentication, Rate Limiting, Errors & Status Codes, Pagination, Envelopes, Templates, Signatures, Webhooks, Users, Audit Trail, and Files, while downloads still come from the live OpenAPI schema.

For a current module-by-module frontend/backend wiring map, see `docs/FRONTEND_BACKEND_HOOKUP_AUDIT.md`.

## 12. Background Tasks

Celery queues:

```text
default
email
```

Useful task endpoints:

```text
/api/v1/task-definitions/
/api/v1/task-runs/
/api/v1/task-run-events/
```

Task actions include retry/restart/cancel/purge where implemented.

## 13. Testing

Current checkpoint: `accounts.tests.TenantScopedAPITests` is green with `91 tests OK` after the invitation-gate, envelope-readiness, payment-webhook, APM/readiness, search-ranking, and auth-lockout cleanup passes.

Run all tenant API tests:

```bash
.venv/bin/python backend/manage.py test accounts.tests.TenantScopedAPITests --keepdb
```

Run focused tests:

```bash
.venv/bin/python backend/manage.py test accounts.tests.TenantScopedAPITests.test_release_control_seed_review_and_release_flow --keepdb
```

Check backend configuration:

```bash
.venv/bin/python backend/manage.py check
```

Check migrations:

```bash
.venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Check frontend syntax:

```bash
for f in hanmak_demo_mock_directory/*.js; do node --check "$f" || exit 1; done
```

## 14. Click-Through Audits

When checking the mock/live UI, visible module actions should either call a backend API, open a real data modal, download/export real generated content, or be deliberately disabled with clear copy. Avoid new `onclick="showToast(...)"` actions for create/save/delete/send/retry/release/delegate/export flows.

The next required QA pass is Docker click-through through Nginx:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open:

```text
http://127.0.0.1:8080/mock/
```

Click-through scope:

- Auth: login, forgot password, setup token, invite acceptance, passkey/TOTP surfaces.
- Core work: Dashboard, Inbox/My Tasks, Envelopes, Templates, Form Builder, File Library, Public Signing, Workflow Builder, Approval Queue.
- Evidence and operations: Audit Evidence, Background Tasks, System Health, Operations Console, Release Control.
- Admin/settings: Users, Organizations, Teams, Roles, General, Branding, Email/SMTP, Storage, Security, Notifications, SSO/SCIM/LDAP.
- Developer/business/compliance: API Docs, API Keys, OAuth Apps, Webhooks, SDK/Test Lab, Roadmap, Billing, License, Legal Holds, Retention, Data Residency, Compliance Exports.

For each visible action, classify the result as:

- `pass` — action reaches a real backend path and the UI refreshes or shows returned data.
- `fix` — action errors, points to stale static data, or leaves the UI inconsistent.
- `defer` — action is intentionally production-only and should be disabled or documented.

Useful audit commands:

```bash
rg -n "onclick=\"showToast\\(" hanmak_demo_mock_directory/*.js
rg -n "function .*Live|registerPage\\(" hanmak_demo_mock_directory/*.js
```

After changing frontend wiring, run the JS syntax loop above, `backend/manage.py check`, and focused backend tests for the endpoints used by the changed buttons.

## 15. Production Readiness Boundaries

These areas now have MVP-level live wiring and explicit production boundaries:

- Production auth shell: the mock login shell now shows MFA/passkey/lockout cues, explicit recovery guidance, neutral reset responses, and next-step messaging for lost second factors. A fully separate branded public production shell and localization remain future polish.
- Payment providers: `POST /api/v1/billing/payment-webhook/?provider=stripe|adyen|mock` records webhook events, validates configured signatures, de-duplicates events, and reconciles checkout sessions/subscriptions/invoices when metadata identifies the organization/session. Real provider checkout/portal session creation, taxes, refunds, receipts, and subscription edge cases remain provider-specific work.
- Observability: optional Sentry/OpenTelemetry bootstrap is controlled by env vars, health summaries expose runtime APM status, and `/api/v1/health-checks/deployment-readiness/` reports production-readiness checks. System Health also exposes readiness details, public status publishing, alert subscriptions, thresholds, and `/api/v1/health-checks/deployment-runbook/`; hosted trace dashboards remain provider-specific production work.
- Search quality: `/api/v1/search/` returns rank details and uses Postgres full-text ranking when the database supports it, with weighted-term fallback for SQLite/dev. Stemming dictionaries, synonyms, typo tolerance, and cross-object tuning remain future work.
- Deployment hardening: readiness checks cover DEBUG, secret key, allowed hosts, CORS, database backend, SSL redirects, secure cookies, HSTS, static root, media policy, database/media backup policy, restore drill timestamp, secrets manager, TLS primary domain, APM, external alerts, and payment webhook secrets. See `docs/DEPLOYMENT_HARDENING_RUNBOOK.md`.
- SDK/API runner: SDK snippets are live, and Test Lab reads/writes backend `/task-runs/` for run status, details, reports, scheduling, suite runs, and failed-suite reruns; an in-browser authenticated API request runner is still deferred.

2026-05-15 verification checkpoint: the active Test Lab page is the `live-wiring.js` implementation loaded last by the mock shell, `/api/v1/task-runs/` and `/api/v1/sso-connections/` returned `200` through Docker/Nginx, and the relevant frontend files passed `node --check`.

Useful production env vars:

```text
HANMAK_PAYMENT_PROVIDER=stripe
STRIPE_WEBHOOK_SECRET=whsec_...
HANMAK_APM_PROVIDER=sentry
SENTRY_DSN=https://...
HANMAK_ENVIRONMENT=production
HANMAK_RELEASE=2026.05.14
SECURE_SSL_REDIRECT=true
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SECURE_HSTS_SECONDS=31536000
USE_X_FORWARDED_PROTO=true
```

## 16. Adding A New Feature

Recommended steps:

1. Add backend model/serializer/viewset/action.
2. Register the viewset in `backend/hanmak/urls.py`.
3. Add service-layer logic if orchestration spans multiple models.
4. Add or update tests.
5. Wire the frontend page or init hook.
6. Add a release-control default in `DEFAULT_RELEASE_MODULES`.
7. Map the page to the release key in `PAGE_FEATURE_FLAGS`.
8. Update `MOCK_ALIGNMENT.md`, `PLAN_ALIGNMENT.md`, and relevant guides.
9. Run backend checks, migration checks, JS syntax checks, and focused tests.

## 17. Documentation Files

Primary docs:

```text
backend/README.md
backend/MOCK_ALIGNMENT.md
backend/PLAN_ALIGNMENT.md
docs/USER_GUIDE.md
docs/DEVELOPER_GUIDE.md
Project_Overview.md
```

Keep alignment docs updated whenever a feature changes from mock/static to live/backend-backed.
