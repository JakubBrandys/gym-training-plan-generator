<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Plan review with images

- **Plan**: context/changes/plan-review-with-images/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Deviations from phase contracts not recorded in plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/plan-review-with-images/plan.md (Phase 1 §2, Phase 3 §2–3)
- **Detail**: Three small adaptations are not noted in the plan, which the lesson "Amend plan.md when implementation deviates from its contract" requires. Phase 1: `toPlanResult` takes `readonly Pick<Exercise, 'slug' | 'name' | 'imageKey'>[]` and drops the `CatalogExercise` import. Phase 3: the exercise list lost its bullets and each row gained a `div.plan-exercise-text` wrapper (plan CSS contract said only to lay out image beside text), and `.plan-exercise-image` has a literal `background: #fff`.
- **Fix**: Add dated "Deviation" notes under Phase 1 and Phase 3 Changes Required in plan.md.
- **Decision**: FIXED — Deviation notes added to plan.md (Phase 1 §2, Phase 3 §2 and §3)

### F2 — Hard-coded `#fff` background on the exercise image

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/index.css:173
- **Detail**: A colour literal is used instead of a CSS variable. The file already has a literal at line 91 and `--bg` turns dark, so no existing token fits. The user checked the dark theme visually (manual 3.4).
- **Fix**: Leave as is, or introduce an image-backdrop variable if more themed assets arrive.
- **Decision**: SKIPPED

### F3 — Catalog lookup miss in `toPlanResult` is untested

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: backend/src/plan-generation/plan-pipeline.service.ts:206
- **Detail**: The `imageKey: entry?.imageKey ?? null` fallback has no spec. The plan states a miss cannot happen because slugs are enum-constrained by the same catalog, so the branch is defensive only.
- **Fix**: No action needed; optionally add a spec if the fallback ever becomes reachable.
- **Decision**: SKIPPED
