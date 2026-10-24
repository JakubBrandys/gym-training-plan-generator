# First Plan Generation Implementation Plan

## Overview

A signed-in user submits the plan form (experience, current and desired weekly frequency, height, weight, goals) and receives an AI-generated 8-week plan built only from the 32-exercise catalog. The backend accepts the request as a job (`POST /plan-generations` returns 202 and a `jobId`), runs a two-pass OpenAI pipeline in the background (draft, then review and refine), validates every pass against a zod schema and a catalog-aware validator, retries a failing pass once, and ends in `completed` or `failed`. The SPA polls the job from a new gated page and shows the plan or a fixed error message. This is the roadmap's north star slice (S-02): it tests whether a two-pass pipeline produces a believable personalized plan.

## Current State Analysis

- The backend has no AI SDK, no `zod` and no request-validation stack; `main.ts` has no `ValidationPipe` (`backend/src/main.ts:4-12`, `backend/package.json` dependencies). The frontend has no plan or form types and has never made a non-GET call (`frontend/src/lib/api.ts:3-13`).
- The catalog is ready to feed whole to a prompt: 32 rows keyed by `slug`, one accessor `ExercisesService.findAll()` (`backend/src/exercises/exercises.service.ts:9-11`), exported from its module and imported into `AppModule` (`backend/src/app.module.ts:14`). Compact form is about 2.2K characters. The archived catalog plan defers "plan only uses catalog exercises" validation to this slice (`context/archive/2026-10-04-exercise-catalog-seed/plan.md:48, 256, 313`).
- Auth is global and fail-closed: any controller in a module reachable from `AppModule` is gated, `@CurrentUser()` yields `{ id, email, role }`, blocked profiles get 403 (`backend/src/auth/auth.module.ts:13`, `backend/src/auth/auth.guard.ts:35-60`, `backend/src/profiles/me.controller.ts:5-10`).
- Fly's reported 60 s HTTP idle timeout makes a multi-minute plain POST risky; `fly.toml` sets no request timeout and keeps one always-on machine (`backend/fly.toml:10-29`). Evidence is secondary (Fly community staff replies), recorded in `research.md`.
- The frontend has one gated route (`/`), no component library, a single global stylesheet without `select`/`textarea`/`fieldset` rules, and the only 401/403 handling lives inline in `HomePage` (`frontend/src/router/router.tsx:7-15`, `frontend/src/index.css:43-101`, `frontend/src/pages/HomePage.tsx:33-41`).

## Desired End State

A signed-in user opens `/plans/new`, fills the form, submits, lands on `/plans/generate/:jobId`, sees the stage ("Drafting…", then "Reviewing…"), and when done sees the full 8-week plan (weeks, sessions, exercise names with sets, reps, rest and notes). A refresh mid-generation resumes the same job. If any pass fails, returns something unusable, or the provider is down, the user sees a fixed error message and no plan. One user can run one generation at a time and 5 per rolling 24 hours (configurable).

Verify: the manual criteria in Phases 2, 3 and 4, plus `cd backend && npm run lint && npm run build && npm test` and `cd frontend && npm run lint && npm run build`.

### Key Discoveries:

- OpenAI strict structured output rejects `.optional()` and `.nullish()`; optional fields must be `.nullable()` (AI SDK v7 OpenAI provider docs, checked 2026-10-14). The model-facing schema is therefore structure-only (no min/max) and all semantic rules live in a backend validator.
- `generateText` with `Output.object({ schema })` throws `NoObjectGeneratedError` on invalid output and accepts `timeout`, `maxRetries`, `maxOutputTokens`, `abortSignal` and `providerOptions.openai.reasoningEffort` (AI SDK v7 docs via Context7, checked 2026-10-14). `ai`, `@ai-sdk/openai` and `zod` peer ranges accept zod `^3.25.76 || ^4.1.8` (`npm view`, 2026-10-14).
- OpenAI's own docs name the cost tier `gpt-5.6-luna` (and `gpt-5.6-sol`); press coverage calls them "GPT-6 Luna/Sol" with `gpt-6-luna`; only `gpt-6-astra` appears under GPT-6 in OpenAI's pricing table (Context7 OpenAI docs and web search, 2026-10-14). Model ids are therefore required env vars with no hardcoded default, and `.env.example` documents `gpt-5.6-luna`. Luna is listed at $0.10 input and $0.60 output per million tokens.
- Boot-time validation of required config is an established lesson from S-01, where production broke twice on a bad `SUPABASE_URL` (`backend/src/auth/jwks.provider.ts:8-34`, `context/archive/2026-10-10-sign-up-and-login/reviews/impl-review.md:26-38`).
- Never key authorization on email; job ownership and limits key on `Profile.id` (`context/foundation/lessons.md:5-10`).
- Sign-up is open with unverified email, so per-user limits are evadable with new accounts; the provider-side spend alert is the manual backstop (`context/foundation/infrastructure.md:58, 62, 89`).

## What We're NOT Doing

- Persisting plans or jobs in the database, and any migration or new table (S-05 owns the stored-plan shape; jobs are in memory).
- Live stage-by-stage streaming, SSE or WebSocket (S-03). The job exposes `stage` and `updatedAt` so S-03 can extend it; the page shows the stage label only because polling already returns it.
- The plan review UI with exercise images (S-04). S-02 renders a plain read-only list.
- Edit or regenerate part of a plan (FR-008, parked), cancelling a running job, and regenerating from a finished job.
- Cross-vendor models, a job queue, Redis, or multi-machine support (single Fly machine is the assumption in `infrastructure.md:66, 90`).
- Localization: plan text and UI copy are English, matching existing UI copy.
- A frontend test framework (none is configured; set one up deliberately in a separate change) and a gated-route e2e harness (none exists).
- Admin block and abuse detection beyond the per-user limits (S-07).
- Secondary muscles, instructions or other catalog columns.
- Any authorization or limit keyed on email.

## Implementation Approach

Build bottom-up so each layer is testable without the next. Phase 1 fixes the contract (config, form schema, plan schema, validator) as pure, unit-tested code. Phase 2 adds the model client, two-pass pipeline, in-memory job store, limiter and controller, with the model client behind a thin injectable so every pipeline path is unit-tested with a fake. Phase 3 builds the SPA flow against the real endpoints. Phase 4 deploys and evaluates plan quality, the roadmap's riskiest assumption.

Frequency rule (settled): week 1 has exactly the current frequency, week 8 exactly the desired frequency, and each week moves by 0 or 1 day toward desired and never away. Equal frequencies mean every week is flat. Boundary: current 1 and desired 7 is valid only as 1,2,3,4,5,6,7,7 or another sequence that moves by at most one toward 7 per week and ends at 7 (six steps within seven transitions).

Failure policy (settled): a pass whose output breaks the schema or the validator is re-run once with the validation issues fed back; a second failure fails the job with `invalid_output` and no plan, and the draft is never returned as a fallback when the review pass fails. Provider failures and timeouts fail immediately with `provider_unavailable` (the AI SDK's own `maxRetries: 1` still applies to transient transport errors). Worst case is 2 passes x 2 attempts x 2 SDK tries = 8 provider requests per job, under a 10-minute overall abort.

## Critical Implementation Details

- **Schema strictness**: the model-facing zod schema must be OpenAI-strict compatible (every property required, optionals expressed as `.nullable()`, no `.optional()`/`.nullish()`), with the exercise slug as a `z.enum` built from the catalog at job start. Numeric and length bounds belong to the validator, not the schema, because strict mode does not support them. This keeps a later vendor swap a one-file change.
- **Fire-and-forget under `no-floating-promises`**: the controller starts the pipeline with an explicit `void`, so `run` must catch every error internally and never reject; an unhandled rejection would crash the single Fly machine.
- **Reasoning tokens**: for reasoning models, reasoning tokens count against `maxOutputTokens`. Use `reasoningEffort: 'low'` and a generous `maxOutputTokens`; check `finishReason` in the first real runs, because truncation surfaces as `invalid_output`.
- **Deploy ordering**: required env vars fail the boot, so set the Fly secrets before merging (same rule as S-01, `context/archive/2026-10-10-sign-up-and-login/plan.md:62, 356`).
- **Prompt injection**: `goals` is untrusted free text. Pass it inside a delimited block with an instruction to treat it as data, cap it at 500 characters, and never log it. Structure, slug enum and validator bound what injection can produce; the free-text `note` field is capped at 200 characters and remains the residual surface.

## Phase 1: Backend contract and validation

### Overview

Add dependencies and the pure, unit-tested building blocks: boot-validated config, form schema, model-facing plan schema, and the plan validator. No network, no endpoints.

### Changes Required:

#### 1. Dependencies

**File**: `backend/package.json`

**Intent**: Add the AI SDK, the OpenAI provider and zod as runtime dependencies.

**Contract**: `ai`, `@ai-sdk/openai`, `zod` installed with `npm install` from `backend/` (versions at or above `ai` 7.0.140, `@ai-sdk/openai` 4.0.93, `zod` 4.6.7 per `npm view` on 2026-10-14); lockfile updated.

#### 2. Config

**File**: `backend/src/plan-generation/plan-generation.config.ts`

**Intent**: Read and validate generation settings at boot with self-explanatory errors, following the `SUPABASE_URL` pattern.

**Contract**: `readPlanGenerationConfig(env)` returns `{ openAiApiKey, draftModel, reviewModel, dailyLimit }`. Required: `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL` (non-empty after trim). Optional: `PLAN_DAILY_LIMIT` (positive integer, default 5). Invalid or missing values throw an error naming the variable and what to add to `backend/.env`. Exposed through a provider token so module instantiation fails the boot.

#### 3. Form schema and validation pipe

**Files**: `backend/src/plan-generation/plan-form.schema.ts`, `backend/src/plan-generation/zod-validation.pipe.ts`

**Intent**: Validate the request body once, with one library, and return a safe 400.

**Contract**: `planFormSchema`: `experience` in `beginner|intermediate|expert` (matches the catalog levels); `currentFrequency` and `desiredFrequency` integers 1-7; `heightCm` integer 100-250; `weightKg` number 30-300; `goals` trimmed string 1-500 characters. `ZodValidationPipe` parses with a schema and throws `BadRequestException` listing field paths and fixed messages, never echoing the raw value.

#### 4. Plan schema

**File**: `backend/src/plan-generation/plan.schema.ts`

**Intent**: Define the model-facing structured-output schema and the result types.

**Contract**: `buildGeneratedPlanSchema(slugs)` returns a strict-compatible zod object `{ weeks: [{ week: int, goal: string, sessions: [{ title: string, exercises: [{ slug: z.enum(slugs), sets: int, reps: string, restSeconds: int, note: string.nullable() }] }] }] }` with no min/max constraints. Also exports `GeneratedPlan` and the API-facing `PlanResult`, which adds `name` per exercise (joined from the catalog after validation).

#### 5. Plan validator

**File**: `backend/src/plan-generation/plan-validator.ts`

**Intent**: Enforce every rule the schema cannot, as a pure function so it is cheap to test at the boundaries.

**Contract**: `validateGeneratedPlan(plan, form, catalogSlugs)` returns `{ ok: true }` or `{ ok: false, issues: string[] }` (human-readable, fed back to the model on retry). Rules: exactly 8 weeks numbered 1-8 in order; every slug in the catalog; sessions per week follows the frequency rule above (week 1 = current, week 8 = desired, step 0 or 1 toward desired, never away, flat when equal); 3-10 exercises per session; sets 1-8; `restSeconds` 15-600; `reps` non-empty and at most 20 characters; `note` at most 200, `title` at most 80, week `goal` at most 200 characters; no repeated slug within one session.

**Deviation (2026-10-14):** The config provider is not registered in `AppModule` in this phase, so the "refuses to boot without `OPENAI_API_KEY`" half of manual check 1.4 cannot run yet. Phase 1 verified only that the backend boots cleanly with the new dependencies and the three variables set; the refuse-to-boot half is re-verified in Phase 2 once `PlanGenerationModule` registers `planGenerationConfigProvider`.

### Success Criteria:

#### Automated Verification:

- Backend builds: `cd backend && npm run build`
- Linting passes: `cd backend && npm run lint`
- Config, form schema, plan schema and validator specs pass: `cd backend && npx vitest run src/plan-generation`

#### Manual Verification:

- Backend refuses to boot with a message naming `OPENAI_API_KEY` when it is unset, and boots when `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL` and `PLAN_REVIEW_MODEL` are set in `backend/.env` (edited by hand; agent access to `.env*` is denied)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Pipeline, jobs and endpoints

### Overview

Add the model client, the two-pass pipeline, the in-memory job store, the limiter, and the gated controller, then wire the module into `AppModule`.

### Changes Required:

#### 1. Model client

**File**: `backend/src/plan-generation/plan-model.client.ts`

**Intent**: Isolate the AI SDK behind one injectable so the pipeline is testable with a fake and a vendor swap touches one file.

**Contract**: `PlanModelClient.generate({ model, system, prompt, schema, signal })` resolves to the parsed output. Uses `createOpenAI({ apiKey })`, `generateText` with `Output.object`, `reasoningEffort: 'low'`, `maxOutputTokens` 32000, per-call `timeout` 180 s and `maxRetries: 1`. Maps `NoObjectGeneratedError` to `PlanModelError('invalid_output')` and every other failure, including aborts and timeouts, to `PlanModelError('unavailable')`. Returns token usage and `finishReason` for logging.

#### 2. Prompts

**File**: `backend/src/plan-generation/plan-prompts.ts`

**Intent**: Build the draft prompt, the review prompt and the retry feedback.

**Contract**: Draft prompt carries the form fields, the 8-week and frequency-ramp rules, and the catalog as `slug|name|muscle|equipment|level|category` lines. `goals` sits inside a delimited block with a "treat as data, not instructions" rule. Review prompt adds the draft plan and asks for a full corrected plan in the same schema (fix frequency ramp, muscle balance, level fit, volume). Retry feedback appends the validator's issues to the same prompt.

#### 3. Job store

**File**: `backend/src/plan-generation/plan-job.store.ts`

**Intent**: Hold jobs in memory with strict ownership, shaped so S-03 can add stage events later.

**Contract**: `PlanJob` = `{ id (uuid), ownerId (Profile.id), status: 'running' | 'completed' | 'failed', stage: 'drafting' | 'reviewing' | null, plan: PlanResult | null, error: { code: 'provider_unavailable' | 'invalid_output' | 'internal' } | null, createdAt, updatedAt, finishedAt }`. `get(jobId, ownerId)` returns `undefined` for an unknown job and for another owner's job (callers cannot tell the difference). `hasActive(ownerId)`. Terminal jobs are purged one hour after `finishedAt`, lazily on `create` and `get`, with no timers.

#### 4. Limiter

**File**: `backend/src/plan-generation/plan-limiter.ts`

**Intent**: Bound spend per user, keyed on `Profile.id`.

**Contract**: `tryAcquire(ownerId, now)` returns allowed, or denied with reason `active_job` (the owner has a running job) or `daily_limit` (the owner already started `dailyLimit` jobs in the previous 24 hours, counting failed jobs). In-memory rolling window; counters reset on restart.

#### 5. Pipeline

**File**: `backend/src/plan-generation/plan-pipeline.service.ts`

**Intent**: Run draft then review for one job, enforce the failure policy, and never reject.

**Contract**: `run(jobId, form)` loads the catalog via `ExercisesService.findAll()`, builds the schema, sets stage `drafting`, runs the draft pass with `draftModel`, validates, retries once on issues, sets stage `reviewing`, repeats with `reviewModel` and the draft, then joins exercise names and marks the job `completed`. Failures map to error codes per the failure policy; an empty catalog or any unexpected error maps to `internal` and is logged. A single `AbortSignal.timeout` of 10 minutes covers the whole job. Logs per pass: job id, stage, duration, token usage, finish reason; never form content or goals.

#### 6. Controller and module

**Files**: `backend/src/plan-generation/plan-generation.controller.ts`, `backend/src/plan-generation/plan-generation.module.ts`, `backend/src/app.module.ts`

**Intent**: Expose the two gated endpoints and wire the module in.

**Contract**: `POST /plan-generations` (body through `ZodValidationPipe(planFormSchema)`, status 202): consults the limiter (denied responds 429 with body `{ code: 'active_job' | 'daily_limit' }`), creates the job for `user.id`, starts `void pipeline.run(...)`, returns `{ jobId }`. `GET /plan-generations/:jobId`: returns `{ status, stage, plan, error }` for the caller's own job, otherwise 404. No `@Public()`; the global guard applies. `PlanGenerationModule` imports `ExercisesModule` and is imported into `AppModule`.

**Carried from Phase 1 (2026-10-14):** once the module registers `planGenerationConfigProvider`, manually verify that the backend refuses to boot with a message naming `OPENAI_API_KEY` when it is unset (deferred half of check 1.4), and confirm on the first real run that OpenAI strict mode accepts the safe-integer `minimum`/`maximum` bounds zod 4 emits on integer fields, or that the AI SDK strips them.

**Deviation (2026-10-24):** The `daily_limit` half of manual check 2.5 was not run in this phase; it is covered by unit tests and verified on the deployed Cloudflare page (checks 3.6 and 4.5). Verified manually in Phase 2: a real generation completed with 8 weeks, sessions per week 3,3,3,4,4,4,5,5, and all 160 exercises from the catalog; `active_job` returned 429; a bad key failed the job with `provider_unavailable` and no goals in the logs; the backend refuses to boot with a blank `OPENAI_API_KEY`. OpenAI accepted the strict schema including zod's integer bounds, and `gpt-6-luna` worked as the model id.

### Success Criteria:

#### Automated Verification:

- Backend builds: `cd backend && npm run build`
- Linting passes: `cd backend && npm run lint`
- All backend unit specs pass, including store, limiter, pipeline and controller specs: `cd backend && npm test`

#### Manual Verification:

- With a real key and a valid JWT, `POST /plan-generations` returns 202 with a `jobId` immediately, and polling `GET /plan-generations/:jobId` reaches `completed` with 8 weeks whose exercise names all come from the catalog
- A second POST while a job is running returns 429 with `active_job`; with `PLAN_DAILY_LIMIT=2`, a third POST after two finished jobs returns 429 with `daily_limit`
- A second user's token gets 404 for the first user's `jobId`
- A bad `OPENAI_API_KEY` makes the job end `failed` with `provider_unavailable` and no plan, and server logs show per-pass duration and token usage without any goals text

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Frontend flow

### Overview

Add the form page, the polling job page, a plain plan view and the supporting client code, and extract the duplicated 401/403 handling.

### Changes Required:

#### 1. Auth-failure helper

**Files**: `frontend/src/lib/auth-failure.ts`, `frontend/src/pages/HomePage.tsx`

**Intent**: Share the 401 sign-out and 403 blocked sign-out handling instead of duplicating it in a second caller.

**Contract**: a helper taking the response status and `signOut` that signs out (with reason `blocked` for 403, no reason for 401) and reports whether it handled the status. `HomePage` switches to it with no behavior change. `HomePage` also gains a link to `/plans/new`.

#### 2. API module

**File**: `frontend/src/lib/plan-generation.ts`

**Intent**: Type the plan form and result, and wrap the two endpoints.

**Contract**: `startPlanGeneration(form)` (POST with `Content-Type: application/json`) and `fetchPlanGeneration(jobId, signal)` over `apiFetch`, each returning a discriminated result: ok, unauthorized, blocked, limit (`active_job` | `daily_limit`), not-found, or error. Types mirror `PlanForm`, `PlanResult` and job state from the backend contract.

#### 3. Form page

**File**: `frontend/src/pages/NewPlanPage.tsx`

**Intent**: Collect the six fields and start a job, following the sign-in form conventions.

**Contract**: controlled inputs with `htmlFor`/`id` labels; experience `select`; current and desired frequency number inputs 1-7; height cm and weight kg number inputs; goals `textarea` with `maxLength` 500; native validation; `pending` flag with disabled button; `try/catch/finally`; fixed error copy in `<p className="error" role="alert">`. On success navigates to `/plans/generate/:jobId`.

#### 4. Job page and plan view

**Files**: `frontend/src/pages/PlanGenerationPage.tsx`, `frontend/src/components/PlanView.tsx`

**Intent**: Poll the job, show the stage, then render the plan or a fixed error.

**Contract**: polls every 3 seconds with an `AbortController` cancelled on unmount; stops on `completed` or `failed`; three consecutive network failures end in the generic error. `role="status"` stage text ("Drafting your plan…", "Reviewing your plan…"). Fixed copy per outcome: `provider_unavailable`, `invalid_output`, `internal`, job not found or expired ("start again" with a link to the form), `active_job` and `daily_limit` shown on the form page. `PlanView` renders weeks, sessions and exercises as nested lists with name, sets, reps, rest and note.

#### 5. Routes and styles

**Files**: `frontend/src/router/router.tsx`, `frontend/src/index.css`

**Intent**: Register the gated routes and style the new controls with the existing tokens.

**Contract**: add `/plans/new` and `/plans/generate/:jobId` to the `RequireAuth` children. Add `select`, `textarea`, `fieldset` and minimal plan-list rules next to the existing element selectors; reuse `.hint`, `.status`, `.error`.

**Deviation (2026-10-24):** The daily-limit half of manual check 3.6 was not run locally; the `active_job` message was verified. The `daily_limit` message is verified on the deployed Cloudflare page as part of check 4.5.

### Success Criteria:

#### Automated Verification:

- Linting passes: `cd frontend && npm run lint`
- Type check and production build pass: `cd frontend && npm run build`

#### Manual Verification:

- Submitting the form navigates to the job page, shows the stage, then renders the full 8-week plan
- Refreshing the job page mid-generation resumes polling the same job
- A failed job and a bad provider key each show fixed copy with no provider text, and the user can start again
- Starting a second job while one runs, and exceeding the daily limit, show the two limit messages on the form page
- An unknown or expired `jobId` shows the "not found, start again" message
- Form controls have visible labels, the error uses `role="alert"`, and the form is fully keyboard operable
- A blocked user still gets the sign-out banner from Home and from the job page (regression check on the extracted helper)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Rollout and quality check

### Overview

Document and set the new configuration, deploy, and evaluate plan quality, the riskiest assumption named in the roadmap.

### Changes Required:

#### 1. Configuration docs

**Files**: `backend/.env.example`, `backend/README.md`

**Intent**: Make the four new variables discoverable.

**Contract**: add `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL` (example `gpt-6-luna`, the id confirmed working on the user's OpenAI account on 2026-10-24) and optional `PLAN_DAILY_LIMIT` to the env table in the README. `.env.example` is edited by hand by the user because agent access to `.env*` is denied.

#### 2. Secrets and deploy

**Intent**: Set secrets before the merge that deploys the backend.

**Contract**: `fly secrets set OPENAI_API_KEY=… PLAN_DRAFT_MODEL=… PLAN_REVIEW_MODEL=…` for the backend app before merging, and a spend alert or budget limit on the OpenAI account as the backstop for per-user limits that new accounts can evade.

#### 3. Quality evaluation

**Intent**: Decide whether the two-pass pipeline produces a believable personalized plan and whether the review model needs upgrading.

**Contract**: run at least three profiles on the deployed stack (the user's own 5 to 5 expert profile, a beginner 2 to 4, an intermediate 3 to 5) and record in `change.md` Notes: time to complete, token cost per job from logs, whether the frequency ramp held, muscle balance, tolerability of exercise repetition with a 32-exercise catalog, and whether the review pass visibly improved the draft. If review quality is poor, upgrading is a config change: set `PLAN_REVIEW_MODEL` to the stronger model's id from the user's OpenAI model list (likely `gpt-6-sol`; unconfirmed).

### Success Criteria:

#### Automated Verification:

- Full backend gates pass: `cd backend && npm run lint && npm run build && npm test`
- Full frontend gates pass: `cd frontend && npm run lint && npm run build`

#### Manual Verification:

- Fly secrets for the three required variables exist before the merge (`fly secrets list` shows names) and `README.md` and `.env.example` document all four variables
- After the merge the backend deploys, `/health` is green and the app does not crash-loop on boot
- A signed-in user completes the full flow on the deployed frontend and backend and sees a valid 8-week plan, and exceeding the daily limit shows the daily-limit message (carried from check 3.6)
- The three-profile quality evaluation is recorded in `change.md` Notes with the review-model decision

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Validator: valid ramp 3 to 5 (3,3,4,4,4,5,5,5); flat when current equals desired; taper 5 to 3; week 1 not equal to current; week 8 not equal to desired; a jump of two days between weeks; movement away from desired (3,4,3); the 1 to 7 boundary; 7 weeks and 9 weeks; unknown slug; repeated slug inside one session; out-of-range sets and rest; over-long text fields.
- Config: each required variable missing or blank, `PLAN_DAILY_LIMIT` invalid and default.
- Form schema: boundaries at each range limit, goals trimmed and over 500 characters.
- Job store: owner isolation (other owner and unknown job look identical), `hasActive`, purge after one hour, no purge of running jobs.
- Limiter: active-job denial, daily limit on the rolling 24 hours including failed jobs, window expiry.
- Pipeline with a fake model client: happy path makes exactly 2 calls; invalid draft then valid retry makes 3 calls; invalid twice fails with `invalid_output`; review failing after a valid draft fails the job and returns no plan; provider error fails with `provider_unavailable` without a validation retry; unexpected throw maps to `internal`; `run` never rejects.
- Controller: 202 with `jobId` and pipeline started, 400 on bad body, 429 with each code, GET 404 for another owner's job, job ownership uses `user.id`.

### Integration Tests:

- None added: no gated-route e2e harness exists and building one is out of scope. The existing `test/app.e2e-spec.ts` boots the full `AppModule`, so it now also needs the three new env variables set (document in the README).

### Manual Testing Steps:

1. Run the Phase 2 curl flow with a real key, then the Phase 3 browser flow.
2. Exercise the limit, ownership, bad-key and refresh cases listed under Manual Verification.
3. Run the Phase 4 three-profile quality evaluation.

## Performance Considerations

A job runs for roughly the sum of two model calls plus retries, bounded by a 180 s per-call timeout and a 10-minute job abort. Polling every 3 seconds costs one `AuthGuard` pass and one `Profile` lookup per request, which is acceptable at this scale. The in-memory store is bounded by the daily limit and the one-hour purge. The single 512 MB Fly machine holds a handful of small job objects; memory is not a concern at this scale.

## Migration Notes

None. No schema change, no migration and no data backfill. Jobs are lost on restart or deploy by design; the user sees the "not found, start again" message.

## References

- Related research: `context/changes/first-plan-generation/research.md`
- Gated controller template: `backend/src/profiles/me.controller.ts:5-10`
- Boot-time config validation pattern: `backend/src/auth/jwks.provider.ts:8-34`
- Catalog accessor: `backend/src/exercises/exercises.service.ts:9-11`
- Form conventions: `frontend/src/pages/SignInPage.tsx:25-58`
- Roadmap item: `context/foundation/roadmap.md:106-117`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend contract and validation

#### Automated

- [x] 1.1 Backend builds: `cd backend && npm run build` — 63d21e1
- [x] 1.2 Linting passes: `cd backend && npm run lint` — 63d21e1
- [x] 1.3 Config, form schema, plan schema and validator specs pass: `cd backend && npx vitest run src/plan-generation` — 63d21e1

#### Manual

- [x] 1.4 Backend refuses to boot with a message naming `OPENAI_API_KEY` when it is unset, and boots when `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL` and `PLAN_REVIEW_MODEL` are set in `backend/.env` (edited by hand; agent access to `.env*` is denied) — 63d21e1

### Phase 2: Pipeline, jobs and endpoints

#### Automated

- [x] 2.1 Backend builds: `cd backend && npm run build` — 9efef38
- [x] 2.2 Linting passes: `cd backend && npm run lint` — 9efef38
- [x] 2.3 All backend unit specs pass, including store, limiter, pipeline and controller specs: `cd backend && npm test` — 9efef38

#### Manual

- [x] 2.4 With a real key and a valid JWT, `POST /plan-generations` returns 202 with a `jobId` immediately, and polling `GET /plan-generations/:jobId` reaches `completed` with 8 weeks whose exercise names all come from the catalog — 9efef38
- [x] 2.5 A second POST while a job is running returns 429 with `active_job`; with `PLAN_DAILY_LIMIT=2`, a third POST after two finished jobs returns 429 with `daily_limit` — 9efef38
- [x] 2.6 A second user's token gets 404 for the first user's `jobId` — 9efef38
- [x] 2.7 A bad `OPENAI_API_KEY` makes the job end `failed` with `provider_unavailable` and no plan, and server logs show per-pass duration and token usage without any goals text — 9efef38

### Phase 3: Frontend flow

#### Automated

- [x] 3.1 Linting passes: `cd frontend && npm run lint` — 383bc5a
- [x] 3.2 Type check and production build pass: `cd frontend && npm run build` — 383bc5a

#### Manual

- [x] 3.3 Submitting the form navigates to the job page, shows the stage, then renders the full 8-week plan — 383bc5a
- [x] 3.4 Refreshing the job page mid-generation resumes polling the same job — 383bc5a
- [x] 3.5 A failed job and a bad provider key each show fixed copy with no provider text, and the user can start again — 383bc5a
- [x] 3.6 Starting a second job while one runs, and exceeding the daily limit, show the two limit messages on the form page — 383bc5a
- [x] 3.7 An unknown or expired `jobId` shows the "not found, start again" message — 383bc5a
- [x] 3.8 Form controls have visible labels, the error uses `role="alert"`, and the form is fully keyboard operable — 383bc5a
- [x] 3.9 A blocked user still gets the sign-out banner from Home and from the job page (regression check on the extracted helper) — 383bc5a

### Phase 4: Rollout and quality check

#### Automated

- [x] 4.1 Full backend gates pass: `cd backend && npm run lint && npm run build && npm test` — f378b13
- [x] 4.2 Full frontend gates pass: `cd frontend && npm run lint && npm run build` — f378b13

#### Manual

- [x] 4.3 Fly secrets for the three required variables exist before the merge (`fly secrets list` shows names) and `README.md` and `.env.example` document all four variables — f378b13
- [x] 4.4 After the merge the backend deploys, `/health` is green and the app does not crash-loop on boot — f378b13
- [x] 4.5 A signed-in user completes the full flow on the deployed frontend and backend and sees a valid 8-week plan — f378b13
- [x] 4.6 The three-profile quality evaluation is recorded in `change.md` Notes with the review-model decision — f378b13
