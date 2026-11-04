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
From `frontend/`: `npm run dev`, `npm run build` (`tsc -b` then Vite build), `npm run lint` (oxlint), `npm test` (Vitest).

### Coding Style & Naming Conventions

Both packages use oxlint as the sole linter (no ESLint). `backend/` runs TypeScript in strict mode (`@backend/tsconfig.json`) and enforces `no-floating-promises: error` (`@backend/.oxlintrc.json`) — every Promise must be awaited or explicitly discarded; it formats with Prettier, single quotes and trailing commas (`@backend/.prettierrc`). `frontend/` does **not** enable `strict` in `@frontend/tsconfig.app.json` (only `noUnusedLocals`/`noUnusedParameters`/etc.) and enforces `react/rules-of-hooks` (`@frontend/.oxlintrc.json`); no Prettier is configured there.

### Testing Guidelines

`backend/` uses Vitest; run a single file with `npx vitest run <path>` from `backend/`. `frontend/` uses Vitest 4 with Testing Library (`*.spec.ts` run in the node environment, `*.spec.tsx` under jsdom, per `@frontend/vite.config.ts`); before writing a test, read the cookbook in `@context/foundation/test-plan.md` (§6).

### Security & Configuration Tips

No `.env` files exist in either package yet. `backend/.gitignore` already excludes `.env*` — add secrets there, never commit them. `frontend/.gitignore` has no env-file pattern yet if one is added later.

### UI contract

- Design tokens (colour, radius, widths) live in `@frontend/src/index.css`: `:root` plus the `prefers-color-scheme: dark` override. Views reference roles (`--accent`, `--on-accent`, `--text-muted`, `--surface`, `--radius`, `--content-width`, `--narrow-width`), never colour values or fixed widths.
- Shared components live in `@frontend/src/components/` (`Button`, `ButtonLink`, each with `primary` / `secondary` / `danger` variants, `danger` for destructive actions; `Card` for a `--surface` container; `Chip` for a small pill; `PlanSummary`, `WeekSwitcher` and `WeekPager` for the plan view; `DeletePlanControl` for the inline delete confirmation, `RenamePlanForm` for the inline title editor and `SavedPlanListItem` for a saved-plan list item). Check this directory before creating a component and extend it instead of styling a second `<button>`, link-button or bordered box in a view.
- Signed-in pages render inside `AppShell` (`AppHeader`, the page's own `<main>` through the Outlet, `AppFooter`); sign-in and sign-up render inside `AuthLayout`. Pages keep their own `<main>` and `<h1>`; do not add a "Back to home" link, and add a nav entry in `@frontend/src/components/nav-active.ts`, which also decides the active link. Read the signed-in user's email and role through `useProfile()` from `@frontend/src/profile/` instead of calling `/me` again.
- A training plan is shown by `PlanView` (`@frontend/src/components/PlanView.tsx`): a summary card, a `WeekSwitcher`, one week of session cards with compact rows, and a `WeekPager`. The week lives in the URL hash (`#week-N`) through `@frontend/src/lib/week-hash.ts` (invalid hashes show week 1, switching replaces the history entry), summary numbers come from `@frontend/src/lib/plan-stats.ts`, and `PlanView` needs a router. Keep the week heading an `h2` named `Week N`; the saved page passes its details through the `details` prop, and the generation page passes none because the job view does not expose the form.
- No literal colours (hex, `rgb()`, `hsl()`, `oklch()`) in views, components or `frontend/src/dev/`; add or adjust a token in `index.css` instead. `@frontend/src/ui-contract.spec.ts` fails `npm test` on a literal; its allowlist of known literals is empty and should stay empty.
- Every state of a view (loading, ready, error, pending, disabled; empty when the view has a list) belongs in the dev-only kitchen sink at `/dev/kitchen-sink` (`@frontend/src/dev/KitchenSinkPage.tsx`, present only under `npm run dev`), which also shows the shell header and footer in every state and the plan view in its states (live hash, saved and generation page variants, edge-length content, no images, a failing image). After a visual change, screenshot it at desktop and 375 px in light and dark.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the two M3L4 skills in this order:**

1. **`/10x-e2e-setup`** — one-time setup: Playwright config (`webServer`,
   auth `setup` project, `storageState`), a green seed test, and `context/foundation/test-stack.md`.
2. **`/10x-e2e`** — the per-risk loop: risk → explore the running app with
   `playwright-cli` → generate → review against the five anti-patterns →
   re-prompt by name → verify with a deliberate break.

The skills' `references/` carry the full rules, anti-patterns, seed pattern, and
prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toHaveScreenshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **A red test is a signal, not a chore.** A changed selector → update the
  locator in a reviewed diff. A changed business behavior → the test caught a
  bug; never edit the assertion to match it. Fixing failing tests is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
