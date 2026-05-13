# AIStudio Web (Vercel-ready)

This project is configured to run on Vercel with server-only API key usage for Kie AI.

## 1) Required environment variables (Vercel)

Set these in **Vercel Project Settings → Environment Variables**:

- `KIE_API_KEY` (required)
- `AUTH_SESSION_SECRET` (required in production)
- `ADMIN_TOKEN` (required in production, for admin API calls via header)
- `ADMIN_EMAIL` (recommended)
- `ADMIN_PASSWORD` (recommended)

Optional:

- `ALLOW_DEMO_AUTH=true` (local dev only; automatically disabled in production)
- `DATABASE_URL` (reserved for Coolify/Postgres integration)

Use `env.example` as template.

## 2) Security model

- API key is read only on server from `src/lib/env.ts` and `src/lib/kie.ts`.
- No `NEXT_PUBLIC_*` secrets are used.
- Upload endpoint does not return raw provider payload anymore.
- Auth cookie is `httpOnly`, signed JWT (`jose`), `secure` in production.
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

## 5) Notes for Coolify database

The app is already prepared with `DATABASE_URL` in config template.
Current auth/credit/history logic is still in-memory for non-production demo flows.
For full persistent multi-instance production, next step is wiring these modules to Postgres on Coolify.
