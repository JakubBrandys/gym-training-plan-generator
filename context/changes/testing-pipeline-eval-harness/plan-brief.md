# Pipeline Eval Harness — Plan Brief

> Full plan: `context/changes/testing-pipeline-eval-harness/plan.md`
> Research: `context/changes/testing-pipeline-eval-harness/research.md`

## What & Why

Build an on-demand eval so a prompt or pipeline tweak that makes the real model emit more invalid or less personalised plans shows up before merge as a pass rate over a small fixed input set (test-plan Risk #7). Today nothing calls the real model in a test, and "every tweak is guesswork".

## Starting Point

The pipeline is injectable (`PlanPipelineService` takes the model client, job store and catalog by constructor) and `validateGeneratedPlan` already decides validity. The pipeline retries a rejected pass once, so a job can finish `completed` after a first-attempt failure. Only six real jobs have ever been inspected, all valid on attempt 1, yet weeks 6 to 8 repeated.

## Desired End State

From `backend/`, `npm run eval:generate` runs the real pipeline over 8 fixed inputs and `npm run eval:score` prints one report: first-attempt validity per stage as k/n, three deterministic quality metrics, judge scores for goals and experience fit with a calibration check, and deltas against a saved baseline with regressed metrics marked. Scoring re-runs on saved plans without regenerating. No production code changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tool | Plain Vitest runner, `*.eval.ts`, separate config, no new dependency | evalite is pinned to an older AI SDK generation, vitest-evals has no repeat feature, promptfoo is heavy. | Research |
| Headline metric | Per model call, first attempt of each pass only; draft and review separate | The pipeline's retry hides first-attempt failures that a job-level rate would miss. | Plan (user) |
| Regression policy | Report deltas versus a saved baseline, mark `regressed` past a margin, always exit 0 | About 24 trials make a hard threshold arbitrary, and the test plan keeps this out of CI. | Plan (user) |
| Judge | New required `EVAL_JUDGE_MODEL`; goals fit and experience fit, 1 to 5 each, pass at 4 or more | No model id is hard-coded and a graded score still moves when plans get worse. | Plan (user) |
| Input set | 8 inputs, full run 3 repeats (24 jobs), smoke tier first 3 inputs once, parallel, plans saved as JSON | Covers the known profiles, both ramp extremes and distinct goals; scoring re-runs for free. | Plan (user) |
| Quality metrics | Week repetition, distinct muscle groups per week, share above trainee level; reported, not in the pass rate | Measures the recorded defect and the prompt's two unchecked promises without inventing thresholds. | Plan (user) |
| Location | New `backend/eval/`, lint extended, `/eval/runs` gitignored | `src/` is compiled into `dist` and the Dockerfile copies only `src`. | Plan |
| Catalog | `prisma/seed-data/exercises.json`, no database | The eval needs no DB and the seed file is the catalog source. | Plan |
| Margins | Fixed constants, e.g. validity drop over 0.05, judge mean drop over 0.3; revisit after the first baseline | Chosen above the sampling noise the research derived, not fitted to data. | Plan |

## Scope

**In scope:** `backend/eval/` inputs, metrics, recording wrapper, generate and score runners, judge, calibration, report and baseline diff; wiring (vitest eval config, npm scripts, lint, gitignore); two deliberate-break checks run by the user; the §6.5 cookbook.

**Out of scope:** CI gating or non-zero exit on regression (CI gates are not scheduled), any production-code change, edits to test-plan §1 or §2 (backport unapproved), judging drafts or body stats, a database-backed catalog, snapshotting model text, a second judge provider.

## Architecture / Approach

Pure scoring code and its `*.spec.ts` live in `backend/eval/` and run under `npm test`. A per-job recording wrapper around `PlanModelClient.generate` captures each call's stage, attempt, validity and error, then the real `PlanPipelineService` runs over the seed catalog in a bounded parallel pool and saves `generated.json`. A separate score step computes metrics, calls the judge, writes `report.json` and diffs it against `eval/baseline/report.json`. Real-model entry points are `*.eval.ts` under their own Vitest config, so neither `npm test` nor `npm run test:e2e` runs them.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scoring core | Inputs, metrics, report and diff, wiring; unit specs, no key | Metrics that pass their own fixtures but miss the real defect |
| 2. Generation runner | Recording wrapper, parallel real runs, saved plans, deterministic score; you run a smoke tier | Wrapper alters what the pipeline sees |
| 3. Judge | Goals and experience fit with a calibration check, scoring saved plans | Judge that does not discriminate, same vendor scoring itself |
| 4. Real run and breaks | Full run, baseline, two deliberate breaks, §6.5 cookbook | A break that no metric registers, so sensitivity stays unproven |

**Prerequisites:** your `OPENAI_API_KEY`, `PLAN_DRAFT_MODEL`, `PLAN_REVIEW_MODEL` in `backend/.env` and a chosen `EVAL_JUDGE_MODEL`; the agent cannot read `.env*`, so every real-model step is yours.
**Estimated effort:** about 4 sessions across 4 phases, plus a full run of about 6 to 10 minutes at concurrency 4 and about $0.23 at an unverified price.

## Open Risks & Assumptions

- Sensitivity is unproven: no real-model run has shown that a worse prompt moves any metric; Phase 4's breaks decide this, and a miss is recorded as a finding.
- `gpt-6-luna` pricing is unverified; the cost figure uses the `gpt-5.6-luna` list price.
- A clean 24-run set only bounds a validity failure rate near 12.5%, so the graded metrics carry most of the sensitivity.
- Level fit is weak by construction: the catalog has 26 beginner, 5 intermediate and 1 expert exercise.
- Provider rate limits at concurrency 4 are unchecked.
- Client constants (reasoning effort, token limits) are not part of the prompt hash; the report records the git commit instead.

## Success Criteria (Summary)

- A deliberate prompt break (frequency rule removed, then goals removed) produces a report with the matching metric marked `regressed`, and the restored prompt reads green.
- The full run, its cost and its judge calibration are recorded, and a baseline holding only numbers is saved.
- The §6.5 cookbook tells the next person how to run and read the eval.
