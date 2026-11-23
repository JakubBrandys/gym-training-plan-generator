---
date: 2026-11-04T12:30:00+01:00
researcher: Claude Code (claude-sonnet-5-5)
git_commit: ecef6dcfc342050f8f607ebce993950a04997345
branch: main
repository: gym-training-plan-generator
topic: "Rollout Phase 1 of test-plan.md: does a generation end in an honest state (Risk #2 unusable pipeline result shown as a plan, Risk #1 restart or deploy mid-generation)?"
tags: [research, codebase, plan-generation, plan-job-store, validator, watch-loop, test-plan, restart]
status: complete
last_updated: 2026-11-04
last_updated_by: Claude Code (claude-sonnet-5-5)
---

# Research: Generation outcome integrity (test-plan Phase 1, Risks #2 and #1)

**Date**: 2026-11-04T12:30:00+01:00
**Researcher**: Claude Code (claude-sonnet-5-5)
**Git Commit**: ecef6dcfc342050f8f607ebce993950a04997345 (working tree has uncommitted test-plan and change-folder files only; no application code was modified)
**Branch**: main
**Repository**: gym-training-plan-generator

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`. Verify or correct the response guidance for:

- **Risk #2**: an unusable pipeline result (malformed output, off-catalog exercises, wrong shape, failed or retry-exhausted model call) reaches the user as a normal plan.
- **Risk #1**: the server restarts or deploys mid-generation and the user is left on endless progress, a blank screen or a dead job instead of being told to start again.

For each risk: ground the real failure path, check the "must challenge" assumptions, find existing tests, and name the cheapest useful test layer.

## Summary

**Risk #2 (server side) is mostly protected in code today; the gaps are in the tests and one client-side seam.**

- On the inspected path, a job becomes `completed` in one place, and only after the final (review-pass) plan has passed `validateGeneratedPlan`; the draft is never returned (`plan-pipeline.service.ts:84-91`, `:158-176`). Two of the three assumptions to challenge are false in this code: validating only the draft would not suffice and the code does not do that, and a successful retry result is validated like any other.
- The catalog is enforced twice: by a `z.enum` built from the live catalog per job (`plan.schema.ts:16`) and by the validator (`plan.validator.ts:70`). "Schema-valid means catalog-valid" holds at runtime only because both use the same per-job snapshot.
- Each of the five failure modes in the guidance ends as a failed job with `plan === null` on the inspected path (Section 3). Two wording corrections: the backend emits one of three codes (`invalid_output`, `provider_unavailable`, `internal`), and the user-facing text lives in the frontend; and the pipeline retries only invalid output, not provider errors or timeouts.
- Test gap: the bad-output fixture the pipeline spec uses for validation failures is `rampViolation` (`plan-pipeline.service.spec.ts:74`; the pipeline worker found no other), which is a plan built to trip the validator's own frequency rule. Off-catalog, wrong week count and empty plan have validator-level tests only and no pipeline-level test. The pipeline spec's fake model bypasses the schema, so an off-catalog slug at that layer would be caught only by the validator, which makes it a useful wiring check.
- Client seam: the frontend has no shape check on a completed plan and no error boundary. A completed snapshot with a truthy `plan` is rendered as given (`plan-generation-watch.ts:43-46`); `weeks: []` would render as a success with Save enabled, and a missing array would throw in `PlanView`. This only matters if the server contract is broken, but it is the one place where a bad plan could still reach the screen.

**Risk #1: the server side is already pinned by existing tests; the open question is client and infrastructure behaviour.**

- A restart empties the in-memory job store and limiter (`plan-job.store.ts:59-60`, `plan.limiter.ts:17`). Afterwards the snapshot, stream and save-by-job-id endpoints answer 404, identical to an unknown id (`plan-generation.controller.ts:144-147`, `saved-plans.service.ts:74-77`). Existing tests already assert those responses for unknown ids, so a "recreate the store" backend test would add little signal.
- The client shows an honest "could not be found or has expired" with a "Start again" link when the server answers 404 on the stream, the snapshot, or the post-completion snapshot (`plan-generation-watch.ts:90-93`, `:131-134`, `:171-174`; `PlanGenerationPage.tsx:175-199`).
- It does not show that message when the restart window returns a non-404 failure (5xx, refused connection) or a dropped stream: those outcomes become `failed` (`plan-generation-stream.ts:53`, `:62`, `:76`), then back-off, then polling, then `error` with a generic message and a Retry button (`plan-generation-watch.ts:190-198`, `:95-100`; `PlanGenerationPage.tsx:180-196`). Which one the user sees after a real deploy depends on what Fly's proxy returns during the swap, which is not in the repo.
- There is no spec for `plan-generation.ts`, `plan-generation-stream.ts` or `plan-generation-watch.ts`, and the page spec mocks the whole watch layer. The watch loop, which carries the restart behaviour, has no test.
- Hypothesis (a) "refresh resumes the same job" is true only within one server process; after a restart it is false, and the project accepted that by design in three archived slices.

**Consequence for the plan:** the cheapest high-signal tests for Risk #1 are frontend tests of the watch loop with a faked `fetch` and a manual deploy smoke, not a backend store reset. The test plan's Phase 1 wording ("backend integration ... job-store reset") should be corrected (see "Corrections to the test plan").

## Detailed Findings

### 1. How a job becomes `completed` (Risk #2)

- `PlanPipelineService.run` loads the catalog, runs a drafting pass, runs a reviewing pass with the draft in its prompt, and calls `store.complete` with the reviewed plan (`plan-pipeline.service.ts:62-94`; `complete` at `:91`). Anything thrown inside goes to `failJob` (`:92-93`). `run` has one outer try/catch, and the controller calls it fire-and-forget (`void this.pipeline.run(...)`, worker-reported at `plan-generation.controller.ts:91`).
- Each attempt of each pass calls `validateGeneratedPlan(result.output, form, slugs)` and returns the plan only if the result is `ok` (`plan-pipeline.service.ts:158-176`). There is no path from the draft to `complete`; a failed review fails the job (unit tests at `plan-pipeline.service.spec.ts` for "review invalid twice", worker-reported).
- `toPlanResult` joins `name` and `imageKey` from the catalog onto the validated plan, with fallbacks `entry?.name ?? exercise.slug` and `entry?.imageKey ?? null` (`plan-pipeline.service.ts:198-209`). For validated input these fallbacks are unreachable by construction (the slugs come from the same snapshot), but they would silently mask a mismatch if the two ever diverged.
- Save trusts the job: `saved-plans.service.ts:74-80` requires `job.status === 'completed' && job.plan` and does not re-validate.

### 2. What is and is not validated

From `plan.validator.ts` (read in full, 149 lines) and `plan.schema.ts:5-27`:

- Checked: exactly 8 weeks (`:115`); when there are 8 weeks, week 1 sessions equal the current frequency, week 8 equals the desired frequency, and each step is 0 or one toward the target (`:21-50`, `:119-121`); week numbers are sequential (`:125`); goal at most 200 characters (`:130`); session title at most 80 (`:137`); per session 3-10 exercises (`:58-65`), slug in the catalog (`:70`), no repeated slug within a session (`:73`), sets 1-8 (`:77`), rest 15-600 seconds (`:82`), reps trimmed non-empty and at most 20 characters (`:90`), note at most 200 characters or null (`:98`).
- Not checked in the validator: that `goal` or `title` are non-empty, the content or format of `reps` beyond length, that `imageKey` resolves, level or equipment fit, muscle balance or goal fit (those exist only as prompt requests, worker-reported at `plan.prompts.ts`). The schema adds no range or length rules beyond `z.enum` on the slug and integer types (`plan.schema.ts:9`, `:16-19`).
- Catalog source: a live query on each run with no cache (`exercises.service.ts:9-11`, worker-reported); an empty catalog fails the job as `internal` (`plan-pipeline.service.ts:66-68`).

### 3. Retry semantics and end state per failure mode

- `ATTEMPTS_PER_PASS = 2` (`plan-pipeline.service.ts:29`), so a job makes at most 4 model calls from the pipeline's own loop, on top of an SDK-level `maxRetries` (`plan-model.client.ts:82`, value not re-read) that the pipeline cannot see.
- A retry is triggered by a validator rejection or by a `PlanModelError` whose code is not `unavailable` (`plan-pipeline.service.ts:158-190`). A `PlanModelError('unavailable')`, which the client uses for abort, timeout and provider errors (worker-reported at `plan-model.client.ts:120-125`), fails the job at once as `provider_unavailable` without a pipeline retry (`plan-pipeline.service.ts:181-183`).
- Retry feedback: the issue strings are appended to the base prompt; the previous bad answer is not echoed back, and a schema-level failure feeds back only a generic message (worker-reported at `plan.prompts.ts:30-31`, `:103-111`).
- End state by mode, from the code (outcome codes are the three in `plan-generation-watch.ts:38`; text lives in `PlanGenerationPage.tsx:13-22`):

| Mode | Observed end state on the inspected path | Anchor |
|---|---|---|
| Malformed JSON | Treated as invalid output: one retry, then `failed`, code `invalid_output`, no plan. The exact SDK exception on a failed parse is inferred from the mapping and mocks, not observed. | `plan-pipeline.service.ts:184-190` |
| Schema-valid but off-catalog | Caught first by the `z.enum` (inferred to surface as invalid output), and independently by the validator. Ends `failed`, `invalid_output`. | `plan.schema.ts:16`, `plan.validator.ts:70` |
| Wrong week count | Only the validator catches it (the schema has no array length rule). Retry with issues, then `failed`, `invalid_output`. | `plan.validator.ts:115` |
| Empty plan | `weeks: []` fails the week count; empty sessions fail the frequency rule when week 1 must equal a non-zero current frequency; fewer than 3 exercises fails the exercise count. Ends `failed`, `invalid_output`. | `plan.validator.ts:58-65`, `:115`, `:29` |
| Provider error or timeout | No pipeline retry. `failed`, `provider_unavailable`. Job-wide abort after 10 minutes. Any other thrown error ends `failed`, `internal`. | `plan-pipeline.service.ts:64`, `:174-183`; `plan-job.store.ts:34` |
| Job stuck running | A running job older than 12 minutes is flipped to `failed/internal` by a lazy purge on `create`, `get` and `hasActive`; there is no timer. | `plan-job.store.ts:35`, `:205-216` |

- Fixed-error wording correction: the failed job view carries the code, and the three user-facing messages are chosen in the frontend. "A fixed user-facing error" in the test plan should read "one of three codes, and the matching message".

### 4. Existing backend tests and fixtures (Risk #2)

- The pipeline spec injects a local, unexported `FakePlanModelClient` by direct construction with an `as unknown as PlanModelClient` cast (`plan-pipeline.service.spec.ts:90`, `:157`). `PlanModelClient` is a concrete class with no interface or injection token (worker-reported at `plan-model.client.ts:57-61`).
- Fixtures: `buildPlan(counts)` is a hand-written 8-week plan using six catalog slugs (`plan-pipeline.service.spec.ts:55`); `rampViolation` is `buildPlan([3,3,3,3,3,3,3,4])` (`:74`), derived from the validator's frequency rule. The validator spec has independent hand-written fixtures, including an off-catalog slug `moon-walk` (`plan.validator.spec.ts:187-194`) and 7- and 9-week plans (worker-reported at `:146`, `:155`).
- Coverage by layer, as reported by the pipeline worker and spot-checked for the fixtures above: provider errors, aborts, retry exhaustion and "draft not leaked" are covered at pipeline level; off-catalog, wrong week count and empty plan are covered at validator level only; no test runs a real SDK parse of bad model output (the client spec mocks `ai`).
- The HTTP e2e stubs the pipeline entirely (`{ provide: PlanPipelineService, useValue: { run: pipelineRun } }`, `plan-generation.e2e-spec.ts:90`), so it exercises routing and streaming and has no outcome tests.
- No exported, shared backend fixture builds a full `PlanResult` (with names and image keys) for 8 weeks; the backend e2e plan is one week with one exercise (worker-reported at `saved-plans.e2e-spec.ts:209`); the frontend has `buildSamplePlan` for display (`frontend/src/dev/sample-plan.ts`, worker-reported).

### 5. What a restart does on the server (Risk #1)

- Job state is two in-process maps (`plan-job.store.ts:59-60`, worker-reported); retention is 1 hour after finish (`:33`); `get(jobId, ownerId)` returns `undefined` for an unknown, foreign or purged job, so "never existed", "expired" and "lost on restart" are indistinguishable.
- Endpoint behaviour when the job is gone, on the inspected path:
  - Snapshot GET and stream GET answer `NotFoundException` (404). For the stream the throw happens before any header is written (`plan-generation.controller.ts:144-147`), so the response is a JSON 404, not an event stream.
  - Save by job id looks up an already-saved row first (`saved-plans.service.ts:69-72`), then the job (`:74-77`), then rejects a non-completed job with 409 `not_completed` (`:78-80`). So after a restart: a plan saved earlier is returned (idempotent); a plan completed but never saved gets 404; a job that was running at the restart also gets 404.
- Mid-stream restart: the socket is cut. The server has no shutdown handling: `main.ts:4-13` does not call `enableShutdownHooks`, and a search of non-spec backend source for `enableShutdownHooks`, `SIGTERM`, `OnApplicationShutdown` and `beforeApplicationShutdown` found no match. The in-flight pipeline is abandoned with the process (no abort tied to shutdown, worker-reported).
- The limiter keeps its rolling-24-hour window in memory and "one at a time" is `store.hasActive` (`plan.limiter.ts:17`, `:27`), so both reset on restart; a user can exceed 5 per 24 hours across deploys. This belongs to Risk #5 (test-plan Phase 3).
- Fly config in the repo: one HTTP service with `auto_stop_machines = "off"` and `min_machines_running = 1`, a `/health` check, and a comment that the machine is kept up so SSE streams and in-memory jobs are not lost (`fly.toml:10-25`). The repo sets no `[deploy]` block, kill signal, kill timeout or restart policy. The machine count is not in the repo (an archived deviation records it was reduced to one manually). The deploy workflow runs `prisma migrate deploy` then `flyctl deploy --remote-only` on every push to `main` touching `backend/**`, with no drain step (worker-reported, `.github/workflows/deploy-backend.yml:4-37`).
- UNVERIFIED from the repo: Fly's deploy strategy, kill signal and timeout, what the proxy returns between the old process stopping and the new one accepting requests, and the current machine count.

### 6. What the client does (Risk #1), re-read directly

State machine in `plan-generation-watch.ts:25-31`: `running`, `completed`, `failed`, `not-found`, `error`, `timed-out`.

- **404 on the stream, the snapshot, or the post-completion snapshot** → `not-found` → alert "This plan could not be found or has expired." with a "Start again" link (`plan-generation-stream.ts:52`; `plan-generation-watch.ts:90-93`, `:131-134`, `:171-174`; `PlanGenerationPage.tsx:13`, `:175-179`, `:197-199`). This is the honest path.
- **Stream ends without a terminal event, non-OK status other than 401/403/404, or a thrown error** → outcome `failed` (`plan-generation-stream.ts:53`, `:62`, `:76`). A `reconnect` frame → `closed` (`:66`).
- **Escalation after failures**: a failure with no new event raises the count; back-off is 1 s, then 2 s (`stream-policy.ts:6-7`); the third consecutive failure switches to polling (`stream-policy.ts:3`, `:9-10`; `plan-generation-watch.ts:190-196`). Polling runs every 3 s and emits `error` after 3 consecutive failed snapshots (`plan-generation-watch.ts:21-22`, `:95-100`); a poll that gets 404 emits `not-found` (`:90-93`).
- **User sees after `error`**: the generic message and a plain Retry button, with no "Start again" link (`PlanGenerationPage.tsx:180-196`; the link is rendered only for `completed`, `failed` and `not-found`, `:197-199`).
- **Bound**: by arithmetic from the constants (30 s silence timer `stream-policy.ts:1`, back-offs 1 s and 2 s, 10 s snapshot timeout `plan-generation.ts:69`, 3 s poll interval), an unreachable server reaches `error` in about 9 s when requests fail fast and in at most about 129 s when each attempt hangs until its timer. During that time the UI keeps the last progress state, because a failed poll below the third emits no state (`plan-generation-watch.ts:95-110`). Connection set-up time is not included.
- **Honest-or-not matrix**: 404 anywhere on the three endpoints → honest "Start again". Connection refused or 5xx during the deploy swap → bounded, then generic Retry; a later Retry press against the restarted server then gives the 404 "Start again" message. Which one the user meets on a real deploy is UNVERIFIED (Section 5).
- **Weaker spots found**: an unknown snapshot status is treated as running until the 12-minute cap, since `settleFromSnapshot` returns `null` (`plan-generation-watch.ts:50`, `:103-109`), although the server's job view uses three statuses; the 12-minute cap is checked only between connections and after polls (`:75`, `:112`, `:147`), and every received chunk, comments included, rearms the silence timer (`plan-generation-stream.ts:63`), so a stuck job behind a healthy heartbeat is bounded by the server's reconnect window and stale-job rule rather than by the client (the ~4-minute window value is worker-reported from `plan-stream.config.ts`).
- **Refresh**: a remount starts a new watch with no `Last-Event-ID` (`plan-generation-watch.ts:140-142`); only the job id in the URL persists. After a restart that job id is unknown to the server.

### 7. Shape of a completed plan on the client (Risk #2, last mile)

- `settleFromSnapshot` accepts any truthy `job.plan` as `completed` (`plan-generation-watch.ts:44-46`); the snapshot body is cast `as PlanJobView` without validation (`plan-generation.ts:123`).
- `PlanView` and the summary read arrays directly: `plan.weeks.find(...) ?? plan.weeks[0]`, `plan.weeks.length`, `week.sessions.map`, `session.exercises.length` and `key={exercise.slug}` (`PlanView.tsx:66-77`, `:95-102`; `plan-stats.ts:12-28`).
- A search of non-spec frontend source for `errorElement`, `ErrorBoundary` and `componentDidCatch` found no match, and `router.tsx` and `main.tsx` contain none. Inferred: a render exception would fall to the router's default error screen, replacing the app shell (not run).
- Inferred from the code reads above, not run: `weeks: []` renders a zero-week summary, no week section and, on the generation page, a Save button; a plan with fewer than 8 weeks renders whatever is present; duplicate slugs in a session give duplicate React keys.
- Server-side test data confirms nothing on the store side rejects such a shape: backend e2e tests call `store.complete(job.id, { weeks: [] })` (`plan-generation.e2e-spec.ts:219`, `:291`). Whether `complete` validates is not read; the call being accepted at runtime in a passing test indicates it does not.

### 8. Save after the job vanished (Risk #1, last step)

- Frontend mapping in `PlanGenerationPage.tsx:89-116`: `not-found` → "This plan has expired and can no longer be saved. Generate a new one." (`:100-103`, `:17`), the plan stays on screen; `ok` → navigate to the saved plan; 401 or 403 → sign out; every other result, including `not-completed` (409) and any error, → the generic message (`:110`, `:112`). A 409 therefore shows "Something went wrong, try again" even though it names a persistent condition.
- Backend: see Section 5. The server answers 404 for a job lost on restart, so the honest message is reachable in the restart case.

### 9. Test infrastructure facts for the plan

- Backend e2e builds a module with explicit providers and a header-driven guard (`USER_HEADER = 'x-test-user'`, `plan-generation.e2e-spec.ts:25`); `PlanJobStore` and `PlanLimiter` are real instances; the pipeline is stubbed (`:74`, `:90`); no database is used. The saved-plans e2e uses a real `PlanJobStore` and an in-memory `FakeSavedPlanTable` in place of Prisma (`saved-plans.e2e-spec.ts:65`, `:263`); expiry is simulated by faking `Date` only (`vi.useFakeTimers({ toFake: ['Date'] })`, `:317`, `:366`).
- No helper simulates a restart. The store has no clear or reset method (worker-reported), so with the existing helpers a restart can be built from a second module or a new `PlanJobStore` (`saved-plans.service.spec.ts:163` does the latter for the idempotent-save-after-purge case).
- Frontend: no spec exists for `plan-generation.ts`, `plan-generation-stream.ts` or `plan-generation-watch.ts` (confirmed from the `frontend/src/lib` directory listing). `PlanGenerationPage.spec.tsx` mocks `watchPlanGeneration`, `saveGeneratedPlan` and `useAuth` (`:11-13`) and, per the frontend worker, covers only the Save control; it feeds each state by hand, so it cannot show that a 404 or a restart produces a state. `saved-plans.spec.ts` shows a usable pattern for the missing layer: mock `./api` and return real `Response` objects (worker-reported, `:15`, `:34-39`).
- The dev kitchen sink, per the frontend worker (not re-read), has only the completed generation view; running, not-found, error, failed and timed-out states of the generation page are not shown, which the project's UI contract asks for.

## Verdict on the response guidance

| Test-plan statement | Verdict |
|---|---|
| #2 every failure mode ends failed with a fixed error, never a completed plan with invalid exercises | Holds on the inspected server path. Wording: three codes, not one error; retry applies to invalid output only. |
| #2 challenge: schema-valid means catalog-valid | Holds at runtime only through the shared per-job snapshot; two layers enforce it. The test should pin that the validator alone also rejects it. |
| #2 challenge: the review pass fixes the draft so validating the draft suffices | False in this code; the reviewed plan is validated and the draft is never returned. The test should pin "final plan is validated". |
| #2 challenge: a successful retry implies a valid result | True here: retry results go through the same validator. |
| #2 cheapest layer: integration with a fake model and a table of bad outputs | Confirmed. Use pipeline-level tests, not the e2e (it stubs the pipeline). |
| #1 after restart, refresh/stream/save end in "start again" | Server: 404 on all three. Client: honest on 404, generic Retry on 5xx or refused. Save: honest. |
| #1 challenge: refresh resumes the same job after a restart | False after a restart (accepted by design in the archive). |
| #1 challenge: a 404 means the user is told | True for 404 on all three client paths; not applicable when the response is not a 404. |
| #1 cheapest layer: backend integration with a store reset plus a frontend state test | Correct the first half: a backend store reset repeats existing unknown-id assertions. The signal is in the frontend watch loop and in one real deploy. |

## Code References

- `backend/src/plan-generation/plan-pipeline.service.ts:29` - `ATTEMPTS_PER_PASS = 2`
- `backend/src/plan-generation/plan-pipeline.service.ts:62-94` - `run`: catalog, draft, review, `complete`
- `backend/src/plan-generation/plan-pipeline.service.ts:158-190` - per-attempt validation, retry and failure mapping
- `backend/src/plan-generation/plan-pipeline.service.ts:198-209` - `toPlanResult` and its unreachable fallbacks
- `backend/src/plan-generation/plan.validator.ts:107-149` - `validateGeneratedPlan`; `:70` catalog check; `:115` week count
- `backend/src/plan-generation/plan.schema.ts:16` - `z.enum(slugs)`
- `backend/src/plan-generation/plan-job.store.ts:33-35` - retention 1 h, job timeout 10 min, stale 12 min; `:205-216` lazy purge
- `backend/src/plan-generation/plan-generation.controller.ts:144-147` - stream 404 before headers
- `backend/src/plan-generation/plan.limiter.ts:17`, `:27` - in-memory limiter state
- `backend/src/saved-plans/saved-plans.service.ts:68-80` - save order: saved row, job, completed check
- `backend/src/main.ts:4-13` - no shutdown hooks
- `backend/fly.toml:10-25` - keep-up settings and health check
- `frontend/src/lib/plan-generation-stream.ts:52-76` - status and end mapping
- `frontend/src/lib/plan-generation-watch.ts:43-51`, `:77-120`, `:122-138`, `:146-199` - settle, poll, escalate
- `frontend/src/lib/stream-policy.ts:1-20` - thresholds and back-off
- `frontend/src/lib/plan-generation.ts:69`, `:119-123` - snapshot timeout, 404 mapping, unvalidated cast
- `frontend/src/pages/PlanGenerationPage.tsx:13-22`, `:89-116`, `:175-199` - messages, save handling, state rendering
- `frontend/src/components/PlanView.tsx:66-102`, `frontend/src/lib/plan-stats.ts:12-28` - unguarded shape access
- `backend/src/plan-generation/plan-pipeline.service.spec.ts:55`, `:74`, `:90`, `:157` - fixtures and fake model
- `backend/test/plan-generation.e2e-spec.ts:74`, `:90`; `backend/test/saved-plans.e2e-spec.ts:65`, `:263`, `:317` - e2e construction

## Architecture Insights

- Server contract on the inspected path: a failed job carries a code and no plan, a plan is attached on completion, and ownership failures and missing jobs share one 404. The UI chooses all user-facing wording.
- The catalog gate is defence in depth: model-facing schema plus validator, both fed from one per-job catalog snapshot.
- Job state, events and limits are one in-memory unit by design. Loss on restart is therefore total and consistent (no phantom running slot), and the symptom on a later request for a lost job is a 404 (a connection cut mid-stream is the symptom for a stream that was open).
- The client's honesty after a restart depends on the HTTP status of the first failed request, not on the job's absence.

## Historical Context (from prior changes)

All items below were read by a delegated worker; line anchors are the worker's.

- `context/archive/2026-10-14-first-plan-generation/plan.md:355` - "Jobs are lost on restart or deploy by design; the user sees the 'not found, start again' message." Same stance at `plan.md:32` and `plan-brief.md:61`.
- `context/archive/2026-10-24-live-generation-progress/plan.md:43` - persistence and surviving a restart are out of scope; a restart ends in "could not be found". Manual row 5.6 ("Restarting the Fly machine mid-run ends in the 'could not be found' copy with a Start again link, not a hang") at `plan.md:297`, `:412` is unticked, as are rows 5.4, 5.5 and 5.7. The restart-mid-run behaviour was therefore not recorded as verified in that slice.
- `context/archive/2026-10-27-save-and-view-plan/plan.md:237`, `:406` - manual row 3.6 "server restarted, Save shows the expiry message" is ticked.
- `context/archive/2026-10-14-first-plan-generation/plan.md:307` and `change.md:21` - a second Fly machine split jobs and limiters and produced a 404 for a running job; kept at one machine "until jobs and counters move out of memory".
- `context/archive/2026-10-14-first-plan-generation/plan.md:49`, `:105`, `:171` - the retry-with-feedback and validator contracts that the code matches.
- `context/archive/2026-10-14-first-plan-generation/change.md:14-19` - the 2026-10-24 quality check with three profiles: the frequency ramp held; weeks after the last frequency change repeat; the review pass's contribution was not measurable because the draft is not stored. Relevant to Risk #7 (Phase 4), not to this phase.

## Related Research

- `context/foundation/test-plan.md` - Risks #1 and #2 and their response guidance, which this document verifies.
- None under `context/changes/**/research.md` for this topic.

## Corrections to the test plan (for the backport check)

Findings that change §2 or §3 of `context/foundation/test-plan.md`; none adds a code anchor.

1. **Risk #1 response guidance, layer**: replace "integration (recreate the job store between requests) plus a frontend state test" with "frontend watch-loop tests with a faked `fetch`, plus one manual deploy smoke"; a backend store reset repeats existing unknown-id tests.
2. **Risk #1 wording**: add the distinction the user will actually experience, 404 ("start again") versus a non-404 failure ("something went wrong, retry"), as the thing to prove or deliberately accept.
3. **Risk #2 "what would prove protection"**: replace "the fixed error" with "one of three failure codes and no plan"; replace "error or timeout after retries" with "invalid output after retries; provider error or timeout fails without a pipeline retry".
4. **Risk #2 context**: add the client-side shape seam (no guard, no error boundary) as a context item; whether it becomes a test or a safeguard is a plan decision.
5. **§3 Phase 1 test types**: "job-store reset" becomes "frontend watch-loop tests"; backend work shrinks to pipeline-level bad-output tests.
6. **Cross-reference**: the limiter resets on restart; record under Risk #5 (Phase 3).

## Open Questions

For `/10x-plan` to settle with the user; none blocks the research.

1. **Client shape guard**: should the frontend get a guard (and/or a router error element) so that a malformed completed plan ends in an honest error, or is the server the accepted owner of the contract? Adding a guard is a safeguard, not a test.
2. **5xx or refused connection during a deploy**: keep the generic "something went wrong, retry" (second press then shows "start again"), or treat repeated failures as "start again"? This is a product choice.
3. **What Fly returns during the swap** (404, 502 or refused) and the real deploy strategy and machine count: a real deploy is the way to answer it; this is the manual smoke, and it would also close the unticked archived row 5.6.
4. **Which path let off-catalog output reach the screen** in the incident behind interview Q2, and whether it predates the validator, is unknown. The user may know.
5. **Graceful shutdown** (`enableShutdownHooks`) is absent; adding it is out of scope for a testing change unless the user wants it.
6. **Stale "Drafting…" up to about two minutes during an outage**: acceptable, or should an outage indicator appear?
7. **Shared test helpers**: the fake model client and plan builders are local to one spec; extracting them is needed for pipeline-level tables and for later phases, and is a plan decision.

## Verification note

Re-read directly in the main session: `main.ts`, `plan-pipeline.service.ts` (60-95, 158-212), `plan.validator.ts` (all), `plan.schema.ts` (1-40), `plan-job.store.ts` (205-217), `saved-plans.service.ts` (66-82), `plan-generation.controller.ts` (140-150, 175-182), `fly.toml` (8-30), `plan-generation-stream.ts` (all), `plan-generation-watch.ts` (all), `stream-policy.ts` (all), `plan-generation.ts` (85-128), `PlanGenerationPage.tsx` (89-116 and state-message greps), and greps for shutdown hooks, error boundaries, store constants and test fixtures. Several line numbers given by the delegated workers for the validator, schema and stream files did not match the files and were replaced with anchors from the direct reads. Items marked "worker-reported" were not re-read and keep the worker's anchors. Nothing was run.
