<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin User List

- **Plan**: context/changes/admin-user-list/plan.md
- **Scope**: Full plan (Phases 1 and 2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

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

### F1 — Response type guard checks only 2 of 5 fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/admin-users.ts:20-24
- **Detail**: `isAdminUser` is declared `value is AdminUser` but verifies only `id` and `email`. A missing `blockedAt` renders "Active", a missing `createdAt` renders "Joined: Invalid Date", and any unexpected `role` renders "Member". On an admin screen the unsafe default for a block state is "Active". The lib spec covers only a missing `id`/`email` and a non-object element.
- **Fix**: Validate all five fields in the guard (`role` is `'MEMBER' | 'ADMIN'`, `blockedAt` is `null` or a string, `createdAt` is a string) and add negative cases for each in `admin-users.spec.ts`.
- **Decision**: FIXED — isAdminUser now validates all five fields; six negative cases added to admin-users.spec.ts (break-check: reverting the guard turns all six red)

### F2 — 404 message built from `request.url`, Nest uses `request.originalUrl`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/auth/admin.guard.ts:21
- **Detail**: Nest's Express adapter returns `request.originalUrl` for its unmatched-route 404 (`@nestjs/platform-express/adapters/express-adapter.js:189-191`). The two are equal today only because there is no global prefix or mounted sub-app. If either is added, a member's 404 on `/admin/users` would stop matching an unknown route and the endpoint would become distinguishable.
- **Fix**: Use `request.originalUrl` in the message and make the guard spec fake supply `originalUrl`.
- **Decision**: FIXED — AdminGuard uses request.originalUrl; guard spec gained an originalUrl-vs-url case (break-check: reverting to request.url turns it red)

### F3 — "Exactly like an unknown route" is asserted against a hardcoded string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/test/admin-users.e2e-spec.ts:140-150
- **Detail**: The test never requests a genuinely unmatched route to compare against, and `toMatchObject` ignores the `error` field, so a changed body shape would go unnoticed. Taken together with F2, the parity claim in the plan is not actually proven by a test.
- **Fix**: Compare a member's `/admin/users` body with the body for `/admin/does-not-exist` (normalising the path in `message`, asserting `error` and `statusCode`), and add `HEAD`, trailing-slash and query-string cases.
- **Decision**: FIXED — e2e compares a member body with a real unmatched route and covers /admin/users/, a query string and HEAD (break-check: changing the 404 body turns the parity and variant cases red)

### F4 — Real `AuthGuard` → `AdminGuard` interplay is never exercised

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/test/admin-users.e2e-spec.ts:16-30, 95-125
- **Detail**: The e2e replaces `AuthGuard` with `HeaderUserGuard`, which casts the role header to `ProfileRole` unchecked. A regression such as `AdminGuard` becoming the `APP_GUARD`, or `AuthGuard` being skipped, would pass every current test. Nest guarantees global guards run before controller guards, and `AdminGuard` fails closed when `request.user` is missing, so the present code is correct.
- **Fix A ⭐ Recommended**: Accept; rely on the guard spec and Nest's ordering guarantee
  - Strength: No new test machinery; the guard already fails closed on a missing user and both guards are individually tested.
  - Tradeoff: An ordering regression would be silent.
  - Confidence: MEDIUM — Nest's global-before-controller order is documented behaviour.
  - Blind spot: Not verified against a future Nest major upgrade.
- **Fix B**: Add one test wiring the real `AuthGuard` (mock `ProfilesService` and verifier) in front of `AdminUsersController`
  - Strength: Proves the DB-sourced role reaches `AdminGuard` and that a blocked admin gets 403 first.
  - Tradeoff: Reuses the JWKS/ES256 setup from `auth.guard.spec.ts`, a moderate amount of test code for a guarantee the framework already provides.
  - Confidence: MEDIUM — the setup exists but has not been combined with a controller before.
  - Blind spot: Cost of keeping the extra fixture in sync with `AuthGuard` changes.
- **Decision**: ACCEPTED (Fix A) — rely on the guard spec and Nest global-before-controller ordering; no composed AuthGuard test added

### F5 — A non-admin sees the "Registered users" heading until the 404 arrives

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/pages/AdminUsersPage.tsx:59-63
- **Detail**: While the request is in flight the page renders `<h1>Registered users</h1>` and "Loading…"; only after the 404 does it swap to the bare "Page not found". This is not a data leak (the heading is the page title) but it weakens the plain-not-found intent.
- **Fix A ⭐ Recommended**: Accept as is
  - Strength: The admin endpoint's existence is not secret (the PRD names an admin role) and the window is one request; the heading-less not-found state is already tested.
  - Tradeoff: A member briefly sees the admin page title.
  - Confidence: HIGH — nothing in the PRD requires hiding the page's existence.
  - Blind spot: None significant.
- **Fix B**: Render a heading-less neutral loading shell and show the `<h1>` only in the ready and error states
  - Strength: A member never sees the admin title at any point.
  - Tradeoff: Extra render branch and test updates; admins lose the heading while loading.
  - Confidence: MEDIUM — depends whether hiding the title matters.
  - Blind spot: Layout shift when the heading appears.
- **Decision**: ACCEPTED (Fix A) — heading during loading kept as is; the admin page title is not secret and the heading-less not-found state stays tested

### F6 — `findMany` is unbounded and sorts on an unindexed column

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/admin-users/admin-users.service.ts:25-29
- **Detail**: No `take`/pagination and no `createdAt` index on `Profile`. This is the plan's explicit decision for the PRD's small scale, and the service spec asserts it.
- **Fix**: No code change; record that pagination and an index are needed before the user count grows.
- **Decision**: FIXED — parked line for admin list pagination and a createdAt index added to context/foundation/roadmap.md

### F7 — `list-style: none` drops list semantics in Safari/VoiceOver

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/index.css:214-221
- **Detail**: `.admin-users-list` removes list markers without `role="list"`, so some screen readers stop announcing it as a list. `.saved-plans-list` has the same limitation and the specs query `listitem`, so this is consistent with the codebase.
- **Fix**: Add `role="list"` to the `<ul>` (and ideally to `.saved-plans-list` in a separate change).
- **Decision**: FIXED — role="list" added to the admin users <ul> (attribute only; no spec asserts it, existing listitem queries still pass)
