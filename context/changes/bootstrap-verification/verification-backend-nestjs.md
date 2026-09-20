---
bootstrapped_at: 2026-09-20T13:12:09Z
starter_id: nestjs
starter_name: NestJS
project_name: gym-training-plan-generator
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

**Why this stack** (verbatim from `context/foundation/tech-stack.md`):

Solo developer building an MVP training-plan generator in ~3 weeks, with auth, a multi-model AI pipeline, and live stage-by-stage progress in scope. The PRD's product_type is web-app, but the explicit architecture request — a separate React frontend talking to a Nest.js API, backed by PostgreSQL — doesn't fit the registry's bundled recommended default for (web, js), 10x-astro-starter, so the custom path was walked instead. Nest.js is recorded as the primary starter because auth, the AI orchestration, and the business rule live server-side; it clears all four agent-friendly quality gates (typed, convention-based, popular in JS training data, well-documented) and carries verified bootstrapper confidence. The React frontend is a deliberate follow-up scaffold, not represented in this hand-off's single-starter schema. Deployment defaults to Fly.io — Nest.js's card default, since it isn't an edge/Cloudflare-Workers-friendly framework the way Hono is. CI runs on GitHub Actions with auto-deploy-on-merge. The self-check surfaced two personal-familiarity gaps (official-template recognition, convention recognition); the user chose to proceed deliberately, treating this as a real project to learn from rather than a one-off course exercise.

## Pre-scaffold verification

| Signal      | Value                                         | Severity | Notes                                                        |
| ----------- | ---------------------------------------------- | -------- | ------------------------------------------------------------- |
| npm package | `@nestjs/cli` v12.0.3 published 2026-09-16      | fresh    | resolved from `cmd_template` (`npx @nestjs/cli new ...`)      |
| GitHub repo | not run                                        | n/a      | `docs_url` (`https://docs.nestjs.com`) is not a GitHub URL     |

## Scaffold log

**Note on placement**: the standard `subdir-then-move` mechanic merges scaffold files into cwd root. The user explicitly redirected placement into a `backend/` subfolder instead, to match an agreed `backend/` + `frontend/` repo layout (see `context/foundation/tech-stack-frontend.md`), since cwd is the shared course/lesson repo root, not a dedicated project directory. `backend/` did not exist, so the move was a clean directory rename with zero conflicts.

**Resolved invocation**: `npx @nestjs/cli new .bootstrap-scaffold -p npm --strict --skip-git`
**Strategy**: subdir-then-move (target redirected to `backend/`)
**Exit code**: 0
**Files moved**: 14 files (`.oxlintrc.json`, `.prettierrc`, `README.md`, `nest-cli.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `src/app.controller.ts`, `src/app.module.ts`, `src/app.service.ts`, `src/main.ts`, `src/app.controller.spec.ts`, `test/app.e2e-spec.ts`) plus `node_modules/`
**Conflicts (.scaffold siblings)**: none (target directory `backend/` did not previously exist)
**.gitignore handling**: absent in scaffold (`--skip-git` flag)
**.bootstrap-scaffold cleanup**: deleted (directory renamed to `backend/`)

## Post-scaffold audit

**Tool**: `npm audit --json` (run from `backend/`)
**Summary**: 0 CRITICAL, 2 HIGH, 1 MODERATE, 2 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/2/1/2 (direct: `@nestjs/mau` only, moderate; all HIGH and LOW findings are transitive)

#### CRITICAL findings

None.

#### HIGH findings

- **tmp** (transitive, via `external-editor` → `inquirer` → `@nestjs/mau`) — range `<=0.2.5` — [GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65) "Path Traversal via unsanitized prefix/postfix that enables directory escape" (high). Fix available via `@nestjs/mau` upgrade to 0.0.6 (semver-major).
- **undici** (transitive, via `@nestjs/mau`) — range `<=6.27.0` — multiple advisories at high severity, e.g. [GHSA-f269-vfmq-vjvj](https://github.com/advisories/GHSA-f269-vfmq-vjvj) "Malicious WebSocket 64-bit length overflows parser and crashes the client" (CVSS 7.5), [GHSA-vrm6-8vpv-qv8q](https://github.com/advisories/GHSA-vrm6-8vpv-qv8q) "Unbounded Memory Consumption in WebSocket permessage-deflate Decompression" (CVSS 7.5), [GHSA-v9p9-hfj2-hcw8](https://github.com/advisories/GHSA-v9p9-hfj2-hcw8) "Unhandled Exception ... Invalid server_max_window_bits Validation" (CVSS 7.5), [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) "DoS via fragment count bypass" (CVSS 7.5). Fix available via `@nestjs/mau` upgrade to 0.0.6 (semver-major).

#### MODERATE findings

- **@nestjs/mau** (direct) — moderate — via `inquirer`, `undici` — fix available: upgrade to 0.0.6 (semver-major)

#### LOW / INFO findings

- **external-editor** (transitive, via `tmp`) — low
- **inquirer** (transitive, via `external-editor`) — low

## Hints recorded but not acted on

| Hint                    | Value                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| bootstrapper_confidence | verified                                                                                          |
| quality_override        | false                                                                                             |
| path_taken              | custom                                                                                            |
| self_check_answers      | typed: true, from_official_starter: false, conventions: false, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                              |
| deployment_target       | fly                                                                                               |
| ci_provider             | github-actions                                                                                    |
| ci_default_flow         | auto-deploy-on-merge                                                                              |
| has_auth                | true                                                                                              |
| has_payments            | false                                                                                             |
| has_realtime            | true                                                                                              |
| has_ai                  | true                                                                                              |
| has_background_jobs     | false                                                                                             |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Scaffold the frontend into a sibling `frontend/` folder per `context/foundation/tech-stack-frontend.md` (`npm create vite@latest frontend -- --template react-ts`).
- The one MODERATE, direct finding (`@nestjs/mau`) has a fix available only via a semver-major bump — evaluate before upgrading.
- The two HIGH findings (`tmp`, `undici`) are transitive, pulled in through `@nestjs/mau`'s dependency on `inquirer`; they resolve the same way (upgrading `@nestjs/mau` to 0.0.6).
- Address the remaining findings per your project's risk tolerance — the full breakdown is above.
