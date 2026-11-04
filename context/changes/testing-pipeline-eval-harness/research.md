---
date: 2026-11-04T20:40:00+01:00
researcher: Claude Code (claude-sonnet-5-5)
git_commit: e57466d690172271f20618187b4fc4149204ceb4
branch: main
repository: 10xdevs
topic: "Phase 4 / Risk #7: can a prompt or pipeline change that degrades real-model plan quality show up before merge as a pass rate, and with which tool?"
tags: [research, codebase, plan-generation, eval, llm-judge, risk-7, vitest, ai-sdk]
status: partial
last_updated: 2026-11-04
last_updated_by: Claude Code (claude-sonnet-5-5)
---

# Research: Phase 4 / Risk #7, pipeline eval harness

**Date**: 2026-11-04 (local time, +01:00)
**Researcher**: Claude Code (claude-sonnet-5-5)
**Git Commit**: e57466d690172271f20618187b4fc4149204ceb4 (working tree also has an uncommitted `test-plan.md` edit and this untracked change folder)
**Branch**: main
**Repository**: 10xdevs

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md` for Risk #7: a prompt or pipeline tweak silently degrades plan quality and nothing signals it before deploy. Verify (not blindly accept) the response guidance: a pass rate over a small fixed input set, deterministic validity checks first, an LLM judge only for the personalisation rubric, no snapshotting of model text. Ground the failure path, existing tests, provider and model configuration, cost and minutes per run, non-determinism, what "personalised" means per the PRD, which validators can be reused, and choose the eval tool.

`status: partial` because three things could not be verified: whether a usable `OPENAI_API_KEY` is present (access to `.env*` is denied to the agent), the `gpt-6-luna` price, and how the real model behaves under a degraded prompt (no real-model call was made in this research). Each is flagged in Open Questions.

## Summary

- **The risk is real in structure, thin in recorded evidence.** The only code that decides plan quality sits in `plan.prompts.ts`, the two-pass orchestration in `plan-pipeline.service.ts`, and the client settings in `plan-model.client.ts`. No existing test calls the real model. The pipeline specs replay scripted plans through a fake client (`plan-pipeline.service.spec.ts:126-176`), and the prompt specs only assert that strings appear in the prompt (`plan.prompts.spec.ts:38-168`). The guidance's challenge "a fake-model unit test says nothing about prompt quality" is **confirmed**.
- **The pipeline can be driven in-process with the real model and no database.** `PlanPipelineService` takes `ExercisesService`, `PlanModelClient`, `PlanJobStore` and a config object by constructor (`plan-pipeline.service.ts:54-60`); `ExercisesService.findAll` is one Prisma call (`exercises.service.ts:9-11`) and can be stubbed with `backend/prisma/seed-data/exercises.json` (32 records). The HTTP limiter (5 per day, one at a time) lives in the controller (`plan-generation.controller.ts:72,83`), so a direct pipeline run does not touch it.
- **Correction to the guidance: measure first-attempt validity, not job completion.** The pipeline retries a rejected pass once with the validator's issues appended (`plan-pipeline.service.ts:29,120-136`), so a prompt change that makes the first attempt invalid more often can still end `completed`. A pass rate over finished jobs would hide exactly the degradation Risk #7 describes. The harness has to count attempts, which is possible by wrapping `PlanModelClient.generate` without touching production code.
- **Correction to the guidance: the "deterministic first" tier is wider than the existing validator.** `validateGeneratedPlan` already covers week count, the frequency ramp, exercise count, catalog membership, repeats and field limits (`plan.validator.ts:107-149`). The known real-model weakness (archive note, 2026-10-24) is week-to-week repetition with no progression, and the prompt promises muscle balance and level fit. Those can be measured deterministically from the plan and the catalog; only the goals fit needs a judge.
- **"Personalised" per the PRD is four inputs; only one is free text.** Experience, frequency, body stats and goals (`prd.md:26`, `prd.md:97-99`). Frequency is already a hard validator rule. Body stats enter the prompt but no rule says how they change the plan. The catalog has 26 beginner, 5 intermediate and 1 expert exercise (counted from `exercises.json`), so catalog `level` is a weak personalisation signal. The judge rubric should be goals fit and experience fit (volume, intensity, progression), not a recheck of anything the validator accepts or rejects.
- **Cost and time per run are small but not "minutes".** From six real jobs on the deployed stack: 61 to 104 s per job (draft plus review) and about 1 cent for the largest job at an unverified price. An 8-input by 3-repeat run is 24 jobs: roughly 24 to 42 minutes if run serially, about 6 to 10 minutes at concurrency 4 (inference; provider rate limits not checked), and about 24 cents at the upper bound.
- **Tool: a plain Vitest runner in the backend, no new dependency**, with the judge as one `generateText` call using `Output.object` through the `ai` package already installed. evalite, vitest-evals, promptfoo and autoevals were compared; none earns its install cost here (details below).
- **Hot-spot evidence is misleading for this risk.** The 39 touches are production-file touches in `backend/src/plan-generation` over 30 days, but `plan.prompts.ts` was touched once (2026-10-24). The churn is job-store, controller and event-stream work. The likelihood "High" actually rests on interview Q3 (not stored in the repo) and on a pending prompt follow-up recorded in the archive.

## Detailed Findings

### 1. Where a prompt or pipeline tweak changes plan quality

- The prompts are three pure builders plus a constant system prompt: `PLAN_SYSTEM_PROMPT` (`plan.prompts.ts:10-11`), `buildDraftPrompt` (`:74-83`), `buildReviewPrompt` (`:85-101`) and `buildRetryPrompt` (`:103-111`). The rules the model is asked to follow are in `buildRequirements` (`plan.prompts.ts:37-52`), including the two quality rules no code checks: `"Balance muscle groups across each week and fit the exercises to the trainee level."` (`:51`).
- The trainee block passes experience, both frequencies, height, weight and the goals text; goals are stripped of `<`, `>` and fullwidth brackets and flattened to one line (`plan.prompts.ts:23-27,54-66`).
- Orchestration: one draft pass then one review pass, each with up to 2 attempts (`plan-pipeline.service.ts:29,79-90,112-137`). A pass retries when the validator rejects the output or the model returns unparseable output (`:181-184`, `plan-model.client.ts:113-118`). The job completes only with the reviewed plan (`plan-pipeline.service.ts:91`).
- Client settings that change output without touching a prompt: `reasoningEffort: 'low'` (`plan-model.client.ts:75`), `maxOutputTokens` 32,000 and the timeouts (`:11-15`), and the structured-output schema with `slug: z.enum(slugs)` (`plan.schema.ts:16`). Model ids are not in code: `PLAN_DRAFT_MODEL` and `PLAN_REVIEW_MODEL` are required env vars (`plan-generation.config.ts:43-45`). A model id change, an effort change and a prompt edit are all "pipeline changes" for Risk #7, and the harness covers all three if it goes through the real `PlanModelClient` and the real config.
- Two inferences worth keeping for the plan, from the code above: (a) because the slug field is a closed enum in the schema, an off-catalog slug is constrained at the decoding level when the provider enforces the schema; the first real run recorded that OpenAI accepted the strict schema (`context/archive/2026-10-14-first-plan-generation/plan.md:183`). Catalog validity is therefore unlikely to be what degrades; the validator rules that can degrade are the frequency ramp, week and exercise counts, repeats and field limits. (b) A real-model baseline validity near 100% (see 4) makes a drop detectable only when the regression is large.

### 2. Guidance verification, point by point

| Guidance | Verdict | Evidence |
|---|---|---|
| "A fake-model unit test says nothing about prompt quality." | Confirmed. | `FakePlanModelClient` returns queued plans and only simulates progress events (`plan-pipeline.service.spec.ts:126-176`). It bypasses the zod schema too. Prompt specs assert substrings (`plan.prompts.spec.ts:38-168`). They protect the wiring (goals stay in the delimited block, rules are present), not whether the model obeys. |
| "One good sample is evidence." (to challenge) | Confirmed as a trap. | The 2026-10-24 quality check ran 3 profiles and six jobs, all valid on attempt 1 (`context/archive/2026-10-14-first-plan-generation/change.md:14-19`), and still missed that weeks 6 to 8 repeat. A small all-green sample bounds the failure rate loosely (see 4). |
| "Pass rate over a small fixed set of inputs" | Holds, with a correction. | Feasible in-process (Summary). The metric must be per attempt, not per finished job, because the retry hides first-attempt failures (`plan-pipeline.service.ts:120-136`). |
| "Deterministic validity checks run first" | Holds, and can reuse `validateGeneratedPlan` as is. | It is a pure function of plan, form and slug list (`plan.validator.ts:107-111`). It checks week count and numbering, the frequency ramp, 3 to 10 exercises, catalog membership, repeats, sets 1 to 8, rest 15 to 600, and length limits (`:21-105`). |
| "LLM judge only for the personalisation rubric" | Holds, narrowed. | Frequency is part of "personalised" per the PRD but is already a validator rule, so the judge must not score it. See 3. |
| "Avoid an LLM judge over what a validator already catches" | Holds. | Anything in the list above is deterministic. |
| "Avoid snapshotting model text" | Holds. | Model text differs run to run; assert rates and scores, and keep raw outputs only as a gitignored artefact for hand review. |

### 3. What "personalised" means here, and which parts are testable how

- PRD: the plan is "tailored to the intersection of their actual experience level, weekly frequency, body stats, and specific goals" (`prd.md:20`, `prd.md:26`); FR-004 notes "personalization depth is the core value proposition" (`prd.md:68`); the business rule "weigh[s] the user's experience level, weekly frequency, body stats, and goals" (`prd.md:97`). The PRD gives no measurable definition of "tailored".
- By input, what the code and catalog allow:
  - **Frequency**: hard rule, already validated (`plan.validator.ts:21-50`). Deterministic. Not a judge item.
  - **Experience**: the prompt says "fit the exercises to the trainee level" (`plan.prompts.ts:51`). A catalog-level proxy exists (the exercise `level` field is in the catalog block, `plan.prompts.ts:13-21`), but the catalog holds 26 beginner, 5 intermediate and 1 expert exercise, so a beginner-fit check can only reject at most 6 non-beginner slugs and an expert-fit check has almost nothing to measure. Experience shows up more in sets, reps, rest, volume and progression, which is judge territory.
  - **Body stats**: passed to the prompt (`plan.prompts.ts:58-59`); no rule states an expected effect. A judge asked "did it use the height and weight" would be scoring an unfalsifiable expectation. Recommend not scoring it, or scoring only "does not contradict".
  - **Goals**: free text up to 500 characters (`plan-form.schema.ts:15-22`). This is the one dimension that needs a judge.
- Deterministic checks beyond the validator that the code and the archive support (proposals for the plan, not existing code): week-over-week identity (the recorded weakness: beginner and intermediate weeks 6 to 8 identical "apart from plank durations and notes", `change.md:17`), muscle-group coverage per week from the catalog's `primaryMuscles`, and the share of exercises above the trainee's level. These run before any judge call.

### 4. Cost, minutes and non-determinism

- Recorded real-run data (only source found): deployed Fly stack, `gpt-6-luna` for both passes, 3 profiles, six jobs from retained logs, profile mapping "inferred from output size": 61 to 104 s per job, 6,730 to 9,664 input and 7,906 to 14,183 output tokens per job, every pass `finishReason=stop` on attempt 1, no retries, no validator rejections (`context/archive/2026-10-14-first-plan-generation/change.md:16`). Cost note there: at the `gpt-5.6-luna` list price ($0.10 in, $0.60 out per million) the largest job is about 1 cent, and "`gpt-6-luna` pricing not verified".
- Arithmetic from those figures (inference): 24 jobs (8 inputs x 3 repeats) are 24 x 61 s = 24.4 min to 24 x 104 s = 41.6 min serial; at concurrency 4 about 6.1 to 10.4 min if the provider does not rate-limit (not checked). Cost ceiling 24 x about $0.0095 = about $0.23 at the unverified price. Judge calls add one call per plan with an input about the size of a plan (8 to 14k tokens): about 0.2 to 0.3M tokens, a few cents at the same unverified price.
- Non-determinism: each job is a fresh sample. With 0 failures in n independent runs, the 95% upper bound on the failure rate is about 3/n (rule of three, standard statistics, not from the repo): 24 runs bound it near 12.5%, 6 runs near 50%. Consequence for the plan: a green baseline over a small set only detects large regressions in validity; sensitivity has to come from the graded metrics (judge scores, repetition, balance), which move continuously.
- The existing model client already uses `reasoningEffort: 'low'` (`plan-model.client.ts:75`); this research did not verify whether the chosen model accepts a temperature setting, so it does not assume the judge can be made deterministic that way.
- The review pass cannot currently be evaluated: "contribution not measurable because the draft is not stored" (`change.md:18`). A recording wrapper around `generate` (using the stage at call time, as the spec's fake does, `plan-pipeline.service.spec.ts:126-176`) captures draft and review outputs without a production change.

### 5. Existing tests and what they can and cannot say

- Pipeline: `plan-pipeline.service.spec.ts` (985 lines) with a scripted fake client and a table of bad plans (`:672-742`); client: `plan-model.client.spec.ts` (468 lines; describes partial progress, stream failures, diagnostics without leaking the prompt, `:172,255,392`); validator: `plan.validator.spec.ts` (382 lines); prompts: `plan.prompts.spec.ts` (168 lines); injection e2e: `backend/test/plan-generation-injection.e2e-spec.ts`.
- None of them call the real model. They answer "does the wiring behave when the model returns X", not "what does the model return". Inspected by describe-level read and grep; the bodies of `plan-model.client.spec.ts` and `plan.validator.spec.ts` were not read line by line.
- Test-run separation already exists: `vitest.config.ts` includes only `**/*.spec.ts` (`:11`) and `vitest.config.e2e.ts` only `**/*.e2e-spec.ts` (`:9`), so a file named `*.eval.ts` is picked up by neither `npm test` nor `npm run test:e2e`.

### 6. Eval tool choice

Chosen: **a plain Vitest runner in `backend/`, separate config, `*.eval.ts` files, no new dependency.** The judge is one `generateText` call with `Output.object({ schema })` through the installed `ai` 7.0.140 (`backend/package.json`; installed version read from `node_modules`).

Why it fits:
- It runs the real `PlanPipelineService` and `PlanModelClient` in-process, which the specs already do under Vitest with the NestJS decorators (`tsconfig.json:10-11` enables `experimentalDecorators` and `emitDecoratorMetadata`; Vitest has been importing these decorated classes in existing specs). A `tsx` script would also run, but the decorator handling under `tsx` was not verified here.
- Pass rate over N repeats is a few lines of plain code; no library needed for it.
- No new dependency, no account, no SaaS.

Alternatives, with what was verified (npm registry read on 2026-11-04 by me for the starred items, otherwise reported by a delegated agent from registry, GitHub and docs pages; its unverified items are listed in Open Questions):
- **evalite**: stable `0.19.0`, `latest`, with `@ai-sdk/provider` `^2.0.0` and package last modified 2026-02-20 *(verified)*; a `1.0.0-beta.16` beta exists *(verified dist-tag)*. Reported: stable released 2025-11-06, last push to the repo 2026-04-28, beta peer `ai ^6`. Best fit on paper (`trialCount`, local UI) but pinned to an older AI SDK generation than this repo's `ai` 7. Rejected.
- **vitest-evals**: `0.17.0`, peer `vitest >=4 <5`, `ai >=4 <7` with `ai` and `zod` marked optional *(verified)*. The `ai` range excludes v7 but is optional, so it would not block install; the reported gap is that it has no repeat or pass-rate feature beyond a CI action, which is the one thing this harness needs. Viable second choice if structured judge helpers are wanted later.
- **promptfoo**: most capable (`--repeat`, `llm-rubric` with threshold, reported) but reported at about 33 MB and roughly 76 dependencies, Node `>=22.22`, and its provider interface is prompt-string based, a poor fit for a structured pipeline input. Rejected on weight.
- **autoevals**: scorer-only library; duplicates the `generateText` judge and pulls the `openai` SDK; reported default endpoint is the Braintrust gateway. Rejected.
- **AI SDK facilities**: mock models and DevTools (a local trace viewer); not a scorer. Not an eval tool.

Biggest risk of the choice: the team owns the harness, so there is no run history and no diffing across prompt changes unless the runner writes one JSON file per run (model ids, prompt hash, per-input results). A second risk: the judge is the same vendor scoring its own output with no human calibration.

### 7. Judge design constraints (for the plan)

- Rubric: goals fit and experience fit only; a structured score with a short reason per plan.
- Calibration check that needs no extra generation: score each plan against its own form and against a different profile's form; the matched score should beat the mismatched one. This is a deliberate-break check for the judge itself (suggestion, not an existing practice in the repo).
- Do not hard-code a judge model id: the repo keeps model ids in env (`plan-generation.config.ts:43-45`) and the only id on record as working is `gpt-6-luna` (`first-plan-generation/plan.md:183`).
- Hand-check about ten judged outputs before trusting the number (reported recommendation).

### 8. Access constraint that shapes verification

Access to `.env*` is denied to the agent (`context/archive/2026-10-14-first-plan-generation/plan.md:119`; reproduced here: reads of `backend/.env` and `backend/.env.example` were blocked). Whether a real `OPENAI_API_KEY` is set is unknown to this research. A real-model eval therefore has to be run by the user in their own shell; the plan must not assume the agent can execute the eval or the "deliberate break" runs. Env loading is also open: `dotenv` is a dependency (`backend/package.json`), but how `main.ts` loads `.env` was not inspected.

## Code References

- `backend/src/plan-generation/plan.prompts.ts:10-11` - system prompt
- `backend/src/plan-generation/plan.prompts.ts:37-52` - rules incl. unchecked "balance muscle groups" and "fit to level" (`:51`)
- `backend/src/plan-generation/plan.prompts.ts:54-66` - trainee block, goals sanitised and delimited
- `backend/src/plan-generation/plan.prompts.ts:85-101` - review prompt embeds the draft
- `backend/src/plan-generation/plan-pipeline.service.ts:29,79-91,112-137,139-186` - two passes, 2 attempts each, validate, translate errors
- `backend/src/plan-generation/plan-pipeline.service.ts:54-60` - constructor seams for an eval harness
- `backend/src/plan-generation/plan-model.client.ts:70-76` - `streamText`, `Output.object`, `reasoningEffort: 'low'`
- `backend/src/plan-generation/plan-model.client.ts:113-118` - unparseable output becomes `invalid_output`
- `backend/src/plan-generation/plan.schema.ts:16` - slug is a closed enum
- `backend/src/plan-generation/plan.validator.ts:21-50,52-105,107-149` - reusable deterministic checks
- `backend/src/plan-generation/plan-generation.config.ts:40-47` - model ids from env
- `backend/src/plan-generation/plan-generation.controller.ts:72,83` - limiter is in the controller, not the pipeline
- `backend/src/plan-generation/plan-pipeline.service.spec.ts:126-176` - fake model client
- `backend/src/plan-generation/plan.prompts.spec.ts:38-168` - substring assertions on prompts
- `backend/prisma/seed-data/exercises.json` - 32 records; level counts 26 beginner, 5 intermediate, 1 expert
- `backend/vitest.config.ts:11`, `backend/vitest.config.e2e.ts:9` - include patterns that exclude `*.eval.ts`
- `context/foundation/prd.md:20,26,68,97-99` - what "personalised" means
- `context/foundation/test-plan.md:53,78,112,135,194-196` - risk row, guidance row, tool row, gate, cookbook stub

## Architecture Insights

- The pipeline is built for injection: constructor seams make a real-model, database-free run a wiring job, not a refactor. The harness belongs beside the specs as a consumer of existing classes, with no production-code change (a recording wrapper replaces the need to store drafts).
- Validity and personalisation are different measurement kinds: validity is binary and per attempt; personalisation is graded and noisy. Mixing them in one pass rate would let a bad tweak hide behind a retry.
- The eval is a cost-bearing, key-requiring, minutes-long activity; the test plan already puts it outside CI (`test-plan.md:112,135`), and the repo has no OpenAI secret in CI (reported from the workflows by the archive agent).

## Historical Context (from prior changes)

Each historical sentence scored separately.

- `context/archive/2026-10-14-first-plan-generation/change.md:14-19` - 2026-10-24 quality check. Supported (read directly): frequency ramp held in 3 of 3 profiles; 61 to 104 s and the token ranges; no retries and no rejections in six jobs; week repetition after the last frequency change; review contribution unmeasurable. Partial: "about 1 cent" depends on a price the note itself calls unverified for `gpt-6-luna`. Its decision, "week-to-week repetition is a prompt issue ... handle in a follow-up change", means a prompt change is already queued; no such change folder was found under `context/changes/`.
- `context/changes/testing-generation-outcome-integrity/research.md:144,191` - supported: "validating the draft suffices" is false in this code; the same file routes the quality check to Phase 4.
- `context/foundation/test-plan.md:53` - hot-spot evidence "39 file touches/30d": **supported as a count, misleading as evidence.** Verified: 72 file-touch lines in `backend/src/plan-generation` over 30 days across 12 commits, 33 on `*.spec.ts` and 39 on other files. `plan.prompts.ts` was touched once (commit `34aeeaf`, 2026-10-24); `plan.validator.ts` and `plan-model.client.ts` a few times (counts reported by the archive agent: 2 and 3). The touches are job store, controller and stream work. The Source cell's other evidence, "interview Q3 ('every tweak is guesswork')", is not stored anywhere in the repo, so it can be neither verified nor refuted.
- Interview Q2 ("burned before") is cited by Risk #2, not Risk #7; no recorded real-model off-catalog output exists in the repo (reported by the archive agent from the files it read).
- `context/foundation/test-plan.md:112` - "tool chosen in Phase 4 research": resolved in section 6 above.

## Related Research

- `context/changes/testing-generation-outcome-integrity/research.md` - Phase 1 research on the same pipeline (failure modes, validation gate).
- `context/archive/2026-11-04-testing-access-control-and-abuse-limits/` - Phase 3; its injection fixture and fake-model approach are the deterministic complement to this eval.

## Open Questions

1. **Key and env**: is `OPENAI_API_KEY` (and the two model ids) set in `backend/.env`, and how should the eval load it (`node --env-file`, `dotenv`, or Vitest `loadEnv`)? Unverified; agent access is denied.
2. **Judge model**: which model id, and should it differ from the draft model to reduce self-preference? No second provider is configured.
3. **`gpt-6-luna` pricing** is unverified; the cost ceiling above uses the `gpt-5.6-luna` list price.
4. **Input set and repeats**: the 2026-10-24 profiles (expert 5 to 5, beginner 2 to 4, intermediate 3 to 5) are a starting point; extreme ramps (1 to 7, 7 to 1), a flat low frequency, and goals text variants are candidates. The count (8 x 3 is only an illustration) is a plan decision.
5. **Baseline and threshold policy**: where run JSON is stored, which baseline a change is compared to, and what drop counts as a fail. Sensitivity of a near-100% validity baseline is low (section 4).
6. **Catalog source**: `exercises.json` versus the production database content; the eval uses the seed file unless told otherwise.
7. **Sensitivity is unproven**: no real-model run was made, so it is unknown whether a degraded prompt (for example the frequency-ramp rule removed) actually moves first-attempt validity or the judge score. The plan needs a deliberate-break step run by the user.
8. **Delegated-agent gaps** (tool comparison): npm publish dates for several packages, evalite `trialCount` aggregation, promptfoo account and repeat-stats behaviour, and the evalite and promptfoo claims that came from search snippets were not verified. They do not change the choice, which rests on "no new dependency is needed".
