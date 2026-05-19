# Frontend / Backend Hookup Audit

Last updated: 2026-05-20

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

## 2026-05-20 Fixes Applied

| Issue | File(s) Changed | Fix |
|---|---|---|
| `EP.SIGN_SUBMIT` / `EP.SIGN_DECLINE` pointed to non-existent sub-paths | `src/api/endpoints.js`, `PublicSigning.jsx` | Both now resolve to `/sign/{token}/`. Decline sends `action:'decline'`; submit sends `field_values` as `[{field_key,value}]` array and `signature` with `{signature_type,typed_name,metadata}`. |
| FormBuilder showed blank pages — `render_pages` array response not parsed | `templates/FormBuilder.jsx` | `prepare-for-builder` `rendered_pages` used directly; fallback handles `Array.isArray(data)`. |
| PublicSigning showed "Document preview not available" — wrong pages path | `signing/PublicSigning.jsx` | Pages now read from `session.documents[].document_detail.pages[]`. |
| 10 EP constants missing or hardcoded as strings | `src/api/endpoints.js`, `Profile.jsx`, `BackgroundTasks.jsx` | Added `MFA_TOTP_BEGIN/CONFIRM`, `MFA_PASSKEY_BEGIN/FINISH_REG`, `TASK_RUN_SUMMARY`, `EMAIL_MESSAGES/TEMPLATES`, `ENVELOPE_BULK/SUMMARY/CREATE_FROM_TEMPLATE`. |
| Template/Envelope modals used stub mutations | `TemplateList.jsx`, `EnvelopeList.jsx` | Full async creation matching mock: `create-from-template` + party/role assignment + document attach. |
| `.card-title` / `.card-header` undefined in CSS | `styles/index.css` | Classes defined with DM Sans font, correct margin/weight. Full CSS modernization applied. |
| PDF pages were blank white PNGs | `backend/documents/rendering.py`, `views.py` | Poppler (`pdftoppm`) renders real PDF pages at 1040 px width. `pypdf` auto-detects page count. |

## 2026-05-20 Storage + Rendering + Preview Fixes

| Issue | File(s) Changed | Fix |
|---|---|---|
| FormBuilder blank pages: `document.file.path` raises `NotImplementedError` for S3 storage | `templates/FormBuilder.jsx` | Client-side PDF.js rendering (`pdfjs-dist`) — browser renders PDF pages directly into canvas data URLs; no backend renderer dependency for the canvas preview. Backend upload runs in parallel to register the document. |
| Existing document preview in FormBuilder also blank (fetching MinIO URL 403) | `templates/FormBuilder.jsx` | Primary path now fetches `file_url` via `apiClient.get(url, {responseType:'arraybuffer'})` and renders with PDF.js. Nginx `/files/` proxy makes URLs same-origin so fetch succeeds. |
| MinIO file URLs missing bucket name in path (403) | `settings.py`, `docker-compose.dev.yml`, `.env.example` | `AWS_S3_CUSTOM_DOMAIN` changed to `localhost:8080/files`; Nginx `/files/` location proxies to `minio:9000/hanmak/`. All file URLs are now `http://localhost:8080/files/{key}`. |
| PDF page images always blank PNG (Poppler couldn't access S3 files) | `backend/documents/rendering.py` | Replaced raw `pdftoppm` subprocess with `pdf2image.convert_from_bytes()`. `_get_pdf_bytes()` reads file via Django's storage API (`file.open('rb')`) which transparently handles both local and S3/MinIO storage. |
| Template preview modal showed "No page images available" for all templates | `templates/TemplateList.jsx` | `openPreview()` now calls `prepare-for-builder` on demand when no pages exist, using `rendered_pages` from the response. |
| Template cards showed no document preview | `templates/TemplateList.jsx`, `backend/envelopes/serializers.py` | Added `preview_image_url` to `TemplateSerializer` (first page of latest version's document). Template cards now show a 148 px thumbnail above content; clicking opens the preview modal. |
| No MinIO bucket on startup | `docker-compose.dev.yml` | Added `minio_init` service (`minio/mc`) that creates the `hanmak` bucket and sets it public-read before backend services start. |

## Remaining Intentional Non-API Actions

- Copy buttons remain copy-only where the action is genuinely copy-oriented: API key reveal, webhook/SCIM token, signing URL, hash, code snippets, SSO metadata, and single audit event text.
- Development placeholder document creation remains in code for Test Lab and local QA, but beta mode blocks user-facing placeholder envelope/template creation.
- `signing.js` still contains the old static signing workflow mock, but `live-wiring.js` registers the active `signing` page later and overrides it with the backend-backed Signing Sessions page.
- `settings.js` still contains the older email settings mock, but `live-wiring.js` registers the active `settings-email` page later and overrides it with the backend-backed SMTP/template UI.

## Current Static Scan Result

No remaining high-impact create/edit/delete/send/retry/export/delegate/test action was found that only displays a toast when a backend endpoint exists. Remaining toast-only items are informational, no-file notices, or copy helpers.
