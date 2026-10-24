<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Plan Generation

- **Plan**: context/changes/first-plan-generation/plan.md
- **Scope**: Full plan (Phases 1-4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION (all findings triaged and fixed or accepted on 2026-10-24)
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks re-run on 2026-10-24: backend build, lint and 387 tests pass (160 in `src/plan-generation`); frontend lint and build pass; 26 of 26 Progress rows ticked. `tsc --noEmit` on the backend reports spec type errors (F3) and one pre-existing e2e error (`supertest/types`), neither caught by build, lint or tests. `backend/.env.example` could not be inspected (`.env*` is deny-listed).

## Findings

### F1 — A job can stay `running` forever and block its owner

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-pipeline.service.ts:64,75; plan-job.store.ts:52,89-96
- **Detail**: The catalog load (`exercises.findAll()`, line 64) runs before the 10-minute `AbortSignal.timeout` is created (line 75), so the signal covers only model calls. The store never reaps non-terminal jobs and `hasActive` counts `running` indefinitely. A hung catalog query leaves the job `running`, the limiter answers `active_job` for that user until the process restarts, and the SPA polls forever (see F5). Verified by reading the code; the hang itself was not reproduced.
- **Fix A ⭐ Recommended**: Create the abort signal first and treat a `running` job older than the job timeout plus a margin as failed `internal` in the store (`purgeExpired`/`hasActive`)
  - Strength: Bounds every non-terminal state with no timers, matching the store's lazy-purge design.
  - Tradeoff: One more rule in the store and two small tests (stale running job, hung catalog load).
  - Confidence: HIGH — the store already purges lazily on `create` and `get`.
  - Blind spot: Whether Prisma's pool or driver already enforces a connect/query timeout that makes a true hang impossible.
- **Fix B**: Only race `findAll` against the signal inside the pipeline
  - Strength: Smallest change and fixes the known path.
  - Tradeoff: Any other way a job stays `running` still blocks the owner.
  - Confidence: MEDIUM — covers the one verified path only.
  - Blind spot: Other stuck paths are unknown.
- **Decision**: FIXED via Fix A — abort signal now created before the catalog load (which is raced against it), and `running` jobs older than 12 minutes are failed `internal` lazily in the store; tests added

### F2 — The original provider error is discarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-model.client.ts:78-83; plan-pipeline.service.ts:155
- **Detail**: Every non-`NoObjectGeneratedError` becomes `PlanModelError('unavailable')` with no cause, and the log shows only `modelError=unavailable`. A bad key, an unknown model id, a 429 quota error, an unsupported option and a real outage are indistinguishable in logs and to the user. Logging the SDK message or body would be wrong, because `APICallError` carries the request body, which includes goals.
- **Fix**: Carry `error.name` and `statusCode` (when present) on `PlanModelError` and add them to the existing warn line, never the message or body.
- **Decision**: FIXED — `PlanModelError` carries `causeName` and `statusCode`; the warn line logs them, never the message or body; tests added

### F3 — Spec fixtures do not type-check and nothing catches it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/plan-generation/plan-prompts.spec.ts:16,24; plan-pipeline.service.spec.ts:29
- **Detail**: Verified with `npx tsc --noEmit`: the fixtures use `'intermediate'` and `'beginner'`, but the Prisma `ExerciseLevel` values are `'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'`. `tsconfig.build.json` excludes specs and Vitest does not type-check, so the specs assert a shape production never produces (the real catalog lines carry upper-case levels).
- **Fix**: Change the fixtures to the enum values and type the pipeline catalog fixture instead of casting through `unknown[]`.
- **Decision**: FIXED — fixtures use the Prisma enum values and a typed catalog; `tsc --noEmit` is clean

### F4 — Job page keeps the previous job's state when `jobId` changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/PlanGenerationPage.tsx:41,44-102
- **Detail**: `polledState` lives in `useState` and the effect never resets it. With browser back or forward between two `/plans/generate/:jobId` URLs, React Router reuses the component and the previous job's plan or failure shows until the new poll answers. Verified by reading the code.
- **Fix**: Render the page with `key={jobId}` (a small wrapper component), or reset to `{ status: 'polling', stage: null }` at the start of the effect.
- **Decision**: FIXED — `PlanGenerationPage` is a wrapper keying the inner page by `jobId`

### F5 — Polling ends in a dead end while the job keeps running

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/PlanGenerationPage.tsx:69-76
- **Detail**: After 3 consecutive failures (about 9 seconds) the page shows the generic error while the server job continues. "Start again" then returns 429 `active_job` for up to 10 minutes, and the job id lives only in the URL, with no way to resume polling. There is also no overall polling cap, so a stuck backend job (F1) polls forever.
- **Fix A ⭐ Recommended**: Add a "Retry" action on the generic error that restarts polling for the same job id, and cap total polling time (for example 12 minutes) with a distinct "taking too long" message
  - Strength: Fixes both the dead end and the unbounded poll with a small state change.
  - Tradeoff: One more state and button, and copy for the timeout case.
  - Confidence: HIGH — the effect already owns the controller and timer.
  - Blind spot: Not tested with a real flaky network.
- **Fix B**: Make failures slower to give up (more consecutive failures)
  - Strength: One constant.
  - Tradeoff: Does not remove the dead end or the unbounded poll.
  - Confidence: MEDIUM
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — Retry action and a 12-minute polling cap with a distinct message

### F6 — Plan bookkeeping does not match what happened

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/first-plan-generation/plan.md:25,36,183,252,419; change.md
- **Detail**: (a) Progress rows 2.5 and 3.6 are ticked and their Deviation notes say the `daily_limit` half was moved to check 4.5, but the 4.5 Progress row does not mention it and `change.md` records no deployed daily-limit evidence. The user did see the daily-limit message on the deployed page during this session, but it is written down nowhere. (b) Key Discoveries line 25 still says `.env.example` documents `gpt-5.6-luna`, while the confirmed id is `gpt-6-luna`. (c) The plan still assumes a single Fly machine while a second machine exists; the risk is only in `change.md`, and `lessons.md` asks for deviations to be recorded in plan.md.
- **Fix**: Add a dated note to `change.md` recording the deployed daily-limit check, add a dated Deviation under Phase 4 for the machine count and model id, and update plan line 25.
- **Decision**: FIXED — change.md note, plan Deviation under Phase 4, plan line 25 updated

### F7 — Risky behaviors have no tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: backend/src/plan-generation/plan-pipeline.service.spec.ts; plan-generation.controller.spec.ts
- **Detail**: No pipeline test for job abort or timeout, none for a hung catalog load, none for goals made only of `<` and `>`, and no HTTP-level check of the 202 status, the 429 `{code}` body or the validation-pipe wiring (the controller spec calls methods directly). The "never logs goals" test passes trivially because nothing logs the form; it is an acceptable regression guard.
- **Fix A ⭐ Recommended**: Add a fake-timer abort test on the pipeline and a hanging-`findAll` test with F1, and one supertest check for 202 and 429
  - Strength: Covers the behaviors that cost money or block users.
  - Tradeoff: The e2e harness has a pre-existing `supertest/types` error, so the HTTP check needs a small setup fix first.
  - Confidence: MEDIUM — the pre-existing error is untouched.
  - Blind spot: How much work the supertest setup is.
- **Fix B**: Add only the pipeline-level tests
  - Strength: No harness work.
  - Tradeoff: HTTP wiring stays untested.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — pipeline abort/timeout and hung-catalog tests, `<>` goals test, and an HTTP spec (`test/plan-generation.e2e-spec.ts`, 8 tests)

### F8 — Spend is limited per user only, and resets on deploy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-limiter.ts:17; plan.md:28,295,345
- **Detail**: There is no global concurrency or budget cap, sign-up is open with unverified email so new accounts evade the per-user limit, the limiter resets on restart or deploy, and failed jobs (including platform faults) count toward the daily quota. Worst case is 8 provider requests per job. The plan accepts this and names the provider-side spend alert as the backstop; nothing in the repo shows that alert exists. The "store is bounded by the daily limit" claim holds per user only.
- **Fix**: No code change now. Confirm the OpenAI spend limit is set, and track a global cap or database-backed counters with the follow-up that moves jobs out of memory.
- **Decision**: ACCEPTED — design kept; the user will confirm the OpenAI spend limit; global cap or database-backed counters go with the follow-up that moves jobs out of memory

### F9 — Prompt injection through goals is contained, with small residuals

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-prompts.ts:23,58-61,94
- **Detail**: Goals are limited to 500 characters, delimited and stripped of `<` and `>`, and the output must satisfy the slug enum and the validator, so the blast radius is small and results are shown only to their owner as plain text. Residuals: fullwidth `＜` and newlines are not neutralized, and the draft JSON in `<draft_plan>` is embedded unescaped, so a draft's free text could carry a second-order injection into the review pass. Neither widens the blast radius.
- **Fix**: Accept for now; if tightened later, also strip fullwidth angle brackets and collapse newlines in goals.
- **Decision**: FIXED — fullwidth brackets stripped and whitespace collapsed in goals; tests added

### F10 — Minor pattern items

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/plan-generation/plan-limiter.ts, plan-validator.ts, plan-prompts.ts; frontend/src/pages/{NewPlanPage,PlanGenerationPage,HomePage}.tsx; frontend/src/lib/plan-generation.ts:135
- **Detail**: Three files lack the dotted role suffix their siblings use (`plan-job.store`, `plan-model.client`, `plan-pipeline.service`); `GENERIC_PLAN_ERROR` is duplicated in three pages; the poll response is cast `as PlanJobView` with no shape check; "Start again" loses the form input.
- **Fix**: Optional cleanup: rename the three files, extract one shared error constant, and leave the rest.
- **Decision**: FIXED — three files renamed to `plan.limiter`, `plan.validator`, `plan.prompts`; shared `GENERIC_PLAN_ERROR` in `frontend/src/lib/error-messages.ts`
