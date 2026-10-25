# Live Generation Progress Implementation Plan

## Overview

Replace the 3-second poll on the plan-generation job page with a live progress stream. The model call becomes a streamed structured-output call, so the pipeline can report which week is being written, when validation runs and when a retry starts. A Server-Sent Events endpoint pushes those events to the SPA, which reads them with a fetch stream so the existing Bearer auth is reused. Missed events replay on reconnect, and the existing GET snapshot stays the authoritative fallback. This delivers roadmap slice S-03 (FR-006, US-01): continuous, stage-by-stage progress for the whole run, with no dead air and no fixed maximum wait.

## Current State Analysis

- `POST /plan-generations` returns `{ jobId }` and starts `PlanPipelineService.run` fire-and-forget (`backend/src/plan-generation/plan-generation.controller.ts:41-57`). `GET /plan-generations/:jobId` returns a snapshot of `status`, `stage`, `plan` and `error` (`:59-74`).
- The job store is in memory and owner-scoped, holding only `stage` (`'drafting' | 'reviewing'`) and timestamps (`plan-job.store.ts:5-20`). Nothing records events.
- Each pass is one blocking `generateText` call with `Output.object` (`plan-model.client.ts:60-70`). Nothing is observable inside a pass, so the user sees "Drafting your plan…" for the whole pass. That is the dead air this slice removes.
- The job page polls every 3s with a `setTimeout` chain, three-failure tolerance and a 12-minute ceiling (`frontend/src/pages/PlanGenerationPage.tsx:14-16`, `:56-119`).
- Auth is a global guard that accepts only `Authorization: Bearer` (`backend/src/auth/auth.guard.ts:15-44`). Block and expiry are checked once per request (`:51-53`), so a long stream is not re-checked after it opens. Native `EventSource` cannot send that header.
- The SPA's `apiFetch` returns the raw `Response` and reads the Supabase session on every call (`frontend/src/lib/api.ts:3-14`), so `response.body.getReader()` works and each reconnect picks up the latest token.
- There is no compression middleware and CORS reflects request headers (`backend/src/main.ts:5-12`), so nothing buffers a stream and no CORS change is needed. `fly.toml` already has `auto_stop_machines = "off"` and `min_machines_running = 1`, and its comment still says "WebSocket".
- S-02 left room explicitly: the job exposes `stage` and `updatedAt` so S-03 can extend it, and the transport was left undecided (`context/archive/2026-10-14-first-plan-generation/plan.md:33`, `:153`).

## Desired End State

A user submits the form and lands on the job page. The page shows the current pass ("Drafting your plan" or "Reviewing your plan"), the week being written ("week 3 of 8") with a progress bar, a live elapsed timer, and short notices when the plan is being checked or a retry starts. Progress keeps moving until the plan appears, and a refresh or a dropped connection resumes with nothing lost. If the stream cannot be re-established, the page falls back to polling the snapshot and still shows the plan or the error. Any failure still shows the fixed error copy and never a broken plan.

Verified by a full run on the deployed stack with the weekly progress visible throughout, plus the backend and frontend suites passing.

### Key Discoveries:

- Partial structured output from `streamText` + `Output.object` (`partialOutputStream`) is parsed from accumulated text and is not schema-validated. The last array element can be half-built, so week progress is derived from the array length only (ai 7.0.140, verified in `node_modules/ai`).
- In ai 7, stream errors do not throw from the iterators. They arrive as `error` parts and through `onError`, and `await result.output` rejects with `NoObjectGeneratedError` on parse or validation failure, so the existing error mapping carries over.
- `maxRetries` covers only failures before streaming starts. Mid-stream retry is controlled by `streamRetries` (default 0) and stays off, so a failed stream is never silently re-billed.
- `timeout` accepts `{ totalMs, stepMs, firstChunkMs, chunkMs }` in streaming, so a stall inside a pass is detectable.
- For a reasoning model the first output delta arrives only after reasoning ends. The delay at `reasoningEffort: 'low'` is unmeasured, so it is measured in Phase 2 and Phase 5.
- Fly's idle cut (about 60s, community reports that disagree, not in the official docs) resets while bytes flow, so heartbeats every ~12s are required whatever the exact limit is.
- Nest's `@Sse()` writes headers lazily on the first emitted message, defaults auto-ids to a per-connection counter and does not read `Last-Event-ID`, so the endpoint emits an immediate first frame, sets explicit ids and reads the header itself.
- Test seams already exist: `FakePlanModelClient` with queued replies in `plan-pipeline.service.spec.ts`, and the `HeaderUserGuard` supertest harness in `backend/test/plan-generation.e2e-spec.ts`.
- `WEEK_COUNT = 8` lives unexported in `plan.validator.ts:7`.

## What We're NOT Doing

- Cancelling a running generation, or aborting the job when the stream closes. Closing the tab never stops the job, as in S-02.
- `streamRetries` or any silent re-run of a failed stream. S-02's rule stands: one retry with feedback per pass, then an error.
- Re-checking the user's block or token on every event. Streams are capped and the client reconnects instead.
- Reasoning summaries (`reasoningSummary`), which OpenAI rejects for unverified organizations.
- WebSocket, a stream ticket in the query string, or a new streaming dependency such as `@microsoft/fetch-event-source`.
- Persistence of jobs or events, or surviving a machine restart. A restart still ends in "could not be found" (S-05 owns persistence).
- Sending the finished plan over the stream. The terminal event only signals completion and the client reads the plan from the snapshot.
- Browser e2e tooling (Playwright) and a jsdom or component-test setup for the frontend.
- Streaming the partial plan content to the user (the review UI is S-04).

## Implementation Approach

Build from the inside out so each phase is verifiable alone: the event contract and log first, then the model and pipeline that produce events, then the endpoint that serves them, then the SPA that consumes them, then live verification on the deployed stack. The snapshot endpoint stays and gains the current week, so the polling fallback shows the same progress without events.

New code follows repo conventions: arrow function expressions, no code comments, ESM `.js` import suffixes in the backend, no semicolons and `import type` in the frontend.

## Critical Implementation Details

- **State sequencing**: A `week` event is appended only when the started-week count changes, and counts started weeks (the array length of the partial), so the number never exceeds `WEEK_COUNT`. A retry resets the visible week with a preceding `retrying` event, so the bar never jumps back unexplained.
- **Timing & lifecycle**: The job's lifetime is independent of any stream. The stream closes after a fixed window and on every terminal event, and the job keeps running with its own abort signal. A subscriber added after the job already finished must receive the replay and the terminal event, then close.
- **User experience spec**: The elapsed timer must sit outside the live region, and only pass and week changes may be announced, otherwise a screen reader would read out every second. Progress derives from event timestamps, so a refresh resumes the correct elapsed time.
- **Debug & observability**: The existing per-attempt log lines stay. Add one log line per stream open and close with the job id, the `Last-Event-ID` presented and the close reason, and never log the goals text (an S-02 spec asserts this).

## Phase 1: Progress contract and event log

### Overview

Define the progress events and give each job a bounded, replayable event log with live subscribers, and expose the current week on the snapshot. No model or HTTP changes yet.

### Changes Required:

#### 1. Progress event contract

**File**: `backend/src/plan-generation/plan-progress.ts` (new)

**Intent**: Single definition of what the stream can say, shared by the pipeline, store and endpoint.

**Contract**: A discriminated union keyed on `type`: `stage` (pass started, with `stage`), `week` (with `stage` and `week` = started-week count 1..`WEEK_COUNT`), `validating` (with `stage`), `retrying` (with `stage` and `attempt`), `completed`, and `failed` (with an error code from `PlanJobErrorCode`). Every stored event also carries a numeric `id` and an ISO `at` timestamp. `completed` and `failed` are the only terminal types. Export `WEEK_COUNT` from `plan.validator.ts` and reuse it here.

#### 2. Event log and subscribers in the store

**File**: `backend/src/plan-generation/plan-job.store.ts`

**Intent**: Record events per job with monotonic ids and let a consumer replay then follow them, while keeping the existing owner scoping and purge rules.

**Contract**: The job holds an append-only event list whose ids start at 1 and never repeat, plus the latest started week (null before any). The store gains `append(jobId, event)`, and `subscribe(jobId, ownerId, afterId, listener)` returning an unsubscribe function and `undefined` for an unknown or foreign job. `subscribe` first delivers stored events with `id > afterId` synchronously, then forwards new ones. `setStage`, `complete` and `fail` append their matching events (`stage`, `completed`, `failed`), and `finish` notifies subscribers once. The list is bounded by construction (events are emitted only on change, at most two passes with two attempts each), so no cap code is needed, and the list is purged together with its job.

#### 3. Snapshot gains the current week

**File**: `backend/src/plan-generation/plan-generation.controller.ts`

**Intent**: Let the polling fallback show the same progress as the stream.

**Contract**: `PlanJobView` gains `week: number | null`. Existing fields and status codes are unchanged.

**Deviation (2026-10-25):** The contract left some details open, settled during implementation. `plan-progress.ts` also exports `PlanProgressInput` (event without `id`/`at`), `PlanProgressDraft` (non-terminal inputs, the only type `append` accepts, so `completed` and `failed` can come only from `complete` and `fail`), `PlanProgressListener`, `isTerminalProgressEvent` and `isValidWeekNumber`; the `failed` event's field is `code`. `append` ignores a `week` event that is out of range or not greater than the current week, resets the week on `stage` and on `retrying` (so a retry's week 1 is accepted), and is a no-op for unknown or finished jobs, so `setStage` no longer mutates a finished job. Subscriptions live in a store-level map rather than on the job, a subscriber added to a finished job gets the replay and a no-op unsubscribe, and a throwing listener is swallowed. `PlanJob` gained `week` and `events`. The controller and e2e specs' expected snapshots gained `week`.

### Success Criteria:

#### Automated Verification:

- Store specs cover id monotonicity, replay with `afterId`, live delivery, owner isolation, replay-then-terminal for a finished job, and purge: `cd backend && npx vitest run src/plan-generation/plan-job.store.spec.ts`
- Controller spec asserts the snapshot's `week` field: `cd backend && npx vitest run src/plan-generation/plan-generation.controller.spec.ts`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`

---

## Phase 2: Streaming model client and pipeline events

### Overview

Switch each pass from a blocking call to a streamed one so the pipeline can report weeks as they are written, and emit the full set of progress events while keeping every S-02 validation, retry and failure rule.

### Changes Required:

#### 1. Streamed model call

**File**: `backend/src/plan-generation/plan-model.client.ts`

**Intent**: Run the structured-output call with `streamText` and surface partial progress to the caller without changing what a successful or failed call returns.

**Contract**: `PlanModelRequest` gains an optional `onPartial` callback receiving the started-week count whenever it changes. `generate` still resolves to `{ output, usage, finishReason }` and still throws `PlanModelError` with the same `invalid_output` / `unavailable` codes, causeName and statusCode: partial parsing and an `error` part feed the same mapping, and the final `await result.output` is wrapped in the existing try/catch. No `streamRetries`; keep `maxRetries`. Keep the `abortSignal` from the request and the 180s total, and add a first-chunk and a between-chunk stall timeout through the `timeout` object. The values (first-chunk allowance for reasoning, shorter between-chunk limit) are set after the Phase 2 manual measurement.

#### 2. Pipeline emits progress

**File**: `backend/src/plan-generation/plan-pipeline.service.ts`

**Intent**: Turn the model client's partials and the pass lifecycle into store events at the right moments.

**Contract**: In `runPass`, `stage` is appended as the pass starts; the `onPartial` callback appends `week` events (deduplicated by the store or caller); after the stream completes and before the validator runs, `validating` is appended; before an attempt after the first, `retrying` is appended with the attempt number. Terminal `completed` and `failed` come from the existing `store.complete` and `store.fail`. The failure policy, error codes, logging (including the no-goals-in-logs rule) and the "fire-and-forget never rejects" guarantee are unchanged.

**Deviation (2026-10-25):** In the installed ai 7.0.140 a mid-stream provider error does not stop the step: it finishes with finish reason `error` and `result.output` then rejects with `NoObjectGeneratedError` on the truncated text. The client therefore throws the first error recorded by `onError` right after draining the partial stream, so a provider error maps to `unavailable` with the stream error's cause name and status code, while a `NoObjectGeneratedError` with no recorded stream error (for example finish reason `length`) still maps to `invalid_output`. Week counting is a small `countStartedWeeks` helper (array length clamped to `WEEK_COUNT`) and the client reports a week only when the count grows. Stall timeouts are placeholders pending the manual measurement: first chunk 120 000 ms, between chunks 45 000 ms, total 180 000 ms, held as constants at the top of `plan-model.client.ts`. It is unconfirmed whether reasoning chunks reset the first-chunk timer.

### Success Criteria:

#### Automated Verification:

- Model client spec mocks `streamText` and covers a successful stream, partial week counting, a `NoObjectGeneratedError` on the final output, an error part mapping to `unavailable`, and abort: `cd backend && npx vitest run src/plan-generation/plan-model.client.spec.ts`
- Pipeline spec asserts the event order for a clean run, a validation retry, a model-error retry and a hard failure: `cd backend && npx vitest run src/plan-generation/plan-pipeline.service.spec.ts`
- All plan-generation specs pass: `cd backend && npx vitest run src/plan-generation`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`

#### Manual Verification:

- With a real OpenAI key locally, one generation logs the week counter reaching 8 in each pass; record the time from request to the first `week` event for the draft and review passes.
- Using an invalid model id yields a `failed` event with `provider_unavailable`, the job ends as failed, and the log shows no unhandled rejection.

---

## Phase 3: SSE endpoint

### Overview

Serve the event log as a Server-Sent Events stream with heartbeats, replay from `Last-Event-ID` and a capped stream lifetime, behind the existing guard.

### Changes Required:

#### 1. Events endpoint

**File**: `backend/src/plan-generation/plan-generation.controller.ts`

**Intent**: Let an authenticated owner follow a job's events live.

**Contract**: `GET /plan-generations/:jobId/events`, `Content-Type: text/event-stream`, owner-scoped through the store (404 for an unknown or foreign job, exactly like the snapshot). Each frame has `id` (the event id), `event` (the event `type`) and `data` (JSON of the event). It reads `Last-Event-ID` (a non-integer or missing value means 0) and replays stored events after it before following live ones. The first frame is written immediately so headers flush. A comment frame is sent about every 12 seconds. After a terminal event the stream sends it and closes. After a fixed window of about 4 minutes the stream sends a named `reconnect` event (no id) and closes, even if the job is still running. Closing the response unsubscribes and never touches the job. Nothing here applies compression. Whether to build it with Nest `@Sse()` plus an Observable or a raw response is the implementer's choice, provided the explicit-id and immediate-flush requirements hold.

#### 2. Stream constants

**File**: `backend/src/plan-generation/plan-stream.config.ts` (new)

**Intent**: Name the heartbeat interval and stream window so tests can control them.

**Contract**: Exported numeric constants for the heartbeat interval (~12 000 ms) and the stream window (~240 000 ms).

### Success Criteria:

#### Automated Verification:

- Controller specs cover the events handler's replay, terminal close and unknown-job 404: `cd backend && npx vitest run src/plan-generation/plan-generation.controller.spec.ts`
- Supertest e2e covers frames and headers, `Last-Event-ID` replay with no duplicates, heartbeat under fake timers, close after the terminal event, the window close with a `reconnect` event, owner isolation, and 401 without the header: `cd backend && npm run test:e2e`
- Backend unit suite passes: `cd backend && npm run test`
- Backend lint passes: `cd backend && npm run lint`
- Backend build passes: `cd backend && npm run build`

#### Manual Verification:

- `curl -N` with a valid Bearer token against the local backend shows frames as a real generation proceeds and a comment line roughly every 12 seconds.
- Reconnecting with `Last-Event-ID: <n>` returns only events after `n`, and the stream closes itself with a `reconnect` event near the 4-minute window.

---

## Phase 4: Frontend streaming client and job page

### Overview

Add a scoped test setup, a pure SSE parser and progress reducer, a stream loop with reconnect and polling fallback, and the new progress UI on the job page.

### Changes Required:

#### 1. Frontend test framework, scoped

**File**: `frontend/package.json`, `frontend/vite.config.ts`

**Intent**: Test the parser and reducer, the riskiest new frontend code, without a component or browser test stack.

**Contract**: Add Vitest as a dev dependency and a `test` script that runs `vitest run` in a node environment. Specs live beside source as `*.spec.ts` and import `describe`, `it` and `expect` from `vitest` explicitly. `npm run build` (`tsc -b`) and `npm run lint` must keep passing with the specs present.

#### 2. SSE frame parser

**File**: `frontend/src/lib/sse.ts` (new), `frontend/src/lib/sse.spec.ts` (new)

**Intent**: Turn arbitrary byte chunks from a fetch stream into complete SSE frames.

**Contract**: A stateful parser: `feed(text)` returns the frames completed so far, each `{ id, event, data }`. It handles chunk boundaries inside a line or a frame, `\n` and `\r\n`, comment lines (ignored but counted as activity by the caller), multi-line `data`, and frames without an `id`.

#### 3. Progress types and reducer

**File**: `frontend/src/lib/plan-progress.ts` (new), `frontend/src/lib/plan-progress.spec.ts` (new)

**Intent**: Hold the SPA copy of the event union and fold events into the view state.

**Contract**: The event union mirrors the backend's. A pure `reduceProgress(state, event)` yields `{ stage, week, retrying, validating, stageStartedAt, terminal }`. `stage` events reset the week, `retrying` clears and shows the retry notice, and unknown event types are ignored.

#### 4. Stream client with reconnect and fallback

**File**: `frontend/src/lib/plan-generation-stream.ts` (new), `frontend/src/lib/plan-generation.ts`

**Intent**: Consume `/events` with `apiFetch`, resume across drops, and degrade to polling.

**Contract**: A function that opens the stream with `Last-Event-ID` set to the last seen id, reads it through the parser, and reports events and a result: terminal event seen, closed by the server window or a `reconnect` event (reconnect immediately), network or 5xx failure, 401, 403, or 404. Silence for about 30 seconds without any bytes (including comments) is treated as a drop. Consecutive failures back off (about 1s, 2s, 4s); after three the page switches to the existing snapshot polling. A server-window close never counts as a failure. On a `completed` event, fetch the snapshot once for the plan; on `failed`, show the code's fixed message. 401 and 403 go through `handleAuthFailure`, and 404 shows the existing not-found copy. `PlanJobView` gains `week`.

#### 5. Job page UI

**File**: `frontend/src/pages/PlanGenerationPage.tsx`, `frontend/src/index.css`

**Intent**: Show pass, week, a progress bar, an elapsed timer and retry or checking notices.

**Contract**: The polling state is replaced by stream state with the same terminal states (`completed`, `failed`, `not-found`, `error`, `timed-out`) and the same Retry behavior. Copy: "Drafting your plan" / "Reviewing your plan" with "week N of 8", a native `<progress>` bar, a notice such as "Checking the plan…" while validating and "Trying again…" while retrying, and a local elapsed timer derived from the pass start timestamp and kept outside the live region. A polling fallback shows the same view from the snapshot's `stage` and `week`. Styles follow the existing CSS variables, with dark-mode support and no motion that ignores `prefers-reduced-motion`.

### Success Criteria:

#### Automated Verification:

- Parser and reducer specs pass: `cd frontend && npm test`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend build (type check plus bundle) passes: `cd frontend && npm run build`

#### Manual Verification:

- Locally against a real run, the page shows the pass, "week N of 8" advancing, the progress bar and a ticking timer until the plan appears.
- Refreshing mid-run resumes the same job with the right week and an elapsed time that did not reset.
- Setting the browser offline for 10 seconds mid-run reconnects and continues; blocking `/events` entirely makes the page fall back to polling and still finish.
- With a screen reader or the accessibility tree, only pass and week changes are announced, not the timer.

---

## Phase 5: Rollout and live verification

### Overview

Correct the stale transport note, deploy, and measure the real stream behavior on Fly.

### Changes Required:

#### 1. Fly config note

**File**: `backend/fly.toml`

**Intent**: Stop the comment from describing a WebSocket that was never built.

**Contract**: Reword the autostop comment to refer to the live-progress stream (SSE). No setting changes.

#### 2. Docs and results

**File**: `backend/README.md`, `context/changes/live-generation-progress/plan.md`

**Intent**: Record how the stream works and what was measured.

**Contract**: Add a short section to the README on the events endpoint (auth header, heartbeat, stream window, polling fallback). Record the measured time to the first week event, and the final stall-timeout values if they changed from the Phase 2 defaults, as dated notes under the relevant phase (per `context/foundation/lessons.md`).

### Success Criteria:

#### Automated Verification:

- Backend lint, unit and e2e suites pass: `cd backend && npm run lint && npm run test && npm run test:e2e`
- Backend build passes: `cd backend && npm run build`
- Frontend lint, tests and build pass: `cd frontend && npm run lint && npm test && npm run build`

#### Manual Verification:

- On the deployed stack, a signed-in user submits the form and sees continuous progress (pass, week, timer) through both passes until a valid plan appears.
- A run longer than 60 seconds shows no stream cut, and the 4-minute window reconnect (or a forced reconnect) resumes without losing events.
- Restarting the Fly machine mid-run ends in the "could not be found" copy with a Start again link, not a hang.
- Time to the first week event and any stall-timeout adjustment are recorded in this plan.

---

## Testing Strategy

### Unit Tests:

- Store: event ids, replay with `afterId`, subscribe and unsubscribe, owner isolation, replay for already finished jobs, purge.
- Model client: streamed success, partial week counting (including a half-built last week), `NoObjectGeneratedError`, error part mapping, abort.
- Pipeline: event order for clean, validation-retry, model-error-retry and hard-failure runs; goals text never logged.
- Frontend parser: split chunks, CRLF, comments, multi-line data, missing id. Reducer: stage reset, retrying, unknown events.

### Integration Tests:

- Supertest e2e for the events endpoint through the real controller with `HeaderUserGuard`: headers, frames, replay, heartbeat, terminal close, window close, 404 and 401.

### Manual Testing Steps:

1. Run a real generation locally and watch the progress through both passes.
2. `curl -N` the events endpoint with and without `Last-Event-ID`.
3. Refresh, go offline and block the endpoint mid-run in the browser.
4. Repeat the full flow on the deployed stack, including a machine restart mid-run.

## Performance Considerations

Each stream holds one open connection and a listener per job on a single machine, which fits the small target scale. Heartbeats are a few bytes every 12 seconds. The stream replaces one authenticated request every 3 seconds (a guard pass and a profile lookup each) with one per connection, so auth load drops. Partial-output parsing runs on the accumulated text per chunk; week events are emitted only when the count changes, so store writes stay minimal.

## Migration Notes

None. No schema or persistence changes, and `POST` and the snapshot `GET` remain compatible (the snapshot only gains a field). Deploy order does not matter: an old SPA keeps polling a new backend, and a new SPA falls back to polling if the events endpoint is missing.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-006, US-01, NFR on continuous progress)
- Prior plan and decisions: `context/archive/2026-10-14-first-plan-generation/plan.md`, `plan-brief.md`
- Infra: `context/foundation/infrastructure.md` (Fly risk register), `backend/fly.toml`
- Lessons: `context/foundation/lessons.md` (amend plan on deviation)
- Pipeline and store: `backend/src/plan-generation/plan-pipeline.service.ts`, `plan-job.store.ts`, `plan-model.client.ts`
- SPA job page: `frontend/src/pages/PlanGenerationPage.tsx`, `frontend/src/lib/api.ts`
- Test templates: `backend/src/plan-generation/plan-pipeline.service.spec.ts`, `backend/test/plan-generation.e2e-spec.ts`
- Docs: AI SDK structured data https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data; NestJS SSE https://docs.nestjs.com/techniques/server-sent-events; Fly timeouts https://community.fly.io/t/request-timeouts-on-fly-io/5653

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Progress contract and event log

#### Automated

- [x] 1.1 Store specs cover id monotonicity, replay with `afterId`, live delivery, owner isolation, replay-then-terminal for a finished job, and purge: `cd backend && npx vitest run src/plan-generation/plan-job.store.spec.ts` — ada7289
- [x] 1.2 Controller spec asserts the snapshot's `week` field: `cd backend && npx vitest run src/plan-generation/plan-generation.controller.spec.ts` — ada7289
- [x] 1.3 Backend lint passes: `cd backend && npm run lint` — ada7289
- [x] 1.4 Backend build passes: `cd backend && npm run build` — ada7289

### Phase 2: Streaming model client and pipeline events

#### Automated

- [x] 2.1 Model client spec mocks `streamText` and covers a successful stream, partial week counting, a `NoObjectGeneratedError` on the final output, an error part mapping to `unavailable`, and abort: `cd backend && npx vitest run src/plan-generation/plan-model.client.spec.ts`
- [x] 2.2 Pipeline spec asserts the event order for a clean run, a validation retry, a model-error retry and a hard failure: `cd backend && npx vitest run src/plan-generation/plan-pipeline.service.spec.ts`
- [x] 2.3 All plan-generation specs pass: `cd backend && npx vitest run src/plan-generation`
- [x] 2.4 Backend lint passes: `cd backend && npm run lint`
- [x] 2.5 Backend build passes: `cd backend && npm run build`

#### Manual

- [x] 2.6 With a real OpenAI key locally, one generation logs the week counter reaching 8 in each pass; record the time from request to the first `week` event for the draft and review passes
- [x] 2.7 Using an invalid model id yields a `failed` event with `provider_unavailable`, the job ends as failed, and the log shows no unhandled rejection

### Phase 3: SSE endpoint

#### Automated

- [ ] 3.1 Controller specs cover the events handler's replay, terminal close and unknown-job 404: `cd backend && npx vitest run src/plan-generation/plan-generation.controller.spec.ts`
- [ ] 3.2 Supertest e2e covers frames and headers, `Last-Event-ID` replay with no duplicates, heartbeat under fake timers, close after the terminal event, the window close with a `reconnect` event, owner isolation, and 401 without the header: `cd backend && npm run test:e2e`
- [ ] 3.3 Backend unit suite passes: `cd backend && npm run test`
- [ ] 3.4 Backend lint passes: `cd backend && npm run lint`
- [ ] 3.5 Backend build passes: `cd backend && npm run build`

#### Manual

- [ ] 3.6 `curl -N` with a valid Bearer token against the local backend shows frames as a real generation proceeds and a comment line roughly every 12 seconds
- [ ] 3.7 Reconnecting with `Last-Event-ID: <n>` returns only events after `n`, and the stream closes itself with a `reconnect` event near the 4-minute window

### Phase 4: Frontend streaming client and job page

#### Automated

- [ ] 4.1 Parser and reducer specs pass: `cd frontend && npm test`
- [ ] 4.2 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 4.3 Frontend build (type check plus bundle) passes: `cd frontend && npm run build`

#### Manual

- [ ] 4.4 Locally against a real run, the page shows the pass, "week N of 8" advancing, the progress bar and a ticking timer until the plan appears
- [ ] 4.5 Refreshing mid-run resumes the same job with the right week and an elapsed time that did not reset
- [ ] 4.6 Setting the browser offline for 10 seconds mid-run reconnects and continues; blocking `/events` entirely makes the page fall back to polling and still finish
- [ ] 4.7 With a screen reader or the accessibility tree, only pass and week changes are announced, not the timer

### Phase 5: Rollout and live verification

#### Automated

- [ ] 5.1 Backend lint, unit and e2e suites pass: `cd backend && npm run lint && npm run test && npm run test:e2e`
- [ ] 5.2 Backend build passes: `cd backend && npm run build`
- [ ] 5.3 Frontend lint, tests and build pass: `cd frontend && npm run lint && npm test && npm run build`

#### Manual

- [ ] 5.4 On the deployed stack, a signed-in user submits the form and sees continuous progress (pass, week, timer) through both passes until a valid plan appears
- [ ] 5.5 A run longer than 60 seconds shows no stream cut, and the 4-minute window reconnect (or a forced reconnect) resumes without losing events
- [ ] 5.6 Restarting the Fly machine mid-run ends in the "could not be found" copy with a Start again link, not a hang
- [ ] 5.7 Time to the first week event and any stall-timeout adjustment are recorded in this plan
