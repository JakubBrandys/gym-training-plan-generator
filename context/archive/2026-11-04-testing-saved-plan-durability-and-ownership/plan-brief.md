# Saved-Plan Durability and Ownership — Plan Brief

> Full plan: `context/changes/testing-saved-plan-durability-and-ownership/plan.md`
> Research: `context/changes/testing-saved-plan-durability-and-ownership/research.md`

## What & Why

Rollout Phase 2 of the test plan: prove that only a plan's owner can read or change it (Risk #4), and that what a user saves comes back intact, images included, or fails honestly (Risk #3). The tests are written from the PRD ("own plans only", "reloads correctly"), not from the code, and use no real database.

## Starting Point

Ownership is already enforced on all eight id-taking routes and tests prove B gets a 404, but not that B's answer equals a nonexistent id's or that A's data survived. No test touches a database; the backend "round trip" compares a fixture with its own clone, and the frontend reads a saved plan with an unchecked cast, so a malformed stored body crashes the render.

## Desired End State

A two-user matrix proves B's answer equals a well-formed unknown id's and A's whole row, job and list are unchanged. A plan with images round-trips over the real HTTP JSON path, a failed save leaves nothing and succeeds on retry, and a malformed stored body ends in "Something went wrong, try again" instead of a crash. A manual smoke with two real accounts and two new cookbook entries are on file.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persistence testing | Hermetic now; real-database gap recorded in the cookbook | No compose file, CI database or confirmed Docker; the fake still gives signal on ownership and rendering | Plan |
| Saved-plan read path | Loose structural guard in `fetchSavedPlan` | Rejects only what the renderer would crash on, so older shapes still render | Plan |
| "Older stored shape" fixtures | Missing `imageKey` and `note`, `weeks: []`, missing `title` only | The one real historic shape change; extra-field and form-drift fixtures declined | Plan |
| Oracle for "matches a nonexistent id" | Well-formed unknown UUID, status and body; malformed id accepted as a format difference | Tests the real no-leak rule with no production change | Plan |
| NUL in model-written plan text | Known gap, no code or test | Inferred and unreproduced; the model is unlikely to emit it | Plan |
| Manual two-account smoke | Included in the last phase | The only real-database evidence for both risks | Plan |
| Layer for ownership | Existing e2e with the fake table, no shared helper | The fake filters on `ownerId`, so dropping it fails the owner's own tests | Research |
| Round-trip expectation | JSON string literal parsed in the test, not a clone | Supertest parses real JSON, so it checks serialization; `structuredClone` does not | Research |

## Scope

**In scope:** ownership matrix for saved-plan and plan-generation id routes; round trip and failed-save retry; read guard and stored-shape render tests; rejected-Save branch; cookbook §6.2 and §6.3; manual smoke.

**Out of scope:** real-database harness; extra-field and form-drift fixtures; NUL guard; changing the malformed-id body; error boundary; blocked users and rate limits (Phase 3 of the rollout); editing `plan-delete-and-rename`; backporting §2, §3 and §4 corrections (`/10x-test-plan`); shared test helper; browser e2e.

## Architecture / Approach

Extend the two existing backend e2e specs for the ownership matrix and the persistence cases, add one new jsdom spec that feeds raw stored JSON through the real `fetchSavedPlan` into `SavedPlanPage` and `PlanView`, and add the guard in `saved-plans.ts` as the only production change. Each test phase ends with deliberate-break checks: break production code in the worktree, confirm the named tests go red, restore.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Ownership matrix (backend) | Foreign equals unknown and victim unchanged on every id route | Over-asserting Nest's message wording |
| 2. Persistence round trip and failed save (backend) | Independent-fixture round trip; failed save answers 500, no row, retry succeeds | The fake cannot show jsonb behaviour, which stays a recorded gap |
| 3. Read guard and stored-shape render (frontend) | Loose guard; raw stored bodies through the real fetch with images and remount; rejected-Save case | A guard too strict would reject older plans |
| 4. Cookbook, known gaps and manual smoke | §6.2 and §6.3 filled; two-account smoke recorded | Needs two real accounts and a bearer token for the API step |

**Prerequisites:** backend e2e passes today (4 files, 79 tests) and the frontend suite passes (532 tests); two real accounts and the hosted database for Phase 4.
**Estimated effort:** about 4 sessions across 4 phases, with one manual check in Phase 3 and three in Phase 4.

## Open Risks & Assumptions

- The jsonb behaviours (key reordering, NUL rejection, real P2002 mapping) are inferred from Postgres knowledge and stay unverified by automation.
- No older stored row is known to exist, so the older-shape fixture is invented; its legitimacy rests on the `imageKey` history and the additive-only lesson.
- Rows 1.8 and 1.9 of `plan-delete-and-rename` stay unticked there; this change's smoke covers the ownership half only.

## Success Criteria (Summary)

- B cannot tell A's plan or job from a nonexistent one on any route, and B's attempts change nothing of A's.
- A saved plan comes back with its images, and an odd or malformed stored body shows a normal screen or an honest error, never a crash.
- A failed save is never confirmed and can be retried without a duplicate.
- The cookbook tells the next contributor how to add such tests and names the gaps that remain.
