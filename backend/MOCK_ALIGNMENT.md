# Mock Alignment Notes

This document tracks the alignment between the vanilla JS beta prototype (`hanmak_demo_mock_directory/`) and the Django/DRF backend. It also serves as the authoritative reference for the React production frontend (`react-frontend/`) — each row in the "Strongly Represented" table identifies the backend endpoints that the React implementation must wire.

**Frontend status as of 2026-05-18:**
- `hanmak_demo_mock_directory/` — fully live-wired beta prototype; used for beta testing.
- `react-frontend/` — React 18 production frontend scaffold initialized; all pages load live API data; full feature parity implementation in progress (see `docs/REACT_FRONTEND_ARCHITECTURE.md`).

Compared against `hanmak_demo_mock_directory` as of 2026-05-14.

---

## Strongly Represented — fully live-wired

| Page / Feature | Backend endpoint(s) |
|---|---|
| Dashboard | `/analytics/completion/`, `/inbox/`, `/search/`, `/audit-events/`, `/risk-findings/`, `/workflows/`, `/analytics/approval-bottlenecks/`, analytics stats/activity/risk/workflow/webhook summary; sidebar organization/user/badge chrome hydrates from backend and respects selected organization context |
| Envelopes (list + detail drawer) | `/envelopes/` list/search/filter/sort/paginate; `/envelopes/summary/` organization-wide status counts; per-row send/remind/void/download/delete for drafts; bulk-action (send/void/delete_drafts) with readiness validation; detail drawer with recipients, attachments, emails, documents, and signed PDF actions |
| Inbox / My Tasks | `/inbox/` list; task/document/priority/search filters; visible-row selection and bulk mark-read/snooze/retry/cancel; per-item approve/reject/delegate for approval items; "Sign Now" for signing items; failed tasks link to Background Tasks |
| Templates | `/templates/`, `/template-versions/`, `/template-parties/`, metadata edit, archive/activate, duplicate, delete, setup, dynamic template-party recipient assignment, and `/envelopes/create_from_template/` |
| Form Builder | `/documents/`, `/documents/{id}/prepare-for-builder/`, `/documents/{id}/process/`, `/scan/`, `/templates/`, `/templates/{id}/setup/`; supports File Library document loading, dynamic parties with inline rename (double-click tab), attachment-upload fields, radio group fields with configurable options, corner-handle field resizing, page-clamped field placement, and normalized 1040px-wide page coordinates plus persisted page width/height basis in saved template schemas and FormField rows |
| Documents / File Library | `/documents/` upload/list/search/sort/filter; `/documents/summary/`; `/documents/{id}/prepare-for-builder/`, `/duplicate/`, `/process/`, `/scan/`, `/render_pages/`; `/stored-files/` |
| Signing Sessions (admin) | `/signing-sessions/` — live table with status, token, envelope link, "Open Signer" action for active sessions |
| Signing Workflow (public signer) | `/sign/{token}/`, typed/drawn/uploaded signature capture controlled by builder settings, typed-signature style/color/size controls, signer decline and signer self-delegation, all field types including date picker/dropdown/attachment upload, filled-value overlays without outlines, signature image overlays, canonical 1040px page rendering with actual rendered page height when available, readonly completed/review display with attachment links, signed-PDF output using the same canonical page-image coordinate basis, and signer-uploaded attachment pages appended to the generated artifact via `/evidence-bundles/` |
| Workflow Builder | `/workflows/`, `/workflows/{id}/replace-stages/`, `/workflow-runs/`, `/workflow-events/`; create/edit/delete/activate/archive, validation/simulation, run creation, event view, `/workflow-runs/{id}/advance/` |
| Approvals | `/approval-requests/` + approve / reject / request-changes / delegate; per-status tab counts, delegated tab, backend-backed detail modal, live approval analytics, and live approver-load sidebar |
| Audit Trail | `/audit-events/` with backend search, type-prefix filter, date range, pagination; evidence bundle creation + verify |
| Evidence Bundles | `/evidence-bundles/`, `/generate/`, `/generate-signed-pdf/`, `/verify/`, `/visual-qa/`; manifest includes submitted field attachments |
| API Docs / API Keys | API Docs now includes live sidebar sections for Authentication, Rate Limiting, Errors, Pagination, Envelopes, Templates, Signatures, Webhooks, Users, Audit Trail, and Files; `/api-keys/` — list, create, rotate, revoke, scope-edit |
| OAuth Apps | `/oauth-apps/` — list, create, edit, delete, disable, rotate client secret with one-time reveal |
| Webhooks | `/webhook-endpoints/`, `/event-outbox/`, `/webhook-deliveries/` — add, edit, delete, queue test delivery, history, replay delivery |
| Operations Console | `/risk-findings/` (resolve), `/policy-rules/` (create), `/api-request-logs/`, `/event-outbox/`, `/oauth-grants/` (revoke), `/object-permissions/`, `/feature-flags/` (toggle), `/search-index/` (rebuild) |
| Release Control | `/feature-flags/`, `/feature-flags/seed-defaults/`, `/feature-flags/{id}/review/`, `/feature-flags/{id}/release/`, `/feature-flags/summary/`; auto-seeded fine-grained release gates for all current app surfaces including Dashboard, Inbox, Envelopes, Templates, Form Builder, File Library, Signing, Workflow, Approvals, Developer, Admin, Settings, Compliance, Billing, License, Roadmap, Operations, and Release Control; selected backend endpoints enforce these gates directly |
| Billing | `/subscriptions/`, `/plans/`, `/usage-records/`, `/invoices/`, `/payment-methods/`, `/payment-portal-sessions/`, `/payment-webhook-events/`, checkout/portal handoff actions, provider webhook ingest, super-admin plan allocation, and payment-method override |
| License | `/license-keys/` — details, backend feature list, activation with default licensed features, super-admin license generation, and override |
| Roadmap | `/app-settings/` namespace `roadmap` — feature requests, subscriptions, upvotes, and notify-me records |
| Settings — General | `/general-settings/` — all fields including `application_name` and `time_format` |
| Settings — Email / SMTP | SMTP config stored via `/app-settings/` (namespace=email, key=smtp); test email via `/email-messages/test_smtp/`; email templates via `/email-templates/` |
| Settings — Branding | `/organizations/{id}/branding/` + `/organizations/{id}/upload_logo/`; logo preview/sidebar application, saved color palette application, signing portal domain, email from-domain, and email footer persistence |
| Settings — Security | `/security-settings/` — all 14 fields including MFA toggles, password policy, session limits, IP allowlist |
| Settings — Storage | `/storage-settings/` — backend, bucket, endpoint; connection check via `/health-checks/summary/` |
| Settings — Notifications | `/notification-preferences/` — per-row PATCH/POST upsert; digest frequency via `PATCH /profiles/me/` |
| SSO / SCIM / LDAP / JIT / Social | `/sso-connections/` (OIDC + SAML — save, validate, test, persisted SAML security toggles, provider preset form-fill), `/scim-connections/`, `/scim-identities/provision-user/`, `/ldap-connections/`, `/jit-settings/`, `/social-providers/` |
| Legal Holds | `/legal-holds/` — list, create, view details modal; `/legal-holds/{id}/release/` with confirm |
| Retention Policies | `/retention-policies/` — list, create; toggle active/inactive; delete |
| Data Residency | `/data-residency-regions/`, `/data-residency-policies/`, `/data-residency-policies/summary/`; enforcement flag via `/app-settings/` |
| Compliance Exports | `/compliance-exports/` — list; queue export with type selector (audit/envelopes/signatures/users/full) and date range |
| Admin — Users | `/users/`, `/memberships/`, `/invitations/`, `/mfa-devices/`, `/user-sessions/`; all lifecycle actions, including target-organization selection for super-admin cross-organization user creation/invites |
| Admin — Organisations | `/organizations/`, `/organization-domains/` — create, read, update, export, logo upload, ownership transfer, deletion request/confirm, and super-admin direct delete |
| Admin — Teams | `/teams/` — create, edit, delete with audit logging; membership role/custom-role assignment |
| Admin — Roles & Permissions | `/roles/` — list, create, edit, delete (non-system), permission matrix PATCH with audit logging; built-in membership roles are Super Admin, Admin, Manager, Signer, and Viewer |
| Background Tasks | `/task-runs/summary/`, `/task-definitions/`, `/email-messages/summary/`, `/health-checks/summary/`; tab filters (All/Failed/Running/Queued); restart, cancel, purge; live queue/task/scheduler rows with explicit empty states; live Celery worker names when inspect is available |
| System Health | `/health-checks/summary/`, `/health-checks/run_checks/`, `/health-checks/public_status/`, `/health-checks/apm-config/`, `/health-checks/deployment-readiness/`, alert thresholds + subscriptions, `/incidents/` create/resolve, public status publish action |
| Email Messages | `/email-messages/` — retry, mark-bounced |
| Profile — Personal Info | `PATCH /profiles/me/` |
| Profile — Security | passkeys (WebAuthn), TOTP QR setup, auth state |
| Profile — Sessions | `/user-sessions/` — list, per-session revoke, revoke-all-others |
| Profile — Activity | `/profiles/me/activity/` |
| Profile — Notifications | `/notification-preferences/` — per-row PATCH/POST upsert |
| Profile — Change Password | `POST /profiles/change_password/` with auth-version bump |
| Login / Auth | `/auth/login/`, `/auth/refresh/`, passkey challenge + assertion |
| Setup / Invitation | Setup-token and invitation-token inspect/complete flows |
| Search | `/search/` — tenant-scoped with rank details, Postgres full-text strategy when available, and weighted-term fallback in local dev |

---

## Current Verification

- 2026-05-20 React frontend — integration fixes and PDF rendering:
  - **PDF rendering:** `backend/documents/rendering.py` now uses Poppler (`pdftoppm`) to generate real page PNGs. `prepare-for-builder` auto-detects page count via `pypdf`. Blank canvas is only the fallback.
  - **Public signing fixed:** `EP.SIGN_SUBMIT` / `EP.SIGN_DECLINE` corrected to `/sign/{token}/`. Submit payload sends `field_values` as `[{field_key, value}]` array; decline sends `action: 'decline'`. Signature uses `{signature_type, typed_name, metadata}`.
  - **FormBuilder page loading:** `rendered_pages` from `prepare-for-builder` used directly; `render_pages` fallback handles array response.
  - **PublicSigning pages:** Correctly derived from `session.documents[].document_detail.pages[]`.
  - **EP constants:** 10 missing constants added; `Profile.jsx` and `BackgroundTasks.jsx` updated.
  - **Template/Envelope creation:** Full async creation flows with `create-from-template`, party/role assignment, document attachment for scratch envelopes.
  - **UI/UX:** `index.css` modernized; `.card-title` / `.card-header` CSS bug fixed.
- 2026-05-18 React frontend scaffold initialized: all 44 pages live-wired with `useApiQuery`.
- 2026-05-18 signed PDF coordinate fix: three-layer fix in `evidence/pdf.py`, `form-builder.js`, and `live-wiring.js`.
- 2026-05-16 side-by-side hookup pass: `docs/FRONTEND_BACKEND_HOOKUP_AUDIT.md` mapped; export actions converted to file downloads.
- 2026-05-15 frontend live-data verification: Dashboard, Approval Queue, Test Lab, SSO SAML checked in code.
- Nginx/API smoke checks: `200` on `/api/v1/task-runs/`, `/api/v1/sso-connections/`, `/api/v1/profiles/me/`, `/api/v1/inbox/`, `/api/v1/analytics/approval-bottlenecks/`.
- Backend system check passes. Migration dry-run reports no model changes.
- Full tenant API test class passes: `accounts.tests.TenantScopedAPITests` (`91 tests OK`).
- Next verification step is Docker click-through QA: upload a real PDF, build a template, create an envelope, sign it end-to-end.

---

## Partially Represented — loads live, some sections static

### Settings — General
The **Envelope Defaults** card is now persisted on `GeneralSettings`. New envelopes and backend-native template-created envelopes use the organization default expiration when no due date is supplied.

### Settings — Storage
AWS Access Key ID and Secret Access Key are intentionally not stored in the database (these belong in environment variables / secrets manager). The storage page now renders saved backend/encryption policy plus live disk/object-storage/MinIO metrics from `/health-checks/summary/`.

### Settings — Notifications
The four **Digest Email content** checkboxes ("Include pending signatures", "Overdue items", "Completed", "Team activity") persist in profile preferences along with digest frequency. Notification preference rows remain live through `/notification-preferences/`.

### Admin — Impersonation
Audited request/approve/deny/start/end workflow exists and is visible in the Users page impersonation queue. Starting requires an approved request and issues a temporary JWT for the target user with impersonation claims; ending restores the previous mock token and revokes the target auth version.

### Background Tasks
The task table, queue counts, retry/cancel/purge actions, email reliability, and scheduler definitions are live. The **Celery Workers** panel now uses worker names, active/reserved/scheduled task counts, pool size, PID, RSS, and timing metadata from `/health-checks/summary/` when Celery inspect responds; if inspect is unavailable it shows an explicit fallback message.

### System Health
Health metrics, alert thresholds/subscriptions, the public status JSON endpoint, APM config/runtime status, deployment-readiness checks, and **Recent Incidents** are live. Hosted status-page publishing and external alert-provider delivery remain production-observability work.

### SSO
OIDC, SAML, SCIM, LDAP, JIT provisioning, and Social Login configuration records are now wired to backend endpoints. Production login/account-linking policies, provider certificate rotation, and complete SCIM lifecycle automation remain deferred.

### TOTP
Full QR-code registration and confirm flow are wired. Dev mode accepts any 6-digit code for devices without a stored secret; production requires the secret in `MFADevice.metadata.totp_secret`.

### Usage & Billing
Plan banner, usage bars, stat cards, invoice history, payment method card, checkout session creation, billing portal session creation, session records, and webhook event history are live. The handoff URL is provider-configurable and defaults to a mock local URL for development; provider webhooks can reconcile subscriptions/invoices when organization/session metadata is present.

### License
License key details (edition, status, dates) and the Edition Features checklist load from the backend `features` array. Activating a blank development license seeds a default feature list so the UI no longer depends on curated mock labels.

### Signing.js (internal test page)
`signing.js` registers a static NDA walkthrough page for internal dev/demo use. The production public-signer flow (`/sign/{token}/`) is fully live-wired.

---

## Backend Endpoints with No Frontend UI

| Endpoint | What it does | Notes |
|---|---|---|
| `/consent-records/` | Signer consent records | Accessible only via signing flow |
| `/signatures/` | Stored signature objects | Accessible only via signing flow |
| `/field-values/` | Envelope field values | Accessible only via signing flow |
| `/recovery-codes/` | Account recovery codes | Backend-managed, no UI needed |
| `/passkey-challenges/` | WebAuthn challenge state | Backend-internal to login/register flow |
| `/reminder-schedules/` | Reminder schedule records | Email page can trigger `run_due/`; full schedule editor deferred |

---

## Still Mock-Only or Intentionally Deferred

- **Storage credentials** — AWS/MinIO keys not stored in DB (use env vars)
- **External payment processor execution** — webhook ingestion/reconciliation is live; actual Stripe/Adyen checkout/portal session creation, taxes, refunds, and receipts remain environment-specific
- **Celery worker production telemetry** — Celery inspect details and process/host metrics are live; container orchestrator metrics still require production observability integration
- **Docker click-through QA** — next checkpoint; automated/backend tests are green, but every browser-visible action still needs a proxy-stack pass before declaring MVP complete.
- **SDK / CLI documentation publishing** — intentionally deferred
- **API request runner** — intentionally deferred; Test Lab run/schedule/report/details actions now hydrate from `/task-runs/`, create backend task records, export backend run data, and rerun failed recorded suites
- **Product roadmap planning system** — visible roadmap feedback is stored through backend app settings; a richer triage board, voting dedupe, and notification delivery remain product-management polish
- **Advanced search quality** — Postgres full-text ranking is wired when available; stemming dictionaries, typo tolerance, and synonym tuning remain deferred
- **Production-grade PDF rasterization** — **implemented 2026-05-20** via Poppler (`pdftoppm`); PyMuPDF is an optional upgrade path
- **AI document analysis and risk automation** — beyond stored risk findings
