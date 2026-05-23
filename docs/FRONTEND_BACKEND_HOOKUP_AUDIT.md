# Frontend / Backend Hookup Audit

Last updated: 2026-05-23

This audit compares the visible mock frontend modules with the backend endpoints currently exposed under `/api/v1/`.

## Feature Scan Source

The current coverage matrix is based on a feature-by-feature scan of:

- `react-frontend/src/router.jsx` for visible pages and public/authenticated routes.
- `react-frontend/src/api/endpoints.js` for frontend API constants.
- `backend/hanmak/urls.py` for registered DRF routers and standalone API paths.
- Backend `models.py` and `views.py` files for the data objects/actions behind each feature.

No visible React feature group is intentionally undocumented: auth/setup/profile, dashboard, inbox, search, templates, form builder, documents, envelopes, signing, workflow, approvals, audit/evidence, admin, settings/identity, system operations, compliance, billing/license, developer/integrations, and release control are all represented below.

## React Frontend Hookup Status (2026-05-18)

The React production frontend (`react-frontend/`) is fully implemented. All 46 lazy-loaded pages call live backend endpoints via the centralized `EP` registry (`src/api/endpoints.js`). Key integration notes:

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
| Error Log | Live frontend error log page backed by the client error store for local diagnostics. |
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

## 2026-05-20 FormBuilder / Preview / create-from-template Fixes

| Issue | File(s) Changed | Fix |
|---|---|---|
| `POST /api/v1/envelopes/create-from-template/` returned 405 | `backend/envelopes/views.py` | DRF generates URL from `func.__name__` (underscores) when no `url_path` set; `create_from_template` → `create_from_template/` (underscore) but frontend called `create-from-template/` (hyphen). Fixed by adding `url_path='create-from-template'`. |
| FormBuilder save sent wrong payload structure | `templates/FormBuilder.jsx` | `handleSave` was sending `{name, document, parties, form_schema:{fields}}` but `TemplateSetupSerializer` expects `{document, fields, changelog}`. Fixed: template name PATCHed separately; fields sent at top level; parties auto-derived by `setup_template_version` from field `party_key` values. |
| Template preview modal showed no field overlays | `templates/TemplateList.jsx` | Modal only rendered `<img>` tags. Fixed: `openPreview` now stores `fields` and `versions` in state; modal renders color-coded absolute-positioned field overlays using `field.x/pageW*100%` percentage positioning. |

## 2026-05-20 OAuth Apps + useApiMutation Fixes

| Issue | File(s) Changed | Fix |
|---|---|---|
| `useApiMutation` `invalidateKeys` never ran when `onSuccess` was also provided | `src/hooks/useApi.js` | Spreading `...options` at end of `useMutation({})` overwrote the wrapped `onSuccess`, so cache invalidation was silently skipped for all 124 mutations in the app. Fixed by destructuring `onSuccess` out of options before the spread. |
| Toggle enable/disable didn't refresh app list | `developer/OAuthApps.jsx` | Caused by the `useApiMutation` hook bug above; now fixed. Toggle correctly sends `{status:'active'/'disabled'}`. |
| Delete didn't remove app from list | `developer/OAuthApps.jsx` | Same root cause — `invalidateKeys` didn't run. Fixed by hook fix. |
| OAuth scope names were generic (`read`, `write`) | `developer/OAuthApps.jsx` | Changed `ALL_SCOPES` to namespaced scopes matching the vanilla JS reference: `envelopes:read`, `envelopes:write`, `templates:read`, `signatures:write`, `users:read`. |
| Edit modal had no status field | `developer/OAuthApps.jsx` | Added Status dropdown (Active/Disabled) to `AppFormModal` when editing; payload now includes `status` on PATCH. |

## 2026-05-20 FormBuilder Enhancements

| Enhancement | File(s) Changed | Detail |
|---|---|---|
| Resizable field boxes | `templates/FormBuilder.jsx` | Corner drag handles (NW/NE/SW/SE) appear on selected fields. `startDragField` extended with `mode` param (`'move'` default, `'resize-se'`, `'resize-sw'`, `'resize-ne'`, `'resize-nw'`). Opposite corner is pinned during resize; min size enforced (40px wide, 18px tall). `FieldOverlay`, `DocumentPage`, `BlankPage` updated to pass resize mode through. |
| Radio button field type | `templates/FormBuilder.jsx` | Added `radio` to `FIELD_DEFAULTS` (160×80), `FIELD_LABELS`, and `FIELD_GROUPS` (Selection group). `FieldInspector` `isSelect` condition includes `radio` so the options editor appears for radio groups. `fieldApiType` passes `radio` through unchanged. |
| Rename party names | `templates/FormBuilder.jsx` | Double-click any party tab to rename it inline. An `<input>` replaces the button; pressing Enter or blurring commits the new name; Escape cancels. `editingPartyId` state + `renameParty` callback added. |

## 2026-05-23 Workflow, Preview, and Signing Carry-Forward Fixes

| Area | Files Changed | Fix |
|---|---|---|
| Workflow-backed templates | `TemplateList.jsx`, `FormBuilder.jsx`, `envelopes/serializers.py`, `envelopes/services.py`, `envelopes/views.py` | Templates can be saved with or without an active workflow. Workflow-backed templates store `workflow_schema`, turn human workflow stages into parties, require party recipients, and auto-start a workflow run on send. |
| Workflow run stage/party display | `envelopes/models.py`, `workflow/serializers.py`, `WorkflowBuilder.jsx` | Added `Recipient.party_key`, persisted party ownership, and serialized run `stages`/`parties` so workflow runs show all stages and owning parties. |
| Multi-page template preview | `TemplateList.jsx` | Preview now prefers PDF.js when the source PDF is available, rendering every page and repairing backend page count with `prepare-for-builder`. |
| Public signing carry-forward | `PublicSigning.jsx` | Submit success uses the fresh POST response, and shared/unassigned fields completed by the first signer render as read-only overlays for later parties. |

## 2026-05-20 Critical Bug Fixes

| Bug | Root Cause | Files Changed | Fix |
|---|---|---|---|
| Party names reset to "Party 1/2" on template reload | `FormBuilder.jsx` loaded fields from `versionsData` but never restored `parties` from `latest.parties[]` | `FormBuilder.jsx` | `versionsData` effect now reconstructs parties from `latest.parties[].{role_key, label}` before loading fields |
| Party names not persisted after save | `TemplateSetupSerializer` had no `parties` field; `setup_template_version` always auto-generated labels from `role_key` | `envelopes/serializers.py`, `envelopes/services.py`, `envelopes/views.py`, `FormBuilder.jsx` | Added optional `parties` list to serializer; `setup_template_version` accepts `party_labels` dict and uses it; `handleSave` includes `parties: [{key, label}]` in payload |
| Renamed party names defaulted back in envelope creation | Same root cause — party labels were never stored, `TemplateParty.label` always auto-generated | Same files | Same fix — party labels now round-trip through save/load |
| Multi-page documents only showed first page in signing/preview | `prepare_for_builder` was called with `page_count: doc.page_count || 1` BEFORE `pdfjs` rendered the PDF, so 0-page documents registered only 1 page in the backend | `FormBuilder.jsx` | Moved `prepare_for_builder` call inside the async IIFE, after `renderPdfFromBytes`, passing `pages.length` as the real page count |
| Completed form not viewable or downloadable after signing | Simple ✅ screen had no document view or download button; revisiting a submitted session (`status='submitted'`) fell through to the main signing form | `PublicSigning.jsx`, `signing/views.py`, `hanmak/urls.py`, `endpoints.js` | Added `PublicSigningDownloadView` at `GET /sign/{token}/download/` (public, token-gated); added `EP.SIGN_DOWNLOAD`; replaced simple ✅ screen with full read-only view showing document pages + filled field overlays + "Download Signed PDF" button; fixed completed detection to check `session.is_completed` and `status === 'submitted'` |
| `handleSave` stale closure sent old party list | `parties` was missing from `useCallback` dependency array in `FormBuilder.jsx` — always sent initial `[Party 1, Party 2]` regardless of renames | `FormBuilder.jsx` | Added `parties` to `handleSave` dependency array |
| Renamed parties showed as raw slug in envelope creation dropdown | `partyKeys = t?.party_keys ?? []` returns role slugs; option label was the raw slug string | `TemplateList.jsx` | Envelope creation modal now reads `t?.versions?.[0]?.parties` (which has `{role_key, label}`); dropdown shows human labels; falls back to title-cased slugs when no version data |
| Download Signed PDF button hidden for revisiting signers | Condition `submitted || envelope_detail.status === 'completed'` excluded revisiting signers (neither true post-reload) | `PublicSigning.jsx` | Button always shown inside `isAlreadyDone` view — condition removed |
| Multi-page: signing view only shows first page when backend images missing | `pages` array sourced backend `image_url` only; no fallback when Poppler page images unavailable | `PublicSigning.jsx` | Added pdfjs client-side rendering effect: fetches document `file_url`, renders all pages into canvas data URLs, merges into `augmentedPages`; signing and completed views both use `augmentedPages` |

## 2026-05-20 End-to-End QA Pass Results

Full API sweep performed against the live Docker stack. All 44 frontend pages and their EP constants verified.

**Bugs found and fixed:**

| Bug | Fix |
|---|---|
| `POST /webhook-endpoints/{id}/test/` → 404 | Added `test` `@action` to `WebhookEndpointViewSet` in `webhooks/views.py`. Creates a test `EventOutbox` entry, fires an HTTP delivery to the endpoint URL, records the result in a `WebhookDelivery` record, returns `{delivery_id, status, response_status, error_message, latency_ms}`. |
| SMTP test → 400 "organization is required" | `Email.jsx` `handleSendTest` was sending `{to}` without `organization`. Fixed to include `organization: Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'))`. |

**Confirmed working (complete list):**
Analytics (completion, approval-bottlenecks), Dashboard all cards, Inbox (all/signing/approval/tasks tabs), Envelopes (list/summary/detail/download/bulk-action/create-from-template), Templates (list/versions/parties/setup/archive/activate/duplicate), Documents (list/summary/upload/process/prepare-for-builder), Signing Sessions (admin list), Public signing (GET session, submit, decline, download — download correctly 403 when envelope not yet completed), Workflows (list/runs/events/stages), Approvals (list/approve/reject/request-changes/delegate — `/approval-requests/`), Audit Events, Evidence Bundles (list/verify), API Keys, OAuth Apps, Webhooks (endpoints/deliveries/replay/test), Email messages/templates, Feature flags/Release control, Operations Console (risk-findings/policy-rules/api-request-logs/event-outbox/oauth-grants/object-permissions), Users (list/sessions via `/user-sessions/`/mfa-devices), Organizations/Teams/Roles, Background Tasks (task-runs/definitions/summary), System Health (`/health-checks/summary/`, `/health-checks/deployment-readiness/`, `/health-checks/apm-config/`), General/Email/Storage/Security/Notification settings, SSO connections, Branding (`/organizations/{id}/branding/`), Data Residency (regions/policies), Legal Holds, Retention Policies, Compliance Exports, Plans, Subscriptions, Invoices, Payment Methods, Payment Webhook Events, License Keys, App Settings (roadmap).

**Expected/correct non-200 responses (not bugs):**
- Signing download 403 when envelope `status = sent` (not yet completed) — correct by design
- Template setup 400 when document is null — correct validation
- Envelope bulk-action 405 on GET (POST-only action) — correct DRF behaviour

## 2026-05-21 Rate Limiting & Security Hardening

| Change | Files | Detail |
|---|---|---|
| DRF throttle classes | `accounts/throttles.py` | `_ScopedThrottle` base reads rate live from `api_settings` so `override_settings` works in tests. Five endpoint-scoped subclasses: login (10/min), token_refresh (30/min), public_signing (30/min), account_setup (5/min), password_reset (5/min). |
| Login / refresh throttle | `accounts/token_views.py` | `HanMakTokenObtainPairView` uses `LoginRateThrottle`; `HanMakTokenRefreshView` uses `TokenRefreshRateThrottle`. |
| Public signing throttle | `signing/views.py` | `PublicSigningSessionView` and `PublicSigningDownloadView` both use `PublicSigningRateThrottle`. `DoesNotExist` on unknown tokens now returns `404` instead of a 500 traceback. |
| Invitation / password-reset throttle | `accounts/views.py` | `InvitationViewSet.get_throttles()` applies `AccountSetupRateThrottle` on accept/inspect_token actions. `AccountRecoveryRequestViewSet.get_throttles()` applies `PasswordResetRateThrottle` on request_reset/complete actions. |
| Global throttle settings | `hanmak/settings.py` | `DEFAULT_THROTTLE_CLASSES` and `DEFAULT_THROTTLE_RATES` added to `REST_FRAMEWORK`. All rates env-configurable (`THROTTLE_*`). |
| Security headers | `hanmak/settings.py` | `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS=DENY`, `SECURE_BROWSER_XSS_FILTER`, `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SAMESITE=Lax`. |
| BasicAuth removed from production | `hanmak/settings.py` | `BasicAuthentication` only loaded when `DEBUG=true`. |
| Bundle splitting | `react-frontend/vite.config.js`, `react-frontend/src/router.jsx` | All 44 page routes wrapped in `React.lazy()`. `manualChunks` extracts react/query/axios vendor bundles. Initial load reduced from ~1.4 MB to ~39 kB shell + deferred vendor chunks. |

## Remaining Intentional Non-API Actions

- Copy buttons remain copy-only where the action is genuinely copy-oriented: API key reveal, webhook/SCIM token, signing URL, hash, code snippets, SSO metadata, and single audit event text.
- Development placeholder document creation remains in code for Test Lab and local QA, but beta mode blocks user-facing placeholder envelope/template creation.
- `signing.js` still contains the old static signing workflow mock, but `live-wiring.js` registers the active `signing` page later and overrides it with the backend-backed Signing Sessions page.
- `settings.js` still contains the older email settings mock, but `live-wiring.js` registers the active `settings-email` page later and overrides it with the backend-backed SMTP/template UI.

## Current Static Scan Result

No remaining high-impact create/edit/delete/send/retry/export/delegate/test action was found that only displays a toast when a backend endpoint exists. Remaining toast-only items are informational, no-file notices, or copy helpers.
