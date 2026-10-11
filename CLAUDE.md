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

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
