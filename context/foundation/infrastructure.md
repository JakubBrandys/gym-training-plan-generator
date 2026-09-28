---
project: gym-training-plan-generator
researched_at: 2026-09-20
recommended_platform: Fly.io
database_platform: Supabase
frontend_platform: Cloudflare Workers (static assets)
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript / Node.js
  framework: NestJS
  runtime: node
---

## Recommendation

**Deploy on Fly.io. Database on Supabase.**

Fly.io is the only researched platform that clears all five agent-friendly criteria while natively supporting the persistent, long-running NestJS process your PRD's live-progress AI pipeline requires (FR-006, and the NFR that imposes no fixed maximum wait time) — no architectural redesign needed, unlike Render (requires the paid always-on tier to avoid spin-down killing the WebSocket) or Railway (requires an async job-queue redesign around its 5-minute HTTP timeout). It's also the cheapest of the three survivors and matches the `deployment_target` already recorded in `context/foundation/tech-stack.md`, so this research confirms rather than overturns the earlier stack decision.

**Database update (post-research decision):** Postgres is hosted on **Supabase** rather than Fly's managed Postgres — cheaper for this workload, and the account is already being set up. This is a database-hosting choice made independently of the compute-platform recommendation above: Fly.io was recommended for what it does for the NestJS *process* (persistent connections, WebSockets), which holds regardless of where Postgres lives. The tradeoff is deliberate cross-vendor hosting (app on Fly, DB on Supabase) instead of Fly's co-located Postgres — see the new risk-register rows below for what that costs.

**Frontend hosting (post-research decision):** the React SPA deploys to **Cloudflare Workers, using its static-assets feature** — not the Fly app, and not Cloudflare Pages. Infra-research above dropped Cloudflare Workers *for the backend* because NestJS itself can't run there (bundle-size limits, no native Node runtime); none of that applies to a static frontend build, which is just files served from Cloudflare's edge with no Node runtime involved. Pages (the older static-site product) would also work and remains fully supported, but Cloudflare has put it in maintenance mode as of 2026 — all new investment goes to Workers static assets, which is now the recommended path for new static sites and can do everything Pages did (unlimited free static requests, `not_found_handling: "single-page-application"` for client-side routing, `wrangler versions upload` for per-branch preview URLs) plus the option to add real Worker logic later without migrating platforms. Consequence: frontend and backend are on different origins by design, so the NestJS app needs CORS enabled for the deployed Worker's origin — see `backend/src/main.ts`.

## Platform Comparison

| Platform | CLI-first | Managed | Agent-readable docs | Stable deploy API | MCP / Integration | Verdict |
|---|---|---|---|---|---|---|
| Cloudflare Workers + Pages | — | — | — | — | — | **Dropped** — NestJS itself doesn't run on Workers (bundle-size limits, no native Node runtime, connection-pooling model mismatch). Would require rewriting the backend to Hono, contradicting the locked `tech-stack.md` decision. |
| Vercel | — | — | — | — | — | **Dropped** — hard execution ceilings (300s Hobby / 800s GA Pro / 1800s beta) conflict with the no-fixed-max-wait requirement. |
| Netlify | — | — | — | — | — | **Dropped** — no persistent process, no WebSocket support; 60s sync / 15-min background-only with no streaming. |
| **Fly.io** | Pass | Pass | Pass | Pass | Pass | **Recommended** — clears all five criteria; GA persistent connections/WebSockets; official MCP server (`flymcp`). |
| Render | Pass | Pass | Partial | Pass | Pass | Runner-up — full WebSocket/100-min-timeout support with no redesign, but docs are web-served HTML with no public GitHub source, and cost floor (~$13/mo) is 2–6x Fly's. |
| Railway | Partial | Pass | Pass | Partial | Pass | Third — best managed-Postgres/Redis DX, but 5-minute HTTP timeout forces an async redesign of the live-progress feature, and rollback has no CLI path (dashboard-only). |

### Shortlisted Platforms

#### 1. Fly.io (Recommended)

Runs full containers (Fly Machines), so NestJS deploys as-is with no framework changes. GA support for persistent connections and WebSockets means the live-progress feature can stream updates for as long as the AI pipeline actually takes — genuinely "no fixed max wait time," not a timeout worked around with polling. Cheapest cost floor of the three survivors (~$2–25/mo depending on machine size + Postgres), an official MCP server for agent-driven operations, and it's already the platform recorded in `tech-stack.md`, so no prior decision needs to be unwound.

#### 2. Render

Also runs full containers with no timeout-driven redesign needed (100-minute HTTP timeout, full WebSocket support on paid tiers). Its `render.yaml` Blueprint system and official MCP server are strong, and its flat, predictable pricing (no per-request billing) is arguably easier to reason about than Fly's usage-based model. The gap versus Fly: docs are served as HTML with no public markdown/GitHub source (a real agent-readability deficit), free tier spin-down (15 min inactivity) would break the live-progress WebSocket unless you're on the $7/mo+ Starter tier from day one, and the overall cost floor (~$13/mo web+DB) is meaningfully higher than Fly's.

#### 3. Railway

The most polished database DX of the three — one-click managed Postgres and Redis with auto-injected env vars, plus pgvector/PostGIS/pg_cron built in. But its 5-minute HTTP timeout is a hard architectural constraint: the live-progress feature would need to be redesigned around SSE-with-keepalive (extends to ~15 min) or an async job-queue-and-poll pattern rather than a single long-lived request/stream — real added complexity for an MVP. Rollback is dashboard-only with no CLI or API path, which is a genuine agent-operability gap.

## Anti-Bias Cross-Check: Fly.io

### Devil's Advocate — Weaknesses

1. **Managed Postgres patch/upgrade automation is incomplete.** Fly's Managed Postgres documentation flags automatic security patching and version upgrades as "under development" — as a solo dev with no ops team, you're the one who has to notice a CVE and manually upgrade.
2. **No free tier means real money from day one.** The free tier ended October 2024; even the cheapest always-on setup (~$2–4/mo machine + Postgres) puts a live credit card on the line before any validation, unlike Render/Railway's time-boxed trials.
3. **NestJS isn't a first-class citizen on Fly's auto-generated Dockerfile.** The documented "nest: not found" build error means a first deploy via `fly launch`'s defaults is likely to fail unless the official `fly-apps/fly-nestjs` example is used instead.
4. **Tigris (object storage) is still beta.** Irrelevant today since the exercise-image catalog is self-curated/static, but a future feature needing user uploads wouldn't have a GA co-located storage option.
5. **Usage-based billing can surprise a solo dev.** CPU/memory/bandwidth are billed continuously with no default hard cap — a runaway AI-pipeline retry loop translates directly into a larger bill.

### Pre-Mortem — How This Could Fail

Six months in, the bill has crept from $8/month to $40/month and nobody noticed why — the AI pipeline occasionally retries a failed model call in a loop, and Fly's usage-based billing quietly charged for it. Meanwhile, a routine dependency-audit finding in the Postgres image sits unpatched for three months because Fly's managed Postgres doesn't auto-patch and the solo dev, buried in feature work, never checked. The original `fly launch` deploy actually failed silently on day one — the generated Dockerfile treated NestJS as plain Express, and the dev spent an evening confused before finding the community thread pointing at the official example repo. Once live, the multi-stage AI pipeline occasionally runs past 15 minutes on a bad day (a retried model call), and because nobody load-tested that edge case, the WebSocket connection quietly drops with no user-facing error — support inbox fills with "it just hangs" reports. The team's mental model was "it's just Fly.io, it behaves like a fully managed PaaS" — but every gap (patching, cost caps, Dockerfile correctness) needed someone to actually watch it.

### Unknown Unknowns

- **Regional machine affinity matters for stateful WebSocket sessions** — scaling to multiple machines/regions later can route a client's live-progress WebSocket to the wrong machine unless region/instance affinity is explicitly configured; not obvious from marketing copy that emphasizes "deploy globally in seconds."
- **`fly deploy` failures can leave a machine in a half-updated state** requiring manual `fly machine` inspection to diagnose — not always the clean all-or-nothing swap that "deterministic deploy" language implies.
- **Legacy accounts (pre-October-2024) retain a cheaper published rate that new accounts don't** — comparing notes with someone else's Fly.io setup may not reflect current pricing.
- **Health-check configuration is the developer's responsibility, not automatic** — an app wedged mid-AI-pipeline-stage can still report "healthy" to Fly's default checks unless a liveness check reflects actual pipeline progress.

**Decision**: proceeded with Fly.io, risks noted and carried into the risk register below — no platform swap.

## Operational Story

- **Preview deploys**: Fly has no native PR-preview-URL feature (unlike Vercel/Netlify). Implement via a GitHub Actions workflow that runs `fly deploy --app pr-<number>` to spin up an ephemeral app per PR and `fly apps destroy` on close — a documented community pattern, not a platform-native one.
- **Secrets**: `fly secrets set KEY=value` stores values encrypted per-app and injects them as env vars at runtime; `fly secrets list` shows names only, never values. Rotation: `fly secrets set` again followed by `fly deploy` to pick up the new value. `DATABASE_URL` is a manually-set secret pointing at Supabase (no `fly postgres attach` auto-injection, since the DB isn't Fly-managed) — rotate by changing the DB password in the Supabase dashboard first, then `fly secrets set DATABASE_URL=<new-connection-string>`.
- **Rollback**: `fly releases` lists deploy history; revert by re-deploying a prior release image. Typical time-to-revert is a few minutes (image pull + restart). Caveat: database migrations do **not** auto-roll-back with an app rollback — a schema change tied to a bad release must be reverted manually and separately.
- **Approval**: routine `fly deploy` on merge (already the recorded CI flow) and read-only `fly logs`/`fly status` may run unattended. Rotating the primary Postgres credential, changing the Postgres plan/tier (cost impact), and destroying an app or volume (irreversible data loss) require explicit human approval.
- **Logs**: `fly logs --app <name>` for live tail from the CLI; agent-native access should go through the official Fly MCP server (`github.com/superfly/flymcp`) for structured, typed access rather than parsing CLI text output.
- **Cloudflare Workers static assets (frontend)**: there's no server-side secret store to configure here — `VITE_*` values are baked into the static bundle at `npm run build` time (before `wrangler deploy` ever runs), so they're supplied as regular CI env vars, not Cloudflare secrets. They're public by design once bundled (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`); never build `SUPABASE_SECRET_KEY` into this bundle. Preview deploys: `wrangler versions upload` (instead of `wrangler deploy`) uploads a version without shifting production traffic and returns its own preview URL — use this for branches/PRs instead of the live `wrangler deploy`. Rollback: `wrangler deployments list` + `wrangler rollback [<version-id>]` to a prior version.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Managed Postgres lacks automated patch/upgrade | Devil's advocate | M | M | Subscribe to Fly's changelog/security advisories; schedule a monthly manual check of the Postgres image version. |
| No free tier — real cost from day one | Devil's advocate | H | L | Budget with `fly.io/calculator` before deploying; start with the smallest shared-cpu-1x machine. |
| NestJS auto-generated Dockerfile fails build ("nest: not found") | Devil's advocate / Research finding | H (if using `fly launch` defaults) | M (blocks first deploy) | Use the official `fly-apps/fly-nestjs` example Dockerfile from the start instead of relying on `fly launch` autodetection. |
| Usage-based billing spike from retry loops | Pre-mortem | M | M | Set a spend-alert/budget cap; add a retry-limit and circuit breaker to the AI pipeline's model-call logic. |
| WebSocket session pinned to wrong machine/region if scaled | Unknown unknowns | L (single-region MVP) | M | Stay single-machine/single-region until a real multi-region need arises; document the affinity requirement before scaling. |
| Health checks report "healthy" while the pipeline is wedged | Unknown unknowns | M | M | Implement an application-level liveness check that reflects actual pipeline progress, not just process-up status. |
| DB migrations don't auto-rollback with an app rollback | Research finding | M | H | Pair every schema migration with a written manual rollback script before deploying it. |
| Fly app and Supabase DB aren't co-located (cross-vendor hop) | Research finding | M | L | Pick a Supabase project region matching/neighboring the Fly app's region to minimize added latency. |
| Supabase's default direct-connection string is IPv6-only, may not resolve from Fly's egress | Research finding | M | M | Use the Supavisor session pooler string (port 5432, IPv4-compatible) as `DIRECT_URL` for migrations instead of the raw direct-connection string; keep `DATABASE_URL` on the transaction pooler (port 6543) for runtime. |
| Supabase free-tier projects pause after ~1 week of inactivity | Research finding | H (pre-launch), L (post-launch) | H (app can't reach DB until manually unpaused) | Move to a paid Supabase tier before real traffic; until then, expect to manually un-pause after idle periods. |
| Fly's Postgres backup/restore tooling (`fly postgres`/`fly mpg`) no longer applies | Research finding | M | M | Rely on Supabase's own backup/PITR (tier-dependent) for DB recovery instead of Fly CLI commands. |
| CORS misconfiguration between Worker origin and Fly API | Research finding | M | M | `FRONTEND_URL` drives `enableCors` in `main.ts`; keep it in sync with the actual `*.workers.dev`/custom domain URL, including preview-version origins if those need API access. |
| Backend-only secrets accidentally baked into the frontend build | Research finding | L | H (secret exposed in public client bundle) | Only `VITE_`-prefixed public values go into the frontend build env; `SUPABASE_SECRET_KEY` etc. only ever go in Fly secrets — there's no Cloudflare-side secret store involved since this Worker has no server code, only static assets. |
| Fly's default autostop-on-idle would silently reintroduce the connection-drop failure Fly was chosen to avoid | Research finding | H (if left at defaults) | H (breaks FR-006 live-progress WebSocket) | `fly.toml` explicitly sets `min_machines_running = 1` and `auto_stop_machines = "off"`. |

## Getting Started

1. Install flyctl (`curl -L https://fly.io/install.sh | sh`) and run `fly auth login`.
2. From `backend/`, use the NestJS-specific Dockerfile pattern from `github.com/fly-apps/fly-nestjs` instead of accepting `fly launch`'s auto-generated one — this avoids the documented "nest: not found" build failure.
3. Run `fly launch --no-deploy` from `backend/` to generate `fly.toml` without deploying yet; review the generated app name, region, and VM size before proceeding.
4. Create a Supabase project (dashboard, or `supabase projects create` after `supabase login`). Pick a region matching/neighboring the Fly app's region to keep latency down. Prisma needs **two** connection strings, not one:
   - `DATABASE_URL` — the Supavisor **transaction pooler** string (port 6543), used by the app at runtime via `@prisma/adapter-pg`.
   - `DIRECT_URL` — the **session pooler** string (port 5432) or the raw direct-connection string, used only by the Prisma CLI for migrations (`prisma migrate`/`prisma db push` hold session-level locks that the transaction pooler doesn't support). If the raw direct string (IPv6-only unless the IPv4 add-on is purchased) isn't reachable from Fly's egress, use the session pooler string instead — never the transaction pooler for this one.
   Wire both up with `fly secrets set DATABASE_URL=<pooler-string> DIRECT_URL=<direct-or-session-pooler-string>` (there's no `fly postgres attach`-style auto-injection since the DB isn't Fly-managed).
5. `fly secrets set` for any additional secrets (AI model provider API keys, etc.).
6. `fly deploy` to ship the first release; verify with `fly status` and `fly logs`.
7. Install Wrangler (`npm install -g wrangler` or use `npx wrangler`) and run `wrangler login`. `frontend/wrangler.jsonc` already declares the Worker (`name`, `assets.directory`, `assets.not_found_handling: "single-page-application"` for client-side routing) — no dashboard project-creation step needed, `wrangler deploy` creates it on first run.
8. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (the Fly app's `https://<app>.fly.dev` URL) as env vars for the `npm run build` step — they get baked into the static bundle at build time, before `wrangler deploy` runs; there's no separate Cloudflare secret store for a static-assets-only Worker.
9. `npm run build` then `wrangler deploy` from `frontend/` to ship the first frontend release, to a `*.workers.dev` subdomain by default.
10. Set `FRONTEND_URL` as a Fly secret (`fly secrets set FRONTEND_URL=https://<name>.<subdomain>.workers.dev`) and redeploy the backend so CORS allows the deployed Worker's origin.

See `context/deployment/deploy-plan.md` for the full runbook (manual account-creation gates, GitHub Actions secrets, verification steps).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
