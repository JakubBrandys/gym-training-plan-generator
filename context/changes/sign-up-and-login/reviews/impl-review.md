<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sign Up and Log In

- **Plan**: context/changes/sign-up-and-login/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Plan adherence: every planned change MATCH; approved deviations (createBrowserRouter + RouterProvider, signOutReason in auth context, arrow functions, auth-user.ts / auth-context.ts / useAuth.ts splits, 503 logging) are consistent. Success criteria re-run 2026-10-11: prisma validate, migration SQL greps, no DB drift, 19 auth specs / 216 tests, backend + frontend lint and build, no react-router-dom, README lists SUPABASE_URL — all pass; all 33 Progress rows checked, manual rows confirmed by the user (production verified after PR #10).

## Findings

### F1 — Backend config values are not validated at startup

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/auth/jwks.provider.ts (getSupabaseUrl), backend/src/main.ts:6-8
- **Detail**: getSupabaseUrl only checks non-empty. Production broke twice: `//https://…` crashed boot with a bare "Invalid URL", and the full JWKS URL passed the check, so every gated request returned 503 (and the issuer was wrong). FRONTEND_URL is split on commas without trimming, so "a, b" silently drops the second CORS origin.
- **Fix**: Parse SUPABASE_URL with `new URL`, require https (http only for localhost), path `/`, no query/hash, return `origin`, and throw a message naming the expected shape and the received value; trim/filter FRONTEND_URL entries; add a spec for empty, `//https://…`, full-JWKS-URL and trailing-slash inputs.
  - Strength: Both production incidents would have failed at boot with a self-explanatory error, before Fly switched traffic.
  - Tradeoff: ~20 lines plus a spec in a slice that's already merged — lands as a small fix commit/change.
  - Confidence: HIGH — failure modes reproduced from the Fly logs.
  - Blind spot: A future local Supabase stack would use http://127.0.0.1:54321 — the localhost exception must allow it.
- **Decision**: FIXED — strict SUPABASE_URL parsing (https or local http, origin only, clear error with received value), FRONTEND_URL entries trimmed/filtered, jwks.provider.spec.ts (11 cases; break-check passed)

### F2 — Frontend env values are not validated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts:15, frontend/src/lib/supabase.ts:3-6
- **Detail**: A missing VITE_API_URL requests "undefined/me" on the Worker origin, which the SPA fallback answers with index.html (200), so Home shows only "Something went wrong"; a trailing slash yields "//me"; a missing VITE_SUPABASE_* value throws at import (blank page).
- **Fix**: Add src/lib/env.ts that validates the three VITE_* values once (new URL, strip trailing slash, explicit error naming the variable) and use it from api.ts and supabase.ts.
- **Decision**: SKIPPED — VITE_* values are set correctly locally and in GitHub secrets (verified in the deployed bundle); preventive only

### F3 — Leftover template asset and CI credentials in env examples

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: frontend/public/icons.svg, backend/.env.example, frontend/.env.example
- **Detail**: Phase 3 said to delete unused template assets; frontend/public/icons.svg is unreferenced since App.tsx was deleted. The env examples also gained CI/deploy credentials as placeholders (FLY_API_TOKEN in backend, CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in frontend) that the apps never read — placeholders only, no secrets exposed.
- **Fix**: Delete frontend/public/icons.svg; remove the CI-only lines from both .env.example files (hand edit — agent access to .env* is denied).
- **Decision**: FIXED — frontend/public/icons.svg deleted; user removes FLY_API_TOKEN (backend) and CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (frontend) from .env.example by hand (CI credentials live in GitHub secrets)

### F4 — Auth forms can get stuck or show no error

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/SignInPage.tsx:33-43, frontend/src/pages/SignUpPage.tsx:23-37
- **Detail**: handleSubmit has no try/finally: anything that throws (bad env URL, auth lock timeout) leaves the button disabled and an unhandled rejection. Raw Supabase messages are shown; a network error can carry an empty message, so `{error && …}` shows nothing. minLength 6 duplicates the dashboard password policy.
- **Fix**: Wrap in try/catch/finally (generic error, always reset pending); map known error codes (invalid_credentials, user_already_exists, weak_password, over_request_rate_limit) to fixed copy with a generic fallback.
- **Decision**: FIXED — try/catch/finally in both submit handlers; new frontend/src/auth/auth-errors.ts maps invalid_credentials, user_already_exists/email_exists, weak_password, over_request_rate_limit and network failures to fixed copy (Supabase message or generic fallback otherwise); verified in browser with mocked responses. minLength 6 left as is

### F5 — Unvalidated `from` redirect target

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/SignInPage.tsx:20
- **Detail**: location.state.from.pathname is used unchecked. Not exploitable today (history.state is same-origin, navigation uses replace), but a future push or another writer of state.from would make it an open redirect. Only pathname is kept, so query/hash are dropped.
- **Fix**: Accept `from` only if it starts with "/" and not "//" or "/\", else "/"; optionally keep search + hash.
- **Decision**: FIXED — safeReturnPath in SignInPage accepts only same-origin paths (starts with "/", not "//" or "/\\"), else "/"; search + hash now preserved (verified: /?x=1#h survives sign-in)

### F6 — Redundant getSession() without catch in AuthProvider

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/auth/AuthProvider.tsx:14-18
- **Detail**: onAuthStateChange already emits INITIAL_SESSION; the extra getSession().then has no catch and can in theory overwrite a newer session that arrived first.
- **Fix**: Drop the getSession() call and rely on INITIAL_SESSION (Supabase's recommended pattern).
- **Decision**: FIXED — getSession() seed removed; INITIAL_SESSION from onAuthStateChange sets session + loading (verified: signed-out visit reaches /sign-in, reload keeps the session)

### F7 — Plan not amended for approved deviations

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/sign-up-and-login/plan.md (Phase 3 §4)
- **Detail**: The router switch and the blocked-reason move are recorded only in commit messages; plan.md still describes BrowserRouter/App.tsx and router state. Same pattern as the exercise-catalog review (image source).
- **Fix**: Accept (commits are the record), or record a lesson: amend plan.md when a phase deviates from its contract.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Amend plan.md when implementation deviates from its contract — two dated Deviation notes added under Phase 3 §4
