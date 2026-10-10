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

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
