# First Plan Generation — Plan Brief

> Full plan: `context/changes/first-plan-generation/plan.md`
> Research: `context/changes/first-plan-generation/research.md`

## What & Why

A signed-in user submits the plan form and receives an AI-generated 8-week plan built only from the 32-exercise catalog. The backend runs a two-pass OpenAI pipeline (draft, then review and refine) as a background job and the SPA polls it. This is the roadmap's north star slice (S-02): it tests whether a two-pass pipeline produces a believable, personalized plan, the riskiest assumption in the product.

## Starting Point

The catalog (`ExercisesService.findAll()`) and fail-closed global auth already exist, so a new gated endpoint needs no auth code. There is no AI SDK, no `zod`, no request validation, no plan type, and the frontend has never made a non-GET call.

## Desired End State

A user opens `/plans/new`, submits the form, lands on a job page that shows "Drafting…" then "Reviewing…", and finally sees the full plan with sets, reps, rest and notes. A refresh resumes the same job. Any failure shows a fixed error message and never a broken plan. One generation at a time per user, 5 per rolling 24 hours.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider and models | OpenAI via Vercel AI SDK; `gpt-5.6-luna` for both passes, ids in env, review upgradeable to `gpt-5.6-sol` | Cheap first, upgrade by config if evaluation shows a gain | Plan |
| Model id naming | Required env vars, no hardcoded default; docs say `gpt-5.6-luna`, press says `gpt-6-luna` | The two sources disagree, so the user confirms the real id | Research / Plan |
| Structured output | `zod` strict-compatible schema plus a backend validator | OpenAI strict mode rejects optionals and bounds, so rules live in code | Research |
| Transport | `POST` returns 202 and `jobId`; SPA polls `GET`; in-memory jobs keyed to `Profile.id` | Avoids Fly's reported 60 s idle cut and leaves room for S-03 events | Plan |
| Frequency rule | Ramp: week 1 = current, week 8 = desired, 0 or 1 day per week toward desired | Uses both form fields the way a coach would | Plan |
| Failure policy | Retry a failing pass once with feedback, then error; never fall back to the draft | Bounds cost and honors the "no silent broken plan" guardrail | Plan |
| Plan shape | Per exercise: slug, sets, reps, restSeconds, optional note | Enough to train from, small enough for strict output | Plan |
| Limits | 1 active job and 5 per 24 h per user (env-configurable), in memory | Bounds spend on an open sign-up with no new table | Plan |
| Job UX | Job page at `/plans/generate/:jobId` | Survives refresh and gives S-03 and S-04 a natural page | Plan |
| Language | English | Matches all existing UI copy | Plan |

## Scope

**In scope:** two endpoints, two-pass pipeline, validator, in-memory jobs and limits, form page, job page with plain plan view, extracted 401/403 helper, config and rollout docs, a three-profile quality check.

**Out of scope:** persistence and migrations (S-05), streaming (S-03), image review UI (S-04), edit or regenerate (FR-008), cross-vendor models, localization, frontend test framework, admin block (S-07).

## Architecture / Approach

Controller (`POST`/`GET /plan-generations`) calls limiter and job store, then starts `PlanPipelineService.run` fire-and-forget. The pipeline loads the catalog, builds a zod schema whose slug field is an enum of catalog slugs, calls `PlanModelClient` (AI SDK) for the draft, validates it, retries once on issues, then does the same for the review pass with the draft as input, joins exercise names and marks the job complete. The SPA polls the job every 3 seconds and renders the plan or fixed error copy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend contract and validation | Deps, boot-validated config, form and plan schemas, plan validator | Strict-schema limits push rules into the validator |
| 2. Pipeline, jobs and endpoints | Model client, two-pass pipeline, job store, limiter, gated endpoints | Reasoning tokens truncating output; fire-and-forget must never reject |
| 3. Frontend flow | Form, polling job page, plan view, shared auth-failure helper | First non-GET and long-wait UX in the SPA; helper refactor regression |
| 4. Rollout and quality check | Env docs, Fly secrets, deploy, three-profile evaluation | Boot fails without secrets; quality of a 32-exercise catalog is unproven |

**Prerequisites:** S-01 and F-01 are done; an OpenAI API key and a confirmed model id.
**Estimated effort:** about 3-4 sessions across 4 phases.

## Open Risks & Assumptions

- The Fly 60 s idle timeout rests on community staff posts, not official docs; polling avoids the dependency either way.
- Exact OpenAI model ids are unconfirmed; env-only configuration limits the cost of being wrong.
- Per-user limits are evadable with new accounts while sign-up is open; a provider-side spend alert is the backstop.
- With 32 exercises and a 5-day split, exercise repetition across 8 weeks is unavoidable and may read as low quality.
- Jobs are lost on restart or deploy; the user sees "not found, start again".

## Success Criteria (Summary)

- A signed-in user completes form, job page and plan view end to end on the deployed stack with a valid 8-week plan.
- Every exercise in a returned plan is from the catalog, and any failure shows an error instead of a plan.
- Backend and frontend lint, build and tests pass, and the three-profile quality evaluation is recorded.
