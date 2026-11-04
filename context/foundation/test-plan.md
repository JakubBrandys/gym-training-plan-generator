# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-04

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `backend/src`, `frontend/src`
(specs, lockfiles, docs, archive and build output excluded; 32 commits in the
last 30 days as of 2026-11-04).

Test base profile: meaningful — Vitest configured in both packages, about 61
spec files, no browser e2e, and no test gate in CI.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | The server restarts or deploys mid-generation and the user is left on endless progress, a blank screen or a dead job instead of being told clearly to start again. | High | High | interview Q1, Q4; PRD non-functional requirement "no dead air"; archive/2026-10-14-first-plan-generation (jobs held in memory); tech-stack CI flow (auto-deploy on every backend merge). |
| 2 | An unusable pipeline result reaches the user as a normal plan: malformed output, off-catalog exercises, wrong shape, or a failed or retry-exhausted model call. | High | High | interview Q1, Q2 (burned before), Q3; PRD US-01 acceptance criteria and guardrail 2; hot-spot dir `backend/src/plan-generation` (39 file touches/30d). |
| 3 | A saved plan does not reload intact, or shows garbage, in a later session. | High | Medium | interview Q1; PRD guardrail 1; lessons.md (saved shape is a persisted contract); archive/2026-10-27-save-and-view-plan. |
| 4 | One user reads, streams, saves, renames or deletes another user's job or saved plan. | High | Medium | abuse lens (authorization); PRD Access Control ("Member manages own plans only"); user question during plan-delete-and-rename ("can another user open plans that were not saved?"; user-stated, not recorded in a change file); change plan-delete-and-rename (new write endpoints on saved plans). |
| 5 | A user abuses the generation form: injected instructions in free text change the output, or more generations than the limits allow are triggered. | Medium | Medium | abuse lens (untrusted input, resource abuse); PRD FR-003 note and Access Control (prompt-injection abuse); archive/2026-10-14-first-plan-generation (one generation at a time, 5 per rolling 24 hours). |
| 6 | A blocked user keeps access: an already-issued token still works on some route, or sign-in and refresh still succeed. | High | Low | PRD guardrail 3 and FR-003; archive/2026-10-31-admin-block-user; hot-spot dir `backend/src/auth` (11 file touches/30d). |
| 7 | A prompt or pipeline tweak silently degrades plan quality and nothing signals it before deploy. | Medium | High | interview Q3 ("every tweak is guesswork"); hot-spot dir `backend/src/plan-generation` (39 file touches/30d). |

**Impact × Likelihood rubric.** Both axes use a coarse High / Medium / Low scale.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

Considered and not on the map: secret and PII leakage (no evidence beyond the
generic abuse lens; candidate for `--refresh`), UI regressions (only evidence
is churn from the settled redesign, and an existing UI-contract spec already
guards it), and provider outages (observability, not a test).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | After a restart or a vanished job, a refresh, an open progress stream and a save attempt all end in an honest state ("start again"), never endless progress or a half plan; a not-found response shows "start again", and a non-404 failure (5xx or refused connection) ends bounded in a generic retry state, which the test either proves acceptable or flags. | That "refresh resumes the same job" still holds after a restart; that a not-found job means the user is told. | Job lifetime, how the stream and snapshot behave when the job is gone, client handling of not-found and closed streams, restart behaviour on the host. | Frontend watch-loop tests with a faked fetch (a backend job-store reset repeats existing unknown-id tests), plus one manual smoke on a real deploy. | Asserting a mocked stream error that mirrors production; testing only that a missing job returns nothing, without checking what the user sees. |
| #2 | For each failure mode (malformed JSON, schema-valid but off-catalog exercise, wrong week count, empty plan, invalid output after retries, provider error or timeout) the job ends failed with no plan and one of three failure codes (invalid output, provider unavailable, internal), never a completed plan containing invalid exercises; a provider error or timeout fails without a pipeline retry. | That schema-valid means catalog-valid; that the review pass fixes the draft so validating the draft suffices; that a successful retry implies a valid result. | The catalog's source of truth, what the second pass may change, retry rules, where "completed" is decided, error translation, and whether the client checks the shape of a completed plan (research found no shape check and no error boundary). | Integration with a fake model driven by a table of bad outputs. | Deriving the bad outputs from the validator's own branches; happy-path-only; asserting only the error copy. |
| #3 | A plan saved from a completed generation reloads identically, images included, in a later session; an older stored shape still renders; a failed save is surfaced, not confirmed. | That "save returned success" means intact; that a round trip built with the same builder proves anything. | The persisted shape versus what the plan view consumes, the read path, idempotency, and whether persistence is tested against a real database or a fake. | A frontend render of an independently written raw stored body through the real fetch, plus backend e2e tests against the existing fake (a round trip over the HTTP JSON path with a fixture written independently of the serializer, and a failed save followed by a retry); a real-database round trip is a separate cost decision, because a round trip through the fake has no signal on jsonb. A browser e2e is not needed for the render. | The oracle problem (expected value copied from the code under test); mocking the database so persistence is never exercised. |
| #4 | User B cannot read, stream, save, rename or delete user A's job or plan; the answer matches a well-formed unknown id (a malformed id gets the same status with a different body), and A's data survives B's attempt. | That a scoped list implies a scoped get; that an unguessable id is a control; that owning the job implies owning the save. | Every endpoint that takes an id, how ownership is enforced, the not-found-for-unauthorized convention, the stream endpoint. | Integration, two-user matrix per endpoint. | Single-user tests; checking only the status code and not that A's data survived. |
| #5 | Instruction-laden goals text cannot produce output that violates catalog or structure rules because output validation still gates; a second concurrent generation by the same user is refused (one at a time) and the 6th start in a rolling 24 hours is refused, failed jobs included; behaviour of the limit across a restart is known (the in-memory quota resets). | That output validation covers injection (it covers shape, not intent); that the limit is exact under concurrency. | Where user text enters the prompt, where limit state lives and for how long (Phase 1 research found it in memory, reset on restart), whether check-and-start is atomic. | Integration: parallel submissions plus an injection fixture against the fake model. | Asserting that the model refuses an injection (non-deterministic) instead of asserting the invariant. |
| #6 | A blocked profile is refused on every gated route, including with a still-valid token; a block takes effect immediately for every new request (a stream or job already open continues, a known gap); a half-applied block is visible, not silent. | That a refusal on one route means all routes; that a provider-side ban kills already-issued tokens (research: it does not, the database flag is the gate). | Guard order, the public routes, the stream route, the two-part block action and its partial failure. | Integration over a table of all gated routes. | Testing the guard alone; copying the route list from the controllers so a new route can bypass it unnoticed. |
| #7 | A prompt or pipeline change that makes the real model emit more invalid or less personalised plans shows up before merge as a pass rate over a small fixed set of inputs. | That a fake-model unit test says anything about prompt quality; that one good sample is evidence. | Provider and model configuration, cost and minutes per run, non-determinism, what "personalised" means per the PRD. | AI-native: a small on-demand eval, deterministic validity checks first, an LLM judge only for the personalisation rubric. | An LLM judge over what a validator already catches; snapshotting model text. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk. Phases are ordered by
risk and bundle the feature areas each risk touches.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Generation outcome integrity | A generation never ends as a silently bad or vanished plan: every pipeline failure mode and a mid-generation restart end in an honest user-facing state. | #2, #1 | backend pipeline-level tests (fake-model failure table), frontend watch-loop and page state tests, one manual deploy smoke | complete | testing-generation-outcome-integrity |
| 2 | Saved-plan durability and ownership | What the user saves reloads intact, and only its owner can read or change it. | #3, #4 | integration round trip, two-user matrix per id-taking endpoint, frontend stored-shape render | complete | testing-saved-plan-durability-and-ownership |
| 3 | Access control and abuse limits | Blocked users stay out on every gated route, and generation limits and free-text injection cannot be gamed. | #6, #5 | integration route table, parallel-request limit test, injection fixture | complete | testing-access-control-and-abuse-limits |
| 4 | Pipeline eval harness (AI-native) | A prompt or pipeline change that hurts plan quality is visible before merge. | #7 | on-demand eval: deterministic checks first, LLM judge for the personalisation rubric only | complete | testing-pipeline-eval-harness |

**Status vocabulary** (fixed — parser literals): `not started`, `change opened`,
`researched`, `planned`, `implementing`, `complete`.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration (backend) | Vitest with `@nestjs/testing` | vitest ^4.1.2 | Specs beside source as `*.spec.ts`. Run: `cd backend && npm test`. |
| HTTP e2e (backend) | Vitest with supertest | supertest ^7.0.0 | Specs in `backend/test/` as `*.e2e-spec.ts`; HTTP level, not a browser. Run: `cd backend && npm run test:e2e`. |
| unit + component (frontend) | Vitest with Testing Library and jsdom | vitest ^4.1.12, @testing-library/react ^16.3.3, jsdom ^30.1.3 | Two projects: node for `*.spec.ts`, jsdom for `*.spec.tsx`. Run: `cd frontend && npm test`. |
| lint | oxlint | ^1.58.0 backend, ^1.81.0 frontend | Backend runs type-aware. Run: `npm run lint` in each package. |
| API / model mocking | none as a library | n/a | Model calls go through an injectable client faked in specs; persistence in e2e specs uses in-test fakes. Whether that is enough is Phase 1 and 2 research. |
| browser e2e | none yet | n/a | No Playwright configuration. Not planned unless Phase 2 research shows no cheaper layer covers risk #3. |
| accessibility | none yet | n/a | No rollout phase targets it. |
| AI-native: pipeline eval | LLM-judge eval over a fixed input set; tool chosen in Phase 4 research — checked: 2026-11-04 | n/a | When NOT to use: for anything a deterministic validator can assert; as a CI gate (cost, minutes per run, non-determinism); on changes that do not touch prompts or the pipeline. |

**Stack grounding tools (current session):**
- Docs: Context7 available — not queried in discovery because Vitest is already detected in both packages; use it in each phase's research for version-specific setup; checked: 2026-11-04
- Search: Exa not available in current session; built-in web search available; checked: 2026-11-04
- Runtime/browser: Playwright MCP and chrome-devtools MCP available — possible verification layer, not used; checked: 2026-11-04
- Provider/platform: `gh` CLI available for CI status; Sentry, Atlassian and Figma integrations are installed but not relevant to quality gates; checked: 2026-11-04

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Recommended after §3 Phase N" means the gate is advised once that rollout
phase lands. A gate marked `not scheduled` has no rollout phase: CI gates are
deliberately deferred for now. Today the CI workflows only
deploy: the backend workflow installs, migrates and deploys, and the frontend
workflow installs, builds and deploys. Frontend typecheck runs only as part of
that build.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (both packages) | local + CI | not scheduled (no CI gates for now) | syntactic and type drift |
| unit + integration (both packages) | local + CI | not scheduled (no CI gates for now) | logic regressions in the risks covered by Phases 1–3 |
| backend HTTP e2e | local + CI | not scheduled (no CI gates for now) | broken ownership, gating and persistence paths |
| manual deploy smoke (restart mid-generation) | between merge and production | recommended after §3 Phase 1 | restart behaviour no automated test reproduces cheaply |
| on-demand pipeline eval | local, before merging prompt or pipeline changes | recommended after §3 Phase 4 | quality drift from prompt changes |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads "TBD — see
§3 Phase N." Run commands that work today are in §4.

### 6.1 Testing a generation failure mode or a lost job

- **Location**: backend pipeline failures beside the service, `backend/src/plan-generation/`; client watch loop in `frontend/src/lib/`; page states in `frontend/src/pages/`, each spec next to the unit it covers.
- **Naming**: `<unit>.spec.ts` runs in the node environment and `<unit>.spec.tsx` under jsdom (`frontend/vite.config.ts` routes by extension). `plan-generation-watch.spec.tsx` is `.tsx` only because the watch loop calls `window.setTimeout`, which the node project does not have; a spec for a pure guard stays `.spec.ts`. A page spec that uses the real watch layer is `<Page>.watch.spec.tsx`, apart from the canned-state `<Page>.spec.tsx`.
- **Pattern, bad pipeline output**: one table of bad plans (off-catalog slug, 7 weeks, 9 weeks, no weeks, a week without sessions, a session with 2 exercises), each built by a function so every call gets a fresh object, run through both the drafting and the reviewing pass with `describe.each` and `it.each`. Assert the job fails with `invalid_output` and no plan, not the error copy. A clean run asserts every exercise resolves to the spec's own `CATALOG` fixture, so the table cannot drift from the validator's branches.
- **Pattern, lost job on the client**: mock only the network edge with `vi.mock('./api', () => ({ apiFetch: vi.fn() }))` and keep `watchPlanGeneration`, `streamPlanEvents` and `fetchPlanGeneration` real. Route by URL: a path ending in `/events` is the stream, anything else the snapshot. A stream that stays open must error its controller when `init.signal` aborts. Use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`.
- **Pattern, time caps**: record `settled` through `.then` on the watch promise, advance time with `vi.advanceTimersByTimeAsync`, and assert both the flag and the last state, so a missing time cap fails the test instead of hanging it. `AbortSignal.timeout` (the 10 s snapshot timeout) is not driven by fake timers, so every mocked response must resolve.
- **Pattern, page states**: `PlanGenerationPage.spec.tsx` feeds canned watch states and checks rendering only; `PlanGenerationPage.watch.spec.tsx` mocks `apiFetch` and `useAuth`, keeps the real watch layer and advances time inside `act`. Assert what the user sees (the not-found message with `Start again`, the generic retry state), not the internal state name.
- **Mocking policy**: pipeline specs fake the model client and the catalog; frontend specs mock `apiFetch` (or the watch module, for rendering-only specs). Never mock the guard or the watch loop in a spec that claims to cover them. Break the production code in the worktree, confirm the named tests go red, then restore, before trusting a new test.
- **Reference tests**: `backend/src/plan-generation/plan-pipeline.service.spec.ts` (bad-output table), `frontend/src/lib/plan-generation-watch.spec.tsx` (lost job, outage, time cap), `frontend/src/lib/plan-generation.spec.ts` (`isPlanResult` guard, node environment, dev sample plan plus hand-written literals), `frontend/src/pages/PlanGenerationPage.watch.spec.tsx` (what the user sees after a restart).
- **Run locally**: backend `cd backend && npx vitest run src/plan-generation/plan-pipeline.service.spec.ts` (all: `npm test`); frontend `cd frontend && npx vitest run <path>` (all: `npm test`).
- **Not automated**: a restart mid-generation on a real deploy is a manual smoke (§5), not a spec.

### 6.2 Testing that saved data round-trips

- **Location**: backend HTTP cases in `backend/test/saved-plans.e2e-spec.ts` (`describe('persistence fidelity')`); the read guard and stored-shape cases in `frontend/src/lib/` and `frontend/src/pages/`, each spec next to the unit it covers.
- **Naming**: backend `*.e2e-spec.ts` runs through `vitest.config.e2e.ts`. Frontend `saved-plans.spec.ts` stays `.spec.ts` (node, the guard is pure); a page spec that renders a raw stored body is `<Page>.stored.spec.tsx` (jsdom), apart from the canned-state `<Page>.spec.tsx`.
- **Pattern, round trip over HTTP**: hand a typed `PlanResult` with non-null `imageKey` and a mix of string and `null` `note` to `store.complete`; write the expected value as a separate JSON string literal and parse it with `JSON.parse`. Go through `POST /saved-plans` then `GET /saved-plans/:id` over supertest (a real JSON parse of the response) and assert `plan` equals the parsed literal. Never build the expectation with the builder that built the input, and never offer a `structuredClone` of the stored row as the round trip.
- **Pattern, stored body on the client**: feed raw bodies as real `Response` objects through the real `fetchSavedPlan` (`describe('stored body shape')`), then render the real `SavedPlanPage` and `PlanView` with a body built from `JSON.parse(JSON.stringify(buildSamplePlan()))` (`frontend/src/dev/sample-plan.ts`). Assert the `Week 1` heading, the exercise name, the image `src` (`/` plus the stored `imageKey`) and its alt, and a remount with a fresh response (the later-session reload). A malformed body must end in the generic error alert with no `console.error`. The guard rejects only what the renderer would throw on (a missing `form`, `plan`, `weeks`, a week's `sessions`, a session's `exercises`); optional and extra fields pass, because the stored shape only grows additively.
- **Pattern, older shapes**: limit older-shape fixtures to a missing `imageKey` and `note`, `weeks: []` and a missing `title`; each renders with no alert. Hand-write them, do not derive them from the guard's field list.
- **Pattern, failed save**: `table.create.mockRejectedValueOnce(new Error('connection lost'))` gives 500 with no part of the message in the body, no row, the job still `completed`, and a retry that answers 201 with exactly one row. On the client, a rejected `saveGeneratedPlan` shows the generic alert, keeps the plan and re-enables Save (`PlanGenerationPage.spec.tsx`).
- **Mocking policy**: backend e2e persistence is the in-test `FakeSavedPlanTable`; frontend specs mock only the network edge (`../lib/api`, `../auth/useAuth`, `../lib/supabase`) and keep the fetch, the page and `PlanView` real. The fake proves field fidelity through the service and the HTTP JSON path, and that `ownerId` scoping is present. It cannot prove what Postgres does (see Known gaps). Break the production code in the worktree and confirm the named tests go red before trusting a new case.
- **Known gaps**: no real database is exercised, and there is no real-database harness (no compose file, no Postgres service in CI). Not covered because the fake cannot show them: jsonb normalisation (key order, duplicate keys), the real P2002 mapping through the pg adapter, the foreign key and `ON DELETE CASCADE` to Profile, `@db.Uuid` rejecting non-UUID ids (e2e ids are plain strings such as `user-1`), collation and ordering. A NUL (`\u0000`) in model-written plan text (`goal`, `title`, `reps`, `note`) has no guard, while `goals` and the rename title do; a save would probably fail with a default 500 (inferred, never reproduced). The manual two-account smoke of this change is the only real-database evidence.
- **Reference tests**: `backend/test/saved-plans.e2e-spec.ts` (`persistence fidelity`), `frontend/src/lib/saved-plans.spec.ts` (`stored body shape`), `frontend/src/pages/SavedPlanPage.stored.spec.tsx` (stored plan to the DOM, remount, older shape, malformed bodies), `frontend/src/pages/PlanGenerationPage.spec.tsx` (rejected save).
- **Run locally**: backend `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts` (all e2e: `npm run test:e2e`; `npm test` skips `*.e2e-spec.ts`); frontend `cd frontend && npx vitest run <path>` (all: `npm test`).
- **Not automated**: a save and reload against the real hosted database is a manual two-account smoke, not a spec.

### 6.3 Testing ownership on a new id-taking endpoint

- **Location**: backend e2e, in the spec of the module that owns the route: `backend/test/saved-plans.e2e-spec.ts` (`describe('ownership matrix')`) and `backend/test/plan-generation.e2e-spec.ts`. Extend them in place; there is no shared two-user helper.
- **Pattern, two-user matrix per route**: users are the literals `user-1` (A) and `user-2` (B), and the unknown id is a hand-written well-formed UUID. For each route, B's answer to A's real id equals B's answer to the unknown id in status and body (and content type and text for the event stream, once without and once with `Last-Event-ID: 0`). Take a `structuredClone` of A's whole row (or A's snapshot or view) before B's attempt and assert it is unchanged after. Then repeat the request as A on the same route and assert it still succeeds (200, 200 and 204 for GET, PATCH and DELETE): the fake table compares `where.ownerId`, so if production drops `ownerId` the fake matches nothing, B still gets 404 and the row survives, and "B gets 404 and the row survives" alone would stay green. Cover save as well: B posting A's unsaved job, and B posting a job A already saved, each equal to an unknown job id with no row created or changed.
- **Pattern, malformed id**: `/saved-plans/:id` answers 404 for a non-UUID id with the `ParseUUIDPipe` body, which differs from the unknown-id body. It is an accepted format difference (it reveals only that the id is not a UUID), so pin only status 404, `statusCode: 404` in the body and no row data, not the message text.
- **Reference tests**: `backend/test/saved-plans.e2e-spec.ts` (`ownership matrix`), `backend/test/plan-generation.e2e-spec.ts` (foreign snapshot and `/events` cases).
- **Run locally**: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts test/plan-generation.e2e-spec.ts` (all e2e: `npm run test:e2e`). `cd backend && npm test` does not run `*.e2e-spec.ts` (`vitest.config.ts` includes only `**/*.spec.ts`).
- **Not automated**: what a real database would let B do if `ownerId` were dropped; the manual two-account smoke covers B's UI and API view of A's plan.

### 6.4 Testing gated routes and abuse limits

- **Location**: backend HTTP specs in `backend/test/`: `access-control.e2e-spec.ts` (route table and block lifecycle), `plan-generation.e2e-spec.ts` (`describe('abuse limits')`) and `plan-generation-injection.e2e-spec.ts` (hostile goals through the real pipeline). Extend them in place.
- **Naming**: `*.e2e-spec.ts` through `vitest.config.e2e.ts`; backend HTTP over supertest, no browser.
- **Pattern, route table**: boot the real `AppModule` and override only `PrismaService` (fake profile table plus a stub saved-plan table), `SupabaseJwtVerifier` (token to user map, throws `UnauthorizedException` for unknown tokens), `SupabaseAdminClient` (`banUser` as `vi.fn`) and `PlanPipelineService` (a run that never resolves). `AuthGuard`, `ProfilesService`, `AdminGuard` and `AdminUsersService` stay real. `discoverRoutes(app)` reads the Express 5 router stack, keeps layers with a `route`, treats `GET /` and `GET /health` as the hand-written public allowlist and `/admin/` as the admin prefix, and replaces `:param` with a well-formed unknown UUID. A hand-written floor of PRD-named routes keeps the table from being vacuous; no exact route count is asserted, so a new route needs no edit. Collect violations as `METHOD path -> status` so a red run names routes.
- **Pattern, properties**: a blocked member with a valid token gets 403 `Account is blocked` on every gated route, an invalid body and `/admin/*` included (403, never the 404 disguise), with no writes; a missing, forged or failing-verification token gets 401, never 403; an active member passes the guard (control); public routes stay open to blocked and anonymous callers.
- **Pattern, block lifecycle**: block through the real `/admin/users/:id/block`, then use the same token and assert refusal on every route while the fake verifier still accepts it (the refusal comes from the profile); a second member is unaffected. A failed ban answers 502 without upstream detail, the member stays refused, the admin list shows a non-null `blockedAt`, and repeating the block answers 200 with the original `blockedAt` and `banUser` called twice. Blocked starts never run the pipeline or hold a job; a changed email on the token does not clear the block.
- **Pattern, limits**: send a burst of 6 same-user `POST /plan-generations` over a real listening port (`app.listen(0, '127.0.0.1')` and `request(baseUrl)`; plain supertest hit `ECONNRESET` under concurrency) and assert exactly one 202 and five 429 `{ code: 'active_job' }` while another user gets 202. Assert `daily_limit` on the 6th start after 5 jobs finished alternately through `complete` and `fail` (failed jobs count). Test the sliding window with `vi.useFakeTimers({ toFake: ['Date'] })` only: just under 24 h still limited, past 24 h admitted. A second `createApp()` instance grants the full quota again while the first still refuses; that pins the in-memory limiter as accepted MVP behaviour and turns red if the limit is persisted.
- **Pattern, injection fixture**: real controller, `PlanJobStore`, `PlanLimiter` and `PlanPipelineService` over a scripted fake `PlanModelClient` and a stubbed `ExercisesService`. Hostile goals (closing-tag escape plus an instruction, fullwidth brackets and newlines, JSON-looking text) must reach both the draft and the review prompt only inside one goals block (match `/^<goals>$/gm`, since the instruction sentence itself mentions `<goals>` twice) with no `<`, `>`, U+FF1C, U+FF1E or line break, and never the system prompt. 501 chars, NUL, a number or an array answer 400, are not echoed and never reach the model. A model that obeys the injection (slug outside the catalog, 9 weeks) on the draft or the review pass ends `failed` with `invalid_output` and a null plan; a valid draft is not a fallback. Hostile goals with a valid model plan complete with 8 weeks and catalog-only slugs. The fake client bypasses the zod schema, so the validator gate is what is exercised.
- **Mocking policy**: fake only the edges named above (Prisma, JWT verifier, Supabase admin client, model client, catalog); never mock the guards or the limiter in a spec that claims to cover them. Break the production code in the worktree and confirm the named tests go red before trusting a new case. Two lessons from the break checks: an `await Promise.resolve()` or `setImmediate` yield between `tryAcquire` and `store.create` does NOT turn the burst test red, because the continuation runs before the next request reaches the handler, while a real timer yield (`setTimeout` of 5 or 25 ms, standing in for a database call) does; and a stray `@Public()` on a route is caught by the blocked-member and 401 tables, where `GET /me` answers 500 because `@CurrentUser()` is undefined on a public route.
- **Known gaps**: a blocked user's already-open progress stream (up to 240 s, `backend/src/plan-generation/plan-stream.config.ts`) and already-running job (up to the 10 min job timeout) continue after a block; every new request is refused. Accepted in `context/archive/2026-10-31-admin-block-user/plan.md`; no test pins it. The daily quota resets on restart or deploy (limiter and job store are in-process memory; Fly keeps one machine up and auto-deploys on every backend merge); multi-instance behaviour (per-instance quota) is unreachable on the current deploy and untested. Injected-but-valid text inside `goal` (200), `title` (80), `reps` (20) and `note` (200) passes the validator, because output validation gates catalog and structure, not intent; untested by decision. The review pass embeds the draft unescaped in `<draft_plan>` (`plan.prompts.ts`), and `sanitizeGoals` covers only `<`, `>` and the fullwidth pair, not other bracket lookalikes; untested by decision. No real database and no real Supabase: blocked-user sign-in rejection is Supabase's behaviour (§7) and is observed only by the manual smoke.
- **Reference tests**: `backend/test/access-control.e2e-spec.ts` (route table, block lifecycle), `backend/test/plan-generation.e2e-spec.ts` (`abuse limits`), `backend/test/plan-generation-injection.e2e-spec.ts` (hostile goals, injection-obeying model).
- **Run locally**: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/access-control.e2e-spec.ts test/plan-generation.e2e-spec.ts test/plan-generation-injection.e2e-spec.ts` (all e2e: `npm run test:e2e`; `npm test` skips `*.e2e-spec.ts`).
- **Not automated**: the manual block smoke (a member signed in, the admin blocks them, the same session is refused, and a real ban rejects sign-in), recorded in `context/changes/testing-access-control-and-abuse-limits/plan.md` Phase 5.

### 6.5 Running the pipeline eval

- **Location**: `backend/eval/`, outside `src/` on purpose: `tsconfig.build.json` compiles all of `src` and the Dockerfile copies only `src`, so nothing here reaches `dist` or the image. Lint covers it (`npm run lint`). Generated plans go to the gitignored `backend/eval/runs/<timestamp>/`; the committed baseline `backend/eval/baseline/report.json` holds numbers and metadata only, never plan text.
- **Naming**: pure modules and their specs are `eval-*.ts` and `eval-*.spec.ts` and run under `npm test` with no key. The real-model entry points are `generate.eval.ts` and `score.eval.ts`, run through `vitest.eval.config.ts`; neither `npm test` nor `npm run test:e2e` picks them up.
- **Run locally** (from `backend/`; needs `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL` in `backend/.env`, loaded with `dotenv`, plus `EVAL_JUDGE_MODEL` for the judge, which has no default):
  - `npm run eval:generate` runs the real pipeline, `EVAL_TIER=smoke` (default, first 3 inputs once) or `EVAL_TIER=full` (8 inputs x 3 repeats = 24 jobs); `EVAL_CONCURRENCY` (default 4).
  - `EVAL_RUN_DIR=<dir> npm run eval:score` scores a saved run (default: the newest); `EVAL_SKIP_JUDGE=1` skips the judge. It re-runs on saved plans without regenerating.
  - `npm run eval:baseline -- <run-dir>` copies that run's `report.json` to the baseline.
  - Both scripts use `--reporter=verbose` because Vitest hides `console.log` from passing tests otherwise, and the report is printed with `console.log`.
- **Pattern, headline metric**: per model call, first attempt of each pass only. A recording wrapper (`eval-record.ts`) sits around `PlanModelClient.generate` per job, reads the stage from the job store at call time, and judges each output with the production `validateGeneratedPlan`; an unparseable answer is a failed call. Draft and review are reported separately; retry calls (attempt 2) are reported apart and never in the headline, because the pipeline's retry would otherwise hide a prompt that gets worse on the first try. Never read the headline off job status.
- **Pattern, deterministic quality metrics**: week repetition (a week repeats when its sessions have the same slugs in order and the same sets as the previous week, reps and notes ignored, so the 2026-10-24 plank case counts), mean distinct muscle groups per week, and the share of exercises above the trainee's level. They are reported with deltas and never counted in the validity pass rate.
- **Pattern, judge**: one `generateText` call with `Output.object` (installed `ai` 7.0.140) scores goals fit and experience fit, 1 to 5 each; a score of 4 or more (4 included) is a pass. It never scores frequency, counts, catalog or formats (the validator and the metrics decide those). A failed judge call or a job with no plan is `unscored`, never a pass. Calibration: on the first repeat of each input the same plan is also judged against the next input's form; separation (matched mean minus mismatched mean) under 1.0 marks the judge `not discriminating`.
- **Pattern, reading the report**: it prints deltas against the baseline over the input ids both runs share and marks a metric `REGRESSED` past its margin; the process always exits 0. Initial margins (fixed, not fitted to data, revisit after the first baseline): call validity drop over 0.05, job failure rate rise over 0.05, week repetition rise over 0.15, judge mean drop over 0.3, mean distinct muscles drop over 1.0, above-level share rise over 0.10. A drop of exactly a margin is not marked. Read the report before merging a prompt, model or pipeline change; a green report over a small set only bounds a validity failure rate loosely (0 failures in n runs bounds it near 3/n at 95%).
- **Mocking policy**: the unit specs fake only the model client and the judge and make no claim about the real model's quality; the real-model checks are your smoke and full runs. Break the production code in the worktree and confirm the named specs go red before trusting a new case.
- **Known gaps**: no CI gate (cost, minutes per run, non-determinism); the judge is the same vendor scoring its own output, so it is only as trustworthy as the calibration check and a hand read of about ten judged plans; level fit is weak by construction (the catalog is 26 beginner, 5 intermediate and 1 expert exercise); the catalog is the seed file, not the production database; client constants (`reasoningEffort`, token limits) are not part of the prompt hash, so the report records the git commit instead; provider rate limits at concurrency 4 and `gpt-6-luna` pricing are unverified. Whether a worse prompt actually moves a metric was not shown by a real run when this was written (2026-11-04); the two deliberate-break runs in `context/changes/testing-pipeline-eval-harness/plan.md` Phase 4 decide that.
- **Tool choice (checked: 2026-11-04)**: a plain Vitest runner with no new dependency. evalite 0.19.0 depends on `@ai-sdk/provider` ^2.0.0 (an older AI SDK generation than this repo's `ai` 7), vitest-evals 0.17.0 has no repeat or pass-rate feature (its `ai` peer is `>=4 <7` and optional), promptfoo is about 33 MB (reported) with a prompt-string provider interface, and autoevals only duplicates the judge call.
- **Reference tests**: `backend/eval/eval-metrics.spec.ts` (plank case, boundaries), `backend/eval/eval-report.spec.ts` (first-attempt counting, margin boundaries, score 4, calibration), `backend/eval/eval-runner.spec.ts` (draft retried, unparseable answer, provider error, failing job, pool limit), `backend/eval/eval-judging.spec.ts` (unscored, mismatched call only on repeat 1).
- **Run the specs**: `cd backend && npx vitest run eval/` (all: `npm test`).
- **Not automated**: every real-model run, the baseline, and the two deliberate-break runs are manual (the agent cannot read `.env*`).

### 6.6 Per-rollout-phase notes

(Appended by `/10x-implement` after each phase lands: two or three lines on
anything the phase taught that later tests should reuse.)

- 2026-11-04, `testing-access-control-and-abuse-limits`: reuse the real-`AppModule` harness in `backend/test/access-control.e2e-spec.ts` for any new gated route test. When checking atomicity, yield with a timer (`setTimeout`), not `await Promise.resolve()`. The route table is discovered from the router, so adding a route needs no table edit.

## 7. What We Deliberately Don't Test

Interview Q5 was skipped, so these exclusions are inferred from the PRD
non-goals and the archive rather than stated by the team. Confirm or edit them
in the first `--refresh`.

- **Progress tracking, team features, fetching images from the web** — PRD non-goals; none of it is built. Re-evaluate if the PRD changes. (Source: PRD Non-Goals.)
- **Visual and styling snapshot tests** — the UI is still moving and an existing UI-contract spec already guards tokens and shared components. Re-evaluate if a visual regression reaches production. (Source: inferred.)
- **Admin user-list screen** — one trusted admin, low blast radius; only its access control is covered, under risk #6. Re-evaluate when more admins exist. (Source: inferred from PRD Access Control.)
- **The auth provider's own behaviour** — we test our reaction to it, not Supabase. Re-evaluate if we move providers. (Source: inferred.)
- **The catalog seed script** — idempotency is already covered by an existing spec. Re-evaluate if the catalog grows past the minimal seed. (Source: archive/2026-10-04-exercise-catalog-seed.)
- **FR-008 (edit or regenerate part of a plan)** — not built, so nothing to test. Re-evaluate when it is planned. (Source: roadmap Parked.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-04
- Stack versions last verified: 2026-11-04
- AI-native tool references last verified: 2026-11-04

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
