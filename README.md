# Recoverly — AI Revenue Recovery

Phase 1 foundation for a company-facing revenue recovery operations platform. The UI is intentionally limited to the professional fintech shell and placeholder states; database, payment integrations, recovery workflows, and AI agent integrations are not included yet.

## Architecture

```text
ai-revenue-recovery/
├── frontend/       # React + TypeScript + Vite
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── layouts/
│       └── lib/
└── backend/        # Node.js + Express + TypeScript
    └── src/
        ├── routes/
        ├── controllers/
        ├── services/
        └── server.ts
```

## Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

## Run independently

In terminal 1:

```bash
cd backend
PORT=3001 FRONTEND_URL=http://localhost:5000 npm run dev
```

In terminal 2:

```bash
cd frontend
VITE_API_BASE_URL=/api BACKEND_URL=http://127.0.0.1:3001 npm run dev
```

The frontend runs on port 5000 and the backend runs on port 3001. `VITE_API_BASE_URL` is the browser-facing API base and `BACKEND_URL` configures Vite’s development proxy. For a separately hosted backend, set `VITE_API_BASE_URL` to its `/api` URL.

## Verify

```bash
cd frontend && npm run build
cd ../backend && npm run build
curl http://127.0.0.1:3001/api/health
```

The health endpoint returns `{ "ok": true, "service": "revenue-recovery-api", ... }`.

## Database layer

The backend uses Supabase PostgreSQL through `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Both variables are backend-only; never prefix them with `VITE_` or import them into frontend code.

The reproducible schema is in `backend/migrations/001_initial_schema.sql`. Apply that migration in the connected Supabase project, then verify and seed the fictional INR demo data:

```bash
cd backend
npm run db:verify
npm run db:seed
```

The seed contains fictional Indian customer/company names and covers successful and failed payments, insufficient funds, expired cards, checkout abandonment, subscription failures, overdue invoices, mandate failures, payment-method issues, open/recovered/escalated cases, promises to pay, recovery actions, agent business logs, and audit entries. Agent logs contain concise business decisions only; no private chain-of-thought is stored.