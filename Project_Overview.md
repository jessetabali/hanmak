# Project Overview

HanMak is a feature-complete enterprise document-signing platform — think DocuSign/PandaDoc. The repo has two parts: a vanilla-JS SPA mock frontend and a Django/DRF backend. The pattern is to build the backend API first, then progressively replace static mock data with live API calls.

---

## Frontend (`hanmak_demo_mock_directory/`)

~13,000 lines across 27 JS files, no build step.

Architecture is a hand-rolled SPA:

| File | Role |
|---|---|
| `app.js` | Router (`navigate()`, `registerPage()`), toast, modal, utility icons |
| `api-client.js` | `hanmakApi()` fetch wrapper with 401-retry/refresh, token storage, login/logout helpers |
| `live-wiring.js` | ~2,827 lines — the main integration layer; most pages' `_init()` hooks live here |
| Domain files | `envelopes.js`, `templates.js`, `signing.js`, `admin.js`, `settings.js`, `system.js`, `compliance.js`, `business.js`, `developer.js`, `sso.js`, etc. — each calls `registerPage()` for its sections |

**Init hook convention:** `navigate('settings-general')` renders the HTML string, then calls `settings_general_init()` if it exists. That function fetches from the API and populates the DOM. This is how mock → live wiring works throughout.

**Auth:** JWT tokens in `localStorage` (`HANMAK_ACCESS_TOKEN`, `HANMAK_REFRESH_TOKEN`). `ensureHanmakApi()` tries the refresh token first, then auto-attempts login with demo credentials (`admin` / `admin123`) if no token is present. Organization ID is also cached (`HANMAK_ORGANIZATION_ID`). Token version guard in `api-client.js` clears stale tokens when auth config changes.

---

## Backend (`backend/`)

Django 6.0 + DRF + simplejwt. 18 Django apps, ~65 models, ~80 router-registered viewsets plus custom views.

### App Breakdown

| App | Models |
|---|---|
| `accounts` | `Organization`, `Team`, `Membership`, `Role`, `Invitation`, `UserProfile`, `MFADevice`, `UserSession`, `ImpersonationRequest`, `ObjectPermission`, `PasskeyChallenge`, `AccountRecoveryRequest` |
| `envelopes` | `Template`, `TemplateVersion`, `TemplateParty`, `Envelope`, `Recipient`, `FormField` |
| `signing` | `SigningSession`, `ConsentRecord`, `Signature`, `EnvelopeFieldValue` |
| `documents` | `StoredFile`, `Document`, `DocumentPage`, `EnvelopeDocument`, `DocumentScan` |
| `configcenter` | `AppSetting`, release-control `FeatureFlag`, `GeneralSettings`, `EmailSettings`, `StorageSettings`, `SecuritySettings`, `HealthCheck`, `Incident` |
| `messaging` | `EmailMessage`, `EmailTemplate`, `ReminderSchedule` |
| `identity` | `SSOConnection`, `SSOState`, `SCIMConnection`, `SCIMExternalIdentity` |
| `evidence` | `EvidenceBundle` |
| `compliance` | `LegalHold`, `RetentionPolicy`, `ComplianceExport`, `DataResidencyRegion`, `OrganizationDataResidencyPolicy` |
| `workflow` | `WorkflowDefinition`, `WorkflowStage`, `WorkflowRun`, `WorkflowEvent` |
| `auditlog` | `AuditEvent` |
| `tasks` | `TaskDefinition`, `TaskRun`, `TaskRunEvent` |
| `risk` | `RiskFinding`, `PolicyRule` |
| `billing` | `Plan`, `Subscription`, `UsageRecord`, `Invoice`, `PaymentMethod`, `PaymentPortalSession`, `PaymentWebhookEvent`, `LicenseKey` |
| `search` | `SearchIndex` |
| `api_keys` | `APIKey`, `APIRequestLog` |
| `oauth_apps` | `OAuthApplication`, `OAuthGrant` |
| `webhooks` | `WebhookEndpoint`, `EventOutbox`, `WebhookDelivery` |

### Two Critical Shared Patterns

**1. Multi-tenancy — `OrganizationScopedQuerySetMixin`** (`accounts/permissions.py`)

Every viewset that inherits this mixin automatically filters its queryset to organizations the requesting user belongs to. Cross-org writes are rejected. Superusers bypass it.

**2. RBAC — `OrganizationRolePermission`** (`accounts/permissions.py`)

GET requests are gated by object-level grants; mutations require `admin` or `manager` membership role, or a matching custom-role permission (stored in the `Role` model's permission matrix). Most viewsets declare `write_roles` to narrow this further.

### Auth Stack

- **JWT** via `simplejwt`, extended with an `auth_version` claim (`accounts/auth.py`). Bumping `UserProfile.auth_version` invalidates all existing tokens (used on password reset and session revocation).
- **Token lifetime:** 8-hour access tokens, 7-day rotating refresh tokens.
- **Login lockout:** tracks `failed_login_count` / `locked_until` on `UserProfile`.
- **MFA:** WebAuthn passkeys fully wired (`fido2` library). TOTP fully wired — QR code generation via `qrcode[pil]`, secret stored in `MFADevice.metadata.totp_secret`, confirmed with HMAC-TOTP; dev mode accepts any 6-digit code for legacy devices without a stored secret.
- **Impersonation:** fully audited request/approve/deny/start/end flow (`ImpersonationRequest`) with guarded temporary session switching and auth-version revocation support.

### Celery / Async

- Two queues: `default` and `email`.
- Celery beat runs failed-email retries every 5 minutes and due-reminder automation hourly.
- `deliver_email_message_task` dispatches SMTP via the configured backend (Mailhog in dev).

### Services Layer

`envelopes/services.py` provides `setup_template_version()` and `create_envelope_from_template()` — atomic transactions that wire documents, parties, and field copies without relying on the frontend to orchestrate them.

---

## Integration State

The vast majority of the surface area is live-wired. See `MOCK_ALIGNMENT.md` for the full status.

**Fully wired:**
- Users, Organisations, Teams, Roles & Permissions (including delete)
- Envelopes, Templates, Form Builder, Documents, Public Signing
- Workflow Builder, Approvals, Audit Trail, Evidence Bundles
- API Keys, OAuth Apps, Webhooks, Operations Console
- Billing, License
- Settings: General (all fields), Email/SMTP, Branding, Security (all 14 fields), Storage, Notifications
- SSO (OIDC + SAML), SCIM provisioning
- Legal Holds, Retention Policies, Data Residency, Compliance Exports
- Admin (Users/Orgs/Teams/Roles), Background Tasks (with tab filters), System Health
- Profile (all tabs), Login/Auth, Setup/Invitation, Search
- Release Control for every current feature surface, with QA checklist, rollout stage, release action, automatic first-load seeding, frontend gating after flags load, and backend enforcement on selected tenant-scoped endpoints

## Documentation

Detailed guides:

| File | Purpose |
|---|---|
| `docs/USER_GUIDE.md` | Product workflow guide for operators, admins, signers, reviewers, and release managers |
| `docs/DEVELOPER_GUIDE.md` | Architecture, run commands, API patterns, release-control workflow, testing, and feature-extension guide |
| `backend/MOCK_ALIGNMENT.md` | Mock-to-backend alignment status |
| `backend/PLAN_ALIGNMENT.md` | Build-plan and implementation alignment notes |

**Current verification checkpoint:**
- Backend checks are green: `manage.py check` and `makemigrations --check --dry-run`.
- Full tenant API suite is green: `accounts.tests.TenantScopedAPITests` (`91 tests OK`).
- Public invitation accept/inspect, envelope send readiness, signing, payment webhooks, search ranking, deployment readiness, release-gated admin flows, and tenant/RBAC guards are covered in tests.
- Signed PDF field-placement bug resolved 2026-05-18: three-layer fix across `evidence/pdf.py` (overlay canvas now uses source page mediabox instead of DocumentPage dimensions), `form-builder.js` (calls `render_pages/` after document upload so page images exist for the primary renderer), and `live-wiring.js` (signer field geometry scales `page_height` by the same ratio as X/Y coordinates).
- Next checkpoint is Docker click-through QA through `http://127.0.0.1:8080/mock/` to verify every browser-visible action against the Nginx-proxied stack.

**Partially wired / production polish remaining:**
- Release Control now gates the mock frontend and selected backend endpoints directly through `feature_flag_key` checks on org-scoped viewsets and explicit APIView checks.
- Storage settings persist backend/bucket/endpoint and health checks; production cloud credential lifecycle still needs real secrets management.
- SSO/OIDC/SAML/SCIM/LDAP surfaces are modeled and validation endpoints exist; production providers still require real metadata, certificates, redirect URIs, and account-mapping policy.
- Billing has checkout/portal handoff records plus webhook ingestion/reconciliation; production payment processor integration still needs real provider-side checkout/portal creation, taxes, refunds, receipts, and subscription edge-case handling.
- System telemetry includes live process/storage/database/Redis/task summaries, deployment readiness, and optional Sentry/OpenTelemetry bootstrap; hosted status publishing, external alert delivery, and deeper trace dashboards remain production observability work.

**Intentionally deferred / later hardening:**
- Complete feature-flag enforcement for every backend resource beyond the selected tenant-scoped/APIView coverage already in place.
- Search relevance beyond current Postgres full-text / weighted fallback: stemming, synonyms, typo tolerance, and ranking tuning.
- Production PDF rasterization, AI risk analysis, hosted observability/status stack, and real payment-provider session creation.

---

## Infrastructure (Dev)

`docker-compose.dev.yml` starts:

| Service | Role |
|---|---|
| **Nginx** | Reverse proxy on `:8080` |
| **Django / Gunicorn** | API backend |
| **Postgres** | Primary database |
| **Redis** | Celery broker |
| **Celery worker** | Background task processor |
| **Mailhog** | SMTP capture (UI on `:8025`) |
| **MinIO** | S3-compatible object storage |

SQLite is the default for local dev without Docker.

Run `python manage.py seed_demo` to create demo organizations, users, plans, subscriptions, API keys, webhooks, audit events, approval requests, documents, and OAuth apps.
