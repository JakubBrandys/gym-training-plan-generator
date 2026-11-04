# Access Control and Abuse Limits Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md` ("Access control and abuse limits", Risks #6 and #5). Add the tests that pin who is refused and what cannot be gamed: a blocked profile is refused on every gated route with a still-valid token, a block takes effect on the next request and a half-applied block is visible (Risk #6); hostile goals text cannot make a completed plan break catalog or structure rules, the second concurrent generation is refused, the daily limit holds, and what a restart does to the limit is asserted and written down (Risk #5). The change is test-only by decision: no production code changes. It closes with the cookbook entry §6.4, the known gaps and a manual block smoke on a real Supabase project.

## Current State Analysis

Research (`research.md`) found the enforcement sound and the tests thin exactly where the risks live.

- Blocked users: one global `AuthGuard` (`backend/src/auth/auth.module.ts:13`) verifies the JWT, reads the profile from the database on every request and throws 403 `Account is blocked` when `blockedAt` is set (`backend/src/auth/auth.guard.ts:49-53`). Only `GET /` and `GET /health` are `@Public()`; the other 11 handlers are gated. The JWT verifier never asks Supabase about bans (`backend/src/auth/supabase-jwt.verifier.ts:32-64`), so the database flag is the sole gate for an already-issued token and a block applies on the next request.
- Block flow: `AdminUsersService.block` stamps `blockedAt` first and bans at Supabase second; a failed ban answers 502, keeps the block and a repeat call repairs it (`backend/src/admin-users/admin-users.service.ts:44-65`).
- Blocked-user tests: the guard unit test refuses a blocked profile (`backend/src/auth/auth.guard.spec.ts:292`); at HTTP level exactly one test drives the real `AuthGuard`, a blocked admin on `POST /admin/users/:id/block` (`backend/test/admin-users.e2e-spec.ts:503`), with `verify` and `resolve` returning one fixed profile (`:477-483`). Every other e2e spec replaces the guard with a header guard that cannot model a blocked profile. `GET /me` has no spec of any kind.
- Limits: `PlanLimiter.tryAcquire` denies `active_job`, then `daily_limit` (5 starts in a rolling 24 h window, failed jobs included) and records the start (`backend/src/plan-generation/plan.limiter.ts:25-36`); `start()` calls it and `store.create` with nothing awaited between (`backend/src/plan-generation/plan-generation.controller.ts:83-91`). Limiter state and the job store are in-process memory, so a restart resets both; Fly keeps one machine up and auto-deploys on every backend merge (`backend/fly.toml:15-18`).
- Limit tests: unit boundaries (`backend/src/plan-generation/plan.limiter.spec.ts:33-122`), controller-level `daily_limit` with `dailyLimit` 2 (`backend/src/plan-generation/plan-generation.controller.spec.ts:144-186`), HTTP `active_job` once (`backend/test/plan-generation.e2e-spec.ts:119`). Nothing fires concurrent POSTs, nothing drives `daily_limit` over HTTP, nothing asserts a restart.
- Injection: `goals` is the only free text (max 500, trim, no NUL); angle brackets are stripped and whitespace collapsed only at prompt time, goals sit inside `<goals>…</goals>` in the user prompt (`backend/src/plan-generation/plan.prompts.ts:23-27`, `:62-65`). Output gates are the zod slug enum plus the validator, applied to draft and review passes (`backend/src/plan-generation/plan-pipeline.service.ts:112-186`); `goal`, `title`, `reps` and `note` accept any text within length bounds and the review pass embeds the draft unescaped. Existing coverage is prompt-level only (`backend/src/plan-generation/plan.prompts.spec.ts:41-81`); the HTTP e2e replaces the whole pipeline with a stub (`backend/test/plan-generation.e2e-spec.ts:92`), so no hostile goals ever reach a real pipeline.
- Spike result (this planning session, throwaway file deleted): the real `AppModule` boots in a test with only `PrismaService` overridden and dummy env values, and Express 5's `app.router.stack` lists exactly the 13 routes (`GET /`, `GET /health` and the 11 gated ones).
- Baseline: backend e2e specs live in `backend/test/` and run through `vitest.config.e2e.ts`; `npm test` in `backend/` skips `*.e2e-spec.ts`.

## Desired End State

- A new e2e spec composes the real `AppModule` with the real `AuthGuard`, `ProfilesService` and `AdminUsersService`. Its route table is discovered from the running app, never copied from the controllers: every discovered route outside a hand-written public allowlist answers 403 to a blocked member (including with an invalid body and on `/admin/*`), 401 to a missing or forged token, and does not answer 401 or 403 to an active member.
- The same spec shows the member's still-valid token refused on every gated route right after an admin blocks them through the real endpoint, a failed ban answering 502 with the member still refused and the state visible in the admin list, a retry repairing it, and blocked requests never touching the generation quota.
- `plan-generation.e2e-spec.ts` proves, over HTTP, that concurrent same-user starts yield one 202 and the rest `active_job`, that the sixth sequential start after five finished or failed jobs is `daily_limit`, that the window slides, and that a fresh app instance (a restart) grants the full quota again.
- A new e2e spec runs hostile goals through the real pipeline with a scripted fake model: the model sees the goals only inside one `<goals>` block with no angle brackets, an injection-obeying model ends `failed` with `invalid_output` on both passes, and a completed plan satisfies catalog and structure rules.
- `test-plan.md` §6.4 tells the next contributor how to add such tests, and its known gaps say what is deliberately not covered. A recorded manual smoke with two real accounts shows what the database flag does to a live session.

### Key Discoveries:

- The route list can be read from the live app: `app.getHttpAdapter().getInstance().router.stack` filtered to layers that carry a `route`, with `route.methods` and `route.path` (Express 5.2.1; spike on this commit).
- `AuthGuard` runs before the body pipe and before `AdminGuard`, so a blocked member gets 403 even with an invalid body and even on `/admin/*`, where an active member gets the 404 disguise (`backend/src/auth/admin.guard.ts:18-22`).
- The existing real-guard slice uses `vi.fn` for `verify` and `resolve` with one fixed return (`backend/test/admin-users.e2e-spec.ts:477-483`); the new spec uses the real `ProfilesService` over a fake profile table and a `verify` that maps a bearer token to a user, so one table serves the guard, the admin block endpoint and the next request.
- `FakeProfileTable` (`backend/test/admin-users.e2e-spec.ts:64-131`) implements `findMany`, `findUnique` and `updateMany`; the real `ProfilesService` additionally needs `create` and `update` (`backend/src/profiles/profiles.service.ts:10-41`).
- Body parsing is asynchronous but `tryAcquire` to `store.create` is synchronous, so a burst of same-user POSTs genuinely interleaves at the HTTP layer and is serialised only by the handler; that is what a concurrency test exercises.
- A scripted fake `PlanModelClient` already exists in `backend/src/plan-generation/plan-pipeline.service.spec.ts:115-203`, with `buildPlan`, `buildPlanWith` and a six-slug `CATALOG`; it records every `system` and `prompt`. It is file-local, so the new spec copies a trimmed version.
- A fake model client returns its output without going through the zod schema, so an off-catalog slug reaches the validator branch; the real client's schema would reject it earlier. The validator is the second gate, and the injection test pins that it is reachable at HTTP.
- Rules to follow: no code comments, `const` arrow functions, Prettier single quotes and trailing commas in `backend/`, the lesson that access decisions key on `Profile.id` and never email (`context/foundation/lessons.md`).

## What We're NOT Doing

- Any production change. A blocked user's open stream (up to 240 s) and running job (up to 10 min) continue after a block; every new request is refused. This is recorded as a known gap, not pinned by a test and not fixed (decided; it matches the archived block plan's out-of-scope list).
- Persisting the daily counter or the job store. The restart reset is asserted as accepted MVP behaviour and documented (decided); a durable limit is a separate product decision.
- Pinning the two acknowledged injection weaknesses with characterization tests: injected-but-valid text inside `goal`, `title`, `reps` and `note`, and the unescaped `<draft_plan>` embed in the review prompt. Both go to the cookbook known gaps (decided).
- Asserting that a real model resists an injection (non-deterministic). Only deterministic invariants are asserted.
- Unblocking: no unblock endpoint exists and none is added; the smoke cleans up with SQL and the Supabase dashboard.
- Multi-instance limiter behaviour, which is unreachable on the current single-machine deploy.
- Supabase's own sign-in and ban behaviour beyond the one manual smoke (`test-plan.md` §7 excludes the provider).
- Stryker or any mutation-testing setup (decided: deliberate-break checks only).
- A shared test-helper module; the new specs carry their own fakes, as the existing e2e specs do.
- Backporting the research's wording correction to `test-plan.md` §2 ("N+1th parallel generation") and the §3 status flip; that is a `/10x-test-plan` step after this change.
- Frontend tests and a browser e2e.

## Implementation Approach

Order is by risk and by dependency: the route table first (Risk #6, High × Medium, the harness every later Risk #6 test reuses), then the block flow on the same harness, then the limit tests (Risk #5, extending the existing spec in place), then the injection fixture (Risk #5, the only phase that needs a real pipeline in HTTP), then the cookbook and the manual smoke. Each test is written from the requirement, not from the code under test: the oracle for Risk #6 is the PRD guardrail "a blocked user truly loses access" (`prd.md:39`) and FR-003; for the limits it is "1 active job and 5 per 24 h per user" (`context/archive/2026-10-14-first-plan-generation/plan-brief.md:29`); for injection it is the catalog and structure rules, not any model behaviour. Users are hand-written UUID constants, the public allowlist is hand-written, and expected quota numbers are literals. Every test phase ends with deliberate-break checks: break the production code in the worktree only, confirm the named tests go red, restore.

Decisions taken in the interview: the stream and running-job continuation is a known gap with no production change; the restart reset is asserted with a second app instance and documented; the injection fixture asserts the deterministic invariant and leaves in-bounds free text and the unescaped draft embed as known gaps; quality is gated by deliberate-break checks; the change closes with a manual two-account block smoke.

## Critical Implementation Details

- **Running the e2e specs:** `npm test` in `backend/` skips `*.e2e-spec.ts`; every backend criterion names `npm run test:e2e` or `npx vitest run --config ./vitest.config.e2e.ts <files>` explicitly.
- **Booting the real `AppModule`:** the module reads env at construction (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL`) and `PrismaService` connects in `onModuleInit`; set the env in `beforeAll` before the module is compiled, restore it in `afterAll`, and override `PrismaService` so nothing connects. No JWKS request is made at construction.
- **Route discovery must not be vacuous:** a hand-written floor check (the PRD-named routes `POST /plan-generations`, `GET /plan-generations/:jobId/events`, `GET /saved-plans`, `GET /me`, `GET /admin/users` are all discovered) guards against a framework upgrade changing the stack shape and the table silently iterating over nothing. Do not assert the exact count of routes.
- **Faking only `Date`:** the window-slide test advances `Date` only (`vi.useFakeTimers({ toFake: ['Date'] })`), restored in `afterEach`, so supertest and the event loop keep real timers.
- **Concurrent requests:** fire the burst with `Promise.all`; if supertest's per-request listen proves flaky under concurrency, listen once with `app.listen(0, '127.0.0.1')` as the existing spec does for the live stream (`backend/test/plan-generation.e2e-spec.ts:377`) and send the burst with `fetch`.

## Phase 1: Route table with the real guard (Risk #6)

### Overview

Prove that a blocked member is refused on every gated route and that the table follows the live app. One new spec, no production change. This phase builds the harness the next phase reuses.

### Changes Required:

#### 1. Harness: the real application with per-request profiles

**File**: `backend/test/access-control.e2e-spec.ts` (new)

**Intent**: Compose the real `AppModule` so a newly added controller is covered without touching the test, with only the edges faked, and let one fake profile table serve the guard, the block endpoint and the next request.

**Contract**: `Test.createTestingModule({ imports: [AppModule] })` with `overrideProvider` for: `PrismaService` (a fake with a `profile` table implementing `findUnique`, `create`, `update`, `updateMany`, `findMany` with `select` projection, plus `$queryRaw` resolving for `/health` and an empty `savedPlan` stub); `SupabaseJwtVerifier` (`verify(token)` returns `{ id, email }` for a hand-written token map and throws `UnauthorizedException` otherwise, mirroring the real verifier's refusal); `SupabaseAdminClient` (`banUser: vi.fn()` resolving); `PlanPipelineService` (`run` returning a never-resolving promise, as in `backend/test/plan-generation.e2e-spec.ts:76`). Real: `AuthGuard`, `ProfilesService`, `AdminGuard`, `AdminUsersService`, `PlanJobStore`, `PlanLimiter`. Fixed UUID constants for an active member, a blocked member (`blockedAt` set in the seed), an active admin and a second active member; tokens are hand-written strings mapped to those ids. A small helper sends a request with a given token, an invalid or empty body on POST and PATCH, and a well-formed unknown UUID substituted for every `:param`.

#### 2. Route table cases

**File**: `backend/test/access-control.e2e-spec.ts`

**Intent**: Assert the invariant over the discovered routes, in one test per property with the failures collected as `METHOD path -> status` so a red run names the route.

**Contract**: `discoverRoutes(app)` reads `app.getHttpAdapter().getInstance().router.stack`, keeps layers with a `route` and returns `{ method, path }` pairs; a hand-written allowlist `['GET /', 'GET /health']` separates public from gated; admin routes are classified by the `/admin/` path prefix. Properties: (a) the discovered set contains the hand-written floor of PRD-named routes; (b) blocked member with a valid token: every gated route answers 403 with body message `Account is blocked`, including `POST` with an invalid body and every `/admin/*` route (403, not the 404 disguise), and the fake `PlanPipelineService.run` and `PrismaService` write methods are never called; (c) no `Authorization` header and a forged token: every gated route answers 401, and a blocked member's token that fails verification answers 401, never 403; (d) active member: every discovered gated route outside `/admin/` answers neither 401 nor 403, active admin `GET /admin/users` answers 200 (this is the control that stops the table passing for the wrong reason); (e) public routes: `GET /` and `GET /health` answer 200 to a blocked member's token and to no token.

**Deviation (2026-11-04):** The blocked-member and unauthenticated properties are split into several smaller tests (all gated routes, `/admin/*` only, no writes; no header, forged token, failing-verification token) so a red run points at one property, and a fake saved-plan table with spied writes replaces the empty stub. There is no separate public-allowlist test: a stray `@Public()` is caught by the blocked-member and 401 tables, where `GET /me` then answers 500 because `@CurrentUser()` is undefined on a public route. Break check 1.6 therefore goes red in those tests, naming `GET /me`.

### Success Criteria:

#### Automated Verification:

- New spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/access-control.e2e-spec.ts`
- Full backend e2e suite passes: `cd backend && npm run test:e2e`
- Backend unit suite passes: `cd backend && npm test`
- Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual Verification:

- Deliberate-break check: remove the `blockedAt` check from `backend/src/auth/auth.guard.ts`; the blocked-member test goes red and names every gated route; restore the file
- Deliberate-break check: add `@Public()` to `MeController`; the public-allowlist test goes red naming `GET /me`; restore the file
- Read the red output of the first break and confirm each failure line names a route and a status, not a bare mismatch

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Block takes effect and half-applied block (Risk #6)

### Overview

Prove the lifecycle around the guard on the same harness: a block applied through the real admin endpoint refuses the member's still-valid token on the next request, a failed Supabase ban is visible and repairable and leaves the member refused, and blocked requests never touch the quota. No production change.

### Changes Required:

#### 1. Block through the real endpoint, same token refused

**File**: `backend/test/access-control.e2e-spec.ts`

**Intent**: Show the "immediately" and "still-valid token" halves of the risk as one observable sequence rather than as two unit facts.

**Contract**: An active member's token first answers `GET /me` with 200. The admin token then posts `/admin/users/<member>/block` (200, `blockedAt` set on the fake row). The same member token then answers 403 on every gated route (reusing the Phase 1 helper), and the fake `verify` is observed to have accepted that same token, which shows the refusal comes from the profile, not from token invalidation. A second member's token is unaffected (200 on `GET /me`).

#### 2. Half-applied block: failed ban is visible and repairable

**File**: `backend/test/access-control.e2e-spec.ts`

**Intent**: Prove the state between the database write and the Supabase ban is refused, visible and repairable, at HTTP level with the real guard (existing tests cover it only with a fake guard).

**Contract**: With `banUser` rejecting once, `POST /admin/users/<member>/block` answers 502 with a body that does not contain the rejection's message; the member row has `blockedAt` set; the member's token is refused (403) on every gated route; `GET /admin/users` as the admin lists that member with a non-null `blockedAt`. With `banUser` resolving, a repeat of the same POST answers 200, keeps the original `blockedAt` and `banUser` has been called twice.

#### 3. Edge cases around the guard

**File**: `backend/test/access-control.e2e-spec.ts`

**Intent**: Pin the two edges research found untested: a blocked member must not consume quota, and the profile email refresh must not clear a block.

**Contract**: Three `POST /plan-generations` by a blocked member answer 403, `PlanPipelineService.run` is never called and `app.get(PlanJobStore).hasActive(<member>)` is false. A blocked member whose token carries a different email than the stored row is refused (403) and the row keeps its original `blockedAt`.

### Success Criteria:

#### Automated Verification:

- Spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/access-control.e2e-spec.ts`
- Full backend e2e suite passes: `cd backend && npm run test:e2e`
- Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual Verification:

- Deliberate-break check: skip the `blockedAt` write in `AdminUsersService.block` (keep the ban); the block-then-refused test goes red; restore the file
- Deliberate-break check: make `AdminUsersService.block` swallow a ban failure and return the summary; the 502 test goes red; restore the file
- Deliberate-break check: add `blockedAt: null` to the email update in `ProfilesService.resolve`; the changed-email test goes red; restore the file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase.

---

## Phase 3: Limits at HTTP level (Risk #5)

### Overview

Prove over HTTP what the limiter does under a burst, at its daily boundary and across a restart. The new cases extend the existing plan-generation e2e spec in place; no production change.

### Changes Required:

#### 1. Build the app through a function

**File**: `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Let one test build a second application instance (the restart) from the same module definition without duplicating it.

**Contract**: Move the module construction in `beforeEach` into a local `createApp()` that returns the app and its `pipelineRun` mock; `beforeEach` calls it and keeps its current behaviour, so every existing test is unchanged.

#### 2. Concurrent same-user starts

**File**: `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Prove the one-generation-at-a-time rule is exact under a burst, which the existing single `active_job` case cannot show.

**Contract**: Six simultaneous `POST /plan-generations` for `user-1` (fired with `Promise.all`) answer exactly one 202 and five 429 with body `{ code: 'active_job' }`; `pipelineRun` is called once. A simultaneous request for `user-2` in the same burst answers 202.

#### 3. Daily limit and sliding window

**File**: `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Prove the 5-per-rolling-24h limit at HTTP level, counting failed jobs, which only unit and controller specs cover today.

**Contract**: Five sequential starts by `user-1` each answer 202 and are finished through `app.get(PlanJobStore)` between requests (alternating `complete` and `fail`); the sixth answers 429 `{ code: 'daily_limit' }` and `pipelineRun` has been called five times; `user-2` still answers 202. With `Date` faked, advancing less than 24 hours since the first start still answers `daily_limit`, advancing past 24 hours answers 202.

#### 4. A restart resets the quota

**File**: `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Make "behaviour of the limit across a restart is known" an executable statement of the accepted MVP behaviour.

**Contract**: After `user-1` is refused with `daily_limit` on the first app instance, a second instance built by `createApp()` answers that user's start with 202 and calls its own `pipelineRun`; the first instance still answers 429. The test title states that the reset is the in-memory design, so a future persisted limit knowingly turns it red.

**Deviation (2026-11-04):** The burst test listens on a real port (`app.listen(0, '127.0.0.1')`) and sends the requests with `request(baseUrl)`, because plain supertest per-request listen failed with `read ECONNRESET` under concurrency (the plan's allowed fallback). Its burst includes the `user-2` request, so `pipelineRun` is asserted twice (one start per user), not once. Break check 3.5 as written (a bare `await` between `tryAcquire` and `store.create`) stayed green: `await Promise.resolve()` and a `setImmediate` yield resume before the next request reaches the handler, so nothing interleaves. A real time-yielding await (`setTimeout` of 5 ms or 25 ms, standing in for a database call) turns the burst test red; that is the break to use for 3.5.

### Success Criteria:

#### Automated Verification:

- Spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/plan-generation.e2e-spec.ts`
- Full backend e2e suite passes: `cd backend && npm run test:e2e`
- Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual Verification:

- Deliberate-break check: remove the `hasActive` denial from `PlanLimiter.tryAcquire`; the concurrent-burst test goes red; restore the file
- Deliberate-break check: make `PlanGenerationController.start` async with an `await` between `tryAcquire` and `store.create`; the concurrent-burst test goes red; restore the file
- Deliberate-break check: make `startsByOwner` a `static` map in `PlanLimiter`; the restart test goes red; restore the file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase.

---

## Phase 4: Injection fixture through the real pipeline (Risk #5)

### Overview

Prove the deterministic invariant behind injection resistance: hostile goals text reaches the model only inside the goals block, and whatever an injection-obeying model returns, a job never completes with output that breaks catalog or structure rules. One new spec running the real `PlanPipelineService` over a scripted fake model; no production change.

### Changes Required:

#### 1. Harness: real pipeline over a scripted model

**File**: `backend/test/plan-generation-injection.e2e-spec.ts` (new)

**Intent**: Run hostile goals through the real controller, limiter, store and pipeline, which no HTTP test does today, with only the model and the catalog faked.

**Contract**: A testing module with `PlanGenerationController`, real `PlanJobStore`, `PlanLimiter` and `PlanPipelineService`, `{ provide: PlanModelClient, useValue: fake }`, `{ provide: ExercisesService, useValue: { findAll } }` returning a hand-written six-slug catalog, the same `PLAN_GENERATION_CONFIG` and `PLAN_STREAM_CONFIG` literals as `backend/test/plan-generation.e2e-spec.ts`, and a header guard as `APP_GUARD`. The fake is a trimmed copy of `FakePlanModelClient` (`backend/src/plan-generation/plan-pipeline.service.spec.ts:115-170`): a queue of replies, every `PlanModelRequest` recorded with its `system` and `prompt`. A helper starts a generation with a given goals string and waits with `vi.waitFor` until `GET /plan-generations/:jobId` leaves `running`. Plan fixtures are hand-written builders with fresh objects per call and a form whose current and desired frequency are both 3.

#### 2. Hostile goals reach the model only as data

**File**: `backend/test/plan-generation-injection.e2e-spec.ts`

**Intent**: Assert the prompt-side invariant at HTTP level on the draft and the review prompt without mirroring the sanitiser's regex.

**Contract**: `it.each` over three hand-written hostile goals (a closing-tag escape with an instruction, the same with fullwidth brackets and newlines, and JSON-looking text) with a valid scripted plan for both passes: the job completes; in both recorded prompts there is exactly one `<goals>` and one `</goals>`, the text between them is non-empty, contains no `<`, `>`, U+FF1C, U+FF1E or line break, and still contains the harmless words of the input; the recorded `system` prompts contain no part of the hostile goals. A separate `it.each` over a 501-character goals, a goals containing NUL and a non-string goals answers 400 with the value not echoed and the fake model never called.

#### 3. An injection-obeying model cannot produce a completed plan

**File**: `backend/test/plan-generation-injection.e2e-spec.ts`

**Intent**: Assert that output validation still gates, on both passes, whatever the goals said.

**Contract**: `it.each` over pass (draft, review) and violation (a slug outside the catalog, 9 weeks): the scripted model returns the violating plan for every attempt of that pass (two attempts per pass); the job ends `failed` with error code `invalid_output`, `plan` is null, and the review-only case shows the valid draft is not used as a fallback. One more case: hostile goals with a fully valid scripted plan completes with 8 weeks and every exercise slug in the hand-written catalog slug list.

### Success Criteria:

#### Automated Verification:

- New spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/plan-generation-injection.e2e-spec.ts`
- Full backend e2e suite passes: `cd backend && npm run test:e2e`
- Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual Verification:

- Deliberate-break check: remove the angle-bracket stripping from `sanitizeGoals` in `plan.prompts.ts`; the prompt-invariant test goes red for both prompts; restore the file
- Deliberate-break check: make `PlanPipelineService.tryAttempt` return the plan whether or not validation passed; the obeying-model table goes red; restore the file
- Deliberate-break check: make the review pass fall back to the draft when the review output is invalid; the review-only case goes red; restore the file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase.

---

## Phase 5: Cookbook, known gaps and manual block smoke

### Overview

Write down how to add these tests and what they deliberately do not cover, and record the only real-Supabase evidence for the block.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` in §6.4 with the patterns shipped, in the shape of §6.2 and §6.3, and add two or three lines to §6.6 on what the phase taught.

**Contract**: §6.4 gains Location, Pattern (route table derived from the live app against a public allowlist with a hand-written floor; real guard with a profile table and a token-to-user `verify`; concurrent burst; sequential daily-limit table with finished and failed jobs; restart as a second app instance; hostile goals through a real pipeline over a scripted model), Mocking policy (fake only the edges: Prisma, the verifier, the Supabase admin client, the model client; never fake the guard in a spec that claims to cover it), Reference tests, Run locally, Not automated, and Known gaps: the open stream and running job continuing after a block (up to 240 s and 10 min), the restart quota reset as accepted MVP behaviour (and the unreachable multi-instance split), injected-but-valid text inside `goal`, `title`, `reps` and `note`, the unescaped `<draft_plan>` embed and sanitiser coverage of other bracket lookalikes, no real database and no real Supabase beyond the smoke, and that a blocked-user sign-in rejection is Supabase's behaviour (`test-plan.md` §7). Remove nothing from §6.5. §3 and §2 are not edited here.

#### 2. Manual block smoke

**File**: `context/changes/testing-access-control-and-abuse-limits/plan.md` (this file, a result note under this phase)

**Intent**: Observe on a real Supabase project that the database flag beats a live session and that the real ban holds, which the hermetic tests can only infer.

**Contract**: With one admin account and one member account on the deployed app: sign the member in and keep the session open; as admin block the member on `/admin/users` and confirm the row shows `Status: Blocked`; in the member's still-open session reload or navigate and observe the sign-out with the blocked banner; send `GET /me` with the member's still-valid access token and observe 403 `Account is blocked`; try to sign in again as the member and record the exact rejection wording; then clean up by clearing `blockedAt` in SQL and lifting the Supabase ban. Record the outcome as a dated result note.

### Success Criteria:

#### Automated Verification:

- Backend unit and e2e suites pass: `cd backend && npm test && npm run test:e2e`
- Section 6.4 no longer contains a `TBD`: `awk '/### 6.4/,/### 6.5/' context/foundation/test-plan.md | grep -c TBD` prints 0

#### Manual Verification:

- Manual block smoke executed against a real Supabase project and its result recorded under this phase
- Known gaps in section 6.4 read and confirmed by the human as the intended stance
- The test account used in the smoke is unblocked and signs in again

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- None added. Unit coverage of the guard, the limiter boundaries, the prompt builders and the schema already exists; the gaps are all at HTTP level.

### Integration Tests:

- Route table over the live app with the real guard: blocked 403 everywhere, 401 for missing or forged tokens, active member passes the guard, public routes stay open (Phase 1).
- Block lifecycle: block then same-token refusal, failed ban 502 then visible and repairable, blocked requests never consume quota, a changed email does not clear a block (Phase 2).
- Limits: one 202 and five `active_job` under a burst, `daily_limit` after five finished or failed jobs, the window slides, a restart resets (Phase 3).
- Injection: hostile goals only as data in both prompts, an obeying model never completes a plan, valid output satisfies catalog and structure rules (Phase 4).

### Manual Testing Steps:

1. Run the block smoke from Phase 5 against the deployed app with two real accounts.
2. For each test phase, run the deliberate-break checks listed in its manual verification and restore the code.

## Performance Considerations

None. The new specs boot the real `AppModule` once per file or per case with faked edges; the route table makes roughly 11 requests per property.

## Migration Notes

None. No production code, schema or data changes.

## References

- Related research: `context/changes/testing-access-control-and-abuse-limits/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (risks #6 and #5), §3 Phase 3, §6.4
- Block design: `context/archive/2026-10-31-admin-block-user/plan.md`
- Limit design: `context/archive/2026-10-14-first-plan-generation/plan-brief.md:29`
- Real-guard slice to build on: `backend/test/admin-users.e2e-spec.ts:464-518`
- Scripted fake model to copy: `backend/src/plan-generation/plan-pipeline.service.spec.ts:115-203`
- Prior phase conventions: `context/changes/testing-saved-plan-durability-and-ownership/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Route table with the real guard (Risk #6)

#### Automated

- [x] 1.1 New spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/access-control.e2e-spec.ts` — 8c165b6
- [x] 1.2 Full backend e2e suite passes: `cd backend && npm run test:e2e` — 8c165b6
- [x] 1.3 Backend unit suite passes: `cd backend && npm test` — 8c165b6
- [x] 1.4 Lint and type check pass: `cd backend && npm run lint && npm run build` — 8c165b6

#### Manual

- [x] 1.5 Deliberate-break check: remove the `blockedAt` check from `backend/src/auth/auth.guard.ts`; the blocked-member test goes red and names every gated route; restore the file — 8c165b6
- [x] 1.6 Deliberate-break check: add `@Public()` to `MeController`; the public-allowlist test goes red naming `GET /me`; restore the file — 8c165b6
- [x] 1.7 Read the red output of the first break and confirm each failure line names a route and a status, not a bare mismatch — 8c165b6

### Phase 2: Block takes effect and half-applied block (Risk #6)

#### Automated

- [x] 2.1 Spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/access-control.e2e-spec.ts` — d845e96
- [x] 2.2 Full backend e2e suite passes: `cd backend && npm run test:e2e` — d845e96
- [x] 2.3 Lint and type check pass: `cd backend && npm run lint && npm run build` — d845e96

#### Manual

- [x] 2.4 Deliberate-break check: skip the `blockedAt` write in `AdminUsersService.block` (keep the ban); the block-then-refused test goes red; restore the file — d845e96
- [x] 2.5 Deliberate-break check: make `AdminUsersService.block` swallow a ban failure and return the summary; the 502 test goes red; restore the file — d845e96
- [x] 2.6 Deliberate-break check: add `blockedAt: null` to the email update in `ProfilesService.resolve`; the changed-email test goes red; restore the file — d845e96

### Phase 3: Limits at HTTP level (Risk #5)

#### Automated

- [x] 3.1 Spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/plan-generation.e2e-spec.ts`
- [x] 3.2 Full backend e2e suite passes: `cd backend && npm run test:e2e`
- [x] 3.3 Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual

- [x] 3.4 Deliberate-break check: remove the `hasActive` denial from `PlanLimiter.tryAcquire`; the concurrent-burst test goes red; restore the file
- [x] 3.5 Deliberate-break check: make `PlanGenerationController.start` async with an `await` between `tryAcquire` and `store.create`; the concurrent-burst test goes red; restore the file
- [x] 3.6 Deliberate-break check: make `startsByOwner` a `static` map in `PlanLimiter`; the restart test goes red; restore the file

### Phase 4: Injection fixture through the real pipeline (Risk #5)

#### Automated

- [ ] 4.1 New spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/plan-generation-injection.e2e-spec.ts`
- [ ] 4.2 Full backend e2e suite passes: `cd backend && npm run test:e2e`
- [ ] 4.3 Lint and type check pass: `cd backend && npm run lint && npm run build`

#### Manual

- [ ] 4.4 Deliberate-break check: remove the angle-bracket stripping from `sanitizeGoals` in `plan.prompts.ts`; the prompt-invariant test goes red for both prompts; restore the file
- [ ] 4.5 Deliberate-break check: make `PlanPipelineService.tryAttempt` return the plan whether or not validation passed; the obeying-model table goes red; restore the file
- [ ] 4.6 Deliberate-break check: make the review pass fall back to the draft when the review output is invalid; the review-only case goes red; restore the file

### Phase 5: Cookbook, known gaps and manual block smoke

#### Automated

- [ ] 5.1 Backend unit and e2e suites pass: `cd backend && npm test && npm run test:e2e`
- [ ] 5.2 Section 6.4 no longer contains a `TBD`: `awk '/### 6.4/,/### 6.5/' context/foundation/test-plan.md | grep -c TBD` prints 0

#### Manual

- [ ] 5.3 Manual block smoke executed against a real Supabase project and its result recorded under this phase
- [ ] 5.4 Known gaps in section 6.4 read and confirmed by the human as the intended stance
- [ ] 5.5 The test account used in the smoke is unblocked and signs in again
