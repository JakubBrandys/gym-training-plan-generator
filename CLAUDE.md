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

### UI contract

- Design tokens (colour, radius, widths) live in `@frontend/src/index.css`: `:root` plus the `prefers-color-scheme: dark` override. Views reference roles (`--accent`, `--on-accent`, `--text-muted`, `--radius`, `--content-width`, `--narrow-width`), never colour values or fixed widths.
- Shared components live in `@frontend/src/components/` (`Button`, `ButtonLink`, each with `primary` / `secondary` variants). Check this directory before creating a component and extend it instead of styling a second `<button>` or link-button in a view.
- Signed-in pages render inside `AppShell` (`AppHeader`, the page's own `<main>` through the Outlet, `AppFooter`); sign-in and sign-up render inside `AuthLayout`. Pages keep their own `<main>` and `<h1>`; do not add a "Back to home" link, and add a nav entry in `@frontend/src/components/nav-active.ts`, which also decides the active link. Read the signed-in user's email and role through `useProfile()` from `@frontend/src/profile/` instead of calling `/me` again.
- No literal colours (hex, `rgb()`, `hsl()`, `oklch()`) in views, components or `frontend/src/dev/`; add or adjust a token in `index.css` instead. `@frontend/src/ui-contract.spec.ts` fails `npm test` on a literal; its one allowlisted entry (`background: #fff` on `.plan-exercise-image`) is removed when that value is tokenised.
- Every state of a view (loading, ready, error, pending, disabled; empty when the view has a list) belongs in the dev-only kitchen sink at `/dev/kitchen-sink` (`@frontend/src/dev/KitchenSinkPage.tsx`, present only under `npm run dev`), which also shows the shell header and footer in every state. After a visual change, screenshot it at desktop and 375 px in light and dark.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5 (10xDevs 4.0 UI)

**For UI work on a view that already renders, start with `/10x-ui <view>`.** It is the
entry point: a short pre-audit, a suggested change-id and the `/10x-new` command for you to
run, then the audit brief for `/10x-research`. The visual change goes through the same chain
as any other change (`/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` →
`/10x-impl-review`); `/10x-ui <change-id>` resumes at the first step not yet done. It carries
the rules:
when to start and which view, the audit into charges, the design-system contract as
this repo realises it, the component states, the screenshot gate, and the rule that
keeps the next agent on the contract. Its `references/` hold the quality checklist.

Building a view for the first time is not a `/10x-ui` job — build it through the
ordinary chain, then come back to it with `/10x-ui`.

<!-- END @przeprogramowani/10x-cli -->
