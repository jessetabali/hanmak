# HanMak React Frontend

Production React frontend for HanMak — enterprise document signing platform.

This replaces the vanilla JS prototype (`hanmak_demo_mock_directory/`) with a maintainable, component-based architecture using the same Django/DRF backend.

## Stack

| Layer | Technology |
|---|---|
| Build | Vite 5 |
| UI | React 18 |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Client state | Zustand v4 |
| HTTP | Axios |

## Quick Start

```bash
cd react-frontend
cp .env.example .env
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/api` and `/media` to the Django backend at `http://127.0.0.1:8003`.

Make sure the backend is running first:

```bash
cd backend
source .venv/bin/activate
python manage.py runserver 127.0.0.1:8003
```

Or use Docker for the full stack (Nginx, Postgres, Redis, Celery, Mailhog, MinIO):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Then access the React app via Nginx on `http://127.0.0.1:8080/` (update `nginx.conf` to serve the Vite `dist/` build).

## Project Structure

```
src/
├── api/
│   ├── client.js        Axios instance — JWT attach, refresh, org header
│   └── endpoints.js     Central registry of all API endpoint paths
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx  Sidebar + Topbar wrapper (React Router <Outlet>)
│   │   ├── AuthGuard.jsx Redirects unauthenticated users to /login
│   │   ├── Sidebar.jsx   Nav groups with NavLink active states
│   │   └── Topbar.jsx    Search, inbox, and profile actions
│   └── ui/
│       └── Toast.jsx     Context-based toast notification system
├── hooks/
│   ├── useAuth.js        Thin wrapper over authStore
│   ├── useToast.js       Access toast context from any component
│   └── useApi.js         useApiQuery + useApiMutation wrappers over TanStack Query
├── pages/                One file per route — matches router.jsx
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── Inbox.jsx
│   ├── Search.jsx
│   ├── Profile.jsx
│   ├── envelopes/
│   ├── templates/
│   ├── documents/
│   ├── signing/
│   ├── workflow/
│   ├── approvals/
│   ├── audit/
│   ├── admin/
│   ├── settings/         Nested under SettingsLayout — shared left sub-nav
│   ├── system/
│   ├── compliance/
│   ├── billing/
│   └── developer/
├── router.jsx            All routes — mirrors the vanilla JS page registry
├── store/
│   ├── authStore.js      Zustand — JWT, user, organization state + login/logout
│   └── uiStore.js        Zustand — sidebar collapsed/mobile state
├── styles/
│   └── index.css         Global CSS — design tokens, layout, shared components
└── utils/
    └── formatting.js     formatDate, formatBytes, titleCase, initials, escapeHtml
```

## Auth Flow

1. Unauthenticated requests hit `<AuthGuard>` → redirect to `/login`.
2. `Login.jsx` calls `useAuth().login(username, password)` → POST `/api/v1/token/`.
3. Access and refresh tokens stored in `localStorage` (`HANMAK_ACCESS_TOKEN`, `HANMAK_REFRESH_TOKEN`).
4. All Axios requests auto-attach `Authorization: Bearer <token>`.
5. On `401`, the Axios interceptor refreshes the token once, replays the original request, or clears tokens and redirects to `/login`.
6. Organization ID stored in `localStorage` as `HANMAK_ORGANIZATION_ID` and sent as `X-HanMak-Organization` header on every request.

## Data Fetching Pattern

Use the thin wrappers in `hooks/useApi.js`:

```jsx
// GET
const { data, isLoading, error } = useApiQuery('envelopes', EP.ENVELOPES, { status: 'draft' });

// POST / PATCH / DELETE
const { mutate, isPending } = useApiMutation(
  (payload) => apiClient.post(EP.ENVELOPES, payload).then(r => r.data),
  {
    invalidateKeys: ['envelopes'],
    onSuccess: () => showToast('Envelope created', 'success'),
  }
);
```

## Settings Navigation

Settings pages use React Router nested routes under `SettingsLayout`:

```
/settings              → redirect to /settings/general
/settings/general      → General.jsx
/settings/branding     → Branding.jsx
/settings/email        → Email.jsx
/settings/storage      → Storage.jsx
/settings/security     → Security.jsx
/settings/notifications → Notifications.jsx
/settings/sso          → SSO.jsx
```

`SettingsLayout.jsx` renders the left sub-nav using `<NavLink>` and `<Outlet>` for the active section — no manual active-state management needed.

## Building for Production

```bash
npm run build
```

Output goes to `dist/`. Serve via Nginx alongside the Django API.

## Environment Variables

Copy `.env.example` to `.env` and set:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | (empty — uses Vite proxy) | Full API base URL for production builds |
| `VITE_ALLOW_DEMO_AUTO_LOGIN` | `false` | Auto-login with demo credentials (dev only) |
| `VITE_SENTRY_DSN` | (empty) | Sentry error tracking DSN |

## Mapping from Vanilla JS Prototype

| Vanilla JS concept | React equivalent |
|---|---|
| `registerPage(id, fn)` | A page component in `src/pages/` + a route in `router.jsx` |
| `navigate(pageId)` | `useNavigate()` / `<Link to="...">` |
| `${pageId}_init()` hook | `useEffect` + TanStack Query in the page component |
| `hanmakApi('/path/')` | `apiClient.get/post/patch/delete` via `useApiQuery` / `useApiMutation` |
| `showToast(msg, type)` | `useToast().showToast(msg, type)` |
| `openModal(html)` | A modal component with React state |
| `hydrateShellChrome()` | `authStore` + component-level `useApiQuery` calls |
| `registerPage` for settings | Nested route + `SettingsLayout` with `<Outlet>` |
| `settingsNav(active)` | `SettingsLayout.jsx` using `<NavLink>` — active state is automatic |
