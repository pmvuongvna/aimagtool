# AIStudio Web (Vercel-ready)

This project is configured to run on Vercel with server-only API key usage for Kie AI.

## 1) Required environment variables (Vercel)

Set these in **Vercel Project Settings → Environment Variables**:

- `KIE_API_KEY` (required)
- `AUTH_SESSION_SECRET` (required in production)
- `ADMIN_TOKEN` (required in production, for admin API calls via header)
- `ADMIN_EMAIL` (recommended)
- `ADMIN_PASSWORD` (recommended)
- `DATABASE_URL` (required for persistent auth, credits, and payments)
- `PAYOS_CLIENT_ID` (required for one-time credit checkout)
- `PAYOS_API_KEY` (required for one-time credit checkout)
- `PAYOS_CHECKSUM_KEY` (required for payment signatures and webhook verification)
- `PUBLIC_APP_URL=https://escanor.app`
- `PAYOS_WEBHOOK_URL=https://api.escanor.app/api/payments/payos/webhook`

Optional:

- `ALLOW_DEMO_AUTH=true` (local dev only; automatically disabled in production)

Use `env.example` as template.

## 2) Security model

- API key is read only on server from `src/lib/env.ts` and `src/lib/kie.ts`.
- No `NEXT_PUBLIC_*` secrets are used.
- Upload endpoint does not return raw provider payload anymore.
- Auth cookie is `httpOnly`, signed JWT (`jose`), `secure` in production.
- User passwords are stored with salted `scrypt`; legacy local hashes are upgraded after a successful login.
- payOS secrets stay server-side, and credits are granted only from a verified webhook or authenticated provider reconciliation.
- Payment orders and credit mutations use PostgreSQL transactions and idempotent ledger references.
- `/user/*` and `/admin/*` are protected by `src/proxy.ts`.
- In production, unauthenticated access to user APIs is blocked.

## 3) Local run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 4) Deploy to Vercel

1. Push repo to GitHub
2. Import project in Vercel
3. Add env vars above
4. Deploy

## 5) payOS setup

1. Add the payOS environment variables to the backend deployment.
2. Deploy the API so the webhook route is publicly reachable.
3. In Admin → Payments, click `Register webhook`, or register `PAYOS_WEBHOOK_URL` in the payOS dashboard.
4. Run a small real payment and confirm the order, ledger entry, and user balance all update once.

Payment endpoints intentionally fail closed when `DATABASE_URL` is missing. In-memory credit mode remains available only for local generation demos.
