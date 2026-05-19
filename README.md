# HanMak — Enterprise Document Signing Platform

HanMak is a feature-complete DocuSign/PandaDoc alternative with PDF upload, form builder, multi-party signing, approvals, audit trail, and billing.

## Repository Layout

| Directory | What it is |
|---|---|
| `react-frontend/` | **Production frontend** — React 18 + Vite 5 + TanStack Query v5 + Zustand + Axios |
| `hanmak_demo_mock_directory/` | Vanilla JS beta prototype — fully live-wired reference used for design/API reference |
| `backend/` | Django 6.0 + DRF + simplejwt API server |
| `docs/` | Architecture, developer guide, user guide, audit notes |

## Quick Start

**Full stack (recommended):**
```bash
docker compose -f docker-compose.dev.yml up --build
# React frontend  →  http://127.0.0.1:8080/
# Vanilla JS beta →  http://127.0.0.1:8080/mock/
# Mailhog SMTP UI →  http://127.0.0.1:8025/
```

**Backend only:**
```bash
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8003
```

**React frontend only:**
```bash
cd react-frontend
npm install && npm run dev
# http://localhost:5173  (proxies /api → localhost:8003)
```

Demo credentials: `admin / admin123`

## Key Documentation

| File | Purpose |
|---|---|
| `Project_Overview.md` | Architecture overview, integration state, infrastructure |
| `docs/DEVELOPER_GUIDE.md` | Run commands, API patterns, testing, feature extension |
| `docs/USER_GUIDE.md` | Operator and signer workflows |
| `docs/REACT_FRONTEND_ARCHITECTURE.md` | React frontend route map, conventions, component guide |
| `docs/FRONTEND_BACKEND_HOOKUP_AUDIT.md` | Endpoint hookup coverage matrix |
| `backend/MOCK_ALIGNMENT.md` | Vanilla JS prototype ↔ backend alignment reference |
| `backend/PLAN_ALIGNMENT.md` | Full implementation history and build plan notes |

## Current Status (2026-05-20)

- **Backend:** Django 6.0, 18 apps, ~65 models, 91 tenant-scoped API tests passing.
- **React frontend:** All 44 pages fully implemented and live-wired to the backend.
- **PDF rendering:** Real PDF→PNG conversion via Poppler (`pdftoppm`) — page images shown in Form Builder and public signing view reflect actual document content.
- **Public signing:** Submit and decline payloads corrected; field overlay pages correctly derived from session data.
- **Form Builder:** Page loading chain fixed; actual rendered pages load from `prepare-for-builder` response.
- **EP constants:** All API endpoint paths centralized and correct in `src/api/endpoints.js`.

See `Project_Overview.md` for full integration state and `backend/PLAN_ALIGNMENT.md` for complete implementation history.
