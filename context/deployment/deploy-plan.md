---
project: gym-training-plan-generator
planned_at: 2026-09-23
backend_platform: Fly.io
database_platform: Supabase
frontend_platform: Cloudflare Workers (static assets)
status: config-ready, first-deploy-not-yet-run
---

# Initial Deployment Runbook

Source decisions: `context/foundation/infrastructure.md` (Fly.io + Supabase, frontend on Cloudflare Workers static assets), `context/foundation/tech-stack.md` (NestJS/Prisma/Supabase Auth stack, `ci_provider: github-actions`, `ci_default_flow: auto-deploy-on-merge`).

Frontend note: Cloudflare Pages was the initial choice but was swapped for Workers static assets since Cloudflare put Pages in maintenance mode in 2026 and now directs new static-site investment to Workers. No cost difference for this project (static assets are free/unlimited on both).

## What's already done (automated, this session)

| File | Purpose |
|---|---|
| `backend/src/main.ts` | CORS via `FRONTEND_URL`, explicit `0.0.0.0` bind |
| `backend/src/health/health.controller.ts` | `GET /health` — queries Postgres via Prisma, proves DB connectivity (not just process-up) |
| `backend/Dockerfile` | Multi-stage, ESM-aware, handles the `prisma generate`/`DIRECT_URL` config-load gotcha |
| `backend/.dockerignore` | Excludes `node_modules`, `dist`, `src/generated`, real `.env*` |
| `backend/fly.toml` | Hand-authored — health check wired to `/health`, `min_machines_running = 1` / `auto_stop_machines = "off"` (Fly's default autostop would break the live-progress WebSocket this platform was chosen for) |
| `frontend/wrangler.jsonc` | Declares the Worker (`name`, `assets.directory: ./dist`, `assets.not_found_handling: single-page-application` for client-side routing) — no `main` script, purely static assets |
| `.github/workflows/deploy-backend.yml` | On push to `main` touching `backend/**`: `prisma migrate deploy` then `flyctl deploy --remote-only` |
| `.github/workflows/deploy-frontend.yml` | On push to `main` touching `frontend/**`: `npm run build` then `wrangler deploy` |

**Not done automatically** — requires you, since it's either interactive browser auth or account creation I can't perform:
- `backend/.env.example` / `frontend/.env.example` still need `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FRONTEND_URL` (backend) and `VITE_API_URL` (frontend) added by hand — see the exact lines given earlier in this conversation (blocked by a `Read(.env.*)` permission rule that also covers `.env.example`).
- No Prisma models/migrations exist yet — this first deploy proves the pipeline (build → deploy → DB connectivity → health check), not a real feature.

## Manual setup gates (do these in order)

1. **Fly.io account** (doesn't exist yet): sign up at fly.io, then `curl -L https://fly.io/install.sh | sh` and `fly auth login`.
2. **Supabase values** (project already exists): from the Supabase dashboard → Project Settings → Database, copy the **transaction pooler** string (port 6543) and **session pooler** string (port 5432). From Project Settings → API Keys / JWT Keys, copy the **publishable key**, **secret key**, and confirm the project URL. Fill these into `backend/.env` and `frontend/.env` (both already gitignored).
3. **Cloudflare account**: sign up if you don't have one, then `npx wrangler login` (installs Wrangler on first run). No separate project-creation step — `frontend/wrangler.jsonc` already declares the Worker; `wrangler deploy` creates it on first run.
4. **Fly secrets** (from `backend/`, after step 1–2):
   ```
   fly apps create gym-training-plan-generator-api   # or edit fly.toml's `app` if that name's taken
   fly secrets set \
     DATABASE_URL="<supabase transaction pooler string>" \
     DIRECT_URL="<supabase session pooler string>" \
     SUPABASE_URL="<supabase project url>" \
     SUPABASE_SECRET_KEY="<supabase secret key>" \
     FRONTEND_URL="https://gym-training-plan-generator.<your-subdomain>.workers.dev"
   ```
5. **Frontend build-time env vars** (no Cloudflare secret store involved — a static-assets-only Worker has no server code; these just need to be set wherever `npm run build` runs, e.g. exported in your shell locally, or as GitHub Actions secrets for CI): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (= the Fly app's `https://<app>.fly.dev` URL from step 4).
6. **GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions), for the CI workflows to run on future merges: `FLY_API_TOKEN` (`fly tokens create deploy` gives a scoped token), `DIRECT_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`.

## First deploy (manual, from your machine — no CI secrets exist yet for this first run)

```bash
# Backend
cd backend
npm run prisma:migrate:deploy   # applies migrations against DIRECT_URL (none exist yet — no-op)
fly deploy

# Frontend
cd ../frontend
VITE_SUPABASE_URL="<...>" VITE_SUPABASE_PUBLISHABLE_KEY="<...>" VITE_API_URL="https://<app>.fly.dev" npm run build
npx wrangler deploy
```

## Verification

1. `fly status` / `fly logs` (from `backend/`) — machine shows `started`, no crash loop.
2. `curl https://<app>.fly.dev/health` → `{"status":"ok"}`. A 503 here means Fly can reach the process but not Supabase — check `DATABASE_URL`/`DIRECT_URL` secrets and that the Supabase project isn't paused.
3. Open the `*.workers.dev` URL `wrangler deploy` printed — default Vite page loads.
4. From that page's browser devtools console: `fetch('https://<app>.fly.dev/health').then(r => r.json()).then(console.log)` — succeeds with no CORS error. A CORS error means `FRONTEND_URL` (Fly secret) doesn't match the actual deployed Worker's origin.
5. Once steps 1–4 pass, push a trivial change to `main` and confirm both GitHub Actions workflows (Settings → Actions, or `gh run list`) run green — proves the ongoing `auto-deploy-on-merge` flow (the decision already recorded in `tech-stack.md`) actually works, not just the manual first deploy.

## Known follow-ups (not blockers for this first deploy)

- `/health` proves DB connectivity, not AI-pipeline progress — the risk register's fuller "pipeline-aware liveness check" mitigation is future work once that feature exists.
- Supabase free-tier projects pause after ~1 week of inactivity (see `infrastructure.md` risk register) — expect to manually un-pause if this sits idle before real traffic.
- `fly.toml`'s `app` name and `primary_region` are placeholders — confirm the name is available and the region matches your actual Supabase project's region before the first `fly deploy`.
