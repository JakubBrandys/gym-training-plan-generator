# Access Control and Abuse Limits — Plan Brief

> Full plan: `context/changes/testing-access-control-and-abuse-limits/plan.md`
> Research: `context/changes/testing-access-control-and-abuse-limits/research.md`

## What & Why

Rollout Phase 3 of the test plan, Risks #6 and #5: prove that a blocked user is refused everywhere and that the generation limits and free-text injection cannot be gamed. Enforcement is already sound (one global guard, a synchronous limiter, validated model output); what is missing is HTTP-level proof where the risks actually live, so this change adds tests only.

## Starting Point

One global `AuthGuard` reads the profile from the database on every request and refuses a blocked one with 403; only `GET /` and `GET /health` are public. Exactly one test drives the real guard at HTTP level (a blocked admin on one route). The limiter and job store are in-process memory, and the HTTP e2e replaces the whole pipeline with a stub, so no hostile goals ever reach a real pipeline.

## Desired End State

A new e2e spec boots the real `AppModule` and walks the routes it discovers from the live app: every gated route refuses a blocked member, including with a still-valid token and right after an admin blocks them. A failed ban is visible and repairable. Over HTTP, a burst of same-user starts yields one 202, the daily limit holds and a restart resets it as documented. Hostile goals reach the model only as data, and an injection-obeying model can never complete a plan. The cookbook §6.4 and a recorded manual smoke close the change.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Route list for the table | Discovered from the live Express 5 router, against a hand-written public allowlist and a small floor check | A copied list lets a new route bypass the test unnoticed | Research / Plan |
| Harness | Real `AppModule` with only Prisma, the verifier, the Supabase admin client and the pipeline faked | Covers newly added controllers automatically; spike confirmed it boots | Plan |
| Blocked profile modelling | Real `AuthGuard` and `ProfilesService` over a fake profile table, token-to-user `verify` | The header guard cannot represent a blocked profile | Research |
| Open stream and running job after a block | Known gap, no test, no production fix | Matches the archived block plan; a test would encode the weakness | Plan (interview) |
| Restart behaviour | Asserted with a second app instance and documented as accepted MVP behaviour | Makes "known" executable and trips when a durable limit is added | Plan (interview) |
| "N+1th parallel generation" | Tested as burst giving one 202 and the rest `active_job`; `daily_limit` via sequential finished jobs | Under the shipped rule the two limits are separate faces | Research |
| Injection fixture | Deterministic invariant through the real pipeline; in-bounds text and the unescaped draft embed are known gaps | Asserting model behaviour is non-deterministic; gates cannot judge intent | Plan (interview) |
| Quality gate | Deliberate-break checks per test phase, no Stryker | Same proven gate as earlier phases, no new dependency | Plan (interview) |
| Manual smoke | Two real accounts: block, live session refused, real ban rejects sign-in | Only evidence that the database flag beats a live token | Plan (interview) |
| Production changes | None | Keeps the phase test-only and the known gaps visible | Plan |

## Scope

**In scope:** a real-guard route table, the block lifecycle (immediate, half-applied, quota untouched), HTTP-level limit tests including a restart, the injection fixture, cookbook §6.4 with known gaps, a manual block smoke.

**Out of scope:** any production change, a durable limiter, characterization tests for the injection gaps, Stryker, an unblock endpoint, multi-instance behaviour, frontend tests, the §2 wording backport (a `/10x-test-plan` step).

## Architecture / Approach

Phases 1 and 2 share one new spec (`backend/test/access-control.e2e-spec.ts`): the real `AppModule`, fake edges, tokens mapped to hand-written UUID users, one fake profile table serving the guard, the block endpoint and the next request. Phase 3 extends `plan-generation.e2e-spec.ts` in place (module built through a function so a second instance can stand for a restart). Phase 4 adds a spec with the real controller, limiter, store and pipeline over a scripted fake model. Expectations are literals and invariants, never the code's own logic.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Route table with the real guard | Blocked member 403 on every discovered gated route; 401 and public-route cases | Route discovery silently returning nothing (floor check guards it) |
| 2. Block takes effect and half-applied block | Same-token refusal after a real block; 502 visible and repairable; no quota use | Fake table drifting from real `updateMany` semantics |
| 3. Limits at HTTP level | Burst, daily limit, sliding window, restart reset | Concurrency test flaky under supertest (fallback to a real listen) |
| 4. Injection fixture | Hostile goals as data in both prompts; obeying model never completes | Fixture mirroring the sanitiser instead of the invariant |
| 5. Cookbook, known gaps, manual smoke | §6.4 written, gaps recorded, real-Supabase block observed | Smoke needs two real accounts and an SQL cleanup |

**Prerequisites:** none beyond the working backend test setup; the smoke needs the deployed app, two accounts and SQL access.
**Estimated effort:** about 4–5 sessions across 5 phases.

## Open Risks & Assumptions

- The route table assumes Express 5's `router.stack` keeps its shape; the floor check turns a silent change into a red test.
- The restart test deliberately fails when someone persists the limit; that is the intended signal, and it must then be updated.
- The fake model returns output without the zod schema, so an off-catalog slug reaches the validator branch; the real client's schema would reject it earlier.
- The §2 wording of "N+1th parallel generation" stays as is until a `/10x-test-plan` backport.

## Success Criteria (Summary)

- A new gated route, or a stray `@Public()`, turns the route table red without editing the table.
- A blocked member's still-valid token is refused on every gated route, a failed ban never leaves them with access, and each break check named in the plan turns its test red.
- The limits and the restart behaviour are asserted over HTTP, and hostile goals can never produce a completed plan that breaks catalog or structure rules.
