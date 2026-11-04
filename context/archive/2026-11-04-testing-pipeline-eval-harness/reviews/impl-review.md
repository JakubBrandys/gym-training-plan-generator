<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pipeline Eval Harness

- **Plan**: context/changes/testing-pipeline-eval-harness/plan.md
- **Scope**: Full plan (Phases 1 to 4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run during this review: `npx vitest run eval/` (87 passed), `npm test` (696 passed), `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npm run build` with no eval files in `dist`, both fail-fast commands naming the missing variable, the cookbook stub gone, 0 `"slug"` hits in `eval/baseline/report.json`. All pass. Evidence: two read-only review agents (plan drift; safety, quality and pattern compliance) plus the author's runs.

## Findings

### F1 — save-baseline can overwrite the full judged baseline with a smoke or judge-less report

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/eval/save-baseline.ts:6-11
- **Detail**: It copies a run's `report.json` over `eval/baseline/report.json` unconditionally. A smoke-tier report or one made with `EVAL_SKIP_JUDGE=1` silently replaces the full judged baseline, and a missing `report.json` surfaces as a raw ENOENT. The old baseline is recoverable only from git.
- **Fix**: Read the report's `meta.tier` and `meta.judgeModel`, refuse (or require an explicit flag) unless it is a full, judged run, and print a clear message when `report.json` is missing.
  - Strength: Protects the one paid artefact the whole comparison depends on.
  - Tradeoff: A deliberate smoke baseline now needs an override.
  - Confidence: HIGH — the baseline's meta already carries both fields.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix now): save-baseline refuses a smoke, judge-less or incomplete report unless --force, and names a missing report.json

### F2 — generated.json is written only after all jobs finish

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/eval/generate.eval.ts:29-47
- **Detail**: A crash, the 30-minute Vitest timeout or Ctrl-C discards every paid model call of the run. This already happened once in this session: the first full run was cut off when the previous session ended and its completed jobs were lost.
- **Fix**: Write each job to disk as it finishes (the `onJobDone` hook already exists), for example one file per job in the run directory, and have `score.eval.ts` read them.
  - Strength: A cut-off run keeps what it paid for and can be scored partially.
  - Tradeoff: A new on-disk format (one file per job) and a small change in the scorer.
  - Confidence: HIGH — the hook is already there and the failure was observed.
  - Blind spot: Whether a partial run should be scorable or only resumable.
- **Decision**: FIXED (Fix now): meta.json and one jobs/<input>-<repeat>.json per finished job; score rebuilds a cut-off run

### F3 — judge reasons are never persisted, so manual steps 3.7 and 4.9 could not be done from harness output

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: backend/eval/score.eval.ts (writes only report.json); plan.md Progress 3.7 and 4.9
- **Detail**: `JudgedJob` holds the reasons but only sums reach `report.json`, and `formatReport` prints no reasons. Step 3.7 ("read the judge reasons for the 3 smoke plans") therefore could not be satisfied from `eval:score` output. The user confirmed it anyway, and it is unknown whether they saw the reasons by other means. Step 4.9 was covered by a throwaway script run during this session (10 plans, reasons plausible), which was then deleted. A hand check of the judge is part of the plan's own trust model.
- **Fix**: Write `judged.json` (scores and reasons per job) next to `report.json` in `score.eval.ts`; keep it in the gitignored run directory.
  - Strength: Makes the judge checkable and the step repeatable without a new model call.
  - Tradeoff: One more file in each run directory containing model-written text (gitignored).
  - Confidence: HIGH — the data is already computed in memory.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix now): score writes judged.json (scores and reasons) beside report.json

### F4 — readBaseline hides a corrupt or old-schema baseline

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/eval/score.eval.ts:24-30
- **Detail**: A bare `catch` returns null for any error, so a truncated baseline silently reads as "No baseline found, no deltas". A valid JSON file with an older shape (no `perInput`) instead throws a TypeError inside `diffReports`.
- **Fix**: Return null only on ENOENT, rethrow parse errors, and check that `perInput` and `metrics` exist before diffing.
- **Decision**: FIXED (Fix now): readBaseline returns null only on ENOENT, throws on corrupt JSON or an old shape

### F5 — Provider outages count as failed calls in the headline validity

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/eval/eval-record.ts and eval-report.ts addJob
- **Detail**: A first-attempt call that throws `unavailable` is recorded `ok: false` and lowers `callValidity` and raises `jobFailureRate`, exactly like a bad plan. Break B showed this: 4 of 24 jobs hit provider timeouts of 333 to 354 seconds, which made `callValidity` and `jobFailureRate` flag as regressed for a reason unrelated to the prompt. Recorded in test-plan 6.6, not handled in code.
- **Fix A ⭐ Recommended**: Exclude calls with error code `unavailable` from the validity denominator and report them as their own count.
  - Strength: A red `callValidity` then means the model's output was invalid, not that the network failed.
  - Tradeoff: The headline can look better than the user experienced; the outage count must be shown beside it.
  - Confidence: HIGH — Break B is direct evidence.
  - Blind spot: Whether a very high outage count should invalidate the run.
- **Fix B**: Keep the numbers and print a warning line when any job ended `provider_unavailable`.
  - Strength: No change to the metric definition or baseline comparability.
  - Tradeoff: The red flags still need a human to read the warning.
  - Confidence: MEDIUM — depends on people actually reading it.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A): outage calls and provider_unavailable jobs excluded from callValidity and jobFailureRate and reported as outages; baseline regenerated

### F6 — A runner exception is counted like a model failure and its name is lost

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/eval/eval-runner.ts:44-48
- **Detail**: The bare `catch {}` records `runner_error` and drops the error. Only unexpected errors reach it (`pipeline.run` already catches failures), but a harness bug would be counted in `jobFailureRate` with no trace.
- **Fix**: Log the error name (never the message) when `runnerFailed` is set.
- **Decision**: FIXED (Fix now): the runner logs the error name when it crashes outside the pipeline

### F7 — diffReports does not check that the two runs are comparable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/eval/eval-report.ts:395-430
- **Detail**: It compares only shared input ids. A smoke run (1 repeat on 3 inputs) against the full baseline (3 repeats) pools counts of different sizes against the same fixed margins, and a different draft, review or judge model is not flagged.
- **Fix**: Print a warning line when `meta.tier`, `draftModel`, `reviewModel` or `judgeModel` differ between the report and the baseline.
- **Decision**: FIXED (Fix now): the diff warns when tier or a model differs from the baseline and says whether the prompt hash changed

### F8 — The prompt hash does not cover the retry prompt or every review prompt

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/eval/eval-report.ts:315-324
- **Detail**: `computePromptHash` hashes the system prompt, each draft prompt and the review prompt over an empty draft for the first input only. An edit to `buildRetryPrompt` does not change the hash, so the report would not show that the prompt changed.
- **Fix**: Add a retry prompt built over a fixed issue list to the hashed material.
- **Decision**: FIXED (Fix now): the retry prompt is part of the prompt hash; baseline regenerated

### F9 — plan.md still says the test-plan backport is unapproved and that only 6.5 is edited

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: plan.md "What We're NOT Doing" and Phase 4 Changes Required
- **Detail**: The user later approved the backport and asked to drop Phase 5, so commits 0253b3e and f4d3ca2 edit more of `test-plan.md` than 6.5 (the Phase 5 row removal, section 5 wording, the Phase 4 status flip, the Risk #7 Source and guidance, the Stack row, 6.6). That was authorised, but the plan text now reads as if it were out of scope.
- **Fix**: Add a dated Deviation note under Phase 4 recording the approved extra edits (lessons: amend plan.md when implementation deviates).
- **Decision**: FIXED (Fix now): dated Deviation note added under Phase 4 in plan.md

## Also noted (not findings)

- `score.eval.ts` and `generate.eval.ts` assert almost nothing by design (always exit 0), so those two "tests" cannot fail on a bad result.
- Unchecked `JSON.parse(...) as ...` casts in `score.eval.ts` and `eval-catalog.ts`; acceptable for local tooling.
- `mapPool` stops on the first rejected worker while other lanes keep issuing paid calls; unreachable today because the workers do not throw.
- `eval-judge.ts` duplicates `readRequired` from `plan-generation.config.ts` (it is not exported there).
- Pattern checks were clean: no comments, only `const` arrow functions, ESM `.js` suffixes, Prettier, `no-floating-promises`.
- Not verifiable here: the real judge's behaviour with `z.int()` at runtime beyond what the real runs showed, and anything in CI.
