<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin Block User

- **Plan**: context/changes/admin-block-user/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence notes:
- Plan drift review: every planned item MATCH; no DRIFT, MISSING, or "What We're NOT Doing" violation. All 19 changed code files are in the plan.
- Automated criteria re-run on commit de71501: backend lint, build, scoped unit (28), scoped e2e (18), full unit (558), full e2e (59); frontend lint (0 warnings), build, scoped specs (61), full suite (180). All pass.
- Manual rows 1.7–1.10 and 2.5–2.9 were ticked after the user confirmed them ("manual confirmed"). Row 1.8 asked to record Supabase's observed sign-in error code and message; that value was not recorded anywhere in the change folder.
- CI (`.github/workflows/`) only deploys; it runs no tests, so the new boot-time `SUPABASE_SECRET_KEY` does not break CI, but `flyctl deploy` needs the Fly secret set.
- The review agent reported `backend/.env.example` already contains `SUPABASE_SECRET_KEY`; the main session could not read env files and `deploy-plan.md:30` says otherwise. Unverified; the user confirmed row 1.7.

## Findings

### F1 — No timeout on the Supabase ban call

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/supabase-admin/supabase-admin.client.ts:12-26
- **Detail**: `createClient` and `updateUserById` get no `fetch` override or abort signal. A stalled Supabase request leaves the HTTP request hanging; the frontend gives up at 15 s (`WRITE_REQUEST_TIMEOUT_MS`) while the server request keeps running, and a hung call never reaches the 502 path. The database write has already happened, so this is not a consistency risk, only a reliability gap.
- **Fix**: Pass `global: { fetch }` to `createClient` with a wrapper that adds `AbortSignal.timeout(~10 s)`, so a timeout surfaces as the existing 502 path, and add a test that asserts it.
  - Strength: Reuses the existing error path and keeps the service unchanged; the 10 s bound sits under the frontend's 15 s.
  - Tradeoff: A fetch wrapper is the only way to bound the SDK call, and the 10 s value is a guess about Supabase latency.
  - Confidence: MED — the supabase-js `global.fetch` option is documented, but its exact typing in ^2.118 was not checked.
  - Blind spot: How the SDK surfaces an aborted request (error shape) was not verified.
- **Decision**: FIXED (Fix now) — 10 s abort wrapper on the SDK fetch (`BAN_REQUEST_TIMEOUT_MS`), so a stalled ban surfaces as the 502 path; client tests added.

### F2 — Frontend does not resync the list after a timeout or network error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/AdminUsersPage.tsx (confirmBlock, final `setNotice(GENERIC_PLAN_ERROR)` fallthrough); frontend/src/lib/admin-users.ts:63-83
- **Detail**: The client aborts at 15 s or fetch throws, and returns `{ kind: 'error' }`. The page shows a generic notice and does not call `refreshUsers()`. The backend writes before it bans, so the row may already be blocked, yet the UI keeps showing `Active` and `Block`. `ban-failed` and `not-found` both refresh; `error` does not.
- **Fix**: Also call `refreshUsers()` in the `error` branch (it already keeps the list if the refresh fails), and add a page test for it.
- **Decision**: FIXED (Fix now) — an `error` result now refreshes the list in place; page test added and the existing error test's list-call expectation updated.

### F3 — Deviations from the plan are not recorded in plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/admin-block-user/plan.md (Phase 1 and Phase 2 "Changes Required"); context/foundation/lessons.md ("Amend plan.md when implementation deviates")
- **Detail**: The lesson requires a dated "Deviation" note under the phase's Changes Required, in the same commit as the deviation. The adaptations were reported in chat but never written into the plan. Phase 1: package resolved to `^2.118.0` (frontend `^2.117.3`, both major 2); README e2e sentence also names `SUPABASE_URL`. Phase 2: extra nested `.admin-users-actions button { margin-top: 0 }` rule beyond the one container class; block-result messages sit in one page-level alert above the list; other rows' buttons are disabled while one is pending; an in-place refresh that returns `error` keeps the current list; the id goes through `encodeURIComponent`; a `WRITE_REQUEST_TIMEOUT_MS = 15_000` constant was added. All are benign and within intent.
- **Fix**: Add a dated `Deviation (2026-10-31)` note under each phase's Changes Required listing the items above, and commit it (a docs commit is acceptable since the original commits are already pushed).
- **Decision**: FIXED (Fix now) — dated Deviation notes added to plan.md under both phases' Changes Required, including the review fixes.

### F4 — Secret-leak config test is vacuous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/supabase-admin/supabase-admin.config.spec.ts:55-61
- **Detail**: "never puts the secret key in an error message" stubs an invalid `SUPABASE_URL`, but `readSupabaseAdminConfig()` evaluates `getSupabaseUrl()` first, so it throws before the key is read. `not.toThrow(/regex/)` also passes vacuously. Verified in the config source: the object literal reads `url` before `secretKey`.
- **Fix**: Keep the key set, trigger the URL error, and assert on the thrown error's message with `expect.not.stringContaining(secret)` (and keep a case where the key is blank).
- **Decision**: FIXED (Fix now) — test rewritten with a distinctive secret set, asserting the thrown message does not contain it.

### F5 — Profile exists but its Supabase auth user is gone: permanent 502

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/supabase-admin/supabase-admin.client.ts:21-26; backend/src/admin-users/admin-users.service.ts:56-62
- **Detail**: An SDK `user_not_found` error is rethrown and mapped to 502 with `blockedAt` kept. The UI then tells the admin to "Re-apply block", which can never succeed. The user cannot sign in anyway, so this is operator confusion only. No test covers this case. The app has no user-deletion flow today, so it is rare.
- **Fix A ⭐ Recommended**: Treat a Supabase "user not found" error in `banUser` as success
  - Strength: The block is effectively complete (no auth user means no sign-in), so the admin gets 200 and no dead-end retry prompt.
  - Tradeoff: Hides auth/profile drift; relies on matching the SDK's error code.
  - Confidence: MED — the Auth server returns a 404 `user_not_found` for a missing user (docs), but supabase-js's surfaced `code` field was not verified.
  - Blind spot: Exact error shape in ^2.118 and any other not-found paths.
- **Fix B**: Leave behaviour as is and add a README note
  - Strength: No change to code paths or tests.
  - Tradeoff: The UI keeps offering a retry that cannot work; relies on the operator reading the README.
  - Confidence: HIGH — nothing changes.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — Supabase `user_not_found` (matched by `error.code`, verified in @supabase/auth-js 2.118.0 `ErrorCode`) counts as a completed ban; client tests added.

### F6 — Test gaps around the 502 path and failures

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/admin-users/admin-users.service.spec.ts; backend/test/admin-users.e2e-spec.ts (502 test); backend/src/supabase-admin/supabase-admin.client.spec.ts
- **Detail**: The e2e 502 test asserts only the status, not the body (`{statusCode: 502, message: 'Bad Gateway'}`) or that neither body nor log contains the secret or the raw SDK message. Missing unit cases: a rejected database `update` propagates and does not call `banUser`; a non-`Error` rejection logs `unknown error`; a Supabase not-found error (depends on F5).
- **Fix**: Add the missing assertions and cases to the existing specs.
- **Decision**: FIXED (Fix now) — 502 body and log assertions, DB-write-rejection and non-Error rejection cases added.

### F7 — Real AuthGuard is not in the e2e chain for the new route

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/test/admin-users.e2e-spec.ts (`HeaderUserGuard` as `APP_GUARD`)
- **Detail**: `AdminGuard` is real, so the member-404 and 401 assertions are meaningful. The real `AuthGuard` (blocked profile gives 403) is not exercised for this route; it is covered only by `auth.guard.spec.ts` generally. This repeats the accepted S-06 finding F4.
- **Fix**: Optionally add one e2e test using the real `AuthGuard` with a stubbed `ProfilesService` returning a `blockedAt` profile, pinning "a blocked admin gets 403 on this route".
- **Decision**: FIXED (Fix now) — e2e describe with the real `AuthGuard`: a blocked admin gets 403 'Account is blocked' and nothing is touched.

### F8 — Concurrent first-time blocks can overwrite blockedAt

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/admin-users/admin-users.service.ts:44-62
- **Detail**: `findUnique` then an unconditional `update({ where: { id } })`. Two simultaneous calls for the same member both read `blockedAt = null` and both write, so the later timestamp wins; likewise a role promoted to ADMIN between read and write would still be blocked. Impact is very low: admin-only endpoint, promotion is manual SQL, single admin today.
- **Fix**: Accept as is (document it), or switch to `updateMany({ where: { id, role: 'MEMBER', blockedAt: null }, data })` and re-read, which also needs the e2e fake table extended.
- **Decision**: FIXED (Fix now) — conditional `updateMany` plus re-read; e2e fake table gained `updateMany`; extra unit cases for count 0 and a null re-read.

### F9 — Accessible name differs from visible text while pending

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/AdminUsersPage.tsx (Confirm button)
- **Detail**: Visible text switches to `Blocking…` while the `aria-label` stays `Confirm blocking <email>`. A minor label-in-name mismatch (WCAG 2.5.3) during the brief pending state.
- **Fix**: Drop the `aria-label` on the pending Confirm button, or update it with the pending text, and adjust the test that targets it.
- **Decision**: FIXED (Fix now) — pending Confirm button's accessible name is `Blocking… <email>`; test updated.
