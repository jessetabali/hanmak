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
- Run the public signing flow on desktop and mobile widths. Verify real PDF page content is visible (not white pages) — Poppler rendering active as of 2026-05-20.
- Generate and download signed PDFs from completed envelopes. Verify that select/text/signature fields appear at their expected visual positions (field placement fix applied 2026-05-18: overlay canvas now uses source PDF mediabox dimensions so fields no longer drift to top-right on A4 sources).
- Click every visible action in the enabled modules.

## Remaining Mock/Demo Surfaces

The frontend scan still shows these intentional development surfaces:

- `placeholderPdfFile()` remains for Test Lab and development-only placeholder flows, but beta mode blocks user-facing placeholder envelope/template creation.
- Test Lab creates synthetic documents for automated end-to-end checks. Keep Test Lab internal during beta unless testers are explicitly validating QA tooling.
- Most high-traffic export actions now download real files, including envelope CSV export. Any remaining clipboard-only exports should be treated as internal utilities and converted before external production use.
- SDK snippets and API docs are live enough for beta, but the in-browser authenticated API request runner remains deferred.
- PDF rendering is now real (`pdf2image` + Pillow via Poppler); all uploaded PDFs produce actual page images stored in MinIO.

## React Production Frontend Status

The React production frontend (`react-frontend/`) reached **full implementation** on 2026-05-18 with subsequent integration rounds on 2026-05-20. All 44 pages are live-wired to the Django/DRF backend. Current state:

- **Done:** Full route map, Axios + JWT client, TanStack Query wrappers, authStore (Zustand), AppShell + Sidebar + Topbar, SettingsLayout with nested routes, Toast context, all 44 pages fully implemented.
- **Done:** All critical bugs fixed — auth endpoints corrected, blob download for authenticated files, organization FK on all creates, ToastContext shortcuts, EvidenceBundle create flow, signing submit/decline URL and payload, FormBuilder page loading, PublicSigning pages path.
- **Done (2026-05-20):** Template and Envelope creation modals fully match the mock — async multi-step flows, party/role assignment, document attachment, "Save Draft" and "Create & Send" actions.
- **Done (2026-05-20):** UI/UX modernized — DM Sans font, card shadows, button animations, modal backdrop blur, toast accent bars.
- **Done (2026-05-20):** MinIO as default file storage — all uploaded documents and rendered page PNGs stored in MinIO. Nginx `/files/` proxy serves them same-origin (no CORS). `minio_init` Docker service creates bucket automatically.
- **Done (2026-05-20):** FormBuilder PDF preview — `pdfjs-dist` renders PDF pages client-side immediately on upload (canvas data URLs). No dependency on backend renderer for the canvas preview. Backend `pdf2image` renders server-side images in parallel for the signing view.
- **Done (2026-05-20):** Template preview — cards show first-page thumbnail (`preview_image_url` from backend serializer). Preview modal auto-generates pages via `prepare-for-builder` when none exist yet.
- **Ready for final parity QA:** Previously tracked high-priority React parity gaps have been ported, including audit hash verification, approvals changes-requested/delegation views, General Settings toggles, public signing delegation, and Envelope Detail recipient delegation. See `docs/MVP_READINESS_CHECKLIST.md` for the final mock-removal checklist.

The React frontend is accessible at `http://127.0.0.1:8080/` (served by Nginx from the Vite dev server in Docker) or `http://localhost:5173/` directly from the Vite HMR server.

### Retirement Criteria for the Vanilla JS Prototype

`hanmak_demo_mock_directory/` will be retired from active serving when:

1. The automated gates in `docs/MVP_READINESS_CHECKLIST.md` are green in a clean checkout.
2. The React frontend passes the same Docker click-through QA checklist that the vanilla JS frontend passed.
3. The React public signing flow (`/sign/:token`) is fully tested on desktop and mobile widths, including submit, decline, and delegate.

Until then, the vanilla JS beta remains the live reference at `http://127.0.0.1:8080/mock/` and should be kept updated when backend API changes occur.
