# Live Generation Progress — Plan Brief

> Full plan: `context/changes/live-generation-progress/plan.md`

## What & Why

The plan-generation job page shows only "Drafting…" or "Reviewing…" for the whole of each model pass, which can last minutes. This slice (roadmap S-03, FR-006) makes progress continuous: the user sees which pass is running, which of the 8 weeks is being written, when the plan is being checked and when a retry starts, for the entire run.

## Starting Point

S-02 runs the pipeline as a background job with in-memory state and the SPA polls a snapshot every 3 seconds. Each pass is one blocking model call, so nothing inside a pass is observable. Auth is Bearer-header only, there is no compression, and Fly is already configured to keep one machine always up.

## Desired End State

The job page shows the pass, "week N of 8" with a progress bar and a live elapsed timer, plus short notices for checking and retrying. A refresh or dropped connection resumes with no lost progress, and if the stream cannot reconnect the page falls back to polling and still finishes. Failures still show fixed error copy and never a broken plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| What counts as progress | Real content progress: streamed partial output gives "week N of 8", plus heartbeats | Matches the PRD's stage-by-stage intent, a spinner or timer alone was rejected there | Plan |
| Transport | SSE endpoint read through fetch plus a small parser, existing Bearer guard | One-way fits the need and `EventSource` cannot send the auth header | Plan |
| Granularity | Pass, week and check events (stage, week, validating, retrying, completed, failed) | Covers every place the pipeline can wait and explains retries | Plan |
| Drops | Per-job event log with ids, `Last-Event-ID` replay, then poll fallback after three failures | Nothing is lost on a blip and the snapshot stays authoritative | Plan |
| Cancel and failure | No cancel, no `streamRetries`, S-02's one-retry policy kept; job outlives the stream | Stays in scope and bounds model spend | Plan |
| Auth on a long stream | Server closes each stream after ~4 min, client reconnects with the latest token | Re-runs the guard (expiry, block) with no new auth code | Plan |
| Plan delivery | Terminal event only signals completion; client reads the plan from the snapshot | Keeps events small and replay simple | Plan |
| Testing | Backend unit plus supertest e2e; add scoped Vitest to the frontend for parser and reducer | Parser and reconnect logic is the riskiest new code, and the frontend framework is set up deliberately | Plan |

## Scope

**In scope:** streamed model call with week counting, progress events and a bounded per-job event log, SSE endpoint with heartbeat, replay and window cap, snapshot `week` field, frontend SSE parser, reducer, reconnect and polling fallback, new progress UI, scoped frontend Vitest, `fly.toml` comment and README note, live verification.

**Out of scope:** cancelling a run, silent stream retries, per-event auth re-checks, reasoning summaries, WebSocket, persistence of jobs or events, sending the plan over the stream, browser e2e tooling, showing partial plan content (S-04).

## Architecture / Approach

The pipeline reports progress through `PlanJobStore`, which keeps an append-only event list per job with monotonic ids and notifies subscribers. A new `GET /plan-generations/:jobId/events` endpoint replays events after `Last-Event-ID`, follows new ones, sends a comment heartbeat about every 12 seconds, and closes on a terminal event or after about 4 minutes. The SPA opens it with `apiFetch`, parses frames, folds them into view state, reconnects with the last id, and falls back to the existing snapshot polling after three failures.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Progress contract and event log | Event types, store log and subscribers, `week` on the snapshot | Replay and subscribe ordering races |
| 2. Streaming model client and pipeline events | `streamText` with week counting and pipeline events | Error parts and partial parsing, reasoning delay before the first partial |
| 3. SSE endpoint | Events endpoint with heartbeat, replay and window cap, plus e2e | Explicit ids, immediate flush and `Last-Event-ID` handling are not done by Nest |
| 4. Frontend streaming client and job page | Parser, reducer, reconnect and fallback, new UI, scoped Vitest | First streaming code in the SPA; reconnect loops and accessibility |
| 5. Rollout and live verification | Config note, README, deployed-run measurements | Fly's idle behavior is unverified in official docs |

**Prerequisites:** S-02 is done; an OpenAI key and the confirmed model ids are in place.
**Estimated effort:** about 3-4 sessions across 5 phases.

## Open Risks & Assumptions

- Fly's idle cut (about 60s, plus a reported 30s zero-window case) rests on community posts, not official docs; heartbeats and a prompt reader are designed in, and Phase 5 tests it live.
- The delay before the first week event (the model reasons first) is unmeasured, so some early dead air may remain until the stall timeouts and the timer are tuned in Phases 2 and 5.
- Jobs and events are lost on restart or deploy; the user sees "could not be found, start again".
- Partial output is not validated, so progress shows the started-week count and never promises a valid week.
- Adding a frontend test framework reverses S-02's deferral, scoped to pure functions only.

## Success Criteria (Summary)

- On the deployed stack the user sees continuous pass and week progress until a valid plan appears, with no silent stall.
- A refresh, a dropped connection or a blocked stream does not lose the run; the page resumes or falls back to polling.
- Backend and frontend lint, build and tests pass, and the live measurements are recorded in the plan.
