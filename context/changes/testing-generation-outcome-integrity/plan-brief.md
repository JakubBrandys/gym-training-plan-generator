# Generation Outcome Integrity — Plan Brief

> Full plan: `context/changes/testing-generation-outcome-integrity/plan.md`
> Research: `context/changes/testing-generation-outcome-integrity/research.md`

## What & Why

Rollout Phase 1 of the project's test plan: make sure a plan generation always ends in an honest state. A model result that breaks the rules must never reach the screen as a plan (Risk #2), and a restart or deploy mid-generation must leave the user told, not stuck (Risk #1). You were burned before by off-catalog output reaching the screen, and you change the pipeline without a safety net.

## Starting Point

The server is mostly protected: a job completes only after the final plan passes validation, and the catalog is enforced twice. The tests are thin: one bad-output fixture at pipeline level, nothing on the client's watch loop, and a page spec that mocks the whole watch layer. On the client, a completed plan is rendered with no shape check, so an empty plan shows a Save button and a missing `weeks` array crashes the page.

## Desired End State

Bad model output is proven to end every job as failed with no plan. The client's outcome for a lost job, a cut stream, a 5xx and a stuck stream is proven bounded and honest. A malformed completed plan ends in the existing error state. A real Fly restart has been observed and recorded, and the test plan's first cookbook entry tells the next contributor how to add such a test.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Server tests layer | Pipeline-level table with the existing fake model | The HTTP e2e stubs the pipeline, and the fake bypasses the schema so only the validator can reject | Research |
| Backend restart test | Not written | The server answers 404 for a lost job exactly as for an unknown id, and existing tests already assert that | Research |
| Client test layer | Real watch loop, mocked `apiFetch`, fake timers, `.spec.tsx` | The restart behaviour lives in the watch loop, which has no test; jsdom is the only environment with `window` | Research + probe |
| Malformed completed plan | Structural guard in the watch layer, ends in `error` | Closes the one seam where a bad plan can still render; no router change | Plan |
| 5xx during a deploy | Keep generic message with Retry; measure on Fly first | The proxy's behaviour during a swap is not in the repo; no copy changes on a guess | Plan |
| Helpers | Extend the existing pipeline spec | Only that spec uses the fake model; no new file location or config | Plan |
| Stale "Drafting" in an outage | Accept and record | Bounded (about 9 s to 2 min), and a new indicator is a UI change beyond these risks | Plan |
| Test oracles | Hand-written fixtures and wire frames | Expected values come from requirements, not from the code under test | Test plan |

## Scope

**In scope:** a six-case bad-plan table through both passes and a clean-run catalog invariant; a watch-loop spec; `isPlanResult` and its use; page rendering tests and one real-watch integration spec; a Fly smoke; the §6.1 cookbook entry; fixing a stale `CLAUDE.md` sentence.

**Out of scope:** a real-SDK parse test, the saved-plan page guard (test-plan Phase 2), a router error element, kitchen-sink states for the generation page, the raw Retry button, an outage indicator, graceful shutdown, limiter and injection tests (test-plan Phase 3), shared test helpers, browser e2e.

## Architecture / Approach

Ordered by risk and dependency, tests first and one small guard in the middle. Each test is derived from a requirement and ends with a deliberate-break check (break the production code in the worktree, confirm the test goes red, restore). Probes done during planning fixed the mechanics: the watch loop runs under jsdom with a URL-routed mock and an abort-aware stream, and `AbortSignal.timeout` is not driven by fake timers, so mocked responses must resolve.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Pipeline bad-output table | Six bad plans through both passes, plus a catalog invariant for clean runs | A break check on the week count only turns the 9-week case red |
| 2. Watch-loop outcome tests | 404, cut stream, 5xx, polling, 12-minute cap, auth and abort proven with the real loop | Fake-timer and stream-mock mechanics |
| 3. Completed-plan shape guard | `isPlanResult` wired on both paths, with unit and watch tests | A too-strict guard rejecting real server plans |
| 4. Page-level states | Rendering tests for every state and a real-watch spec for restart and outage | Fake timers with React Testing Library |
| 5. Manual deploy smoke and cookbook | Fly restart observed and recorded; §6.1 and `CLAUDE.md` updated | The proxy may answer with a 5xx, not a 404 |

**Prerequisites:** none beyond a working dev setup; the Fly smoke needs access to the project's Fly app.
**Estimated effort:** about 3 to 4 sessions across 5 phases, plus a short manual smoke.

## Open Risks & Assumptions

- The Fly proxy's response during a deploy swap is unverified; Phase 5 measures it.
- The guard must accept every real server plan; Phase 3 includes a real generation to confirm.
- The generation page has no kitchen-sink states, a UI-contract gap left for a separate change.

## Success Criteria (Summary)

- Every unusable model output is shown to end as a failed job with no plan, in both passes.
- After a restart, an outage or a malformed plan, the user ends on a bounded, honest message and never on a broken plan with Save.
- You have seen what the Fly restart actually looks like and decided whether the wording needs a follow-up.
