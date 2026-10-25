<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Live Generation Progress

- **Plan**: context/changes/live-generation-progress/plan.md
- **Scope**: Full plan (Phases 3 and 5 included although their manual rows are still pending; their code is committed and complete)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run for all five phases: backend 479 unit and 19 e2e tests, frontend 27 tests, lint and build in both packages, all passing.

## Findings

### F1 — SSE streams are not capped per user or per job

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-generation.controller.ts:89-173, backend/src/plan-generation/plan-job.store.ts:115-130
- **Detail**: Nothing limits concurrent `/events` connections. Each holds a socket, an interval, a timer and a subscription for up to 240 s, and every connect runs the auth guard (JWT verification and a profile lookup). `PlanLimiter` caps job starts, not streams, so any signed-in user can open unlimited streams on their own running job while sign-up is open.
- **Fix A ⭐ Recommended**: Cap concurrent subscribers per job in the store (about 3) and answer an extra connect with 429
  - Strength: Small change in one place, bounded memory and sockets per user because a user has at most one active job.
  - Tradeoff: A legitimate second tab beyond the cap is refused, and the client must treat 429 as a failure that falls back to polling.
  - Confidence: HIGH — the limiter already guarantees one active job per user, so a per-job cap is a per-user cap.
  - Blind spot: Behaviour of the SPA on 429 is untested.
- **Fix B**: Set `http_service.concurrency` in fly.toml
  - Strength: No code change.
  - Tradeoff: Global rather than per user, so one user can still consume the shared budget.
  - Confidence: MEDIUM — depends on the machine's connection ceiling.
  - Blind spot: Haven't measured how many connections the 512 MB machine holds.
- **Decision**: FIXED via Fix A — store gains `subscriberCount`, config gains `maxStreamsPerJob` (3), the controller answers 429 `too_many_streams` before any header is written; specs added, break-check confirmed.

### F2 — Poll request has no timeout, so the 12-minute ceiling can be bypassed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/plan-generation.ts:104-123, frontend/src/lib/plan-generation-watch.ts:76-111
- **Detail**: The snapshot fetch takes only the component's abort signal. If one poll hangs, `hasTimedOut()` is never reached and the page stays on "running" indefinitely.
- **Fix**: Combine the signal with `AbortSignal.timeout(10_000)` per request so a hung poll becomes `{ kind: 'error' }` and counts toward the three-failure limit.
- **Decision**: FIXED — `fetchPlanGeneration` combines the caller signal with `AbortSignal.timeout(10_000)`, so a hung poll becomes an error and counts toward the three-failure limit.

### F3 — Stream open and close logging is missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/src/plan-generation/plan-generation.controller.ts:89-173
- **Detail**: The plan's "Debug & observability" detail asks for one log line per stream open and close with the job id, the `Last-Event-ID` presented and the close reason. The controller has no logger, and the Phase 3 deviation note does not record dropping it. This is the only unrecorded gap in the backend contract; no goals text is logged anywhere.
- **Fix**: Add a `Logger` to the controller and log open (job id, last event id) and close (job id, reason: terminal, window, client disconnect, unknown job). Never log the event payload.
- **Decision**: FIXED — the controller logs stream open (job id, parsed Last-Event-ID) and close (job id, reason terminal / window / client-disconnect / job-finished, duration), plus warnings for refused and unknown-job streams. Only the parsed numeric id is logged and an unknown job id is never echoed, so user-controlled strings cannot inject log lines. Specs added, break-check confirmed.

### F4 — Row 2.6 is ticked without its recorded result, and three live-run rows are open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/live-generation-progress/plan.md (rows 2.6, 3.6, 3.7, 5.4-5.7)
- **Detail**: Row 2.6 asks to record the time from request to the first `week` event for the draft and review passes. No value is recorded, and the stall timeouts in `plan-model.client.ts:13-14` are still the 120 s and 45 s placeholders. Rows 3.6, 3.7 and 5.4-5.7 are pending. Rows 4.4-4.7 are ticked on the user's confirmation, but they depended on a live run too. Rows 5.1-5.3 carry their SHA only as an uncommitted working-tree edit.
- **Fix**: Record the first-week timings under Phase 2 when the user supplies them, retune the two timeout constants if needed, tick the remaining manual rows after the deployed run, and commit the trailing plan.md and change.md edits in the epilogue.
- **Decision**: SKIPPED — no first-week timings available; rows 2.6 stays ticked without a recorded value, the 120 s and 45 s stall timeouts stay as placeholders until the deployed run (5.7), and the remaining manual rows stay open.

### F5 — Watch loop timing bounds are looser than documented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/plan-generation-watch.ts:142-181
- **Detail**: A `closed` outcome resets the failure count and reconnects with no delay. The real server only sends `reconnect` after 240 s, so this cannot spin against it, but a misbehaving proxy or backend could cause a tight authenticated reconnect loop. Separately, the 12-minute ceiling is only checked between connections, so the real bound is up to about 16 minutes; the server settles a job by about 10 minutes anyway.
- **Fix**: Sleep briefly after `closed`, or count a connection that lived under about 1 s as a failure.
- **Decision**: FIXED — a connection that closes within 1 s (`isStableConnection`, spec added) now counts as a failure and goes through backoff and the polling fallback instead of reconnecting instantly. The 12-minute check between connections is left as is, because the server settles every job by about 10 minutes.

### F6 — Frontend trusts stream input shape and size

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/plan-progress.ts:81-97, frontend/src/lib/sse.ts:22-77
- **Detail**: `parseProgressEvent` checks only `id`, `at` and `type`, so a `week` event with a non-numeric `week` reaches the reducer and `<progress value>`. The SSE parser buffer has no size cap and re-scans the whole buffer per feed, which is quadratic for one huge line. The server is trusted, so this is hardening, not a live bug.
- **Fix**: Validate the per-type fields in `parseProgressEvent` and fail the connection when the pending parser buffer exceeds about 64 KB.
- **Decision**: FIXED — `parseProgressEvent` validates the per-type fields (stage, whole week 1-8, positive attempt, failed code) and still passes unknown types through; the SSE parser throws past 64 KB of pending line or frame data, which the stream client turns into a failed connection. Specs added, break-check confirmed.

### F7 — Silent failure paths in SSE delivery

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-job.store.ts:39-48, backend/src/plan-generation/plan-generation.controller.ts:115-118
- **Detail**: A throwing listener is swallowed with an empty catch and no log, `response.write` backpressure is ignored, and an open stream is not re-checked for a later block or token expiry until its 240 s window ends. Volumes are tiny and the window bounds the last point, which the plan accepts, so only the silent catch is worth acting on.
- **Fix**: Log swallowed listener errors at warn level, without the event payload.
- **Decision**: FIXED — the store now warns with the job id, event id and error name when a progress listener throws (never the payload or message); the existing throwing-listener specs mock the logger and a new spec asserts the exact line. Backpressure and the missing mid-stream re-check are left as accepted by the plan (tiny volume, bounded by the 240 s window).

### F8 — Unrecorded exports beyond the deviation notes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: backend/src/plan-generation/plan-progress.ts:12-14, frontend/src/lib/plan-progress.ts, frontend/src/lib/plan-generation-stream.ts
- **Detail**: `PlanProgressType` has no importer and `TerminalPlanProgressType` is used only inside its file. The frontend progress module also exports `WEEK_COUNT`, `initialProgress`, `isTerminalEvent` and `parseProgressEvent`, and the stream module a `silenceMs` test parameter, none of which the deviation notes list. All are harmless and consistent with the plan's intent.
- **Fix**: Drop the two unused backend type exports and extend the Phase 1 and Phase 4 deviation notes to name the extra frontend exports.
- **Decision**: FIXED — `PlanProgressType` removed and `TerminalPlanProgressType` made file-local; the Phase 1, 3 and 4 deviation notes now name the extra exports and record the review fixes (stream cap, stream logging, poll timeout, unstable-connection handling, event and parser hardening, listener-failure warning).
