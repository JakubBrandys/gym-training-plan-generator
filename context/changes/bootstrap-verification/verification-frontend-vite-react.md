---
bootstrapped_at: 2026-09-20T13:30:20Z
starter_id: vite-react
starter_name: Vite + React
project_name: gym-training-plan-generator
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

This run's hand-off was read from `context/foundation/tech-stack-frontend.md` — a manually-authored companion doc, not a `/10x-tech-stack-selector`-generated file (that skill's schema supports only one `starter_id`, already used by the backend's `tech-stack.md`). Schema divergence noted at Step 0: extra keys `companion_to`, `status`; missing `hints` fields `quality_override`, `path_taken`, `self_check_answers`, `has_auth`, `has_payments`, `has_realtime`, `has_ai`, `has_background_jobs` — defaults substituted (`quality_override: false`, `path_taken: not recorded`, `self_check_answers: null`, all `has_*` unset). This did not trigger a refusal per the consumer contract's tolerance for schema drift.

```yaml
starter_id: vite-react
package_manager: npm
project_name: gym-training-plan-generator
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
```

**Why this stack** (verbatim from `context/foundation/tech-stack-frontend.md`):

The backend (`tech-stack.md`) locked in Nest.js, which only leaves room for one `starter_id` in that file's schema. The frontend is a thin React SPA that talks to the Nest.js API over HTTP and never touches PostgreSQL directly, so it doesn't need SSR, routing conventions, or a data layer baked in — `vite-react` (minimal Vite + React + TypeScript template) fits that "bring your own backend" shape exactly, without pulling in server-side features the project doesn't need. It clears all four agent-friendly quality gates except `convention_based` (no built-in routing/data-layer opinions — acceptable here since the API layer already carries those conventions). Deployment defaults to Cloudflare Pages as a static SPA host, which is a good fit specifically because the frontend never opens a database connection itself — only the Nest.js API does, avoiding the edge/BFF-to-Postgres connection-pooling problem discussed earlier.

## Pre-scaffold verification

| Signal      | Value                                       | Severity | Notes                                                    |
| ----------- | -------------------------------------------- | -------- | ---------------------------------------------------------- |
| npm package | `create-vite` v9.2.1 published 2026-09-10    | fresh    | resolved from `cmd_template` (`npm create vite@latest ...`) |
| GitHub repo | not run                                     | n/a      | `docs_url` (`https://vitejs.dev/guide/`) is not a GitHub URL |

## Scaffold log

**Execution error found (not a registry bug)**: the registry's `cmd_template` for `vite-react` is `npm create vite@latest {name} -- --template react-ts` — that `--` is correct and required for `npm create`, which strips it before forwarding the remaining args to the underlying `create-vite` package. This run substituted the template incorrectly, expanding it into a direct `npx create-vite@latest .bootstrap-scaffold -- --template react-ts` invocation while keeping the `--` — valid inside `npm create`'s wrapper, not for a bare `npx` call — which silently produced the **vanilla-ts** template instead of react-ts (exit code 0 either way, so this would not have tripped the HARD-STOP check; caught only by manually inspecting the scaffolded `package.json`). Verified afterward: running the literal registry template (`npm create vite@latest {name} -- --template react-ts`) in isolation works correctly on the first try — `npm create` reported `npx "create-vite" {name} --template react-ts` internally, confirming the `--` was stripped as intended. **No registry change needed.** The lesson for future runs: substitute `{name}`/`{pm}` into the `cmd_template` and run it exactly as written (including its `npm create ... --` form), rather than translating it into an equivalent `npx <package>` call.

**Resolved invocation (corrected, re-run manually)**: `npx create-vite@latest .bootstrap-scaffold --template react-ts --overwrite`
**Strategy**: subdir-then-move (target redirected to `frontend/`, matching `backend/`'s placement)
**Exit code**: 0
**Files moved**: 12 files (`.gitignore`, `.oxlintrc.json`, `README.md`, `index.html`, `package.json`, `public/favicon.svg`, `public/icons.svg`, `src/App.css`, `src/App.tsx`, `src/index.css`, `src/main.tsx`, `tsconfig.app.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`)
**Conflicts (.scaffold siblings)**: none (target directory `frontend/` did not previously exist)
**.gitignore handling**: present in scaffold, absent in `frontend/` (new folder) — moved silently
**.bootstrap-scaffold cleanup**: deleted (directory renamed to `frontend/`)

## Post-scaffold audit

**Tool**: `npm audit --json` (attempted from `frontend/`)
**Status**: failed to run
**Reason**: `vite-react`'s scaffold command does not chain a dependency install (unlike the Nest.js CLI), so no `package-lock.json` exists yet. `npm audit` requires an existing lockfile (`ENOLOCK`: "This command requires an existing lockfile."). Generating one (`npm i --package-lock-only`) was deliberately not done — installing/modifying the scaffolded project is out of scope for this verification step.
**Partial output**:

```
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
npm error audit Try creating one first with: npm i --package-lock-only
npm error audit Original error: loadVirtual requires existing shrinkwrap file
```

## Hints recorded but not acted on

| Hint                    | Value                          |
| ------------------------ | -------------------------------- |
| bootstrapper_confidence | verified                        |
| quality_override        | false (default — not recorded in hand-off) |
| path_taken              | not recorded (manually-authored hand-off) |
| self_check_answers      | null (not recorded)             |
| team_size               | solo                            |
| deployment_target       | cloudflare-pages                |
| ci_provider             | github-actions                  |
| ci_default_flow         | auto-deploy-on-merge            |
| has_auth                | not recorded                    |
| has_payments            | not recorded                    |
| has_realtime             | not recorded                    |
| has_ai                  | not recorded                    |
| has_background_jobs     | not recorded                    |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded — audit is unresolved, see below.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Run `npm install` inside `frontend/` (creates `package-lock.json` and `node_modules/`), then `npm audit` to get the dependency-vulnerability picture this run couldn't produce.
- No registry action needed for `vite-react` — the `cmd_template` is correct as written (see Scaffold log above); the earlier mis-execution has been corrected in this log.
- Cross-reference `context/changes/bootstrap-verification/verification.md` for the backend (`nestjs`) run's audit trail — that one completed its audit successfully.
