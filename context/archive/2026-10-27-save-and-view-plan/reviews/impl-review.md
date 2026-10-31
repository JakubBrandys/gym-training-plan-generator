<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Save and view plan

- **Plan**: context/changes/save-and-view-plan/plan.md
- **Scope**: Full plan (phases 1-4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No request timeout on the new frontend fetches

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/saved-plans.ts:30-93, frontend/src/pages/PlanGenerationPage.tsx (SavePlanControl.handleSave)
- **Detail**: fetchPlanGeneration guards against hung requests with AbortSignal.timeout(10s) (plan-generation.ts:113); saveGeneratedPlan, listSavedPlans and fetchSavedPlan have none (0 AbortSignal uses in saved-plans.ts, verified). If a request stalls without erroring, the Save button stays on "Saving…" and disabled so the user cannot retry, and the list and detail pages stay on "Loading…" forever.
- **Fix**: Pass signal: AbortSignal.timeout(...) to the three apiFetch calls; the existing catch already maps an abort to { kind: 'error' }. Use a longer timeout for save (the backend is idempotent, so a retry after an abort is safe).
  - Strength: Matches the existing snapshot-fetch pattern and turns a stuck UI into a retryable error.
  - Tradeoff: A slow-but-successful save past the timeout shows an error although the plan was saved; a retry returns the same plan, so no duplicate.
  - Confidence: HIGH — same pattern already in the codebase.
  - Blind spot: Right timeout values are a guess; no latency data.
- **Decision**: FIXED — timeouts added to the three calls (save 30s, reads 15s) with specs; verified by break-check (removing either signal turns a test red)

### F2 — A NUL character in the goals text makes every save fail with a 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/plan-generation/plan-form.schema.ts:15, backend/src/saved-plans/saved-plans.service.ts:72-80
- **Detail**: goals is z.string().trim().min(1).max(500), which accepts "\u0000". Postgres JSONB rejects \u0000, so the generation job runs but SavedPlan.create throws a non-P2002 error: HTTP 500 on every save attempt, with no recovery for that plan. Reported by the safety reviewer from known Postgres behaviour; not reproduced against the database.
- **Fix A ⭐ Recommended**: Reject NUL in planFormSchema goals (refine) so the request fails with 400 before a model call is spent.
  - Strength: Fails early at the boundary, costs no AI call, and keeps stored goals identical to what was generated.
  - Tradeoff: Changes the validation of the existing generation endpoint (small schema spec addition).
  - Confidence: HIGH — one-line refine plus a spec case.
  - Blind spot: Other control characters Postgres/JSON may dislike were not examined.
- **Fix B**: Strip NUL from form and plan strings inside SavedPlansService before writing.
  - Strength: Leaves the generation endpoint untouched.
  - Tradeoff: Saved goals can silently differ from what produced the plan; plan text from the model is not covered unless also stripped.
  - Confidence: MEDIUM — deep-stripping the plan JSON is more code than it looks.
  - Blind spot: Whether model output can contain NUL was not checked.
- **Decision**: FIXED via Fix A — NUL rejected in planFormSchema goals with a schema spec; verified by break-check

### F3 — No test for the stale-id/cancelled paths or for the real router's route order

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/SavedPlanPage.spec.tsx (route-order test near the end), frontend/src/pages/SavedPlansPage.spec.tsx
- **Detail**: SavedPlanPage relies on key={id} plus a cancelled flag; no test navigates /plans/a to /plans/b or unmounts before the fetch resolves, so showing plan A under route B would pass the suite. The "static /plans/new wins" test uses a test-local Routes, not router.tsx, so it would not catch /plans/:id being ordered ahead of /plans/new in the real router.
- **Fix**: Add an id-change test with a deferred first promise, and one test that renders createMemoryRouter(router.routes) at /plans/new.
- **Decision**: FIXED — id-change, previous-plan-not-shown and unmount tests added, plus a real-router path test. Note: the router test cannot detect declaration order (react-router ranks static segments first), only a missing or changed /plans/new route; removing `cancelled` alone is an equivalent mutation while key={id} remounts, removing key or both turns tests red

### F4 — Stored form and plan are cast, not validated, and carry no schema version

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: backend/src/saved-plans/saved-plans.service.ts:38,43
- **Detail**: Rows are written from validated data, so this is safe today. If planFormSchema or PlanResult later changes (new experience level, renamed field), old rows are served unchanged: EXPERIENCE_LABELS[form.experience] would render "Experience: undefined" and PlanView could crash on an old shape. This bears on the guardrail "a saved plan is never corrupted".
- **Fix**: Record a project rule that changes to PlanForm and PlanResult must stay backward compatible with saved rows (additive only, or add a version column with the first breaking change).
  - Strength: Costs nothing now and puts the constraint in front of every future plan and review.
  - Tradeoff: Only a rule; nothing enforces it until the shape actually changes.
  - Confidence: MEDIUM — depends on the shape changing at all.
  - Blind spot: No runtime guard on read was designed or costed.
- **Decision**: ACCEPTED-AS-RULE: Keep saved-plan data backward compatible with its stored shape — lesson recorded in context/foundation/lessons.md; no code change

### F5 — Unchecked response shape on the ok path, and a pointless alias

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/lib/saved-plans.ts:44-46, frontend/src/pages/PlanGenerationPage.tsx:17
- **Detail**: saveGeneratedPlan and fetchSavedPlan cast response.json() without a shape check (startPlanGeneration checks typeof jobId; listSavedPlans checks Array.isArray). A malformed 2xx would navigate to /plans/undefined. SAVE_ERROR = GENERIC_PLAN_ERROR is an alias with no added meaning.
- **Fix**: Return { kind: 'error' } unless typeof plan.id === 'string' in saveGeneratedPlan, and use GENERIC_PLAN_ERROR directly.
- **Decision**: FIXED — id shape check in saveGeneratedPlan and fetchSavedPlan with specs, SAVE_ERROR alias removed; verified by break-check

### F6 — Untested failure branches and no log line on save failures

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/saved-plans/saved-plans.service.ts:82-90
- **Detail**: No test covers P2002 followed by a re-read that returns null (the rethrow branch), or a non-P2002 Prisma failure surfacing as a 500 with no row written. A failed save leaves no log line, which makes a production failure like F2 hard to diagnose. The double-click test relies on the disabled attribute after a flushed update, not on a rapid double-fire; the idempotent backend covers the outcome.
- **Fix**: Add the two service spec cases and a Logger.warn (error name only, no payload) in the non-P2002 branch.
- **Decision**: FIXED — Logger.warn (error name only) plus P2002-then-null and non-P2002 specs; verified by break-check
