# Generation Outcome Integrity Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` ("Generation outcome integrity", Risks #2 and #1). Add the tests that pin how a plan generation ends: on the server, every unusable model result ends as a failed job with no plan (Risk #2); on the client, every way a job can vanish or the server can fail ends in an honest, bounded state (Risk #1). One small production change is included by decision: a structural guard so a malformed completed plan can no longer render as a normal success. The change also closes with a manual smoke on the real Fly deployment and fills the first cookbook entry.

## Current State Analysis

Research (`research.md`) found the server mostly protected and the tests thin; the client's restart behaviour depends on the HTTP status of the first failed request and has no test at the layer that carries it.

- Server: a job becomes `completed` in one place, only after the final review-pass plan passed `validateGeneratedPlan` (`backend/src/plan-generation/plan-pipeline.service.ts:84-91`, `:158-176`). The catalog is enforced twice: `z.enum` (`plan.schema.ts:16`) and the validator (`plan.validator.ts:70`).
- Server tests: the only bad-output fixture at pipeline level is `rampViolation` (`plan-pipeline.service.spec.ts:74`), built to trip the validator's own frequency rule. Off-catalog, 7 or 9 weeks, `weeks: []`, an empty-session week and a 2-exercise session are tested at validator level only. No test asserts that a completed plan's slugs belong to the catalog.
- Client: the watch loop maps 404 to `not-found`, and a cut stream, 5xx or refused connection to `failed`, then back-off, polling and `error` with a generic message and Retry (`frontend/src/lib/plan-generation-stream.ts:52-53`, `:62`, `:76`; `plan-generation-watch.ts:77-120`, `:146-199`). There is no spec for `plan-generation.ts`, `plan-generation-stream.ts` or `plan-generation-watch.ts`. `PlanGenerationPage.spec.tsx` mocks the whole watch layer and covers only the Save control.
- Client last mile: a completed snapshot with any truthy `plan` is accepted (`plan-generation-watch.ts:43-46`), the snapshot body is cast without validation (`plan-generation.ts:123`), and there is no error boundary. Probed in this planning session: `{ weeks: [] }` and `{}` both end in `completed`; only `null` ends in `error`.

## Desired End State

- A table of independently written bad plans, run through both the draft and review passes, proves each ends `failed` / `invalid_output` / no plan with the expected number of model calls; a clean run proves every output exercise resolves to its catalog entry.
- A watch-loop spec proves the client's outcome for each way a job can vanish or the server can fail, within bounded time, without a browser.
- A completed generation whose plan is not renderable ends in the existing `error` state instead of rendering.
- A page-level integration spec proves the user-visible text for a restart mid-run and for an outage, using the real watch layer.
- A recorded manual smoke on Fly shows what the user actually sees on a restart, and `test-plan.md` §6.1 tells the next contributor how to add such a test.

### Key Discoveries:

- The watch loop uses `window.setTimeout` and `Date.now()`; `*.spec.ts` files run in the node environment where `window` is undefined, and `*.spec.tsx` files run under jsdom (`frontend/vite.config.ts`, projects `unit` and `components`). Probed: under jsdom `window === globalThis`, `Response`, `ReadableStream`, `TextDecoder` and `AbortSignal.any` exist, and fake timers drive the back-off, polling and 30-second silence timer.
- Probed: `AbortSignal.timeout` is not advanced by fake timers (`plan-generation.ts:113` snapshot timeout), so a hung snapshot request cannot be simulated; mocked responses must resolve.
- Probed: one mock must answer by URL: the stream request (`/events`) needs a stream body, snapshot polls need JSON. A stream mock that ignores the abort signal never lets the 30-second silence path finish, because a real `fetch` body errors on abort.
- Probed outcomes with fake timers: 404 gives `["running","not-found"]`; a cut stream then 404 gives `["running","running","not-found"]` in 2 calls; 502 on every request gives `["running","error"]` in 6 calls; a silent stream with running snapshots gives `["running","timed-out"]`; a `reconnect` frame then 404 gives `["running","not-found"]` in 2 calls.
- The pipeline fake returns typed `GeneratedPlan` objects directly, bypassing zod (`plan-pipeline.service.spec.ts:90`), so all six bad plans are representable without casts and only the validator can reject them at that layer. The fake streams 8 week events for any plan, so assert outcomes, not week events, for 7- and 9-week plans.
- Removing the week-count check does not turn the 7-week or the empty-plan case red, because the frequency rule still rejects them (`plan.validator.ts:115-121`, `:29`); only the 9-week case isolates the week-count check.
- `isAdminUser` (`frontend/src/lib/admin-users.ts:29`) is the precedent for a structural guard returning `value is T`.
- `backend/test/` is excluded from the build and the Docker image and is collected by neither Vitest config; `backend/src/` helpers would ship. No helper-file precedent exists in either location.
- Rules to follow: no code comments, function expressions (`const` arrows), Prettier single quotes and trailing commas in `backend/`, no semicolons in `frontend/`, and the lesson in `lessons.md` that persisted plan shapes change additively only.

## What We're NOT Doing

- A real-SDK test that `z.enum` rejection surfaces through the model client; it needs a stubbed provider and the validator already covers the same outcome at the layer under test.
- A guard on the saved-plan page or its fetch (`fetchSavedPlan` casts without validation); that belongs to test-plan Phase 2 (Risk #3).
- A router error element or error boundary (decided against in this interview).
- A presentational split of `PlanGenerationPage` and kitchen-sink states for it. The UI contract asks for every state in the kitchen sink and the generation page has none; this is a separate UI change and is flagged here.
- Replacing the raw Retry `<button>` with the shared `Button` (`PlanGenerationPage.tsx:192`).
- A "Reconnecting…" notice or any other outage indicator; the stale "Drafting…" display for up to about two minutes during an outage is accepted and recorded (decided in this interview).
- Changing the wording or behaviour for a failure during a deploy. The generic message with Retry is kept and pinned; the Fly smoke in Phase 5 measures what happens before any copy change is considered (decided in this interview).
- Graceful shutdown (`enableShutdownHooks`), distinguishing "lost on restart" from "unknown" in the server's 404, or a backend job-store reset test (it repeats existing unknown-id assertions).
- Limiter-on-restart and injection tests (test-plan Phase 3), and shared test helpers outside the existing spec (decided in this interview).
- Pinning the unknown-snapshot-status behaviour; the server's job view has three statuses.
- Testing the 10-second snapshot timeout (a real timer the fake clock does not advance) and any browser e2e.

## Implementation Approach

Order is by risk and by dependency: the server table first (Risk #2, High × High), then the client watch loop (Risk #1, High × High), then the guard that depends on the watch spec scaffolding, then the page-level tests that sit on top of both, then the manual smoke and the cookbook. Each test is written from the requirement, not from the code under test: bad plans come from the PRD rules (8 weeks, catalog-only exercises, 3-10 exercises per session), SSE frames and snapshot bodies are written by hand from the wire format, and expected states come from the user-visible requirement ("never endless progress, never a broken plan shown as success"). Every test phase ends with deliberate-break checks: break the production code in the worktree only, confirm the named tests go red, restore.

Decisions taken in the interview: guard in the watch layer (not a router error element); keep the generic failure message with Retry and measure on Fly before any wording change; extend the existing pipeline spec instead of creating a shared helper; accept and record the stale-progress display.

## Critical Implementation Details

- **Test environment:** the watch-loop and watch-integration specs must be `*.spec.tsx` so the jsdom project runs them, even though they contain no JSX; the pure guard spec is `*.spec.ts` and runs under node. No config change is needed or wanted.
- **Mock shape:** mock `./api` (or `../lib/api` from the pages folder) once; route by URL suffix `/events`; give the stream an abort-aware body (error the stream controller when `init.signal` aborts); keep every snapshot response resolving immediately.
- **Awaiting the watch:** never await the watch promise unconditionally. Record a `settled` flag with `.then`, advance fake time, and assert both the flag and the last state, so a missing time cap fails the test instead of hanging it.
- **Pipeline cases:** bad plans must be fresh objects per call (the fake dequeues replies and tests mutate plans elsewhere in the spec).

## Phase 1: Pipeline bad-output table (backend, Risk #2)

### Overview

Pin that every unusable model output ends the job as `failed` with `invalid_output` and no plan, in both passes, and that a completed plan's exercises resolve to the catalog. All changes are in one spec; no production code changes.

### Changes Required:

#### 1. Bad-plan builders and table

**File**: `backend/src/plan-generation/plan-pipeline.service.spec.ts`

**Intent**: Add local builders next to `buildPlan` (`:55`) that produce a fresh valid 8-week plan and let a case change exactly one thing, then a table of six bad plans written from the requirements, not from validator branches.

**Contract**: Cases: an exercise slug that is not in `CATALOG` (`moon-walk`); 7 weeks; 9 weeks; `weeks: []`; one week with `sessions: []`; one session with 2 exercises. Each builder returns a new object per call and is typed `GeneratedPlan`. `buildPlan(counts)` keeps its signature and callers.

#### 2. Failure-mode cases through both passes

**File**: `backend/src/plan-generation/plan-pipeline.service.spec.ts`

**Intent**: Add one `describe` with `it.each` over the table, run once for the drafting pass and once for the reviewing pass, asserting the user-relevant outcome.

**Contract**: Drafting pass: reply queue `[bad, bad]`; expect 2 model calls, `job.status === 'failed'`, `job.error` equal `{ code: 'invalid_output' }`, `job.plan` null, and the terminal event `failed` with that code. Reviewing pass: reply queue `[buildPlan(), bad, bad]`; expect 3 calls, the same job outcome, and `job.plan` null (the draft is not returned). For the off-catalog case also assert that the retry prompt (`client.calls[1].prompt` for drafting, `client.calls[2].prompt` for reviewing) contains the offending slug `moon-walk` taken from the fixture, and add one recovery case: `[offCatalog, buildPlan(), buildPlan()]` completes in 3 calls. Do not assert validator message text or week events.

#### 3. Clean-run invariant

**File**: `backend/src/plan-generation/plan-pipeline.service.spec.ts`

**Intent**: Add a test to the happy-path group asserting, across every exercise of a completed plan, that the output resolves to the test's own catalog fixture: slug present in `CATALOG`, `name` and `imageKey` equal to that entry's values, 8 weeks numbered 1 to 8. This catches the silent fallbacks in `toPlanResult` (`plan-pipeline.service.ts:198-209`) that would otherwise show `name === slug` and `imageKey === null`.

**Contract**: The reviewed plan uses several catalog slugs across weeks so the check is not satisfied by one entry; the expected values come from the spec's `CATALOG`, not from the service.

**Test sub-phase details** (the grounding the implementer must keep):

- Behavior asserted: a model output that breaks the rules never completes a job; a completed job's exercises all resolve to catalog entries.
- Regression caught: a refactor that drops validation of the final or draft plan, removes the catalog check, or returns the draft after a failed review.
- Research source: `research.md` Sections 1 to 4.
- Edge/error/boundary: 7, 9 and 0 weeks; empty week; 2 exercises; the same bad plan in each pass.
- Anti-pattern avoided: bad outputs derived from the validator's own branches (`rampViolation` stays only for the existing frequency tests); asserting error copy.

**Deliberate-break checks** (worktree only, restore with `git checkout -- <file>`): remove the `catalog.has` issue push in `plan.validator.ts:70-72` (off-catalog cases go red); remove the week-count check at `:115-121` (the 9-week case goes red; the 7-week and empty cases stay green because the frequency rule also rejects them, which is expected); change `toPlanResult` to ignore the catalog join (the invariant test goes red); make `run` complete with `draft` instead of `reviewed` (the reviewing-pass cases go red).

**Deviation (2026-11-04):** the last break check does not turn the reviewing-pass table cases red. An invalid review fails inside `runPass` before `complete` is reached, so completing with `draft` is caught only by the clean-run invariant and the existing "completes with names joined" test (2 red). The reviewing-pass table cases are exercised by two breaks that target them: falling back to the draft when the review pass fails (`.catch(() => draft)` on the review `runPass`, 11 red) and skipping validation in the reviewing pass (`validation.ok || stage === 'reviewing'` in `tryAttempt`, 10 red). All breaks were run and restored.

### Success Criteria:

#### Automated Verification:

- Pipeline spec passes with the new cases: `cd backend && npx vitest run src/plan-generation/plan-pipeline.service.spec.ts`
- Backend unit suite passes: `cd backend && npm test`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

**Implementation Note**: After this phase and its automated verification pass, pause for confirmation before Phase 2. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: Watch-loop outcome tests (frontend, Risk #1)

### Overview

Pin the client's outcome for every way a job can vanish or the server can fail, using the real `watchPlanGeneration`, `streamPlanEvents` and `fetchPlanGeneration` with a mocked `apiFetch` and fake timers. Tests only; no production change.

### Changes Required:

#### 1. Watch spec scaffolding

**File**: `frontend/src/lib/plan-generation-watch.spec.tsx` (new)

**Intent**: Create the spec with the helpers the probes validated: an SSE frame builder from an event object, an abort-aware stream response, a snapshot response builder, a URL-routed `apiFetch` mock, and a runner that collects emitted states and a `settled` flag under fake timers.

**Contract**: `vi.mock('./api', () => ({ apiFetch: vi.fn() }))` as in `saved-plans.spec.ts:14`. The mock routes by whether the path ends in `/events`. Frames carry `id`, `at` and `type` in the `data:` JSON; the `reconnect` frame is `event: reconnect` with `data: {}`. Fake timers are installed per test and restored after; the file is `.spec.tsx` for the jsdom project (see Critical Implementation Details).

#### 2. Outcome cases

**File**: `frontend/src/lib/plan-generation-watch.spec.tsx`

**Intent**: One test per outcome below, each asserting the emitted state sequence the user would see and any bound.

**Contract**:

- 404 on the stream ends in `not-found`.
- A stream that delivers a stage event then closes, followed by a 404 on reconnect, ends in `not-found`, and the second request carries `Last-Event-ID: 1`.
- A `reconnect` frame followed by a 404 ends in `not-found`.
- A terminal `failed` event maps each of the three known codes to `failed` with that code, and an unknown code to `internal`.
- A terminal `completed` event followed by a snapshot with a valid plan ends in `completed` carrying that plan; followed by a snapshot 404 ends in `not-found`; followed by a 500 or a still-running snapshot ends in `error`.
- A 502 (and, separately, a rejected `apiFetch`) on every request ends in `error`, and the watch has settled within 60 seconds of fake time (bounded, not endless).
- Three failing stream attempts followed by polling that returns a `failed` job end in `failed`, and followed by polling that returns a completed job with a valid plan end in `completed`.
- A silent stream (no bytes) with running snapshots ends in `timed-out`; the watch has settled by 12 minutes plus 30 seconds of fake time.
- A 401 on the stream and a 403 on a snapshot poll call the auth handler with that status and emit no terminal state.
- Aborting the signal mid-run stops state emission and further requests.

**Test sub-phase details:**

- Behavior asserted: the user always ends in a terminal, honest state within bounded time; a lost job is reported as not-found.
- Regression caught: a change to status mapping, the escalation thresholds, the time cap, the reconnect header or the auth hand-off.
- Research source: `research.md` Section 6; probe results in Key Discoveries.
- Edge/error/boundary: stream cut vs `reconnect` frame, refused vs 5xx, polling settle paths, time cap, unknown failure code.
- Anti-pattern avoided: feeding canned states (these tests drive the real loop), asserting a mocked stream error that mirrors production, exact call counts that merely restate the constants (assert bounded time and final state instead).

**Deliberate-break checks:** map the stream 404 to `failed` in `plan-generation-stream.ts:52` (the 404 cases go red); remove the `hasTimedOut` checks (`plan-generation-watch.ts:112`, `:147`) so the time-cap test fails on its settled flag; change `toErrorCode` fallback to return the unknown code (the unknown-code case goes red); drop the `Last-Event-ID` header at `plan-generation-stream.ts:43` (the reconnect-header case goes red).

### Success Criteria:

#### Automated Verification:

- Watch spec passes: `cd frontend && npx vitest run src/lib/plan-generation-watch.spec.tsx`
- Frontend suite passes: `cd frontend && npm test`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend build passes: `cd frontend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

**Implementation Note**: Pause for confirmation before Phase 3.

---

## Phase 3: Completed-plan shape guard (frontend, Risk #2 last mile)

### Overview

Add `isPlanResult` and use it in the watch layer so a completed snapshot whose plan is not renderable ends in the existing `error` state, with unit tests for the guard and watch tests for the malformed cases.

### Changes Required:

#### 1. Structural guard

**File**: `frontend/src/lib/plan-generation.ts`

**Intent**: Export a guard following the `isAdminUser` precedent (`admin-users.ts:29`) that decides whether a value is a `PlanResult` the page can render.

**Contract**: `isPlanResult(value: unknown): value is PlanResult`. True only when `value` is a non-null object whose `weeks` is a non-empty array in which every week has a numeric `week`, a string `goal` and an array `sessions`; every session has a string `title` and an array `exercises`; every exercise has string `slug`, `name` and `reps`, numeric `sets` and `restSeconds`, `note` that is a string or null, and `imageKey` that is a string or null. Empty `sessions` or `exercises` arrays and extra fields are accepted: counts and the 8-week rule belong to the server validator, and per `lessons.md` the shape may only grow additively.

#### 2. Use the guard in the watch layer

**File**: `frontend/src/lib/plan-generation-watch.ts`

**Intent**: Replace the truthiness check on the completed snapshot's plan (`:44-46`) with the guard, so both the poll path and the post-completion path end in `error` for a malformed plan.

**Contract**: `settleFromSnapshot` returns `completed` with the plan only when `isPlanResult(job.plan)`; otherwise `{ status: 'error' }`. `settleFromSnapshot` stays unexported.

#### 3. Guard unit spec

**File**: `frontend/src/lib/plan-generation.spec.ts` (new, node environment)

**Intent**: Test the guard directly with independent fixtures.

**Contract**: Accepts the dev sample plan (`buildSamplePlan()` from `frontend/src/dev/sample-plan.ts`) and a hand-written minimal plan with a null `note` and a null `imageKey`. Rejects `null`, `{}`, `{ weeks: [] }`, `{ weeks: {} }`, a null week, a week without `sessions`, a session without `exercises`, an exercise with a numeric slug, a string `sets`, a missing `note` and a missing `imageKey`.

#### 4. Watch cases for malformed plans

**File**: `frontend/src/lib/plan-generation-watch.spec.tsx`

**Intent**: Prove the guard is wired on both paths.

**Contract**: After a `completed` event, snapshots with `plan` set to `{}`, `{ weeks: [] }` and a plan with a session missing `exercises` each end in `error`; the same malformed plan returned by the polling path ends in `error`; the valid plan from Phase 2 still ends in `completed`.

**Test sub-phase details:**

- Behavior asserted: an empty or malformed completed plan never renders as a success and never offers Save.
- Regression caught: removing or loosening the guard, or wiring it on only one path.
- Research source: `research.md` Section 7; probe of `{ weeks: [] }` and `{}`.
- Edge/error/boundary: empty weeks, wrong types, missing nested arrays, null and missing nullable fields.
- Anti-pattern avoided: a guard test that reuses the guard's own field list as the fixture (fixtures are the dev sample plan and hand-written literals).

**Deliberate-break checks:** make `isPlanResult` return `true` (the malformed cases go red); wire it only in `settleCompleted` and not in the poll path (the polling malformed case goes red); make it reject a null `note` (the minimal-plan acceptance case goes red).

### Success Criteria:

#### Automated Verification:

- Guard and watch specs pass: `cd frontend && npx vitest run src/lib/plan-generation.spec.ts src/lib/plan-generation-watch.spec.tsx`
- Frontend suite passes: `cd frontend && npm test`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend build passes: `cd frontend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

#### Manual Verification:

- A real generation in the dev app (`cd backend && npm run start:dev`, `cd frontend && npm run dev`) completes and shows the plan with a Save button, confirming the guard accepts real server output

**Implementation Note**: Pause for confirmation, including the manual real-generation check, before Phase 4.

---

## Phase 4: Page-level states (frontend, Risk #1 user-visible)

### Overview

Prove the text and controls the user actually sees. First extend the existing page spec with rendering tests for every state; then add one integration spec that uses the real watch layer so a restart or an outage is proven through to the DOM.

### Changes Required:

#### 1. State rendering tests

**File**: `frontend/src/pages/PlanGenerationPage.spec.tsx`

**Intent**: Add a `describe` for the states the existing file never renders, fed with the existing `emitState` helper (`:59-62`) and the existing `renderPage` (`:64-72`). Label them rendering tests: they prove what each state shows, not that a restart produces that state.

**Contract**: Running initial shows `Starting…` in a `status` role; running with a week and a retrying or validating notice shows `Drafting your plan, week 3 of 8…` and `Trying again…` or `Checking the plan…`. Failed shows `The plan service is unavailable right now. Try again later.`, `We could not build a valid plan this time. Try again.` or `Something went wrong, try again` for the three codes, each in an alert with a `Start again` link to `/plans/new`. Not-found shows `This plan could not be found or has expired.` with `Start again`, and a route without `:jobId` shows the same. Error shows `Something went wrong, try again` and a Retry button and no `Start again` link; timed-out shows `This is taking longer than expected. Check back later.` and a Retry button. Clicking Retry calls the watch again with a new abort signal and returns the page to the running state. Completed shows the `Create another plan` link. Unmounting aborts the signal passed to the watch.

#### 2. Real-watch integration spec

**File**: `frontend/src/pages/PlanGenerationPage.watch.spec.tsx` (new)

**Intent**: Render the page with the real watch, stream and snapshot modules and a mocked `apiFetch` and `useAuth`, under fake timers, so restart and outage behaviour is proven end to end.

**Contract**: Same URL-routed, abort-aware mock as Phase 2. Cases: (a) a stream that delivers a stage event and is then cut, with 404 on reconnect, ends showing the not-found alert and the `Start again` link; (b) 502 on every request ends, after advancing fake time, showing `Something went wrong, try again`, a Retry button and no `Start again` link, and then, with the mock switched to 404 and Retry pressed, shows the not-found alert (the two-step path accepted in the interview); (c) a completed generation with a valid plan shows the `Save plan` button and the plan; a completed generation with a malformed plan shows the error alert and no `Save plan` button. Advance time inside `act`.

**Test sub-phase details:**

- Behavior asserted: after a restart the user reads "could not be found" with a way to start again; after an outage the user reads a bounded generic error with Retry; a malformed plan offers no Save.
- Regression caught: a changed message or control, a state mapped to the wrong view, the watch layer wired wrongly into the page.
- Research source: `research.md` Sections 6 and 8.
- Edge/error/boundary: restart then reconnect 404, outage then recovery by Retry, malformed completed plan.
- Anti-pattern avoided: calling canned states proof of a restart (the integration spec drives the real layer), over-mocking the watch in the integration spec.

**Deliberate-break checks:** map the stream 404 to `failed` in `plan-generation-stream.ts:52` (integration case (a) goes red); change the not-found message constant or hide the `Start again` link for `not-found` (the rendering and integration cases go red); disable the `Retry` handler (`PlanGenerationPage.tsx:144-147`) (the Retry cases go red).

### Success Criteria:

#### Automated Verification:

- Page specs pass: `cd frontend && npx vitest run src/pages/PlanGenerationPage.spec.tsx src/pages/PlanGenerationPage.watch.spec.tsx`
- Frontend suite passes: `cd frontend && npm test`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend build passes: `cd frontend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

#### Manual Verification:

- Local outage: start a generation against a local backend, stop the backend mid-run, and the page ends on `Something went wrong, try again` with Retry; after restarting the backend, pressing Retry shows `This plan could not be found or has expired.` with `Start again`

**Implementation Note**: Pause for confirmation, including the local outage check, before Phase 5.

---

## Phase 5: Manual deploy smoke and cookbook

### Overview

Measure what the user sees on the real Fly deployment, and record the patterns this change shipped so the next contributor can add similar tests. The smoke decides whether the deploy-time wording ever needs a follow-up change; nothing here changes product behaviour.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` in §6.1 with the patterns shipped: where each spec lives, naming (including why the watch specs are `.spec.tsx`), the URL-routed abort-aware mock, the settled-flag pattern, the pipeline table, the reference tests and the run commands; bump the "Last updated" header.

**Contract**: §6.1 gains Location, Naming, Mocking policy, Reference tests and Run locally lines in the style of the schema's examples; §6.2 to §6.5 stay `TBD`.

#### 2. Stale testing guidance

**File**: `CLAUDE.md`

**Intent**: Remove the statement that the frontend has no test framework configured (it runs Vitest 4 with Testing Library) and point test authors at `context/foundation/test-plan.md`; add the frontend test command next to the existing commands. The edit stays outside the 10x-cli block.

**Contract**: One sentence replaced under Testing Guidelines and one command added under Build, Test, and Development Commands.

#### 3. Manual smoke record

**File**: `context/changes/testing-generation-outcome-integrity/plan.md`

**Intent**: After the manual smoke, record the observed behaviour in a dated note under this phase so the decision about deploy-time wording is evidence-based.

**Contract**: A "Smoke result" note stating: which message appeared (not-found or generic error), after how long, what Fly returned if visible, and the decision taken with the user.

### Success Criteria:

#### Automated Verification:

- §6.1 no longer reads TBD: `sed -n '/### 6.1/,/### 6.2/p' context/foundation/test-plan.md` contains no `TBD`
- `CLAUDE.md` no longer says the frontend has no test framework: `grep -n "no test framework" CLAUDE.md` returns nothing
- Backend suite, lint and build pass: `cd backend && npm test && npm run lint && npm run build`
- Frontend suite, lint and build pass: `cd frontend && npm test && npm run lint && npm run build`

#### Manual Verification:

- Fly smoke 1: with a generation in the Drafting stage on the deployed app, restart the backend machine (`fly machines list`, then `fly machine restart <id>` for the project's Fly app); record which message the page shows and how long it takes
- Fly smoke 2: if the page ended on `Something went wrong, try again`, press Retry once the machine is back and confirm it then shows `This plan could not be found or has expired.`
- Fly smoke 3: with a completed plan on screen, restart the machine and click Save; the expiry message appears and the plan stays visible
- Record the Fly observations in the Smoke result note and decide with the user whether the deploy-time wording needs a follow-up change

**Implementation Note**: This is the last phase. After the manual rows are confirmed, run `/10x-test-plan` to mark rollout Phase 1 complete and select the next phase.

---

## Testing Strategy

### Unit Tests:

- Pipeline bad-output table and clean-run invariant (Phase 1); `isPlanResult` (Phase 3).
- Edge cases: 0, 7 and 9 weeks, empty week, 2-exercise session, off-catalog slug; null and missing nullable fields.

### Integration Tests:

- Watch loop against a mocked `apiFetch` with fake timers (Phase 2, 3); page plus real watch (Phase 4).

### Manual Testing Steps:

1. Real generation in the dev app after the guard lands (Phase 3).
2. Stop and restart the local backend mid-generation (Phase 4).
3. Restart the Fly machine mid-generation, then press Retry and Save (Phase 5).

## Performance Considerations

The 12-minute cap test advances fake time through roughly 200 polling iterations; the probe finished it well within the default test timeout. Keep each case to one fake-timer advance sequence.

## Migration Notes

None. No schema, API or persisted-shape change; the guard only reads the generation snapshot and accepts additive fields.

## References

- Related research: `context/changes/testing-generation-outcome-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` (Risks #1 and #2, §3 Phase 1, §6.1)
- Mock pattern: `frontend/src/lib/saved-plans.spec.ts:14`, `:32-38`
- Guard precedent: `frontend/src/lib/admin-users.ts:29`
- Fake model and fixtures: `backend/src/plan-generation/plan-pipeline.service.spec.ts:22`, `:55`, `:74`, `:90`, `:140`
- Lesson: `context/foundation/lessons.md` (saved-plan shapes change additively only)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pipeline bad-output table (backend, Risk #2)

#### Automated

- [x] 1.1 Pipeline spec passes with the new cases: `cd backend && npx vitest run src/plan-generation/plan-pipeline.service.spec.ts` — bcca45d
- [x] 1.2 Backend unit suite passes: `cd backend && npm test` — bcca45d
- [x] 1.3 Backend lint passes: `cd backend && npm run lint` — bcca45d
- [x] 1.4 Backend build passes: `cd backend && npm run build` — bcca45d
- [x] 1.5 Each deliberate-break check listed above turns the named tests red and is restored — bcca45d

### Phase 2: Watch-loop outcome tests (frontend, Risk #1)

#### Automated

- [x] 2.1 Watch spec passes: `cd frontend && npx vitest run src/lib/plan-generation-watch.spec.tsx`
- [x] 2.2 Frontend suite passes: `cd frontend && npm test`
- [x] 2.3 Frontend lint passes: `cd frontend && npm run lint`
- [x] 2.4 Frontend build passes: `cd frontend && npm run build`
- [x] 2.5 Each deliberate-break check listed above turns the named tests red and is restored

### Phase 3: Completed-plan shape guard (frontend, Risk #2 last mile)

#### Automated

- [ ] 3.1 Guard and watch specs pass: `cd frontend && npx vitest run src/lib/plan-generation.spec.ts src/lib/plan-generation-watch.spec.tsx`
- [ ] 3.2 Frontend suite passes: `cd frontend && npm test`
- [ ] 3.3 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 3.4 Frontend build passes: `cd frontend && npm run build`
- [ ] 3.5 Each deliberate-break check listed above turns the named tests red and is restored

#### Manual

- [ ] 3.6 A real generation in the dev app (`cd backend && npm run start:dev`, `cd frontend && npm run dev`) completes and shows the plan with a Save button, confirming the guard accepts real server output

### Phase 4: Page-level states (frontend, Risk #1 user-visible)

#### Automated

- [ ] 4.1 Page specs pass: `cd frontend && npx vitest run src/pages/PlanGenerationPage.spec.tsx src/pages/PlanGenerationPage.watch.spec.tsx`
- [ ] 4.2 Frontend suite passes: `cd frontend && npm test`
- [ ] 4.3 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 4.4 Frontend build passes: `cd frontend && npm run build`
- [ ] 4.5 Each deliberate-break check listed above turns the named tests red and is restored

#### Manual

- [ ] 4.6 Local outage: start a generation against a local backend, stop the backend mid-run, and the page ends on `Something went wrong, try again` with Retry; after restarting the backend, pressing Retry shows `This plan could not be found or has expired.` with `Start again`

### Phase 5: Manual deploy smoke and cookbook

#### Automated

- [ ] 5.1 §6.1 no longer reads TBD: `sed -n '/### 6.1/,/### 6.2/p' context/foundation/test-plan.md` contains no `TBD`
- [ ] 5.2 `CLAUDE.md` no longer says the frontend has no test framework: `grep -n "no test framework" CLAUDE.md` returns nothing
- [ ] 5.3 Backend suite, lint and build pass: `cd backend && npm test && npm run lint && npm run build`
- [ ] 5.4 Frontend suite, lint and build pass: `cd frontend && npm test && npm run lint && npm run build`

#### Manual

- [ ] 5.5 Fly smoke 1: with a generation in the Drafting stage on the deployed app, restart the backend machine (`fly machines list`, then `fly machine restart <id>` for the project's Fly app); record which message the page shows and how long it takes
- [ ] 5.6 Fly smoke 2: if the page ended on `Something went wrong, try again`, press Retry once the machine is back and confirm it then shows `This plan could not be found or has expired.`
- [ ] 5.7 Fly smoke 3: with a completed plan on screen, restart the machine and click Save; the expiry message appears and the plan stays visible
- [ ] 5.8 Record the Fly observations in the Smoke result note and decide with the user whether the deploy-time wording needs a follow-up change
