---
starter_id: nestjs
package_manager: npm
project_name: gym-training-plan-generator
hints:
  language_family: js
  team_size: solo
  deployment_target: fly
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: false
    conventions: false
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Solo developer building an MVP training-plan generator in ~3 weeks, with auth, a multi-model AI pipeline, and live stage-by-stage progress in scope. The PRD's product_type is web-app, but the explicit architecture request — a separate React frontend talking to a Nest.js API, backed by PostgreSQL — doesn't fit the registry's bundled recommended default for (web, js), 10x-astro-starter, so the custom path was walked instead. Nest.js is recorded as the primary starter because auth, the AI orchestration, and the business rule live server-side; it clears all four agent-friendly quality gates (typed, convention-based, popular in JS training data, well-documented) and carries verified bootstrapper confidence. The React frontend is a deliberate follow-up scaffold, not represented in this hand-off's single-starter schema. Deployment defaults to Fly.io — Nest.js's card default, since it isn't an edge/Cloudflare-Workers-friendly framework the way Hono is. CI runs on GitHub Actions with auto-deploy-on-merge. The self-check surfaced two personal-familiarity gaps (official-template recognition, convention recognition); the user chose to proceed deliberately, treating this as a real project to learn from rather than a one-off course exercise.

**ORM**: Prisma (v7) is the chosen Postgres client/ORM, wired via the `@prisma/adapter-pg` driver adapter to keep runtime queries on Supabase's pooled connection string while Prisma CLI migrations use the direct connection — see `context/foundation/infrastructure.md` for the Supabase hosting decision and connection-string split.

**Auth** (resolves the "mechanism decided downstream" note in `prd.md` FR-001/§Authentication & Admin): **Supabase Auth**, since Postgres is already Supabase-hosted. Frontend uses `supabase-js` (publishable key) for sign-up/login; NestJS verifies the resulting JWTs locally via Supabase's JWKS endpoint (`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`, asymmetric signing keys) rather than calling Supabase on every request. The secret key (server-only, bypasses RLS) is reserved for admin operations — e.g. the member-blocking role from the PRD's gating section — not for routine request auth.

**Frontend hosting**: **Cloudflare Workers (static-assets feature)**, decided at deploy-planning stage since infra-research only scoped the persistent-connection NestJS API. Cloudflare Pages was the initial choice but was swapped for Workers static assets since Cloudflare put Pages in maintenance mode in 2026 and now recommends Workers for new static sites. Frontend and backend are separate origins by design — see `context/foundation/infrastructure.md` and `context/deployment/deploy-plan.md`.
