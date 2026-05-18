# Frontend / Backend Hookup Audit

Last updated: 2026-05-18

This audit compares the visible mock frontend modules with the backend endpoints currently exposed under `/api/v1/`.

## React Frontend Hookup Status (2026-05-18)

The React production frontend (`react-frontend/`) is fully implemented. All 44 pages call live backend endpoints via the centralized `EP` registry (`src/api/endpoints.js`). Key integration notes:

| Concern | Implementation |
|---|---|
| Auth endpoints | `EP.TOKEN_OBTAIN = '/auth/login/'`, `EP.TOKEN_REFRESH = '/auth/refresh/'` |
| Org scoping | All create mutations include `organization: Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'))` |
| Authenticated file downloads | Blob pattern: `apiClient.get(url, {responseType:'blob'})` → `URL.createObjectURL()` → programmatic anchor click (bypasses browser's unauthenticated `<a href>`) |
| Media files | `/media/` served by Nginx without auth — direct `<img src>` and `<a href>` work for page images |
| Evidence bundles | POST requires `{envelope: id}` — frontend uses envelope picker modal; `{name, description, audit_event_ids}` schema is NOT used |
| Settings | All settings POSTs are upserts via `SingletonSettingsViewSet` — always send full payload including `organization` |
| Toast | `useToast()` returns `{ showToast, dismiss, success, error, warning, info }` — all pages use shorthand methods |

## Coverage Matrix

| Frontend module | Backend hookup status |
|---|---|
| Dashboard | Live: analytics, inbox counts, search, audit activity, webhook/risk/workflow summaries, CSV export. |
| Inbox / My Tasks | Live: `/inbox/`, approval actions, signer links, failed task retry/cancel/delete, filters, checkboxes, bulk actions. |
| Envelopes | Live: list/search/filter/sort, summary, create-from-template, edit, send, remind, void, delete, bulk actions, CSV export, signed PDF generation. |
| Templates | Live: template CRUD, setup, duplicate, archive/activate, version/party/field metadata, create envelope from template. |
| Form Builder | Live: File Library document loading, backend page previews, template setup save, attachment fields, party assignment. |
| File Library | Live: document upload/list/summary/search/filter/sort/rename/duplicate/process/scan/render/delete. |
| Signing Sessions | Live: `/signing-sessions/` admin list and public signer link launch. |
| Public Signing | Live: `/sign/{token}/` load/submit/decline/delegate, field validation, attachments, readonly completed review, canonical field geometry, and signed-PDF attachment append. |
| Workflow Builder | Live: workflow CRUD, stages, validation/simulation, run creation, archive/activate, event view, run advance. |
| Approval Queue | Live: queue, filters, details, approve/reject/request-changes/delegate, CSV export. |
| Audit / Evidence | Live: audit filters/export, evidence bundle generate/verify/signed PDF/visual QA. |
| API Docs | Live downloads: OpenAPI and Postman. Static reference content now matches visible sidebar sections. |
| API Keys | Live: list/create/rotate/revoke/scope edit. Copy actions intentionally copy generated secrets/prefixes. |
| OAuth Apps | Live: list/create/edit/delete/disable/secret rotation. |
| Webhooks | Live: endpoint add/edit/delete/test, delivery history, replay. |
| SDK / Test Lab | Live task-run based schedule/run/rerun/report export. SDK snippets are reference content by design. |
| Release Control | Live: feature flags, seed defaults, review, release, summary. |
| Operations Console | Live: risk findings, policy rules, request logs, event outbox, OAuth grants, object permissions, feature flags, search rebuild. |
| Users | Live: users, memberships, invitations, sessions, MFA, setup tokens, suspend/activate/reset/revoke, cross-organization create/invite for super admins. |
| Organizations | Live: create/read/update/delete, domains, export, logo upload, subsidiaries, transfer, deletion request/confirm. |
| Teams | Live: create/edit/delete and membership role/team assignment. |
| Roles & Permissions | Live: create/edit/delete and permission matrix update. |
| Background Tasks | Live: summaries, task runs, definitions, worker metrics, retry/cancel/purge/logs. |
| System Health | Live: summary checks, APM config, deployment readiness, incidents, public status, alert thresholds/subscriptions. |
| General Settings | Live: singleton general settings. |
| Branding | Live: branding settings, logo upload, color application, signing/email domain values, footer. |
| Email / SMTP | Live: SMTP app-setting storage, SMTP test endpoint, email templates CRUD/preview. |
| Storage | Live: singleton storage settings and health summary verification. |
| Security | Live: singleton security settings and session revocation. |
| Notifications | Live: notification preferences and profile digest frequency. |
| SSO / SCIM / LDAP | Live: OIDC/SAML/SCIM/LDAP/JIT/social settings, validation/test actions, token rotation. |
| Compliance | Live: legal holds, retention, data residency, compliance exports. |
| Billing | Live: plans, subscriptions, usage records, invoices, payment methods, portal/checkout handoff, webhook events, super-admin plan allocation, and payment override. |
| License | Live: license key activation/details/backend feature list, super-admin key generation, and license override. |
| Roadmap | Live persistence through `app-settings` roadmap records. |
| Login / Setup | Live: login/refresh, passkey challenge flow, recovery request, setup token and invitation acceptance. |

## Remaining Intentional Non-API Actions

- Copy buttons remain copy-only where the action is genuinely copy-oriented: API key reveal, webhook/SCIM token, signing URL, hash, code snippets, SSO metadata, and single audit event text.
- Development placeholder document creation remains in code for Test Lab and local QA, but beta mode blocks user-facing placeholder envelope/template creation.
- `signing.js` still contains the old static signing workflow mock, but `live-wiring.js` registers the active `signing` page later and overrides it with the backend-backed Signing Sessions page.
- `settings.js` still contains the older email settings mock, but `live-wiring.js` registers the active `settings-email` page later and overrides it with the backend-backed SMTP/template UI.

## Current Static Scan Result

No remaining high-impact create/edit/delete/send/retry/export/delegate/test action was found that only displays a toast when a backend endpoint exists. Remaining toast-only items are informational, no-file notices, or copy helpers.
