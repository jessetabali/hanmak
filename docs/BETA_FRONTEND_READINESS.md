# HanMak Beta Frontend Readiness

> **Scope:** This document covers the **vanilla JS beta prototype** (`hanmak_demo_mock_directory/`). It is the fully live-wired reference implementation used for beta testing and as the design/API reference for the React production frontend (`react-frontend/`). The React frontend architecture and implementation roadmap are documented separately in `docs/REACT_FRONTEND_ARCHITECTURE.md`.

This document describes the current beta posture for `hanmak_demo_mock_directory`.

## Beta Mode

The frontend loads `beta-config.js` before the API client:

```js
window.HANMAK_FRONTEND_CONFIG = {
  mode: 'beta',
  requireAuth: true,
  allowDemoAutoLogin: false,
  allowPlaceholderDocuments: false,
  apiBaseUrl: '',
};
```

Beta defaults intentionally disable development conveniences:

- No automatic `admin / admin123` login.
- Protected pages require a real API token.
- Placeholder PDFs are disabled for envelope/template creation.
- The Form Builder sample NDA button is hidden.
- Template quick setup no longer creates a fake document in beta mode.

To temporarily restore development behavior, set these in `beta-config.js` or local storage before loading the app:

```js
localStorage.setItem('HANMAK_FRONTEND_MODE', 'development');
```

Then explicitly set `allowDemoAutoLogin` or `allowPlaceholderDocuments` to `true` in `beta-config.js`.

## Recommended Beta URL

Use Nginx so the frontend and backend share one origin:

```text
http://127.0.0.1:8080/mock/
```

This avoids CORS/session confusion and matches the Docker development proxy.

## Beta Testing Checklist

Before inviting testers:

- Run migrations and seed only realistic beta data.
- Create real organizations, users, teams, templates, and File Library documents.
- Use Release Control to enable only the modules you want tested.
- Confirm every tester has an account or invite/setup token.
- Upload real PDF documents and build templates from those documents.
- Create envelopes only from real templates or File Library documents.
- Run the public signing flow on desktop and mobile widths.
- Generate and download signed PDFs from completed envelopes. Verify that select/text/signature fields appear at their expected visual positions (field placement fix applied 2026-05-18: overlay canvas now uses source PDF mediabox dimensions so fields no longer drift to top-right on A4 sources).
- Click every visible action in the enabled modules.

## Remaining Mock/Demo Surfaces

The frontend scan still shows these intentional development surfaces:

- `placeholderPdfFile()` remains for Test Lab and development-only placeholder flows, but beta mode blocks user-facing placeholder envelope/template creation.
- Test Lab creates synthetic documents for automated end-to-end checks. Keep Test Lab internal during beta unless testers are explicitly validating QA tooling.
- Most high-traffic export actions now download real files, including envelope CSV export. Any remaining clipboard-only exports should be treated as internal utilities and converted before external production use.
- SDK snippets and API docs are live enough for beta, but the in-browser authenticated API request runner remains deferred.

## React Production Frontend Status

The React production frontend (`react-frontend/`) was scaffolded on 2026-05-18. It replaces the conversion path described above with a concrete implementation. Current state:

- **Done:** Full route map, Axios + JWT client, TanStack Query wrappers, authStore (Zustand), AppShell + Sidebar + Topbar, SettingsLayout with nested routes, Toast context, all 40+ page stubs loading live API data.
- **In progress:** Full feature parity with the vanilla JS prototype, page by page (see `docs/REACT_FRONTEND_ARCHITECTURE.md` for the phased roadmap).

### Retirement Criteria for the Vanilla JS Prototype

`hanmak_demo_mock_directory/` will be retired from active serving when:

1. React Phase 3 (Documents + Audit Trail + Evidence Bundles) is complete.
2. The React frontend passes the same Docker click-through QA checklist that the vanilla JS frontend passed.
3. The React public signing flow (`/sign/:token`) is fully tested on desktop and mobile.

Until then, the vanilla JS beta remains the live reference at `http://127.0.0.1:8080/mock/` and should be kept updated when backend API changes occur.
