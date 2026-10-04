## Repository Guidelines

Everything below this line is project-specific and owned by this repo, not the 10x-cli tool — it survives lesson syncs, which only touch content inside the block below.

Gym Training Plan Generator: an AI-assisted 8-week training-plan app with a NestJS API (`backend/`) and a Vite + React SPA (`frontend/`), talking over HTTP.

### Hard rules

- Two independent npm projects live here, `backend/` and `frontend/` — no workspace, no shared root scripts. Always `cd` into the target package before running `npm run <script>`. The root `package.json` is an unrelated placeholder stub; its `test` script only prints an error and exits 1.
- Never modify, move, or delete anything under `context/` — it's the bootstrap chain's metadata trail (PRD, tech-stack decisions, scaffold verification logs), not application code.
- The course-chain content below this section is managed by the 10x-cli tool and gets replaced on lesson sync — don't add project rules inside the `BEGIN/END @przeprogramowani/10x-cli` marker block.

### Project Structure & Module Organization

- `backend/` — NestJS API. Source in `src/` (`app.module.ts` + controller/service/module triplets), unit specs beside source as `*.spec.ts`, e2e specs in `test/`.
- `frontend/` — Vite + React SPA. Source in `src/`, static assets in `public/`.
- `context/foundation/` — product decisions: `@context/foundation/prd.md`, `@context/foundation/tech-stack.md` (backend), `@context/foundation/tech-stack-frontend.md` (frontend).

### Build, Test, and Development Commands

From `backend/`: `npm run start:dev` (watch mode), `npm run build`, `npm run lint` (oxlint, type-aware), `npm run test` / `npm run test:e2e` (Vitest).
From `frontend/`: `npm run dev`, `npm run build` (`tsc -b` then Vite build), `npm run lint` (oxlint).

### Coding Style & Naming Conventions

Both packages use oxlint as the sole linter (no ESLint). `backend/` runs TypeScript in strict mode (`@backend/tsconfig.json`) and enforces `no-floating-promises: error` (`@backend/.oxlintrc.json`) — every Promise must be awaited or explicitly discarded; it formats with Prettier, single quotes and trailing commas (`@backend/.prettierrc`). `frontend/` does **not** enable `strict` in `@frontend/tsconfig.app.json` (only `noUnusedLocals`/`noUnusedParameters`/etc.) and enforces `react/rules-of-hooks` (`@frontend/.oxlintrc.json`); no Prettier is configured there.

### Testing Guidelines

`backend/` uses Vitest; run a single file with `npx vitest run <path>` from `backend/`. `frontend/` has no test framework configured yet — set one up deliberately rather than assuming Vitest defaults from the backend.

### Security & Configuration Tips

No `.env` files exist in either package yet. `backend/.gitignore` already excludes `.env*` — add secrets there, never commit them. `frontend/.gitignore` has no env-file pattern yet if one is added later.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
