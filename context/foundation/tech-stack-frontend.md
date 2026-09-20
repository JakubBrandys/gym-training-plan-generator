---
starter_id: vite-react
package_manager: npm
project_name: gym-training-plan-generator
companion_to: tech-stack.md
status: not consumed by /10x-bootstrapper today — see note below
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
---

## Why this stack

The backend (`tech-stack.md`) locked in Nest.js, which only leaves room for one `starter_id` in that file's schema. The frontend is a thin React SPA that talks to the Nest.js API over HTTP and never touches PostgreSQL directly, so it doesn't need SSR, routing conventions, or a data layer baked in — `vite-react` (minimal Vite + React + TypeScript template) fits that "bring your own backend" shape exactly, without pulling in server-side features the project doesn't need. It clears all four agent-friendly quality gates except `convention_based` (no built-in routing/data-layer opinions — acceptable here since the API layer already carries those conventions). Deployment defaults to Cloudflare Pages as a static SPA host, which is a good fit specifically because the frontend never opens a database connection itself — only the Nest.js API does, avoiding the edge/BFF-to-Postgres connection-pooling problem discussed earlier.

## Repo layout

Single repo, two sibling folders:
- `backend/` — Nest.js API (see `tech-stack.md`), deploys to Fly.io
- `frontend/` — this starter, deploys to Cloudflare Pages (or Vercel)

No monorepo tooling (Turborepo/Nx) — plain folders are sufficient at solo scale.

## Scaffold command

```bash
npm create vite@latest frontend -- --template react-ts
```

## Note on tooling status

`/10x-tech-stack-selector`'s hand-off schema (`references/handoff-schema.md`) supports exactly one `starter_id` per project, so this file is a manually-written companion, not a skill-generated artifact — it won't be touched by re-running `/10x-tech-stack-selector` (which only reads/writes `tech-stack.md`), and it's unknown today whether `/10x-bootstrapper` (Lesson 3, not yet available) reads it automatically. If not, scaffold the frontend by hand with the command above once the backend is scaffolded.
