# Admin User List Implementation Plan

## Overview

Add the first admin-only capability: an admin can open a page listing every registered user, and a member cannot reach it. The backend gains a reusable `AdminGuard` and a `GET /admin/users` endpoint over the existing `Profile` table; the frontend gains an `/admin/users` page and an admin-only link on the home page. This is roadmap slice S-06 (PRD FR-002); blocking users is S-07 and is out of scope here.

## Current State Analysis

- `Profile.role` (`MEMBER` | `ADMIN`, default `MEMBER`), `blockedAt` and `createdAt` already exist, so the endpoint needs no migration. The global `AuthGuard` resolves the Profile by id and sets `request.user = {id, email, role}` from the DB row, but nothing checks the role.
- There is no role guard, no admin endpoint, no seed or script that sets `ADMIN`, and no frontend role check. S-01 left the first admin to be set by SQL until S-06 (`context/archive/2026-10-10-sign-up-and-login/plan.md:38`).
- Profile rows are created lazily on the first authenticated request (`backend/src/profiles/profiles.service.ts:10-24`). Sign-up navigates to `/`, whose `HomePage` calls `GET /me`, so a sign-up that returns a session gets a Profile. A user who never made an API call has no row and will not appear in the list.
- On the frontend, `handleAuthFailure(403)` signs the user out with the "blocked" banner (`frontend/src/lib/auth-failure.ts:7-10`). A 403 from a role check would therefore sign a member out; the endpoint answers 404 instead.
- The role is known only inside `HomePage` local state (`frontend/src/pages/HomePage.tsx:8-12,29`). `RequireAuth` checks the session only. There is no table or shared layout in the SPA, and `#root` is capped at `max-width: 28rem` (`frontend/src/index.css:32-36`).

## Desired End State

An admin (a Profile whose `role` is `ADMIN`) sees a "Registered users" link on the home page and, on `/admin/users`, a newest-first list showing each Profile's email, role, active/blocked status and join date. A member never sees the link, and a member who calls `GET /admin/users` or opens `/admin/users` gets a 404 / "Page not found" without being signed out. The first admin is designated by a documented SQL statement keyed on `Profile.id`. Verification: the backend unit and e2e specs, the frontend specs, lint and build pass, and the manual checks in both phases succeed.

### Key Discoveries:

- `AuthGuard` is the global `APP_GUARD` and attaches the DB-sourced role (`backend/src/auth/auth.guard.ts:55-60`), so a controller-level guard can rely on `request.user.role` with no extra lookup.
- 404-for-unauthorized is the repo's convention (`backend/src/saved-plans/saved-plans.controller.ts:44-47`), and 403 is reserved for blocked accounts in both backend (`auth.guard.ts:51-53`) and frontend (`auth-failure.ts:7-10`).
- The closest list analogue is `SavedPlansService.list` (`backend/src/saved-plans/saved-plans.service.ts:100-107`): `select` const, `orderBy [{createdAt:'desc'},{id:'desc'}]`, unpaginated, mapped to a plain interface.
- Frontend list pattern: `SavedPlansPage` (`frontend/src/pages/SavedPlansPage.tsx:14-70`) with a discriminated-union state, a cancelled-flag effect, `listSavedPlans` returning `ok | unauthorized | blocked | error` (`frontend/src/lib/saved-plans.ts:65-81`).
- The e2e harness replaces the guard with a header-driven `HeaderUserGuard` that always sets `role: 'MEMBER'` and replaces Prisma with an in-memory fake (`backend/test/saved-plans.e2e-spec.ts:24-39,64-102`); the new e2e needs a variant that can set `role: 'ADMIN'`.
- The real router is exercised in specs by mocking `RequireAuth` as a plain `Outlet` and loading `router.routes` into a memory router (`frontend/src/pages/SavedPlanPage.spec.tsx:23-26,274-290`).
- Lesson `context/foundation/lessons.md:5-10`: never authorize or designate an admin by email; key on `Profile.id`.

## What We're NOT Doing

- Blocking or unblocking users, and any write endpoint on `Profile` (S-07).
- Pagination, search or filtering of the list; the PRD scale is small and the saved-plans list set the same precedent (`context/archive/2026-10-27-save-and-view-plan/plan.md:33`).
- Listing Supabase `auth.users` or adding `@supabase/supabase-js` and `SUPABASE_SECRET_KEY` usage. Users with no `Profile` row are not shown.
- Any change to the shared 403 handling (`handleAuthFailure`, `authFailureOf`).
- A frontend route guard, a `useMe` hook, or lifting `/me` into `AuthProvider`. The backend is the only authority; the page renders a not-found state on 404.
- An endpoint, script or env allowlist for promoting an admin, and any email-based designation.
- Audit logging of admin reads, and a schema migration or index on `Profile`.
- Renaming `formatSavedDate` or other shared helpers.

## Implementation Approach

Two phases, each independently verifiable. Phase 1 delivers the backend end to end (guard, module, tests, README on designating the first admin) so the endpoint can be exercised before any UI exists. Phase 2 adds the frontend lib, page, route and home link on top of it, then runs the live manual check against a real admin and member. The guard is a reusable `AdminGuard` applied with `@UseGuards` on the controller, rather than a global role system, because S-07 only needs the same admin check on one more controller.

## Critical Implementation Details

- **Timing & lifecycle**: Nest runs global guards before controller-level guards, so `AdminGuard` runs after `AuthGuard` has set `request.user`. The guard must still treat a missing `request.user` as non-admin (404) rather than throwing a different error.

## Phase 1: Backend admin endpoint

### Overview

Add `AdminGuard`, the `admin-users` module with `GET /admin/users`, unit and e2e tests, and the README section for designating the first admin.

### Changes Required:

#### 1. Admin guard

**File**: `backend/src/auth/admin.guard.ts`

**Intent**: Reject any request whose resolved user is not an admin, answering exactly as an unknown route would so a member learns nothing about the endpoint. The decision keys on `request.user.role`, which the global guard read from the Profile row by id.

**Contract**: `AdminGuard implements CanActivate`. Allows when `request.user?.role === 'ADMIN'`; otherwise throws `NotFoundException` with message `Cannot <METHOD> <url>` (the body Nest produces for an unmatched route). Never reads or compares `request.user.email`. No comments in the code.

#### 2. Admin users service

**File**: `backend/src/admin-users/admin-users.service.ts`

**Intent**: Return every Profile as a summary, newest first, with a deterministic tiebreak.

**Contract**: `export interface AdminUserSummary { id: string; email: string; role: ProfileRole; blockedAt: Date | null; createdAt: Date }` (import `ProfileRole` from `../generated/prisma/client.js`). `AdminUsersService.list(): Promise<AdminUserSummary[]>` calls `prisma.profile.findMany` with a `select` const of exactly those five fields and `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`; no `where`, no `take`/`skip`.

#### 3. Admin users controller and module

**Files**: `backend/src/admin-users/admin-users.controller.ts`, `backend/src/admin-users/admin-users.module.ts`, `backend/src/app.module.ts`

**Intent**: Expose the list behind the admin guard and register the feature.

**Contract**: `@Controller('admin/users') @UseGuards(AdminGuard)` with `@Get() list(): Promise<AdminUserSummary[]>` delegating to the service. `AdminUsersModule` imports `PrismaModule`, declares the controller and service. `AppModule` adds `AdminUsersModule` to `imports`. Relative imports use the `.js` suffix; use const arrow functions for any non-class helpers.

#### 4. Backend specs

**Files**: `backend/src/auth/admin.guard.spec.ts`, `backend/src/admin-users/admin-users.service.spec.ts`, `backend/src/admin-users/admin-users.controller.spec.ts`, `backend/test/admin-users.e2e-spec.ts`

**Intent**: Prove the access rule, the query shape and the HTTP behaviour, including the failure that matters: a member (or an admin-looking email) reaching the list.

**Contract**:
- Guard spec: `role: 'ADMIN'` passes; `role: 'MEMBER'` throws `NotFoundException` with message `Cannot GET /admin/users`; a `MEMBER` whose email looks like an admin (for example `admin@example.com`) is denied; a request with no `user` is denied.
- Service spec (mock `PrismaService` as in `profiles.service.spec.ts`): `list` calls `profile.findMany` with the five-field `select` and the `createdAt`/`id` descending `orderBy`, and returns the rows unchanged.
- Controller spec: constructed with a `vi.fn()` service, `list` returns the service result.
- E2E spec (supertest, in-memory fake `profile.findMany`, a header-driven guard like `HeaderUserGuard` that also reads an `x-test-role` header): no user header gives 401; role `MEMBER` gives 404 with `message` `Cannot GET /admin/users`; role `ADMIN` gives 200 with every seeded Profile as the five fields only, newest first, ties on `createdAt` broken by `id` descending, `createdAt`/`blockedAt` serialized as ISO strings or `null`.

#### 5. First-admin documentation

**File**: `backend/README.md`

**Intent**: Record how the first admin is designated, since no code does it.

**Contract**: New `### First admin` subsection after "Secrets and auth settings". It says: sign in once so a `Profile` exists; copy your user id from Supabase dashboard → Authentication → Users (it equals `Profile.id`); run `UPDATE "Profile" SET "role" = 'ADMIN' WHERE "id" = '<user-uuid>';` in the Supabase SQL editor; never match by email because sign-up emails are unverified while Confirm email is off; the change takes effect on the next request with no re-login because the role is read from the database; there is one shared database, so this changes production.

### Success Criteria:

#### Automated Verification:

- Linting passes: `cd backend && npm run lint`
- Build passes: `cd backend && npm run build`
- Guard, service and controller specs pass: `cd backend && npx vitest run src/auth/admin.guard.spec.ts src/admin-users`
- Admin list e2e spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/admin-users.e2e-spec.ts`
- Full unit suite passes: `cd backend && npm test`

#### Manual Verification:

- The README "First admin" section reads correctly and the SQL uses the table and column names from `backend/prisma/schema.prisma`
- Temporarily removing `@UseGuards(AdminGuard)` from the controller turns the member-gets-404 e2e case red; restore it afterwards

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Frontend page and admin link

### Overview

Add the API wrapper, the `/admin/users` page and route, the home-page link for admins, styling, specs, and run the live manual check with a real admin and member.

### Changes Required:

#### 1. Admin users API wrapper

**File**: `frontend/src/lib/admin-users.ts`

**Intent**: Fetch the list and map every outcome to a discriminated result, following `listSavedPlans`.

**Contract**: `export type AdminUser = { id: string; email: string; role: 'MEMBER' | 'ADMIN'; blockedAt: string | null; createdAt: string }`. `ListAdminUsersResult = { kind: 'ok'; users: AdminUser[] } | AuthFailureResult | { kind: 'not-found' } | { kind: 'error' }`. `listAdminUsers()` calls `apiFetch('/admin/users', { signal: AbortSignal.timeout(15_000) })`; 401/403 via `authFailureOf`; 404 gives `not-found`; other non-ok gives `error`; a 2xx body must be an array whose elements are objects with string `id` and `email`, otherwise `error`; thrown errors give `error`. Never throws.

#### 2. Admin users page and route

**Files**: `frontend/src/pages/AdminUsersPage.tsx`, `frontend/src/router/router.tsx`

**Intent**: Show the list to an admin and a plain not-found state to a member, without signing the member out.

**Contract**: `AdminUsersPage` is a named const-arrow export using the `SavedPlansPage` pattern (state union `loading | ready | not-found | error`, cancelled-flag effect, `signOut` dependency). `unauthorized`/`blocked` results call `handleAuthFailure(result.status, signOut)`. `not-found` renders a `<main>` containing only `<p className="error" role="alert">Page not found</p>` and a "Back to home" link, with no heading. Other states render `<main className="admin-users">` with `<h1>Registered users</h1>`: loading `<p className="status">Loading…</p>`, error `GENERIC_PLAN_ERROR` in `role="alert"`, empty `<p>No registered users yet.</p>`, otherwise `<ul className="admin-users-list">` with one `<li key={id}>` per user showing the email, `Role: Admin|Member`, `Status: Active|Blocked` (blocked when `blockedAt` is non-null) and `Joined: <formatSavedDate(createdAt)>` (reuse the existing helper unchanged), then a "Back to home" link. The route `{ path: '/admin/users', element: <AdminUsersPage /> }` is added to the `RequireAuth` children in `router.tsx`.

#### 3. Home page admin link

**File**: `frontend/src/pages/HomePage.tsx`

**Intent**: Give admins a way in using the role `HomePage` already fetches.

**Contract**: When `state.status === 'ready'` and `state.me.role === 'ADMIN'`, render `<p><Link to="/admin/users">Registered users</Link></p>` alongside the existing links. Members and non-ready states render nothing extra.

#### 4. Styling

**File**: `frontend/src/index.css`

**Intent**: Style the list as stacked cards that fit the 28rem column and phone width, matching `.saved-plans-list`.

**Contract**: `.admin-users-list` (no list style, flex column, gap `0.75rem`, margin `0 0 1rem`, no padding), `.admin-users-item` (flex column, gap `0.25rem`, padding `0.75rem`, `1px solid var(--border)`, radius `4px`), `.admin-users-email` (`font-weight: 600`, `overflow-wrap: anywhere`). Uses existing CSS variables only; `#root` width is unchanged.

#### 5. Frontend specs

**Files**: `frontend/src/lib/admin-users.spec.ts`, `frontend/src/pages/AdminUsersPage.spec.tsx`, `frontend/src/pages/HomePage.spec.tsx`

**Intent**: Cover the wrapper's outcome mapping, every page state, the admin-only link, and the real route.

**Contract**:
- Lib spec (unit project, mocking `./api` as `saved-plans.spec.ts` does): 200 with a valid array gives `ok`; 401 gives `unauthorized`; 403 gives `blocked`; 404 gives `not-found`; 500, a non-array body, an element missing `email`, malformed JSON and a thrown fetch each give `error`.
- Page spec (components project, mocking `../lib/admin-users` and `../auth/useAuth` inside `MemoryRouter`, as `SavedPlansPage.spec.tsx` does): loading status; users rendered in the order returned with email, role, status and joined date, including a blocked user showing `Status: Blocked`; empty state; error alert; `not-found` shows "Page not found", has no `Registered users` heading and does not call `signOut`; `unauthorized`/`blocked` call `signOut` through `handleAuthFailure`; the real router (with `RequireAuth` mocked as a plain `Outlet`) resolves `/admin/users` to this page.
- Home spec (mocking `../lib/api`, `../lib/auth-failure` as needed and `../auth/useAuth`): the "Registered users" link is present when `/me` returns `role: 'ADMIN'` and absent when it returns `MEMBER`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `cd frontend && npm run lint`
- Type check and build pass: `cd frontend && npm run build`
- All frontend specs pass: `cd frontend && npm test`

#### Manual Verification:

- After promoting your own Profile with the README SQL, the home page shows a "Registered users" link and the page lists every Profile newest first with email, role, status and joined date
- A second, member account sees no admin link on the home page
- That member opening `/admin/users` directly sees "Page not found", stays signed in, and the browser's request to `/admin/users` returns 404
- The list has no horizontal scroll at phone width (about 375 px), and both links show a visible focus ring when reached by keyboard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. The manual checks run against the single shared Supabase database, so promoting your Profile affects production data.

---

## Testing Strategy

### Unit Tests:

- `AdminGuard`: admin allowed; member, admin-looking email on a member, and missing user denied with the unknown-route 404 message.
- `AdminUsersService.list`: exact `select`, `orderBy` and no `where`/`take`/`skip`.
- `listAdminUsers`: each status and malformed-body outcome.
- `AdminUsersPage`: every state, no sign-out on 404, `handleAuthFailure` on 401/403.

### Integration Tests:

- `test/admin-users.e2e-spec.ts`: 401 without a user, 404 for a member, 200 for an admin with the five-field shape, newest-first order and id tiebreak.
- Real-router resolution of `/admin/users` in `AdminUsersPage.spec.tsx`.

### Manual Testing Steps:

1. Run the README SQL for your own user id, reload, and confirm the home page shows the admin link.
2. Open the list and confirm your own row and any other Profile rows appear, newest first.
3. Sign in as a member and confirm no link, and `/admin/users` shows "Page not found" without a sign-out.
4. Check the layout at about 375 px width and keyboard focus on the links.

## Performance Considerations

The list is one unpaginated `findMany` over `Profile` with no index on `createdAt`. At the PRD's stated small scale this is acceptable; pagination and an index are deferred until the user count makes them necessary.

## Migration Notes

No schema change and no migration. Designating the first admin is a manual SQL statement run once against the single shared Supabase database (dev and production are the same database), documented in `backend/README.md`. No new env var or Fly secret is introduced, so nothing needs setting before merge.

## References

- Related research: `context/changes/admin-user-list/research.md`
- Roadmap slice: `context/foundation/roadmap.md:155-166`; PRD: `context/foundation/prd.md:60,101-108`
- Closest backend analogue: `backend/src/saved-plans/saved-plans.service.ts:100-107`, `backend/src/saved-plans/saved-plans.controller.ts:24-52`
- Closest frontend analogue: `frontend/src/pages/SavedPlansPage.tsx:14-70`, `frontend/src/lib/saved-plans.ts:65-81`
- Test harness patterns: `backend/test/saved-plans.e2e-spec.ts:24-102`, `backend/src/auth/auth.guard.spec.ts:42-60`, `frontend/src/pages/SavedPlanPage.spec.tsx:274-290`
- Prior decisions: `context/archive/2026-10-10-sign-up-and-login/plan.md:38,41-42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend admin endpoint

#### Automated

- [x] 1.1 Linting passes: `cd backend && npm run lint`
- [x] 1.2 Build passes: `cd backend && npm run build`
- [x] 1.3 Guard, service and controller specs pass: `cd backend && npx vitest run src/auth/admin.guard.spec.ts src/admin-users`
- [x] 1.4 Admin list e2e spec passes: `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/admin-users.e2e-spec.ts`
- [x] 1.5 Full unit suite passes: `cd backend && npm test`

#### Manual

- [x] 1.6 The README "First admin" section reads correctly and the SQL uses the table and column names from `backend/prisma/schema.prisma`
- [x] 1.7 Temporarily removing `@UseGuards(AdminGuard)` from the controller turns the member-gets-404 e2e case red; restore it afterwards

### Phase 2: Frontend page and admin link

#### Automated

- [x] 2.1 Linting passes: `cd frontend && npm run lint`
- [x] 2.2 Type check and build pass: `cd frontend && npm run build`
- [x] 2.3 All frontend specs pass: `cd frontend && npm test`

#### Manual

- [x] 2.4 After promoting your own Profile with the README SQL, the home page shows a "Registered users" link and the page lists every Profile newest first with email, role, status and joined date
- [x] 2.5 A second, member account sees no admin link on the home page
- [x] 2.6 That member opening `/admin/users` directly sees "Page not found", stays signed in, and the browser's request to `/admin/users` returns 404
- [x] 2.7 The list has no horizontal scroll at phone width (about 375 px), and both links show a visible focus ring when reached by keyboard
