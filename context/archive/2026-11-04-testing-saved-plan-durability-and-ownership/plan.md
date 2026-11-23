# Saved-Plan Durability and Ownership Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` ("Saved-plan durability and ownership", Risks #4 and #3). Add the tests that pin who can touch a job or a saved plan and what a saved plan looks like when it comes back: on the server, B gets exactly the answer a nonexistent id gets and A's data survives (Risk #4), and a saved plan round-trips with its images and a failed save leaves nothing behind (Risk #3); on the client, a stored body renders or ends in an honest error, never a crash (Risk #3). Testing is hermetic by decision (no real database). One small production change is included by decision: a loose structural guard on the saved-plan read path. The change closes with a manual two-account smoke on a real database and the cookbook entries for §6.2 and §6.3.

## Current State Analysis

Research (`research.md`) found ownership enforced everywhere and tests thin on the "data survived" half; persistence has no test that touches a database, and the frontend read path trusts its body.

- Ownership: every id-taking route compares the verified user id with the stored owner: `job?.ownerId === ownerId` (`backend/src/plan-generation/plan-job.store.ts:86`) and `where: { id, ownerId }` in each saved-plan query (`backend/src/saved-plans/saved-plans.service.ts:118-120`, `:128-130`, `:141-144`, `:148-151`), with save keyed on `ownerId_sourceJobId` (`:158-165`) and a second `store.get(jobId, ownerId)` (`:74`).
- Ownership tests: B gets 404 on every route (`backend/test/saved-plans.e2e-spec.ts:353-363`, `:503-527`, `:590-605`, `:671-686`; `backend/test/plan-generation.e2e-spec.ts:199-211`, `:368-385`), but no test compares a foreign response with an unknown one over HTTP, no test covers "A saved J, then B posts J" or a foreign `Last-Event-ID`, and PATCH and DELETE assert one field or the row count, not the whole row.
- Persistence tests: the e2e uses `FakeSavedPlanTable` (`backend/test/saved-plans.e2e-spec.ts:65-207`), which filters on `ownerId` and copies with `structuredClone`; the "round trip" compares one literal fixture with a clone of itself and the fixtures use `imageKey: null` and `note: null` only (`:218-241`, `:284-303`). `save` selects only `id, createdAt, form, title`, so a 201 never reads the plan back (`saved-plans.service.ts:36-41`, `:83-92`).
- Read path: `fetchSavedPlan` casts the body and checks only `typeof plan?.id === 'string'` (`frontend/src/lib/saved-plans.ts:112-113`). A missing `form`, `plan`, `weeks`, a week's `sessions` or a session's `exercises` throws during render (`SavedPlanDetails.tsx:14`, `PlanView.tsx:115`, `plan-stats.ts:17-18`) and there is no error boundary; a missing `note`, `imageKey` or `title` renders fine. The Phase 1 guard `isPlanResult` (`frontend/src/lib/plan-generation.ts:109-113`) is stricter than the renderer and is used only in the watch layer.
- Frontend tests: `SavedPlanPage.spec.tsx` mocks `fetchSavedPlan`, uses `imageKey: null` and has no malformed or older-shape case; `saved-plans.spec.ts` returns real `Response` objects but never a 200 body with an `id` and a malformed `plan` or `form`; no spec renders a raw stored body through the real fetch into `SavedPlanPage` and `PlanView`.
- Baseline: backend e2e passes (4 files, 79 tests) and the frontend suite passes (532 tests); `npm test` in `backend/` does not run the e2e specs (`vitest.config.ts:11` includes `**/*.spec.ts` only, `vitest.config.e2e.ts:9` includes `**/*.e2e-spec.ts`).

## Desired End State

- A two-user matrix in the existing e2e specs proves, for every id-taking route, that B's answer equals the answer for a well-formed unknown id (status and body) and that A's whole row, job and list are unchanged afterwards.
- A save round-trips an independently written plan with non-null `imageKey` and `note` through the real HTTP JSON path, and a save that fails answers 500, leaves no row and succeeds on retry.
- `fetchSavedPlan` maps a stored body the renderer cannot handle to the existing error state; bodies with a missing `note`, `imageKey` or `title`, or empty `weeks`, still render; a raw stored body renders through the real fetch with its images, and survives a remount.
- A rejected `saveGeneratedPlan` promise ends in the generic error with the plan kept and Save re-enabled.
- A recorded manual smoke with two real accounts shows what the user sees, and `test-plan.md` §6.2 and §6.3 tell the next contributor how to add such tests and which gaps remain.

### Key Discoveries:

- The fake table's `findUnique`, `findFirst`, `updateMany` and `deleteMany` all compare `where.ownerId`, so removing `ownerId` from a service query changes the owner's own results; the fake has signal for scoping (`backend/test/saved-plans.e2e-spec.ts:65-207`).
- Supertest parses the response body from real JSON, so an expected value written as a JSON string literal is a genuine, independent check of serialization over HTTP; the fake's `structuredClone` is not.
- `table.create` and the other fake methods are `vi.fn`, so one call can be made to reject (`mockRejectedValueOnce`) to simulate a failing insert.
- Foreign and well-formed unknown ids both end in a bare `NotFoundException`; a malformed id on `/saved-plans/:id` gets the same status with the `ParseUUIDPipe` body, and `/plan-generations/:jobId` has no pipe (`saved-plans.controller.ts:43-45`, `plan-generation.controller.ts:98`, `:202-209`).
- `buildSamplePlan()` (`frontend/src/dev/sample-plan.ts`) is an 8-week plan whose every exercise has `imageKey: exercises/<slug>.jpg`; it is written independently of the saved-plan code and is not yet rendered by any component spec.
- `./api` imports `./supabase`, so specs mock `../lib/supabase` or the whole `../lib/api` module; `*.spec.tsx` runs under jsdom, `*.spec.ts` under node (`frontend/vite.config.ts`).
- Rules to follow: no code comments, `const` arrow functions, Prettier single quotes and trailing commas in `backend/`, no semicolons in `frontend/`, and the lesson that persisted plan shapes change additively only (`context/foundation/lessons.md`).

## What We're NOT Doing

- A real-database harness or a real-Postgres round trip (decided: hermetic now). The gap (jsonb normalisation, cascade, the real P2002, `@db.Uuid`, collation) is recorded in the cookbook; it belongs to a later change.
- Extra-unknown-field fixtures and form-drift fixtures (an unknown `experience` value, a missing optional form field) for the stored-shape render; only a missing `imageKey` and `note`, `weeks: []` and a missing `title` count as older or odd shapes (decided in this interview).
- Guarding NUL characters in model-written plan text (`goal`, `title`, `reps`, `note`). It is an inferred, unreproduced failure; it is recorded as a known gap in the cookbook (decided).
- Changing the malformed-id response body on `/saved-plans/:id` or adding a UUID pipe to the plan-generations routes. The difference reveals only that the id is not a UUID and is pinned as accepted (decided).
- An error boundary or router `errorElement`, and a guard on the saved-plans list (`listSavedPlans`) or on rename and delete responses.
- Blocked-user behaviour on these routes (Risk #6, test-plan Phase 3) and rate limits.
- Editing `context/changes/plan-delete-and-rename/` or ticking its manual rows 1.8 and 1.9; this change's smoke covers the same ground and is recorded here only.
- The CORS preflight check (plan-delete-and-rename row 1.9).
- A shared two-user test helper; the new cases extend the existing specs in place, as decided in test-plan Phase 1.
- Backporting the research's corrections to `test-plan.md` §2, §3 and §4; that is a `/10x-test-plan` step after this change.
- A browser e2e.

## Implementation Approach

Order is by risk and by dependency: the ownership matrix first (Risk #4, High × Medium, no production change), then the backend persistence cases (Risk #3, same spec, still no production change), then the frontend read guard and stored-shape render (Risk #3, the only production change, its tests written against the guard's contract), then the cookbook and the manual smoke that adds the only real-database evidence. Each test is written from the requirement, not from the code under test: users are the literals `user-1` and `user-2`, the unknown id is a hand-written UUID, the stored plan is a hand-written JSON literal (or `buildSamplePlan()`), and the expected state is the PRD's "own plans only" and "reloads correctly" (`prd.md:37`, `:106`). Every test phase ends with deliberate-break checks: break the production code in the worktree only, confirm the named tests go red, restore.

Decisions taken in the interview: hermetic persistence testing with the real-database gap recorded; a loose structural guard on the saved-plan read path (reject only what the renderer cannot handle); the oracle for "matches a nonexistent id" is a well-formed unknown UUID, with the malformed-id body difference accepted; older-shape fixtures limited to a missing `imageKey` and `note`; NUL in plan text recorded as a known gap; a manual two-account smoke included.

## Critical Implementation Details

- **Running the e2e specs:** `npm test` in `backend/` skips `*.e2e-spec.ts`; every backend criterion here names `npm run test:e2e` or `npx vitest run --config ./vitest.config.e2e.ts <files>` explicitly.
- **Independent expected values:** the round-trip expectation is a JSON string literal parsed in the test (`JSON.parse`), separate from the typed object handed to `store.complete`; the ownership expectations compare against a snapshot taken before B's attempt and against a second request for a well-formed unknown id, never against values computed by the service.
- **Read guard scope:** the guard checks only the structural containers the renderer dereferences and never optional or newly added fields, so `title`, `createdAt`, `note`, `imageKey` and unknown extra fields pass; this keeps the persisted shape additive per `lessons.md`.

## Phase 1: Ownership matrix (backend, Risk #4)

### Overview

Prove that for every id-taking route user B receives the answer a well-formed unknown id receives, and that A's data is unchanged afterwards. All changes are in the two existing e2e specs; no production code changes.

### Changes Required:

#### 1. Saved-plan routes: foreign equals unknown, victim unchanged

**File**: `backend/test/saved-plans.e2e-spec.ts`

**Intent**: Add a `describe` for the ownership matrix next to the existing per-route ownership tests, using the existing `completedJob`, `postSave`, `savedId`, `patchTitle`, `deletePlan` helpers and `table`.

**Contract**: For `GET`, `PATCH` (with a title) and `DELETE` on `/saved-plans/:id`, one `it.each` over the three routes: B's response to A's real plan id has the same status and the same body as B's response to `UNKNOWN_ID`. After B's attempt, `table.rows[0]` deep-equals a `structuredClone` taken before the attempt (whole row: id, ownerId, sourceJobId, form, plan, title, createdAt), and A's `GET` returns a body equal to the one received before. For `POST /saved-plans`: (a) B posts A's completed, unsaved job: same status and body as B posting an unknown job id, `table.rows` stays empty, A's job is still completed in the store and A's own `POST` then answers 201; (b) A saved job J, then B posts J: same status and body as the unknown case, A's row unchanged, B's list empty. Add one case pinning a malformed id on each of the three routes as 404 with `statusCode: 404` in the body and no row data; do not assert the pipe's message text.

#### 2. Plan-generation routes: foreign equals unknown, replay does not leak

**File**: `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Extend the existing foreign-job tests for the snapshot and stream routes with the body comparison and the replay header.

**Contract**: `GET /plan-generations/:jobId` as `user-2` for `user-1`'s job answers the same status and body as for the unknown UUID, and `user-1`'s snapshot afterwards equals the one taken before. `GET /plan-generations/:jobId/events` as `user-2` for `user-1`'s finished job, once without and once with `Last-Event-ID: 0`, answers the same status, content type and body as for the unknown UUID with the same header, contains no `event:` text, and `user-1`'s snapshot is unchanged afterwards.

**Test sub-phase details** (the grounding the implementer must keep):

- Behavior asserted: B cannot tell A's job or plan from a nonexistent one on any id-taking route, and B's attempt changes nothing of A's.
- Regression caught: a service or store query that drops `ownerId`, an early return or error that differs for a foreign id, a replay path that reaches events before the owner check.
- Research source: `research.md` Sections 1 to 3 and the matrix in Section 3; PRD Access Control (`prd.md:106`).
- Edge/error/boundary: foreign id versus well-formed unknown id, A saved then B posts the same job, `Last-Event-ID` replay, malformed id (accepted difference).
- Anti-pattern avoided: single-user tests; asserting only a status code; computing the expected body from the service.

**Deliberate-break checks** (worktree only, restore with `git checkout -- <file>`): remove `ownerId` from the `findFirst` where in `get` (`saved-plans.service.ts:118-120`; the GET cases go red); remove `ownerId` from the `updateMany` where (`:141-144`; the PATCH row-survives case goes red); remove `ownerId` from the `deleteMany` where (`:128-130`; the DELETE row-survives case goes red); make `PlanJobStore.get` return the job regardless of owner (`plan-job.store.ts:86`; the POST, snapshot and stream cases go red).

**Deviation (2026-11-04):** the fake table compares `where.ownerId` itself, so a PATCH or DELETE query that drops `ownerId` makes the fake match nothing: B still gets 404 and the row survives, and a "B gets 404 and the row survives" assertion alone would stay green on that break. Each route in the GET, PATCH and DELETE matrix therefore ends with the owner's own call on the same route (200, 200, 204), which is what turns the PATCH and DELETE breaks red in the new matrix case. The same property means those two breaks also turned existing owner-path tests red (4 and 5 reds in total); the fake proves that scoping is present, not what a real database would let B do without it. `patchTitle`, `deletePlan` and `savedId` were hoisted from the PATCH and DELETE `describe` blocks to the outer `describe` (bodies unchanged) and `getPlan` and `listPlans` were added next to them; no shared helper file. The malformed-id case is one `it.each` over the same three-route table. All four breaks were run and restored: GET break 5 red, PATCH break 5 red, DELETE break 4 red, store break 8 red.

### Success Criteria:

#### Automated Verification:

- E2E specs pass with the new cases: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts test/plan-generation.e2e-spec.ts`
- Backend e2e suite passes: `cd backend && npm run test:e2e`
- Backend unit suite passes: `cd backend && npm test`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

**Implementation Note**: After this phase and its automated verification pass, pause for confirmation before Phase 2. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: Persistence round trip and failed save (backend, Risk #3)

### Overview

Prove that a plan with images and notes comes back from a save unchanged over the real HTTP JSON path, and that a save that fails answers an error, stores nothing and succeeds on retry. Same e2e spec as Phase 1; no production code changes. The fake table cannot show jsonb behaviour, which stays a recorded gap.

### Changes Required:

#### 1. Round trip with an independent fixture

**File**: `backend/test/saved-plans.e2e-spec.ts`

**Intent**: Add a `describe` for persistence fidelity with a stored plan written separately from the existing fixture: several weeks and sessions, exercises with non-null `imageKey` (the `exercises/<slug>.jpg` format) and a mix of string and `null` `note`.

**Contract**: The plan handed to `store.complete` is a typed `PlanResult` object; the expected value is a JSON string literal parsed with `JSON.parse`. After `POST /saved-plans`, `GET /saved-plans/:id` as the owner returns `plan` equal to the parsed literal and `form` equal to the posted form; the stored row's `plan` equals it too; `createdAt` is an ISO string and `title` is `null`. The existing `imageKey: null` fixture and tests stay as they are.

#### 2. Failed save is not confirmed and can be retried

**File**: `backend/test/saved-plans.e2e-spec.ts`

**Intent**: Add the HTTP-level failure case the service spec only covers with stubs.

**Contract**: With `table.create` rejecting once with a plain `Error('connection lost')` (`mockRejectedValueOnce`), `POST /saved-plans` for a completed job answers 500, the body contains no part of the error message, `table.rows` stays empty and the job is still completed in the store; a second `POST` for the same job answers 201 and exactly one row exists.

**Test sub-phase details:**

- Behavior asserted: what the user saved is what comes back, images included, and a failed save is never reported as saved and can be repeated without a duplicate.
- Regression caught: a change that drops, renames or rewrites fields on save or read; an error swallowed into a fake success; a retry that creates a second row or fails because the job was consumed.
- Research source: `research.md` Sections 4 and 7; PRD guardrail 1 (`prd.md:37`) and FR-011 (`:87`).
- Edge/error/boundary: non-null `imageKey` and `note`, `null` note, multiple weeks and sessions, a non-P2002 insert failure followed by retry.
- Anti-pattern avoided: an expected value built with the same builder as the input; a `structuredClone` comparison offered as a round trip; mocking away the failure.

**Deliberate-break checks** (worktree only, restore with `git checkout -- <file>`): store an empty plan in `create` (`saved-plans.service.ts:87-88`, for example `{ weeks: [] }`; the fidelity case goes red); make `toView` rewrite the plan without `imageKey` (`:50-53`; the fidelity case goes red); make `save` catch the non-P2002 error and return a fabricated summary (`:93-105`; the failed-save case goes red).

### Success Criteria:

#### Automated Verification:

- E2E spec passes with the new cases: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts`
- Backend e2e suite passes: `cd backend && npm run test:e2e`
- Backend unit suite passes: `cd backend && npm test`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

**Implementation Note**: Pause for confirmation before Phase 3.

---

## Phase 3: Saved-plan read guard and stored-shape render (frontend, Risk #3)

### Overview

Add a loose structural guard to `fetchSavedPlan` so a stored body the renderer cannot handle ends in the existing error state, and prove with tests that raw stored bodies (full, older shape, malformed) behave as the PRD requires, including images and a remount. Also pin the one untested branch of the Save control. This is the only production change in the change.

### Changes Required:

#### 1. Structural read guard

**File**: `frontend/src/lib/saved-plans.ts`

**Intent**: Replace the id-only check in `fetchSavedPlan` (`:112-113`) with an unexported guard that decides whether a body is a saved plan the page can render without crashing.

**Contract**: The body is accepted only when it is a non-null object with a string `id`, a non-null object `form`, and a `plan` that is a non-null object whose `weeks` is an array in which every week is a non-null object with an array `sessions`, every session a non-null object with an array `exercises`, and every exercise a non-null object. Empty `weeks`, empty `sessions` or `exercises`, a missing `title` or `createdAt`, a missing `note` or `imageKey`, and any extra fields are accepted: they render without throwing and the shape may only grow additively (`lessons.md`). A rejected body returns the existing `{ kind: 'error' }`, so the page shows "Something went wrong, try again". No change to the exported types or to other functions.

#### 2. Guard behaviour through the real fetch

**File**: `frontend/src/lib/saved-plans.spec.ts`

**Intent**: Add tables of raw bodies fed through the real `fetchSavedPlan` with the existing `respondWith` helper (real `Response` objects).

**Contract**: Accepted (result `ok`): a full plan; exercises without `imageKey` and `note`; a plan with `weeks: []`; a body without `title`. Rejected (result `error`): `null`, `[]`, a body without `form`, `form: null`, a body without `plan`, `plan: null`, a plan without `weeks`, `weeks` as an object, a null week, a week without `sessions`, a session without `exercises`, a null exercise. Fixtures are hand-written literals.

#### 3. Stored plan through the real fetch into the page

**File**: `frontend/src/pages/SavedPlanPage.stored.spec.tsx` (new, jsdom)

**Intent**: Render the real `SavedPlanPage`, real `fetchSavedPlan` and real `PlanView` with only the network edge and auth mocked, so a stored body is proven through to the DOM.

**Contract**: Mock `../lib/api` (a routed `apiFetch` returning `Response` objects with JSON bodies) and `../auth/useAuth`; mock `../lib/supabase` if an import pulls it in; render at `/plans/:id` in a router. Cases: (a) a body whose `plan` is `JSON.parse(JSON.stringify(buildSamplePlan()))` shows the `Week 1` heading and the first exercise's name, and an `img` whose `src` is `/` plus that exercise's stored `imageKey` and whose alt is the exercise name followed by `, start and end position`; (b) unmounting and rendering again with a fresh response of the same body shows the same heading and image (the later-session reload); (c) a plan whose exercises have no `imageKey` and no `note` renders the exercise names, no `img` and no alert; (d) each of: a week without `sessions`, a session without `exercises`, `form: null`, a plan without `weeks` shows the alert "Something went wrong, try again" and no `Week 1` heading and does not throw.

#### 4. Rejected Save promise

**File**: `frontend/src/pages/PlanGenerationPage.spec.tsx`

**Intent**: Cover the branch where `saveGeneratedPlan` itself rejects (`PlanGenerationPage.tsx:111-112`), which only the lib-level spec covers today.

**Contract**: With the existing mocks, a completed generation whose `saveGeneratedPlan` rejects shows the generic alert, keeps the plan on screen and re-enables the Save button.

**Test sub-phase details:**

- Behavior asserted: a saved plan reloads with its images from stored data; an older or odd stored shape still renders; a body the renderer cannot handle ends in an honest error, not a crash; a failed save is surfaced and the plan stays.
- Regression caught: removing or loosening the guard, making it strict enough to reject older plans, breaking the image source built from the stored key, an unhandled rejection from the save call.
- Research source: `research.md` Sections 5 and 6; PRD FR-010 and FR-011 (`prd.md:82-87`).
- Edge/error/boundary: missing `imageKey` and `note`, empty `weeks`, missing `title`, null and missing containers, remount, rejected promise.
- Anti-pattern avoided: mocking `fetchSavedPlan` and calling that a stored-shape test; a fixture that reuses the guard's own field list (fixtures are `buildSamplePlan()` and hand-written literals); asserting class names.

**Deliberate-break checks** (worktree only, restore with `git checkout -- <file>`): make the guard return `true` for any body with an `id` (the rejected tables and the page cases (d) go red); make the guard also require a string `imageKey` on every exercise (the older-shape cases in the lib table and page case (c) go red); remove the leading slash from the image source in `PlanView.tsx:22` (page case (a) goes red); make the `catch` in the Save handler empty (`PlanGenerationPage.tsx:111-112`; the rejected-promise case goes red).

### Success Criteria:

#### Automated Verification:

- Specs pass: `cd frontend && npx vitest run src/lib/saved-plans.spec.ts src/pages/SavedPlanPage.stored.spec.tsx src/pages/PlanGenerationPage.spec.tsx`
- Frontend suite passes: `cd frontend && npm test`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend build passes: `cd frontend && npm run build`
- Each deliberate-break check listed above turns the named tests red and is restored

#### Manual Verification:

- In the dev app (`cd backend && npm run start:dev`, `cd frontend && npm run dev`) an existing saved plan opens at `/plans/<id>` and renders as before, with its images, confirming the guard accepts real stored data

**Implementation Note**: Pause for confirmation, including the manual check against real stored data, before Phase 4.

---

## Phase 4: Cookbook, known gaps and manual two-account smoke

### Overview

Record the patterns this change shipped so the next contributor can add similar tests, record what hermetic testing cannot show, and gather the only real-database evidence with two real accounts. Nothing here changes product behaviour.

### Changes Required:

#### 1. Cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` in §6.2 and §6.3 with the patterns shipped, in the style of the §6.1 entry and the schema's examples, and bump the "Last updated" header if it is not already today's date.

**Contract**: §6.2 ("Testing that saved data round-trips") gains Location, Naming, Pattern (independent JSON-literal expectation over HTTP; raw stored body through the real fetch into the page; older-shape fixtures limited to a missing `imageKey` and `note`, `weeks: []` and a missing `title`; failed save then retry), Mocking policy (what `FakeSavedPlanTable` proves and what it cannot: jsonb normalisation, cascade, the real P2002, `@db.Uuid`), Known gaps (those items plus NUL in model-written plan text, recorded as inferred and unreproduced, and the absence of a real-database harness), Reference tests and Run locally lines. §6.3 ("Testing ownership on a new id-taking endpoint") gains Location, Pattern (two-user matrix per route: B's answer equals a well-formed unknown id's status and body, whole-row snapshot unchanged, A's own follow-up request still works; the malformed-id body is an accepted format difference), Reference tests and Run locally lines, and states that `npm test` skips `*.e2e-spec.ts`. §6.4 and §6.5 stay `TBD`; §2, §3 and §4 are not edited here.

#### 2. Manual smoke record

**File**: `context/changes/testing-saved-plan-durability-and-ownership/plan.md`

**Intent**: After the manual smoke, record the observed behaviour in a dated note under this phase so the evidence behind both risks is on file.

**Contract**: A "Smoke result" note stating what each of the three manual checks showed, and anything that differed from the expectation.

**Smoke result (2026-11-04):** run against the dev app with the real hosted database. Smoke 1 (durability, save then sign out and in and reopen) and Smoke 2 (second account opens the first account's plan address) were reported done by the user as expected, without further detail recorded. Smoke 3 (ownership over the API) was run by the assistant with the second account's bearer token (`testtest1@test.com`), which the user supplied; the token was used only for these requests and not stored. Against the local API (`http://localhost:3000`), `GET`, `PATCH` (title `Mine now`) and `DELETE` for the first account's plan `6dbff844-9de7-4d8f-8c98-75e50cf5d5aa` each answered 404 with the body `{"message":"Not Found","statusCode":404}`, identical to the answer for the well-formed unknown UUID `00000000-0000-4000-8000-000000000000`; `GET` and `PATCH` for a second plan, `13024119-87cc-48bb-99d8-7c15d38db36d`, answered the same. A `GET` for `6dbff844-…` against the deployed Fly API answered the same 404 body. The body is the handler's own not-found, not a missing-route message, so the PATCH and DELETE routes exist. `DELETE` was sent only after every `PATCH` was refused identically. Afterwards the user reopened both plans as their owner and both still opened (the user reported them unchanged; the title and week count were not itemised). Nothing differed from the expectation. Not covered: B's `PATCH` and `DELETE` against the deployed API were not sent, and the first account's token was not available, so unchanged state rests on the user's check in the app.

### Success Criteria:

#### Automated Verification:

- §6.2 and §6.3 no longer read TBD: `sed -n '/### 6.2/,/### 6.4/p' context/foundation/test-plan.md | grep -c TBD` prints `0`
- §6.4 and §6.5 still read TBD: `sed -n '/### 6.4/,/### 6.6/p' context/foundation/test-plan.md | grep -c TBD` prints `2`
- Backend suites, lint and build pass: `cd backend && npm test && npm run test:e2e && npm run lint && npm run build`
- Frontend suite, lint and build pass: `cd frontend && npm test && npm run lint && npm run build`

#### Manual Verification:

- Smoke 1 (durability): with account A on the dev app (local backend and frontend, the real hosted database), generate a plan, review it, click Save, sign out, sign back in, open the plan from My plans; all 8 weeks and the exercise images show, and the plan matches what was reviewed before saving
- Smoke 2 (ownership in the UI): sign in as a second account B and open A's `/plans/<A's id>` directly; the page shows "This saved plan could not be found." and A's plan is absent from B's My plans
- Smoke 3 (ownership over the API): with B's bearer token (copied from the browser's network tab) send `GET`, `PATCH` (with a title) and `DELETE` for A's plan id to the local API, and the same three for a well-formed unknown UUID; each pair answers the same status and body (404), and afterwards A's plan still opens unchanged with its original title
- Record the observations in the Smoke result note

**Implementation Note**: This is the last phase. After the manual rows are confirmed, run `/10x-test-plan` to mark rollout Phase 2 complete, backport the research's corrections to §2, §3 and §4, and select the next phase.

---

## Testing Strategy

### Unit Tests:

- The read guard through the real `fetchSavedPlan` (Phase 3).
- Edge cases: missing and null containers; missing `note`, `imageKey`, `title`; `weeks: []`.

### Integration Tests:

- Two-user matrix, round trip with an independent fixture and the failed-save retry against the e2e module with the fake table (Phases 1, 2); raw stored body through the real fetch into `SavedPlanPage` and `PlanView` (Phase 3).

### Manual Testing Steps:

1. Open an existing saved plan in the dev app after the guard lands (Phase 3).
2. Save, sign out and in, reopen; open A's plan as B in the UI; replay GET, PATCH and DELETE as B over the API (Phase 4).

## Performance Considerations

None. The new tests are single-request cases against an in-memory fake; the guard walks one plan of at most eight weeks.

## Migration Notes

None. No schema, API or persisted-shape change; the guard only reads the saved-plan response and accepts additive fields.

## References

- Related research: `context/changes/testing-saved-plan-durability-and-ownership/research.md`
- Test plan: `context/foundation/test-plan.md` (Risks #3 and #4, §3 Phase 2, §6.2 and §6.3)
- Phase 1 pattern: `context/changes/testing-generation-outcome-integrity/plan.md` and `context/foundation/test-plan.md` §6.1
- Ownership code: `backend/src/saved-plans/saved-plans.service.ts:68-156`, `backend/src/plan-generation/plan-job.store.ts:83-87`
- E2E fixtures and helpers: `backend/test/saved-plans.e2e-spec.ts:24-39`, `:65-207`, `:243-281`; `backend/test/plan-generation.e2e-spec.ts:25-61`, `:192-211`, `:368-385`
- Read path: `frontend/src/lib/saved-plans.ts:99-117`, `frontend/src/pages/SavedPlanPage.tsx:58-85`, `frontend/src/components/PlanView.tsx:14-30`
- Fixture builder: `frontend/src/dev/sample-plan.ts`
- Lesson: `context/foundation/lessons.md` (saved-plan shapes change additively only)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ownership matrix (backend, Risk #4)

#### Automated

- [x] 1.1 E2E specs pass with the new cases: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts test/plan-generation.e2e-spec.ts` — 5c416cb
- [x] 1.2 Backend e2e suite passes: `cd backend && npm run test:e2e` — 5c416cb
- [x] 1.3 Backend unit suite passes: `cd backend && npm test` — 5c416cb
- [x] 1.4 Backend lint passes: `cd backend && npm run lint` — 5c416cb
- [x] 1.5 Backend build passes: `cd backend && npm run build` — 5c416cb
- [x] 1.6 Each deliberate-break check listed above turns the named tests red and is restored — 5c416cb

### Phase 2: Persistence round trip and failed save (backend, Risk #3)

#### Automated

- [x] 2.1 E2E spec passes with the new cases: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/saved-plans.e2e-spec.ts` — 446da75
- [x] 2.2 Backend e2e suite passes: `cd backend && npm run test:e2e` — 446da75
- [x] 2.3 Backend unit suite passes: `cd backend && npm test` — 446da75
- [x] 2.4 Backend lint passes: `cd backend && npm run lint` — 446da75
- [x] 2.5 Backend build passes: `cd backend && npm run build` — 446da75
- [x] 2.6 Each deliberate-break check listed above turns the named tests red and is restored — 446da75

### Phase 3: Saved-plan read guard and stored-shape render (frontend, Risk #3)

#### Automated

- [x] 3.1 Specs pass: `cd frontend && npx vitest run src/lib/saved-plans.spec.ts src/pages/SavedPlanPage.stored.spec.tsx src/pages/PlanGenerationPage.spec.tsx` — a0d800c
- [x] 3.2 Frontend suite passes: `cd frontend && npm test` — a0d800c
- [x] 3.3 Frontend lint passes: `cd frontend && npm run lint` — a0d800c
- [x] 3.4 Frontend build passes: `cd frontend && npm run build` — a0d800c
- [x] 3.5 Each deliberate-break check listed above turns the named tests red and is restored — a0d800c

#### Manual

- [x] 3.6 In the dev app (`cd backend && npm run start:dev`, `cd frontend && npm run dev`) an existing saved plan opens at `/plans/<id>` and renders as before, with its images, confirming the guard accepts real stored data — a0d800c

### Phase 4: Cookbook, known gaps and manual two-account smoke

#### Automated

- [x] 4.1 §6.2 and §6.3 no longer read TBD: `sed -n '/### 6.2/,/### 6.4/p' context/foundation/test-plan.md | grep -c TBD` prints `0` — 6210bc7
- [x] 4.2 §6.4 and §6.5 still read TBD: `sed -n '/### 6.4/,/### 6.6/p' context/foundation/test-plan.md | grep -c TBD` prints `2` — 6210bc7
- [x] 4.3 Backend suites, lint and build pass: `cd backend && npm test && npm run test:e2e && npm run lint && npm run build` — 6210bc7
- [x] 4.4 Frontend suite, lint and build pass: `cd frontend && npm test && npm run lint && npm run build` — 6210bc7

#### Manual

- [x] 4.5 Smoke 1 (durability): with account A on the dev app (local backend and frontend, the real hosted database), generate a plan, review it, click Save, sign out, sign back in, open the plan from My plans; all 8 weeks and the exercise images show, and the plan matches what was reviewed before saving — 6210bc7
- [x] 4.6 Smoke 2 (ownership in the UI): sign in as a second account B and open A's `/plans/<A's id>` directly; the page shows "This saved plan could not be found." and A's plan is absent from B's My plans — 6210bc7
- [x] 4.7 Smoke 3 (ownership over the API): with B's bearer token (copied from the browser's network tab) send `GET`, `PATCH` (with a title) and `DELETE` for A's plan id to the local API, and the same three for a well-formed unknown UUID; each pair answers the same status and body (404), and afterwards A's plan still opens unchanged with its original title — 6210bc7
- [x] 4.8 Record the observations in the Smoke result note — 6210bc7
