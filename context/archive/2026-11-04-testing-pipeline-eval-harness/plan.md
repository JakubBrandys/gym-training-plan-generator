# Pipeline Eval Harness Implementation Plan

## Overview

Build an on-demand eval, kept in a new `backend/eval/` directory, that makes a prompt or pipeline change that worsens the real model's output visible before merge (test-plan Risk #7). It runs the real `PlanPipelineService` and `PlanModelClient` over a fixed input set, several times each, and reports: per-call first-attempt validity (reusing `validateGeneratedPlan`), three deterministic quality metrics, and an LLM judge score for goals fit and experience fit only. The report shows deltas against a saved baseline and never fails the process. No production code changes.

## Current State Analysis

- No test calls the real model. Pipeline specs replay scripted plans through a fake client (`backend/src/plan-generation/plan-pipeline.service.spec.ts:126-176`); prompt specs assert substrings (`plan.prompts.spec.ts:38-168`). A fake-model test therefore says nothing about prompt quality (research §2).
- The pipeline retries a rejected pass once with the validator issues appended (`plan-pipeline.service.ts:29,120-136`), so a job can end `completed` after a first-attempt failure. A pass rate over finished jobs hides exactly the degradation Risk #7 describes.
- The pipeline is injectable: `PlanPipelineService(exercises, modelClient, store, config)` (`plan-pipeline.service.ts:54-60`); `ExercisesService.findAll` is one Prisma call (`exercises.service.ts:9-11`) and can be stubbed from `backend/prisma/seed-data/exercises.json` (32 records: 26 beginner, 5 intermediate, 1 expert). The 5-per-day and one-at-a-time limits live in the controller (`plan-generation.controller.ts:72,83`), so a direct pipeline run skips them.
- The review pass's contribution was never measurable because the draft is not stored (`context/archive/2026-10-14-first-plan-generation/change.md:18`).
- Real-run evidence is thin: six jobs, 61 to 104 s each, all valid on attempt 1, yet weeks 6 to 8 repeated (`change.md:14-19` of that archive).
- Build and lint boundaries: `tsconfig.build.json` includes all of `src` and excludes only `*spec.ts`, and the Dockerfile copies only `src`; the lint script covers `src/ test/ prisma/` only (`backend/package.json`). `ConfigModule.forRoot` loads `.env` only when the app boots (`app.module.ts:15`); `prisma.config.ts` shows the `import 'dotenv/config'` pattern. `tsc --noEmit -p tsconfig.json` passes clean today (checked 2026-11-04).

## Desired End State

From `backend/`, a developer can run `npm run eval:generate` (real model, needs the user's `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL`) and `npm run eval:score` (judge, needs `EVAL_JUDGE_MODEL`) and read one report: per-call validity by stage as k/n, retry counts, job outcomes, the three quality metrics, judge scores with a calibration check, and deltas versus a saved baseline with regressed metrics marked. The scoring half re-runs on saved plans with no regeneration. `npm test` covers the pure scoring code without a key. Verified by two deliberate prompt breaks that the user runs.

### Key Discoveries:

- Count calls, not jobs: `tryAttempt` validates every call and returns issues to `runPass` (`plan-pipeline.service.ts:139-186`).
- Stage at call time can be read from the job store, as the spec's fake does (`plan-pipeline.service.spec.ts:126-176`), so a recording wrapper needs no production change.
- The slug is a closed enum in the schema (`plan.schema.ts:16`), so off-catalog slugs are mostly constrained at decoding; the validator rules that can degrade are the frequency ramp, counts, repeats and field limits (research §1).
- Only the goals text is free-form (`plan-form.schema.ts:15-22`); frequency is already a hard validator rule, and body stats have no defined effect on the plan (research §3). The judge therefore scores goals fit and experience fit only.
- `generateText` accepts `output` and returns `.output` in the installed `ai` 7.0.140 (checked in `node_modules/ai/dist/index.d.ts`), and OpenAI accepted zod integer bounds in strict mode on the first real run (`first-plan-generation/plan.md:183`).

## What We're NOT Doing

- No CI gate and no process exit failure on a regression: the eval reports deltas and always exits 0 for a completed run (user decision; test-plan §4 keeps it out of CI). CI gates are not scheduled.
- No production-code change, no stored drafts in the app, no new dependency (research §6).
- No edit to test-plan §1 or §2: the backport of research corrections is unapproved. The only edit to `context/foundation/test-plan.md` is the §6.5 cookbook in Phase 4.
- No judge over anything `validateGeneratedPlan` or the deterministic metrics decide, no scoring of body stats, no judging of drafts (final reviewed plan only), no snapshot assertion on model text. Generated plans are kept only in the gitignored `eval/runs/` for hand review; the committed baseline holds numbers and metadata, never plan text.
- No database-backed catalog: the seed file is the catalog.
- No tuning of margins from data: the initial margins below are fixed constants, revisited after the first baseline.
- No second judge provider; no browser or frontend change.

## Implementation Approach

Build cheapest-signal first. Phase 1 is pure code with unit specs and needs no key. Phase 2 adds the real-model runner and a deterministic score script, and you run a smoke tier. Phase 3 adds the judge and its calibration. Phase 4 is your real full run, two deliberate breaks, and the cookbook. Pure modules live in `backend/eval/` with `*.spec.ts` files beside them, so `npm test` runs them. Real-model entry points are `*.eval.ts` run by a separate Vitest config, so neither `npm test` nor `npm run test:e2e` picks them up (`vitest.config.ts:11`, `vitest.config.e2e.ts:9`).

Settled design (user decisions, 2026-11-04):

- **Headline metric**: per model call, counting only the first attempt of each pass (see Phase 1 note). A call passes when `validateGeneratedPlan` accepts its output; an unparseable answer is a fail. Draft and review are reported separately; retry calls are counted and reported apart.
- **Regression policy**: report deltas versus the saved baseline and mark a metric `regressed` past a margin; always exit 0.
- **Judge**: model id from a new required env var `EVAL_JUDGE_MODEL`, no default; goals fit and experience fit scored 1 to 5 each with a one-sentence reason; a score of 4 or more (4 included) is a pass.
- **Input set**: 8 inputs, full run is 3 repeats each (24 jobs); smoke tier is the first 3 inputs, 1 repeat; jobs run in parallel (default concurrency 4); generated plans, draft and reviewed, are saved as JSON so scoring re-runs without regenerating.
- **Deterministic quality metrics**: week repetition, distinct muscle groups per week, share of exercises above trainee level; reported as rates with deltas, never counted in the validity pass rate.

Initial margins, one constants block in the report module (fixed now, revisit after the first baseline): call validity falls by more than 0.05; job failure rate rises by more than 0.05; mean week repetition rises by more than 0.15; judge mean for either criterion falls by more than 0.3; mean distinct muscle groups per week falls by more than 1.0; mean above-level share rises by more than 0.10; any unscored judge result marks the judge section `incomplete`. These are chosen to sit above the sampling noise the research derived (a clean 24-run set only bounds a failure rate near 12.5%), not fitted to data.

## Phase 1: Scoring core (no model, no key)

### Overview

Everything that can be built and proven without calling a model: the input set, the metrics, the report and baseline diff, and the wiring that keeps `eval/` out of the build and inside lint.

### Test sub-phase contract

- **Behavior asserted**: the metrics and the diff compute the right numbers on hand-written fixtures; the fixed inputs are valid forms with distinct goals; the diff marks exactly the metrics past their margin.
- **Regression caught**: a metric that stops catching the recorded defect (identical weeks 6 to 8 apart from reps and notes), a diff that marks noise or misses a real drop, a boundary mistake at a margin.
- **Research source**: research §3 (what is deterministic), §4 (noise bound), archive `change.md:17` (the repetition case).
- **Edge, error and boundary cases**: a plan with fewer than 8 weeks, an empty plan, a slug missing from the catalog (skipped, not thrown), an expert trainee (above-level share is 0 by construction), a drop of exactly the margin (not regressed) versus just past it, a baseline over different inputs (compared only on shared input ids; none shared means no deltas).
- **Anti-pattern avoided**: fixtures are written as literals independent of the metric code; the repetition fixture is the archive's plank case written by hand, not produced by a builder that shares the metric's logic.

### Changes Required:

#### 1. Input set and catalog loader

**File**: `backend/eval/eval-inputs.ts`, `backend/eval/eval-catalog.ts`

**Intent**: Define the 8 fixed inputs and the smoke tier, and load the catalog from the seed JSON so the pipeline runs with no database.

**Contract**: `EVAL_INPUTS: { id: string; form: PlanForm }[]` in this order, each with distinct goals text and body stats inside `planFormSchema` limits: `expert-5-5-strength`, `beginner-2-4-general`, `intermediate-3-5-hypertrophy` (these three are the 2026-10-24 profiles), `intermediate-1-7-return`, `expert-7-1-taper`, `intermediate-3-3-fatloss`, `beginner-3-3-back-sensitive` (goal text asks to avoid heavy spinal loading), `intermediate-4-4-posture`. Adjacent inputs differ in experience and goals so the judge calibration rotation is a real mismatch. `tierInputs(tier: 'smoke' | 'full')` returns the first 3 for smoke. `loadEvalCatalog()` reads `prisma/seed-data/exercises.json` with `readFile` and returns records shaped like the `Exercise` fields the pipeline reads (`slug`, `name`, `primaryMuscles`, `equipment`, `level`, `category`, `imageKey`).

#### 2. Metrics

**File**: `backend/eval/eval-metrics.ts`

**Intent**: Pure functions over a plan and the catalog. The first reuses the production validator so per-call validity means exactly what the pipeline means.

**Contract**: all accept the structural subset (weeks, sessions, exercises with `slug` and `sets`) so both `GeneratedPlan` and `PlanResult` pass.
- `callValidity(plan, form, slugs)` wraps `validateGeneratedPlan` and returns `{ ok, issueCount }`.
- `weekRepetitionRate(plan)`: a week from week 2 on is a repeat when it has the same number of sessions as the previous week and, for every session in order, the same exercise slugs in the same order and the same sets; reps and notes are ignored. Rate = repeats / (weeks - 1); `null` for fewer than 2 weeks.
- `meanDistinctMusclesPerWeek(plan, catalog)`: for each week the count of distinct `primaryMuscles` across its exercises, averaged; slugs not in the catalog are skipped.
- `aboveLevelShare(plan, catalog, experience)`: share of exercise slots whose catalog level outranks the trainee's (rank beginner < intermediate < expert; a trainee allows its own rank and below).

#### 3. Report and baseline diff

**File**: `backend/eval/eval-report.ts`

**Intent**: Aggregate per-job records into the report shape and diff it against a baseline, marking regressions per the margins block.

**Contract**: input is the run records of Phase 2 (defined there); report holds run metadata (tier, date, model ids, a sha256 of the system prompt plus each input's draft prompt plus the review prompt built over an empty draft, git commit when available), per-stage first-attempt call validity as `k/n`, retry call counts and their validity, job outcomes by error code, the three quality metrics (mean over jobs, plus per input), and a judge section (absent until Phase 3). The report carries no plan text. `diffReports(current, baseline)` compares rates over the input ids both reports contain and prints which ids were shared; it returns each metric with its delta and a `regressed` flag using a constants block of the margins listed above. A drop of exactly a margin is not regressed. The process exit code is never affected.

#### 4. Wiring

**File**: `backend/vitest.eval.config.ts`, `backend/package.json`, `backend/.gitignore`

**Intent**: A separate Vitest config for `*.eval.ts`, lint coverage for `eval/`, and a gitignored run directory.

**Contract**: `vitest.eval.config.ts` mirrors `vitest.config.ts` but includes `eval/**/*.eval.ts`, sets a test timeout of 30 minutes and no file parallelism. Add `eval/` to the `lint` script's paths. Add `/eval/runs` to `.gitignore`. npm scripts `eval:generate` and `eval:score` are added in Phase 2 when their files exist.

**Deviation (2026-11-04):** the input order and one id changed. The first draft order put two intermediate inputs next to each other, so the spec for the calibration rotation (adjacent inputs differ in experience and goals) went red. Final order: `expert-5-5-strength`, `beginner-2-4-general`, `intermediate-3-5-hypertrophy`, `expert-7-1-taper`, `intermediate-3-3-fatloss`, `beginner-3-3-back-sensitive`, `intermediate-1-7-return`, `beginner-4-4-posture` (replaces `intermediate-4-4-posture`). The smoke tier and the three 2026-10-24 profiles are unchanged. Also, `loadEvalCatalog` maps the seed's lowercase levels to the uppercase database enum values (`BEGINNER`), because the production prompt shows the database values and the eval must send the same prompt text. Added helper files not named above: `eval-types.ts`, `eval-paths.ts`, `eval-env.ts`.

### Success Criteria:

#### Automated Verification:

- New eval specs pass: `cd backend && npx vitest run eval/`
- Whole unit suite passes with the eval specs included: `cd backend && npm test`
- Linting passes with `eval/` covered: `cd backend && npm run lint`
- Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- The production build contains no eval code: `cd backend && npm run build && find dist -name '*eval*' | wc -l` prints 0

#### Manual Verification:

- Break check: temporarily make `weekRepetitionRate` also compare reps, confirm the plank-case spec goes red, then restore

**Implementation Note**: After this phase and its automated checks pass, pause for manual confirmation before Phase 2. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: Generation runner and deterministic scoring

### Overview

Run the real pipeline over the input set in parallel with a recording wrapper, save the plans, and score them deterministically. You run the smoke tier with your key.

### Test sub-phase contract

- **Behavior asserted**: the wrapper records, per real model call, its stage, attempt number, validity and any error code, and the wrapper changes nothing the pipeline sees; the runner survives a failing job; saved JSON round-trips into the Phase 1 report.
- **Regression caught**: a wrapper that swallows or alters an error (so a job outcome differs under the eval), mislabels the stage, or counts a retry call as a first attempt; a runner that stops on one failed job; a saved file the scorer cannot read.
- **Research source**: research §1 (retry hides failure), §4 (draft not stored), `plan-pipeline.service.spec.ts:126-176` (stage lookup technique).
- **Edge, error and boundary cases**: a draft that fails then passes (calls: attempt 1 fail, attempt 2 pass, headline counts only attempt 1), a draft that fails twice (job fails, no review call), an unparseable answer (`PlanModelError` `invalid_output`, recorded as a fail and rethrown), a provider error (`unavailable`, job fails with `provider_unavailable`), the missing-key start-up.
- **Anti-pattern avoided**: the specs use a scripted fake client only to test the wrapper and runner wiring; they do not claim anything about the model or the prompt. The headline is never read off job status.

### Changes Required:

#### 1. Recording wrapper

**File**: `backend/eval/eval-record.ts`

**Intent**: Wrap `PlanModelClient.generate` per job to capture each call without touching production code.

**Contract**: one wrapper instance per job, built with that job's `PlanJobStore`, job id, owner, form and the catalog slugs. `generate(request)` delegates to the real client, then records `{ stage, attempt, ok, issueCount, errorCode?, finishReason?, durationMs, usage, output? }`. `stage` is read from the store at call time; `attempt` is the 1-based count of calls already recorded in that stage plus one. Validity comes from `callValidity`. On a thrown `PlanModelError` it records `errorCode` and rethrows the same error. It returns the real result unchanged.

#### 2. Generate runner

**File**: `backend/eval/generate.eval.ts`

**Intent**: Run every (input, repeat) job with a bounded parallel pool and save the run.

**Contract**: starts with `import 'dotenv/config'`, then `readPlanGenerationConfig()` so a missing `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL` or `PLAN_REVIEW_MODEL` fails fast naming the variable. Env knobs: `EVAL_TIER` (`smoke` | `full`, default `smoke`), `EVAL_CONCURRENCY` (default 4). Per job: a fresh `PlanJobStore`, a stub `ExercisesService` returning the catalog, the recording wrapper over one shared real `PlanModelClient`, and `PlanPipelineService.run`; a thrown error in one job is recorded and does not stop the others. Writes `eval/runs/<ISO timestamp>/generated.json`: run metadata plus, per job, `{ inputId, repeat, form, status, errorCode, plan, calls }` where `plan` is the final plan or null and each call keeps its output so the draft is recoverable. Prints the run directory.

#### 3. Score runner and baseline save

**File**: `backend/eval/score.eval.ts`, `backend/eval/save-baseline.ts`, `backend/package.json`

**Intent**: Turn a saved run into a report, print it with deltas, and promote a chosen report to the baseline.

**Contract**: `score.eval.ts` reads `EVAL_RUN_DIR` (default: the newest directory under `eval/runs/`), computes the deterministic metrics and per-call validity from `generated.json`, builds the report, diffs it against `eval/baseline/report.json` when present, prints a readable summary, and writes `report.json` beside `generated.json`. `save-baseline.ts` copies a run's `report.json` to `eval/baseline/report.json` (run with `tsx`). npm scripts: `eval:generate` and `eval:score` run the two `.eval.ts` files through `vitest.eval.config.ts`; `eval:baseline` runs `tsx eval/save-baseline.ts`. The eval specs for the wrapper and the runner use a scripted fake client and stay in `*.spec.ts`.

**Deviation (2026-11-04):** `eval:generate` and `eval:score` run with `--reporter=verbose`, because Vitest hides `console.log` from passing tests and the report is printed that way. `eval:score` reads the run directory from `EVAL_RUN_DIR` (default: the newest), not from a `--` argument; `eval:baseline` takes the run directory as an argument. The runner pool and job logic live in `eval-runner.ts`, so `generate.eval.ts` stays thin. A no-key dry run with a fake model confirmed the generate output, score, baseline and diff path works end to end; its files were deleted.

### Success Criteria:

#### Automated Verification:

- New wrapper and runner specs pass: `cd backend && npx vitest run eval/`
- Whole unit suite passes: `cd backend && npm test`
- Linting passes: `cd backend && npm run lint`
- Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- The runner fails fast naming the missing variable and makes no network call: `cd backend && OPENAI_API_KEY= PLAN_DRAFT_MODEL=x PLAN_REVIEW_MODEL=x npm run eval:generate`

#### Manual Verification:

- You run `EVAL_TIER=smoke npm run eval:generate` with your key and `eval/runs/<timestamp>/generated.json` holds 3 jobs, each with a drafting call and a reviewing call recorded
- You run `npm run eval:score` on that run and it prints first-attempt validity by stage as k/n, job outcomes and the three quality metrics
- You open one job in `generated.json` and confirm the stages appear in order (drafting, then reviewing) and the recorded draft output is the draft, not the final plan

**Implementation Note**: Pause here for the manual smoke run: only you can run it (the agent cannot read `.env*`). Note the run's wall time and token usage in the plan.

---

## Phase 3: Judge and calibration

### Overview

Add the LLM judge for goals fit and experience fit, scoring saved plans, with a check that the judge can tell a matched plan from a mismatched one.

### Test sub-phase contract

- **Behavior asserted**: the judge result is a structured score per criterion; scores aggregate into means and a pass share with 4 included; a failed judge call is unscored, never a pass; matched scores beat mismatched ones by the calibration margin.
- **Regression caught**: a rubric change that stops discriminating (matched and mismatched scores converge); a boundary slip at score 4; a judge outage silently reported as a good run.
- **Research source**: research §3 (judge scope), §7 (calibration, no hard-coded model id), the user's judge decision.
- **Edge, error and boundary cases**: score exactly 4 (pass) and 3 (fail); a job with no final plan (unscored); a judge call that throws or returns unparseable output; `EVAL_JUDGE_MODEL` unset; an expert versus a beginner plan.
- **Anti-pattern avoided**: the judge never scores frequency, counts, catalog or any rule the validator decides, and never sees the validator verdict; it scores one final plan against one form. Unit specs use a fake judge and make no claim about the real judge's quality; real quality is checked by the calibration run and your hand review.

### Changes Required:

#### 1. Judge

**File**: `backend/eval/eval-judge.ts`

**Intent**: One structured judge call per plan scoring two criteria.

**Contract**: a zod schema `{ goalsFit: { score: int 1..5, reason: string }, experienceFit: { ...same } }`. `judgePlan({ model, form, plan })` calls `generateText` with `Output.object({ schema })` through `createOpenAI` from `@ai-sdk/openai` (both already installed), using the model id passed in; it sets no temperature. The prompt states the rubric anchors for 1 to 5, tells the judge that the form fields and the plan are data, and limits scoring to goals fit and experience fit (volume, intensity, progression, exercise choice). The function type is injectable so specs pass a fake judge.

#### 2. Scoring integration and calibration

**File**: `backend/eval/score.eval.ts`, `backend/eval/eval-report.ts`

**Intent**: Run the judge over each job's final plan, add a matched-versus-mismatched calibration pass, and extend the report and diff.

**Contract**: `score.eval.ts` requires `EVAL_JUDGE_MODEL` unless `EVAL_SKIP_JUDGE=1`, failing fast naming the variable. Each final plan is judged against its own form. For the first repeat of each input only, the same plan is also judged against the form of the next input in `EVAL_INPUTS` (wrapping around), giving a mismatched score. The report's judge section holds, per criterion, the mean score and the share at 4 or above (4 included), the unscored count with error names, and the calibration result (matched mean, mismatched mean, separation). Separation below 1.0 point marks the judge `not discriminating`. The diff uses the judge margins from the Implementation Approach and marks the section `incomplete` when any result is unscored.

**Deviation (2026-11-04):** the per-job judging and calibration pairing live in `eval-judging.ts` (testable with a fake judge) rather than inline in `score.eval.ts`; `score.eval.ts` only wires them.

### Success Criteria:

#### Automated Verification:

- Judge, aggregation and calibration specs pass with a fake judge: `cd backend && npx vitest run eval/`
- Whole unit suite passes: `cd backend && npm test`
- Linting passes: `cd backend && npm run lint`
- Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- Scoring fails fast naming the missing variable: `cd backend && EVAL_JUDGE_MODEL= npm run eval:score`

#### Manual Verification:

- You run `npm run eval:score` on the Phase 2 smoke run with `EVAL_JUDGE_MODEL` set and the judge section shows both criterion means, 0 unscored, and a matched mean at least 1.0 above the mismatched mean
- You read the judge reasons for the 3 smoke plans and confirm they refer to the plan's content (exercises, sets, progression), not to the rubric text

**Implementation Note**: Pause for your confirmation. Record the judge model id you used in the plan notes (it is not in code).

---

## Phase 4: Real run, deliberate breaks and cookbook

### Overview

Prove the eval moves when the prompt gets worse, record the cost, save the baseline, and document how to use it.

### Test sub-phase contract

- **Behavior asserted**: against a saved baseline, a prompt that loses the frequency-ramp rule or the goals block produces a report with the matching metric marked `regressed`.
- **Regression caught**: the Risk #7 scenario itself: a prompt tweak that silently degrades quality.
- **Research source**: research §4 (noise bound), Open Question 7 (sensitivity unproven).
- **Edge, error and boundary cases**: a break that no metric registers (recorded as a finding about the eval's blind spot, with the margins left unchanged); judge noise on a re-score of the same saved plans (deltas stay inside the margins); a smoke-versus-full comparison (diffed over shared input ids).
- **Anti-pattern avoided**: trusting one green sample. The harness is trusted only after both breaks have been seen red and the restored prompt has been seen green.

### Changes Required:

#### 1. Baseline and deliberate breaks (run by you)

**File**: `backend/eval/baseline/report.json`, `backend/src/plan-generation/plan.prompts.ts` (temporary, reverted)

**Intent**: Capture a trusted baseline from a full run, then confirm sensitivity with two temporary prompt edits.

**Contract**: the baseline is a full-tier report saved with `npm run eval:baseline -- <run-dir>`; it contains numbers and metadata only. Break A removes the frequency-ramp rule line from `buildRequirements` (`plan.prompts.ts:41`). Break B removes the goals lines from `buildTraineeBlock` (`plan.prompts.ts:62-65`). Each break is a full run scored and compared to the baseline, then reverted with `git checkout -- backend/src/plan-generation/plan.prompts.ts`.

#### 2. Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `### 6.5 Running the pipeline eval` stub with the patterns shipped, in the style of §6.1 to §6.4.

**Contract**: only the §6.5 block changes. It covers location, naming, run commands, the headline metric and why, the margins and how to reread them, the judge and its calibration, the mocking policy (unit specs fake only the model client and the judge), the known gaps (no CI, same-vendor judge, level fit weak because the catalog is mostly beginner, client constants not hashed), and the dated tool facts (`checked: 2026-11-04`: plain Vitest runner chosen over evalite, vitest-evals, promptfoo and autoevals; judge via `ai` 7.0.140 `generateText`).

**Results (2026-11-04, run by the agent at the user's request; models draft and review `gpt-5.6-luna`, judge `gpt-6-luna`):**

- Baseline full run: 24 of 24 jobs completed in about 8.5 minutes at concurrency 4. First-attempt validity: drafting 23 of 24, reviewing 24 of 24, one retry call (valid). Generation tokens 190,460 in and 249,572 out, about $0.17 at the `gpt-5.6-luna` list price (the judge cost was not measured). Judge: goals fit mean 3.917, experience fit mean 4.000, calibration separation 1.375. Re-scoring the same run gave zero deltas on the deterministic metrics and judge deltas of 0.04 and 0.13, inside the 0.3 margin.
- Break A (frequency-ramp rule removed): call validity 0.667 and job failure rate 0.375 (9 of 24 jobs `invalid_output`), both marked `regressed`. The week-repetition, muscle and level metrics did not move; the judge scores moved by less than the margin.
- Break B (goals block removed): goals fit fell 3.917 to 3.250 (delta -0.667), marked `regressed`; experience fit fell by exactly 0.300, which is not past the margin. Caveat: 4 of 24 jobs ended `provider_unavailable` after calls of 333 to 354 seconds (the baseline's longest call was 62 seconds), so call validity and job failure rate also show `regressed` here, but not because of the prompt change; those four are not attributable to the break and also made the judge section incomplete and the calibration read as not discriminating (0.714 on fewer pairs). A rerun would give a cleaner Break B.
- Both breaks were reverted with `git checkout` and `git status` on `backend/src` was empty afterwards.

**Deviation (2026-11-04, approved by the user):** `test-plan.md` was edited beyond §6.5 after the plan was written, because the user approved the backport of the research corrections and asked to drop rollout Phase 5. The edits are: the Phase 5 row removed from §3 and the §5 wording changed to "not scheduled" for the three CI gates, the Phase 4 status set to `complete`, the Risk #7 Source and Risk Response Guidance row, the AI-native row in §4, and a §6.6 note (commit f4d3ca2, with the §3 and §5 edits in 0253b3e). The "What We're NOT Doing" bullet that says the backport is unapproved is therefore out of date.

**Review fixes (2026-11-04, from `reviews/impl-review.md`, all approved):** `eval:baseline` refuses a smoke, judge-less or incomplete report unless `--force` (F1); each finished job is written to `jobs/` as it ends, with `meta.json` written first, and scoring can rebuild a cut-off run (F2); scoring writes `judged.json` with the reasons (F3); an absent baseline is the only case that reads as "no baseline", a corrupt or old-shape baseline throws (F4); calls with an `unavailable` error and jobs ending `provider_unavailable` are excluded from `callValidity` and `jobFailureRate` and reported as outages (F5, applied to both rates for consistency, so the baseline had to be regenerated); a crash in the runner logs the error name (F6); the diff warns when the tier or a model differs from the baseline and says whether the prompt hash changed (F7); the prompt hash now includes the retry prompt (F8). New helper file: `eval-run-io.ts`.

### Success Criteria:

#### Automated Verification:

- Whole unit suite passes after the final changes: `cd backend && npm test`
- Linting passes: `cd backend && npm run lint`
- The cookbook stub is gone: `grep -c "TBD — see §3 Phase 4" context/foundation/test-plan.md` prints 0

#### Manual Verification:

- You run `EVAL_TIER=full npm run eval:generate` then `npm run eval:score`: the report covers 24 jobs and has validity as k/n, quality metrics and judge scores; note the wall time and spend against the research estimate of about 6 to 10 minutes and about $0.23
- You save the baseline with `npm run eval:baseline -- <run-dir>` and `grep -c '"slug"' backend/eval/baseline/report.json` prints 0
- You re-score the same run directory: deterministic metrics show zero deltas and the judge deltas stay inside the margins
- Break A: with the frequency-ramp rule removed, a full run shows call validity or job failures marked `regressed`; if no metric moves, record that as a finding in the plan and leave the margins as they are; then revert the file
- Break B: with the goals lines removed, a full run shows the goals-fit mean marked `regressed`; if it does not, record that as a finding; then revert the file
- You read about 10 judged plans from the full run next to their scores and confirm the scores are plausible
- The diff of `context/foundation/test-plan.md` made by this phase is confined to the §6.5 block

**Implementation Note**: If a deviation from this plan was approved during implementation, add a dated "Deviation" note under the affected phase's Changes Required in the same commit (`context/foundation/lessons.md`).

---

## Testing Strategy

### Unit Tests:

- Metrics on hand-written literal fixtures: the plank-case repetition (identical slugs and sets, different reps and notes), a plan with fewer than 8 weeks, a slug outside the catalog, an expert trainee.
- Report diff: exactly-at-margin versus just-past-margin for each metric, a baseline over partly different input ids, none shared.
- Recording wrapper and runner with a scripted fake client: draft fail then pass, draft fail twice, unparseable answer, provider error, one failing job among several.
- Judge aggregation with a fake judge: score 4 and 3, unscored result, calibration separation above and below 1.0.

### Integration Tests:

- None automated against the real model by design (cost and non-determinism; test-plan §4). The real-model checks are the Phase 2 smoke run and the Phase 4 full run and breaks.

### Manual Testing Steps:

1. Smoke run and score (Phase 2), then score with the judge (Phase 3).
2. Full run, baseline, re-score (Phase 4).
3. Break A and Break B, each followed by a revert and a green re-check.

## Performance Considerations

Full tier is 24 jobs: about 24 to 42 minutes serial and about 6 to 10 minutes at concurrency 4 (inference from 61 to 104 s per job, `first-plan-generation/change.md:16`; provider rate limits not checked). Spend is about $0.23 at the `gpt-5.6-luna` list price, unverified for `gpt-6-luna`; the judge adds a few cents. Scoring from saved plans costs only the judge calls.

## Migration Notes

None. No schema, API or persisted-shape change; `PlanForm` and `PlanResult` are read, not changed (lessons: persisted contracts).

## References

- Related research: `context/changes/testing-pipeline-eval-harness/research.md`
- Test plan row and guidance: `context/foundation/test-plan.md:53,78,92,112,135,194-196`
- Pipeline seams: `backend/src/plan-generation/plan-pipeline.service.ts:54-60,112-186`
- Validator to reuse: `backend/src/plan-generation/plan.validator.ts:107-149`
- Stage-lookup technique: `backend/src/plan-generation/plan-pipeline.service.spec.ts:126-176`
- Prior real-run evidence: `context/archive/2026-10-14-first-plan-generation/change.md:14-19`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scoring core (no model, no key)

#### Automated

- [x] 1.1 New eval specs pass: `cd backend && npx vitest run eval/`
- [x] 1.2 Whole unit suite passes with the eval specs included: `cd backend && npm test`
- [x] 1.3 Linting passes with `eval/` covered: `cd backend && npm run lint`
- [x] 1.4 Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- [x] 1.5 The production build contains no eval code: `cd backend && npm run build && find dist -name '*eval*' | wc -l` prints 0

#### Manual

- [x] 1.6 Break check: temporarily make `weekRepetitionRate` also compare reps, confirm the plank-case spec goes red, then restore

### Phase 2: Generation runner and deterministic scoring

#### Automated

- [x] 2.1 New wrapper and runner specs pass: `cd backend && npx vitest run eval/`
- [x] 2.2 Whole unit suite passes: `cd backend && npm test`
- [x] 2.3 Linting passes: `cd backend && npm run lint`
- [x] 2.4 Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- [x] 2.5 The runner fails fast naming the missing variable and makes no network call: `cd backend && OPENAI_API_KEY= PLAN_DRAFT_MODEL=x PLAN_REVIEW_MODEL=x npm run eval:generate`

#### Manual

- [x] 2.6 You run `EVAL_TIER=smoke npm run eval:generate` with your key and `eval/runs/<timestamp>/generated.json` holds 3 jobs, each with a drafting call and a reviewing call recorded
- [x] 2.7 You run `npm run eval:score` on that run and it prints first-attempt validity by stage as k/n, job outcomes and the three quality metrics
- [x] 2.8 You open one job in `generated.json` and confirm the stages appear in order (drafting, then reviewing) and the recorded draft output is the draft, not the final plan

### Phase 3: Judge and calibration

#### Automated

- [x] 3.1 Judge, aggregation and calibration specs pass with a fake judge: `cd backend && npx vitest run eval/`
- [x] 3.2 Whole unit suite passes: `cd backend && npm test`
- [x] 3.3 Linting passes: `cd backend && npm run lint`
- [x] 3.4 Type checking passes: `cd backend && npx tsc --noEmit -p tsconfig.json`
- [x] 3.5 Scoring fails fast naming the missing variable: `cd backend && EVAL_JUDGE_MODEL= npm run eval:score`

#### Manual

- [x] 3.6 You run `npm run eval:score` on the Phase 2 smoke run with `EVAL_JUDGE_MODEL` set and the judge section shows both criterion means, 0 unscored, and a matched mean at least 1.0 above the mismatched mean
- [x] 3.7 You read the judge reasons for the 3 smoke plans and confirm they refer to the plan's content (exercises, sets, progression), not to the rubric text

### Phase 4: Real run, deliberate breaks and cookbook

#### Automated

- [x] 4.1 Whole unit suite passes after the final changes: `cd backend && npm test`
- [x] 4.2 Linting passes: `cd backend && npm run lint`
- [x] 4.3 The cookbook stub is gone: `grep -c "TBD — see §3 Phase 4" context/foundation/test-plan.md` prints 0

#### Manual

- [x] 4.4 You run `EVAL_TIER=full npm run eval:generate` then `npm run eval:score`: the report covers 24 jobs and has validity as k/n, quality metrics and judge scores; note the wall time and spend against the research estimate of about 6 to 10 minutes and about $0.23
- [x] 4.5 You save the baseline with `npm run eval:baseline -- <run-dir>` and `grep -c '"slug"' backend/eval/baseline/report.json` prints 0
- [x] 4.6 You re-score the same run directory: deterministic metrics show zero deltas and the judge deltas stay inside the margins
- [x] 4.7 Break A: with the frequency-ramp rule removed, a full run shows call validity or job failures marked `regressed`; if no metric moves, record that as a finding in the plan and leave the margins as they are; then revert the file
- [x] 4.8 Break B: with the goals lines removed, a full run shows the goals-fit mean marked `regressed`; if it does not, record that as a finding; then revert the file
- [x] 4.9 You read about 10 judged plans from the full run next to their scores and confirm the scores are plausible
- [x] 4.10 The diff of `context/foundation/test-plan.md` made by this phase is confined to the §6.5 block
