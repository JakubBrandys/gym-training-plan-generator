# Admin Block User Implementation Plan

## Overview

Let an admin block a member from the registered-users page (FR-003, roadmap S-07). A block sets `Profile.blockedAt` (which the existing global `AuthGuard` already turns into a 403 on every gated request) and then bans the user at Supabase through the Admin API so they can no longer sign in or refresh a session. The change adds one backend endpoint, the first Supabase admin client in the backend, and a Block action on the admin page.

## Current State Analysis

- Enforcement exists and needs no change: `AuthGuard` verifies the JWT, reads the `Profile` on every request and throws 403 `Account is blocked` when `blockedAt !== null` (`backend/src/auth/auth.guard.ts:49-53`). Nothing in `backend/src` writes `blockedAt` yet.
- Supabase still issues sessions to a blocked user. A ban stops sign-in and token refresh but does not revoke an access token already issued; that window is covered by the per-request database check (see `research.md`, section 5).
- `GET /admin/users` already returns `id,email,role,blockedAt,createdAt` (`backend/src/admin-users/admin-users.service.ts:5-19`) and the page already renders `Status: Blocked|Active` (`frontend/src/pages/AdminUsersPage.tsx:75`). The page has no mutation state and no buttons.
- The frontend treats every 403 as "account blocked": `handleAuthFailure` signs the caller out with the blocked banner (`frontend/src/lib/auth-failure.ts:7-10`). The repo's convention is 404-for-unauthorized and 403 reserved for blocked accounts.
- The backend has no Supabase client dependency and nothing reads `SUPABASE_SECRET_KEY`. `getSupabaseUrl` is exported from `backend/src/auth/jwks.provider.ts:9`. The boot-validated config pattern to copy is `backend/src/plan-generation/plan-generation.config.ts:16-52`.
- `Profile` rows are created lazily on a user's first API call, so a Supabase user who never called the API has no row and cannot appear in the list or be blocked.

## Desired End State

An admin opens `/admin/users`, presses Block on a member, confirms inline, and the row flips to `Status: Blocked`. From that moment every API call by that member returns 403 (the SPA signs them out with the blocked banner), and Supabase refuses their sign-in and token refresh. Admins, including the caller, cannot be blocked. If the Supabase ban fails, the database block stays, the admin sees an explanatory error, and pressing Re-apply block repeats the ban. Verification: the backend and frontend suites pass, and a throwaway member blocked against the real Supabase project can no longer sign in or call the API.

### Key Discoveries:

- Guard order: global `AuthGuard` runs before the controller-level `AdminGuard`, which answers non-admins with a 404 identical to an unknown route (`backend/src/auth/admin.guard.ts:11-20`). A new `POST` route under the same controller inherits that.
- Write-endpoint template: uuid path param answering 404 when invalid, `ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })` (`backend/src/saved-plans/saved-plans.controller.ts:41-50`).
- `ConfigModule.forRoot({ isGlobal: true })` loads `backend/.env`, and `backend/test/app.e2e-spec.ts` boots the full `AppModule`, so a boot-required `SUPABASE_SECRET_KEY` must be present in the developer's `backend/.env` for `npm run test:e2e` (README states the same for the OpenAI variables, `backend/README.md:87-107`).
- `ban_duration` is a Go duration string with units up to hours only; `"none"` lifts a ban (Supabase Auth admin API docs). A permanent-in-practice ban is `876000h` (about 100 years).
- A refresh-token grant for a banned user is rejected with `user_banned` (Supabase Auth source, `internal/tokens/service.go`); the exact sign-in error wording was not verified and is recorded during Phase 1 manual verification.
- Admin e2e pattern: `FakeProfileTable` as `PrismaService.profile` plus a header-driven `APP_GUARD` stand-in (`backend/test/admin-users.e2e-spec.ts:20-99`). The new endpoint needs `findUnique` and `update` on that fake.
- Frontend tests: `AdminUsersPage.spec.tsx` mocks `../lib/admin-users` with a factory (line 9), so a new export must be added there; no `user-event` or jest-dom is installed, so interactions use `fireEvent`.
- Lessons: key every access decision on `Profile.id` (`context/foundation/lessons.md:5-10`). The block target is a uuid path parameter, never an email.

## What We're NOT Doing

- Unblocking. Neither the PRD nor the roadmap asks for it. Undoing a block stays manual (clear `blockedAt` in SQL and lift the Supabase ban), documented in the backend README.
- Cancelling a blocked user's running generation job or open progress stream. One job per user can finish, up to 10 minutes, and its result is unreachable; an open stream ends within its 240 s window; every new, poll, reconnect and save request gets 403 immediately.
- Blocking admins or yourself. Blocking a second admin requires demoting them by SQL first; there is no role-change endpoint.
- Audit logging of the block action (S-06 excluded it for reads; no decision exists for writes).
- Blocking a user who has no `Profile` row. The endpoint answers 404 and the UI cannot target such a user because they are not listed.
- Mapping Supabase's banned-sign-in error to the blocked banner on the sign-in page. The user sees Supabase's own message; its wording is recorded in Phase 1 manual verification as input for a possible follow-up.
- A Supabase Auth Hook, a database migration or any schema change, pagination of the user list, and an index on `blockedAt`.

## Implementation Approach

Two phases, backend first so the API is testable before any UI exists. Follow the repo's conventions: const function expressions, no code comments, oxlint-clean, Prettier formatting in the backend.

Block flow in `AdminUsersService.block(id)`:

1. Read the target `Profile`. Not found: 404.
2. Target role is `ADMIN` (this includes the caller, since only admins reach the route): 409 Conflict. Never 403, because the frontend would sign the caller out as "blocked".
3. If `blockedAt` is null, set it to now. If it is already set, keep the original timestamp and skip the write.
4. Call the Supabase ban every time, including for an already-blocked user, so a retry repairs a failed ban.
5. If the ban fails, keep the database block, log the failure (never the secret) and answer 502.
6. Return the target's `AdminUserSummary`.

## Critical Implementation Details

- **State sequencing:** the database write must come before the Supabase ban. The per-request 403 is the primary gate and already holds whatever Supabase does, so an outage at Supabase must never leave the user with API access. Do not reorder, and do not roll `blockedAt` back when the ban fails.

## Phase 1: Backend — Supabase admin ban and block endpoint

### Overview

Introduce the Supabase admin client behind a boot-validated config, add `AdminUsersService.block` and `POST /admin/users/:id/block`, and document the new secret and the manual unblock procedure.

### Changes Required:

#### 1. Dependency

**File**: `backend/package.json` (and `backend/package-lock.json`)

**Intent**: Add `@supabase/supabase-js` as a runtime dependency; the Admin API is only reachable through it (or hand-written GoTrue calls, which are not worth maintaining).

**Contract**: Same major version as the frontend's `@supabase/supabase-js`. No other new dependency.

#### 2. Supabase admin config

**File**: `backend/src/supabase-admin/supabase-admin.config.ts`

**Intent**: Read and validate the settings the admin client needs at boot, so the app refuses to start without `SUPABASE_SECRET_KEY`, exactly like the `PLAN_*` variables.

**Contract**: Exports `SUPABASE_ADMIN_CONFIG` (Symbol token), `SupabaseAdminConfig { url: string; secretKey: string }`, `readSupabaseAdminConfig()` and `supabaseAdminConfigProvider` (a `Provider` whose factory calls the reader). `url` comes from the existing `getSupabaseUrl()`. A missing or blank `SUPABASE_SECRET_KEY` throws an error in the style of `plan-generation.config.ts` (names the variable and says to add it to `backend/.env`). The value is trimmed and never appears in an error message.

#### 3. Supabase admin client

**File**: `backend/src/supabase-admin/supabase-admin.client.ts`

**Intent**: One small injectable that owns the Supabase client and exposes only the operation this change needs, so the service and its tests never touch the SDK.

**Contract**: `SupabaseAdminClient` (`@Injectable`, constructor injects `SUPABASE_ADMIN_CONFIG`). Creates the SDK client with the secret key and session persistence and token auto-refresh switched off. Method `banUser(userId: string): Promise<void>` calls `auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION })` and rejects on a returned `error` or a thrown failure. Exports `BAN_DURATION = '876000h'`; the hours unit is required because Supabase's duration format has no larger unit.

#### 4. Supabase admin module

**File**: `backend/src/supabase-admin/supabase-admin.module.ts`

**Intent**: Package the config provider and client so any module can import them.

**Contract**: `SupabaseAdminModule` provides `supabaseAdminConfigProvider` and `SupabaseAdminClient`, and exports `SupabaseAdminClient`.

#### 5. Block logic

**File**: `backend/src/admin-users/admin-users.service.ts`

**Intent**: Add the block operation following the flow in Implementation Approach.

**Contract**: `block(id: string): Promise<AdminUserSummary>`. Injects `SupabaseAdminClient` alongside `PrismaService`. Uses `SUMMARY_SELECT` for every read and write so no other column leaks. Throws `NotFoundException('User not found')`, `ConflictException('Admins cannot be blocked')`, and `BadGatewayException` when `banUser` rejects (the rejection is logged through a Nest `Logger` with the user id and the underlying message).

#### 6. Block endpoint

**Files**: `backend/src/admin-users/admin-users.controller.ts`, `backend/src/admin-users/admin-users.module.ts`

**Intent**: Expose the operation under the existing admin controller so `AdminGuard` applies, and wire the new module in.

**Contract**: `POST /admin/users/:id/block`, `@HttpCode(200)`, `id` parsed with `ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })`, returns the service result (the updated `AdminUserSummary`). `AdminUsersModule` imports `SupabaseAdminModule`.

#### 7. Documentation

**File**: `backend/README.md`

**Intent**: Record the new secret and the manual unblock path so the operator is not surprised.

**Contract**: In "Secrets and auth settings": add a `SUPABASE_SECRET_KEY` row (server-only Admin API key used to ban blocked users, set it before deploying), add it to the list of variables the backend refuses to start without, and add it to the sentence listing variables required for `npm run test:e2e`. Add a short "Unblocking a user" subsection: `UPDATE "Profile" SET "blockedAt" = NULL WHERE "id" = '<uuid>'` plus lifting the Supabase ban (dashboard, or `auth.admin.updateUserById(id, { ban_duration: 'none' })`). Note that the SQL alone does not restore sign-in.

#### 8. Tests

**Files**: `backend/src/supabase-admin/supabase-admin.config.spec.ts`, `backend/src/supabase-admin/supabase-admin.client.spec.ts`, `backend/src/admin-users/admin-users.service.spec.ts`, `backend/src/admin-users/admin-users.controller.spec.ts`, `backend/test/admin-users.e2e-spec.ts`

**Intent**: Cover the config, the client, each branch of the service, the controller delegation and the HTTP behaviour, in the styles already used in `admin-users`.

**Contract**:
- Config: missing and blank key throw and name the variable; value is trimmed; `url` is the validated `SUPABASE_URL`.
- Client (SDK module mocked): `banUser` sends `{ ban_duration: BAN_DURATION }` for the given id; rejects when the SDK returns an `error`; rejects when the SDK throws.
- Service: target not found gives 404 with no write and no ban; admin target gives 409 with no write and no ban; active member gets `blockedAt` set and the ban called with the id, and the summary is returned; already-blocked member keeps the original `blockedAt`, no write, ban still called; ban failure gives `BadGatewayException` after the write has happened (assert call order write-before-ban).
- Controller: delegates to `service.block` with the parsed id.
- E2E (extend `FakeProfileTable` with `findUnique` and `update`, provide a fake `SupabaseAdminClient`): no user gives 401; member caller gives a 404 identical to an unknown `POST` route and touches nothing; non-uuid id gives 404; unknown uuid gives 404; admin target gives 409 and no ban; member target gives 200 with exactly the five summary fields, `blockedAt` set and the ban called; repeat block keeps the first `blockedAt`; ban failure gives 502 while the row stays blocked.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd backend && npm run lint`
- Build passes: `cd backend && npm run build`
- New and extended unit specs pass: `cd backend && npx vitest run src/supabase-admin src/admin-users`
- Block endpoint e2e spec passes: `cd backend && npx vitest run --config vitest.config.e2e.ts test/admin-users.e2e-spec.ts`
- Full unit suite passes: `cd backend && npm test`
- Full e2e suite passes (requires `SUPABASE_SECRET_KEY` in `backend/.env`): `cd backend && npm run test:e2e`

#### Manual Verification:

- `SUPABASE_SECRET_KEY` is set in local `backend/.env` and `backend/.env.example`, and in Fly secrets (`fly secrets list`) before this phase is deployed; env files are edited by hand because they are read-protected in this environment
- Against the real Supabase project with a throwaway member: `POST /admin/users/<id>/block` as admin returns 200 and the list shows the member Blocked; the member's sign-in attempt is rejected by Supabase (record the observed error code and message); a session opened before the block gets 403 on its next API call
- Calling block on your own id or another admin returns 409, on an unknown uuid returns 404, and as a member returns 404
- The throwaway member is unblocked by the README procedure and can sign in again

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Frontend — Block action on the admin page

### Overview

Add `blockAdminUser` to the admin lib and a per-row Block action with inline confirmation, pending and error states on `AdminUsersPage`.

### Changes Required:

#### 1. Block call

**File**: `frontend/src/lib/admin-users.ts`

**Intent**: Add the write helper next to `listAdminUsers`, following `startPlanGeneration` for a POST and `authFailureOf` for 401/403.

**Contract**: `blockAdminUser(id: string): Promise<BlockAdminUserResult>` with `BlockAdminUserResult = { kind: 'ok'; user: AdminUser } | AuthFailureResult | { kind: 'not-found' } | { kind: 'conflict' } | { kind: 'ban-failed' } | { kind: 'error' }`. POSTs to `/admin/users/${id}/block` through `apiFetch` with a timeout signal. Status mapping: 401/403 via `authFailureOf`; 404 not-found; 409 conflict; 502 ban-failed; other non-ok error; 200 with a body that passes `isAdminUser` is ok, otherwise error; thrown failures are error.

#### 2. Page action

**File**: `frontend/src/pages/AdminUsersPage.tsx`

**Intent**: Give each non-admin row a Block action with an inline confirm step, reflect the result in the list without a full reload, and surface failures without ever leaving the admin unsure whether the user is blocked.

**Contract**:
- Admin rows render no action. Active members render a `Block` button; blocked members render `Re-apply block` (it repairs a failed Supabase ban, since the backend always re-applies it).
- Pressing the button swaps the row's action for an inline prompt naming the email with `Confirm` and `Cancel` buttons. Only one row is in the prompt or pending state at a time; the pending row's buttons are disabled.
- On `ok` the returned user replaces the row with the same id; the prompt closes.
- On `unauthorized` or `blocked` call `handleAuthFailure(result.status, signOut)` as the list load does.
- On `ban-failed` show a `role="alert"` message that the user is blocked in the app but the Supabase sign-in ban failed and Re-apply block retries it, and refresh the list's users in place (no loading state) so `Status` reflects the database.
- On `conflict` show that admins cannot be blocked. On `not-found` show that the user was not found and refresh the list's users in place. On `error` show `GENERIC_PLAN_ERROR`.
- The list loader is shared by the initial load and the in-place refresh; results arriving after unmount are ignored, as today.
- Buttons carry accessible names that include the email.

#### 3. Styling

**File**: `frontend/src/index.css`

**Intent**: Lay out the action area inside the existing `.admin-users-item` flex column without introducing a new button variant.

**Contract**: One small container class for the action buttons (wrapping flex row with a gap). No other global style changes.

#### 4. Tests

**Files**: `frontend/src/lib/admin-users.spec.ts`, `frontend/src/pages/AdminUsersPage.spec.tsx`

**Intent**: Cover the status mapping and each page behaviour using the existing mocking style.

**Contract**:
- Lib (mock `./api`): POSTs to the right path with method POST; 200 with a valid user is ok; invalid payload is error; 401 and 403 give the auth failure results; 404, 409 and 502 map to not-found, conflict and ban-failed; another failure status and a thrown error map to error.
- Page: add `blockAdminUser: vi.fn()` to the `vi.mock('../lib/admin-users', …)` factory. Cases: no action on the admin row; `Block` on an active member and `Re-apply block` on a blocked member; Block then Cancel leaves the row unchanged and calls nothing; Block then Confirm calls `blockAdminUser` with the id and the row shows `Status: Blocked` with `Re-apply block`; buttons are disabled while pending; conflict, not-found, ban-failed (list reloaded once more) and error messages; 401 calls `signOut()` and 403 calls `signOut('blocked')`. Interactions use `fireEvent`; new visible text must not repeat the exact string `Status: Blocked`, which existing tests count.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd frontend && npm run lint`
- Build passes: `cd frontend && npm run build`
- Lib and page specs pass: `cd frontend && npx vitest run src/lib/admin-users.spec.ts src/pages/AdminUsersPage.spec.tsx`
- Full frontend suite passes: `cd frontend && npm test`

#### Manual Verification:

- As admin in the browser, Block on a throwaway member shows the inline prompt, Confirm flips the row to `Status: Blocked` with `Re-apply block`, and Cancel leaves a row unchanged
- Admin rows show no action
- The throwaway member's open session is signed out with the blocked banner on its next navigation
- Re-apply block on an already-blocked member completes without an error and the row stays Blocked
- The throwaway member is unblocked by the README procedure afterwards

---

## Testing Strategy

### Unit Tests:

- Backend: config validation, client call shape and failure propagation, every branch of `AdminUsersService.block` including write-before-ban ordering, controller delegation.
- Frontend: `blockAdminUser` status mapping, page prompt/pending/result states, auth-failure routing.

### Integration Tests:

- HTTP-level e2e for the new route with the fake profile table and fake Supabase client: auth, admin gating and 404 parity, validation, 404/409/200/502 outcomes, response shape.
- The real `AuthGuard` plus `AdminGuard` chain is not covered by the e2e (it uses a header-driven guard, as in S-06); the guard's own spec covers the 403 for a blocked profile.

### Manual Testing Steps:

1. Sign up a throwaway member and note its id from the admin list.
2. As admin, block it from the UI; confirm the row flips.
3. Try to sign in as the throwaway user and record Supabase's error.
4. With a second browser session signed in as the throwaway user before the block, navigate and confirm sign-out with the banner.
5. Try to block yourself and another admin via the API and confirm 409.
6. Unblock the throwaway user per the README and confirm it can sign in.

## Performance Considerations

None beyond one extra `Profile` read, at most one write and one Supabase Admin API call per block, on an admin-only route. Enforcement cost is unchanged: the per-request profile read already exists and no cache is added.

## Migration Notes

No schema or migration change: `blockedAt` already exists. A new required environment variable (`SUPABASE_SECRET_KEY`) means the Fly secret must be set before this change is deployed, or the backend will refuse to start. Dev and prod share one Supabase database, so manual testing must use a throwaway user only.

## References

- Related research: `context/changes/admin-block-user/research.md`
- Roadmap item: `context/foundation/roadmap.md:168-178` (S-07)
- Block enforcement today: `backend/src/auth/auth.guard.ts:49-53`
- Admin guard and module: `backend/src/auth/admin.guard.ts:11-20`, `backend/src/admin-users/`
- Write-endpoint pattern: `backend/src/saved-plans/saved-plans.controller.ts:41-50`
- Config pattern: `backend/src/plan-generation/plan-generation.config.ts:16-52`
- Admin e2e pattern: `backend/test/admin-users.e2e-spec.ts:20-99`
- Frontend 403 handling: `frontend/src/lib/auth-failure.ts:7-10`
- Prior change: `context/archive/2026-10-31-admin-user-list/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — Supabase admin ban and block endpoint

#### Automated

- [x] 1.1 Lint passes: `cd backend && npm run lint`
- [x] 1.2 Build passes: `cd backend && npm run build`
- [x] 1.3 New and extended unit specs pass: `cd backend && npx vitest run src/supabase-admin src/admin-users`
- [x] 1.4 Block endpoint e2e spec passes: `cd backend && npx vitest run --config vitest.config.e2e.ts test/admin-users.e2e-spec.ts`
- [x] 1.5 Full unit suite passes: `cd backend && npm test`
- [x] 1.6 Full e2e suite passes (requires `SUPABASE_SECRET_KEY` in `backend/.env`): `cd backend && npm run test:e2e`

#### Manual

- [ ] 1.7 `SUPABASE_SECRET_KEY` is set in local `backend/.env` and `backend/.env.example`, and in Fly secrets (`fly secrets list`) before this phase is deployed; env files are edited by hand because they are read-protected in this environment
- [ ] 1.8 Against the real Supabase project with a throwaway member: `POST /admin/users/<id>/block` as admin returns 200 and the list shows the member Blocked; the member's sign-in attempt is rejected by Supabase (record the observed error code and message); a session opened before the block gets 403 on its next API call
- [ ] 1.9 Calling block on your own id or another admin returns 409, on an unknown uuid returns 404, and as a member returns 404
- [ ] 1.10 The throwaway member is unblocked by the README procedure and can sign in again

### Phase 2: Frontend — Block action on the admin page

#### Automated

- [x] 2.1 Lint passes: `cd frontend && npm run lint`
- [x] 2.2 Build passes: `cd frontend && npm run build`
- [x] 2.3 Lib and page specs pass: `cd frontend && npx vitest run src/lib/admin-users.spec.ts src/pages/AdminUsersPage.spec.tsx`
- [x] 2.4 Full frontend suite passes: `cd frontend && npm test`

#### Manual

- [ ] 2.5 As admin in the browser, Block on a throwaway member shows the inline prompt, Confirm flips the row to `Status: Blocked` with `Re-apply block`, and Cancel leaves a row unchanged
- [ ] 2.6 Admin rows show no action
- [ ] 2.7 The throwaway member's open session is signed out with the blocked banner on its next navigation
- [ ] 2.8 Re-apply block on an already-blocked member completes without an error and the row stays Blocked
- [ ] 2.9 The throwaway member is unblocked by the README procedure afterwards
