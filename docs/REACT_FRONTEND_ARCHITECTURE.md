# HanMak React Frontend Architecture

This document describes the architecture, conventions, and implementation roadmap for the production React frontend (`react-frontend/`). The vanilla JS prototype (`hanmak_demo_mock_directory/`) remains the live-wired beta reference and will be retired once the React frontend reaches feature parity.

---

## Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Build tool | **Vite 5** | Sub-second HMR, native ES modules, fast production builds |
| UI library | **React 18** | Concurrent rendering, `Suspense`, automatic batching |
| Routing | **React Router v6** | Nested routes make `SettingsLayout` and future sub-shells trivial |
| Server state | **TanStack Query v5** | Caching, background refetch, pagination, optimistic updates |
| Client state | **Zustand v4** | Minimal boilerplate for auth/UI state that doesn't belong in the server cache |
| HTTP | **Axios** | Interceptors for JWT attach and 401-refresh; matches the existing `hanmakApi()` contract |

---

## Directory Layout

```
react-frontend/
├── index.html
├── vite.config.js           Dev proxy: /api → :8003, /media → :8003
├── .env.example
├── package.json
└── src/
    ├── main.jsx             QueryClient provider + React root
    ├── App.jsx              RouterProvider + ToastProvider
    ├── router.jsx           All routes — full mapping below
    ├── api/
    │   ├── client.js        Axios instance — JWT, refresh, org header
    │   └── endpoints.js     Central EP constant registry (~80 paths)
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.jsx  Sidebar + Topbar + <Outlet>
    │   │   ├── AuthGuard.jsx Redirect unauthenticated users to /login
    │   │   ├── Sidebar.jsx   Static NAV groups with NavLink
    │   │   └── Topbar.jsx    Search, inbox, profile buttons
    │   └── ui/
    │       └── Toast.jsx     Context provider + dismissible toast stack
    ├── hooks/
    │   ├── useAuth.js        Wraps authStore
    │   ├── useToast.js       Wraps ToastContext
    │   └── useApi.js         useApiQuery + useApiMutation wrappers
    ├── pages/                One component per route
    ├── store/
    │   ├── authStore.js      Zustand — user, org, JWT lifecycle, login/logout
    │   └── uiStore.js        Zustand — sidebar collapse, mobile drawer
    ├── styles/
    │   └── index.css         Design tokens, layout, shared component classes
    └── utils/
        └── formatting.js     formatDate, formatBytes, titleCase, initials
```

---

## Route Map

Every route in `router.jsx` mirrors the page IDs from the vanilla JS `registerPage()` registry.

```
/login                        Login (no shell)
/sign/:token                  PublicSigning (no auth, no shell)

/                             → /dashboard
/dashboard                    Dashboard
/inbox                        Inbox
/search                       Search
/profile                      Profile

/envelopes                    EnvelopeList
/envelopes/:id                EnvelopeDetail

/templates                    TemplateList
/form-builder/:templateId?    FormBuilder

/documents                    Documents (File Library)

/signing                      Signing (session admin view)

/workflow                     WorkflowBuilder

/approvals                    Approvals

/audit                        AuditTrail
/evidence-bundles             EvidenceBundles

/admin/users                  admin/Users
/admin/organizations          admin/Organizations
/admin/teams                  admin/Teams
/admin/roles                  admin/Roles

/settings                     → /settings/general   (SettingsLayout)
/settings/general             settings/General
/settings/branding            settings/Branding
/settings/email               settings/Email
/settings/storage             settings/Storage
/settings/security            settings/Security
/settings/notifications       settings/Notifications
/settings/sso                 settings/SSO

/system/health                system/SystemHealth
/system/tasks                 system/BackgroundTasks

/compliance/legal-holds       compliance/LegalHolds
/compliance/retention         compliance/Retention
/compliance/data-residency    compliance/DataResidency
/compliance/exports           compliance/ComplianceExports

/billing                      billing/Billing
/license                      billing/License

/developer/api-keys           developer/ApiKeys
/developer/oauth-apps         developer/OAuthApps
/developer/webhooks           developer/Webhooks
/developer/api-docs           developer/ApiDocs
/developer/test-lab           developer/TestLab
/developer/email-messages     developer/EmailMessages
/developer/operations         developer/OperationsConsole
/developer/release-control    developer/ReleaseControl
```

---

## Auth and Token Lifecycle

1. `authStore.login(username, password)` → POST `/api/v1/auth/login/` → stores `HANMAK_ACCESS_TOKEN` + `HANMAK_REFRESH_TOKEN` in `localStorage`.
2. Axios request interceptor attaches `Authorization: Bearer <token>` and `X-HanMak-Organization: <orgId>` to every outbound request.
3. On `401`, the Axios response interceptor attempts one token refresh via POST `/api/v1/auth/refresh/`. Concurrent requests during refresh are queued and replayed after the new token arrives.
4. If refresh fails, tokens are cleared and the user is redirected to `/login`.
5. `authStore.logout()` clears all stored tokens and resets Zustand state.

---

## Data Fetching Convention

All server data goes through TanStack Query. Use the thin wrappers in `hooks/useApi.js`:

```jsx
// Read
const { data, isLoading, error } = useApiQuery(
  ['envelopes', status],      // query key (array for parameterized queries)
  EP.ENVELOPES,               // endpoint path
  { status, page_size: 25 },  // axios params (query string)
);

// Write
const { mutate, isPending } = useApiMutation(
  (payload) => apiClient.post(EP.ENVELOPES, payload).then(r => r.data),
  {
    invalidateKeys: ['envelopes'],   // query keys to refetch on success
    onSuccess: () => showToast('Envelope created', 'success'),
    onError: (err) => showToast(err.response?.data?.detail || 'Failed', 'error'),
  },
);
```

Direct `apiClient` usage is acceptable for one-off mutations that don't need query invalidation (e.g., file downloads, test email sends).

---

## Settings Sub-Navigation

Settings pages use React Router nested routes under `SettingsLayout`, which renders a left `<nav>` of `<NavLink>` items and an `<Outlet>` for the active section. Active highlighting is handled automatically by React Router — no manual DOM manipulation required. This replaces the `settingsNav(active)` function and its inline active-state logic from the vanilla JS prototype.

---

## Page Component Conventions

Each page component should:

1. Call `useApiQuery` (or `useApiMutation`) at the top level — no manual `useEffect` + `fetch` chains.
2. Handle the three states explicitly: `isLoading`, `error`, and the success render.
3. Use `useToast().showToast()` for user feedback rather than `alert()`.
4. Use `useNavigate()` for imperative navigation; `<Link>` / `<NavLink>` for declarative navigation.
5. Not contain business logic — extract to custom hooks when a query + derived state is reused across more than one page.

---

## Mapping from Vanilla JS Prototype

| Vanilla JS pattern | React equivalent |
|---|---|
| `registerPage(id, () => html)` | Page component in `src/pages/` + route in `router.jsx` |
| `navigate(pageId)` | `useNavigate()` hook or `<Link to="...">` |
| `${pageId}_init()` hook called after render | `useApiQuery` declared at the top of the page component |
| `hanmakApi('/envelopes/')` | `apiClient.get(EP.ENVELOPES)` via `useApiQuery` |
| `showToast(msg, type, duration)` | `useToast().showToast(msg, type, duration)` |
| `openModal(htmlString)` | A modal component with `useState(false)` open state |
| `openDrawer(htmlString)` | A drawer component with `useState(false)` open state |
| `hydrateShellChrome()` | `authStore` + `useApiQuery` in `Sidebar` / `Topbar` |
| `settingsNav(active)` | `SettingsLayout` with React Router `<NavLink>` — active state automatic |
| `currentPage` global | `useLocation().pathname` via React Router |
| `localStorage.HANMAK_ACCESS_TOKEN` | `authStore.isAuthenticated` + `api/client.js` interceptors |

---

## Implementation Status — COMPLETE (2026-05-18)

All 44 pages are fully implemented and wired to the live Django/DRF backend. The phased roadmap below is preserved for historical reference with completion markers.

### Phase 1 — Core Signing Flow ✓
- [x] `EnvelopeList` — search, filter, sort, pagination, bulk actions, drawer with document thumbnails, preview modal
- [x] `EnvelopeDetail` — recipients, attachments, send/void/download (blob auth pattern)
- [x] `TemplateList` — archive/activate/duplicate/use, document preview modal
- [x] `FormBuilder` — drag-and-drop field placement canvas; corner resize handles; radio group field type; inline party rename
- [x] `PublicSigning` — field rendering, typed/drawn/uploaded signatures, submit/decline

### Phase 2 — Collaboration & Approvals ✓
- [x] `Inbox` — tab filters, bulk actions, per-item approve/sign/snooze
- [x] `Approvals` — per-status tabs, approve/reject/delegate, detail modal
- [x] `WorkflowBuilder` — stage editor, run creation, advance controls

### Phase 3 — Documents & Audit ✓
- [x] `Documents` — upload, process, scan, duplicate, open in FormBuilder
- [x] `AuditTrail` — search, type filter, date range, evidence bundle creation (envelope-picker modal)
- [x] `EvidenceBundles` — generate PDF, verify, visual QA

### Phase 4 — Admin & Settings ✓
- [x] `Users` — invite, suspend, impersonate, role assignment
- [x] `Organizations` — profile edit, domains, subsidiaries, logo upload
- [x] `Teams` — create/edit/delete, member management
- [x] `Roles` — permission matrix editor
- [x] All Settings pages — save handlers, live preview (Branding), test email (Email)

### Phase 5 — Developer & Operations ✓
- [x] `ApiKeys` — create/rotate/revoke/scope-edit
- [x] `OAuthApps` — secret rotation, grant management
- [x] `Webhooks` — add/edit/delete/test delivery/history/replay
- [x] `OperationsConsole` — risk findings, policy rules, feature flags, outbox
- [x] `ReleaseControl` — stage/rollout controls, QA checklist, release action

### Phase 6 — Compliance & Billing ✓
- [x] Full compliance pages with live API data and create/delete flows
- [x] `Billing` — subscription banner, usage bars, invoice history
- [x] `License` — key details, feature entitlements, activation

---

## FormBuilder Enhancements (2026-05-20)

| Enhancement | Detail |
|---|---|
| Resizable field boxes | Corner drag handles (NW/NE/SW/SE) appear on selected fields. Drag a corner to resize; opposite corner stays pinned. Minimum size: 40 px wide × 18 px tall. |
| Radio Group field type | `◉ Radio Group` added to the Selection palette. Defaults to 160×80 px. The inspector shows the same options editor as Dropdown. |
| Party name rename | Double-click any party tab to edit the name inline. Press Enter or click away to save; Escape cancels. |

---

## Known Bugs Fixed (2026-05-18)

| Bug | Root cause | Fix |
|---|---|---|
| Login 401 | `EP.TOKEN_OBTAIN` pointed to `/token/` | Changed to `/auth/login/` in `endpoints.js` |
| Token refresh 401 | `client.js` used `/token/refresh/` | Changed to `/auth/refresh/` |
| Download 401 | `window.open()` doesn't send `Authorization` header | Blob download via `apiClient.get(url, {responseType:'blob'})` → `URL.createObjectURL()` |
| `toast.error is not a function` | `ToastContext` only exposed `showToast`/`dismiss` | Added `success`, `error`, `warning`, `info` convenience methods to `Toast.jsx` |
| POST 400 on most creates | Django `OrganizationScopedQuerySetMixin` requires `organization` FK | All create payloads now include `organization: Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'))` |
| EvidenceBundle POST 400 | Frontend sent `{name, description, audit_event_ids}`, backend requires `{envelope: id}` | Rewrote `AuditTrail` create flow to use an envelope picker modal |
| Vite build ENOENT | `src/styles/index.css` imports `../../public/shared/variables.css` which didn't exist | Created `react-frontend/public/shared/variables.css` with all CSS design tokens |
| Vite not reachable in Docker | Vite bound to `localhost` only | Added `host: true` to `vite.config.js` server config |

---

## Feature Parity Closure vs Vanilla JS Prototype

The previously tracked UI parity gaps from `hanmak_demo_mock_directory/` have been ported to the React frontend. Keep this table as a verification map during mock-removal QA.

| Section | Previously Tracked Gap | Status |
|---|---|---|
| **Audit Trail** | Integrity verification panel (SHA-256 hash checker) | Implemented |
| **Audit Trail** | Compliance standards sidebar (GDPR / HIPAA / SOC2 badges) | Implemented |
| **Audit Trail** | IP address and geolocation in event rows | Implemented |
| **Approvals** | "Changes Requested" tab | Implemented |
| **Approvals** | By Approver Load sidebar | Implemented |
| **Approvals** | Quick Delegation card (most recent delegations) | Implemented |
| **Settings / General** | Missing toggles: completion certificates, bulk send, mobile signing | Implemented |
| **Settings / General** | Timezone selector field | Implemented |
| **Settings / General** | Support email field | Implemented |
| **Admin / Users** | Session list in user drawer | Implemented |
| **Admin / Users** | MFA device list in user drawer | Implemented |
| **Webhooks** | Delivery stats sidebar (success rate, avg latency) | Implemented |
| **Webhooks** | Retry policy info card | Implemented |
| **Dashboard** | Webhook Health card | Implemented |
| **Dashboard** | Workflow Snapshot card | Implemented |
| **Dashboard** | Quick Actions card | Implemented |
| **Background Tasks** | Email Reliability stats card | Implemented |
| **Background Tasks** | Beat Scheduler info card | Implemented |
| **Inbox** | Fields remaining count on each item | Implemented |
| **Inbox** | Work Type filter | Implemented |
| **Inbox** | Tasks tab | Implemented |
| **Branding** | 4 extra color pickers (link, border, sidebar bg, sidebar text) | Implemented |
| **Billing** | Plans comparison sidebar | Implemented |
| **Billing** | Payment Webhook Events section | Implemented |
| **Public Signing** | Delegate signer flow | Implemented |
| **Envelope Detail** | Recipient delegation flow | Implemented |

See `docs/MVP_READINESS_CHECKLIST.md` for the final automated and manual gates before removing the vanilla JS mock.

---

## Bundle Splitting (2026-05-21)

`router.jsx` wraps every page component in `React.lazy()` so routes are loaded on demand. `vite.config.js` uses `manualChunks` to extract stable vendor libraries into separately cacheable files:

| Chunk | Contents | Approx size |
|---|---|---|
| App shell (initial) | `main.jsx`, `App.jsx`, `router.jsx`, layout components | ~39 kB |
| `vendor-react` | `react`, `react-dom`, `react-router-dom` | ~200 kB |
| `vendor-query` | `@tanstack/react-query` | ~49 kB |
| `vendor-axios` | `axios` | ~42 kB |
| `pdfjs` (lazy) | `pdfjs-dist` — loaded only when FormBuilder or PublicSigning opens a PDF | ~458 kB |
| Per-route chunks | One chunk per lazy-loaded page | varies |

This reduces initial load from ~1.4 MB to ~39 kB shell + vendor chunks, with the 458 kB PDF renderer deferred until needed. Vendor chunks are content-addressed and cache across deploys as long as library versions don't change.

```js
// vite.config.js (relevant excerpt)
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-query': ['@tanstack/react-query'],
        'vendor-axios': ['axios'],
      },
    },
  },
},
```

## Production Build and Deployment

```bash
npm run build
# Output: react-frontend/dist/
```

Configure Nginx to serve `dist/` at `/` and proxy `/api/` to Gunicorn:

```nginx
location / {
    root /app/react-frontend/dist;
    try_files $uri $uri/ /index.html;
}
location /api/ {
    proxy_pass http://backend:8003;
}
location /media/ {
    proxy_pass http://backend:8003;
}
```

The `VITE_API_BASE_URL` env variable should be set to an empty string (to use relative `/api/v1` paths) when served behind Nginx on the same origin, which avoids CORS issues and matches the existing Docker setup.
