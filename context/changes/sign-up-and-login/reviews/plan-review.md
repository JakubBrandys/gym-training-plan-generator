<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Sign Up and Log In

- **Plan**: context/changes/sign-up-and-login/plan.md
- **Mode**: Deep
- **Date**: 2026-10-10
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
10/10 paths ✓, 5/5 symbols ✓, brief↔plan ✓, Progress↔Phase ✓. Verified by sub-agent: Prisma 7 `Prisma.PrismaClientKnownRequestError` import path, CORS reflects `Authorization` (cors 2.8.6), alpine runtime has `sh`, jose works under the Vitest node env, `migrate diff --from-config-datasource` against the live DB is empty with no DROPs.

## Findings

### F1 — Supabase outage or pause signs every user out

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 (verifier), Phase 3 §4 (Home)
- **Detail**: The verifier mapped any failure to 401 and Home signs out on 401, so a JWKS fetch failure (Supabase paused, network blip, jose timeout) would log out every signed-in user.
- **Fix**: Map key-fetch failures to 503, keep 401 for invalid tokens; Home shows a generic error on 5xx without signing out; add a guard spec case.
  - Strength: A provider hiccup becomes a retryable error instead of a mass logout.
  - Tradeoff: One verifier branch and one test.
  - Confidence: HIGH — jose throws distinct error classes for token vs fetch failures.
  - Blind spot: Exact DNS-failure error class not enumerated; handled by allowlisting token-level errors for 401.
- **Decision**: FIXED — 401 allowlist of token-level jose errors, everything else 503; Home keeps the session on 5xx; spec case added.

### F2 — The "blocked" message unmounts before anyone sees it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 §4, criteria 3.9 / 4.6
- **Detail**: Signing out on 403 makes RequireAuth redirect immediately, so the message on Home is never visible.
- **Fix**: On 403 sign out and navigate to /sign-in with state { blocked: true }; sign-in shows the banner; update 3.9 and 4.6.
- **Decision**: FIXED — plan, brief, end state and criteria 3.9 / 4.6 updated.

### F3 — Phase 4 automated checks can only pass after the merge

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, criteria 4.2 / 4.3
- **Detail**: /10x-implement runs automated checks before committing, but these curl the deployed app.
- **Fix**: Move 4.2 and 4.3 to Manual (run after merge).
- **Decision**: FIXED — moved to Manual; Phase 4 Progress renumbered (4.1 automated, 4.2–4.7 manual).

### F4 — .env.example files are blocked by permission rules

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §6, Phase 3 §1
- **Detail**: A deny rule blocks agent access to `.env*` files, so the implementer cannot edit the two `.env.example` files.
- **Fix**: Mark both edits as done by hand by the user.
- **Decision**: FIXED — contracts note hand edits; manual criteria 2.8 and 3.11 added.
