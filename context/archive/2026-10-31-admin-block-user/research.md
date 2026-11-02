---
date: 2026-10-31T13:00:34+01:00
researcher: Claude Sonnet 5.5 (session of Jakub Brandys)
git_commit: 8eecdb128da31595ad58ad81f47e3ee36af35374
branch: archive-admin-user-list
repository: 10xdevs
topic: "admin-block-user (S-07, FR-003): what the codebase already enforces, what a block action must add, and what Supabase can do on its side"
tags: [research, codebase, admin-block-user, auth-guard, profiles, supabase-ban, plan-generation, admin-users]
status: complete
last_updated: 2026-10-31
last_updated_by: Claude Sonnet 5.5 (session of Jakub Brandys)
---

# Research: admin-block-user (S-07, FR-003)

**Date**: 2026-10-31T13:00:34+01:00
**Researcher**: Claude Sonnet 5.5 (session of Jakub Brandys)
**Git Commit**: 8eecdb128da31595ad58ad81f47e3ee36af35374
**Branch**: archive-admin-user-list
**Repository**: 10xdevs

## Research Question

`change.md` carries only the name `admin-block-user`, so the question was derived from `context/foundation/roadmap.md:168-178` (S-07) and `prd.md:39,62,105,108`: *what does the codebase already do to block a user, what must a "block user" action add (backend, Supabase side, frontend), and which decisions are still open?* This is internal research plus a short external lookup of Supabase Auth behaviour. It does not choose a design.

## Summary

- **API-level enforcement already exists and needs no change.** On the inspected path (global `AuthGuard`, every non-`@Public` route), a valid token for a profile with `blockedAt !== null` is rejected with 403 `Account is blocked` (`backend/src/auth/auth.guard.ts:49-53`). The profile is read from the DB on every such request, with no cache (`backend/src/profiles/profiles.service.ts:11-13`), so a block takes effect on the user's next request without re-login. The roadmap's headline risk ("must hold for already-issued sessions") is therefore already met for API calls with live tokens; the residual gaps are listed below.
- **Nothing writes `blockedAt` yet.** In `backend/src` and `backend/test` the only references are the schema, the guard, the admin-list read, and specs. S-07 introduces the first writer (verified by grep, no hits besides those).
- **The admin list already shows status.** `AdminUsersPage` renders `Status: Blocked|Active` per row (`frontend/src/pages/AdminUsersPage.tsx:75`) and the API already returns `blockedAt` (`backend/src/admin-users/admin-users.service.ts:9,17`). Missing: a block endpoint, a frontend action, and per-row mutation state.
- **The frontend already handles a blocked live session.** Any 403 calls `signOut('blocked')` and the sign-in page shows "Your account has been blocked" (`frontend/src/lib/auth-failure.ts:7-10`, `frontend/src/pages/SignInPage.tsx:63-67`, as reported by the frontend survey). Consequence: any *new* 403 introduced by S-07 (for example "cannot block yourself") would sign the calling admin out as "blocked".
- **Supabase-side block (the roadmap's open Unknown).** Supabase docs state that a ban "only blocks sign-in for its duration and does not revoke existing sessions", and that already-issued access tokens stay valid until `exp`. The Auth server source shows the refresh-token grant rejects a banned user with `user_banned` (`internal/tokens/service.go`). The custom access token hook *can* reject issuance: a hook error is returned to the client with the hook's `http_code`. Both options are therefore viable for sign-in/refresh and neither affects an already-issued JWT; the existing per-request DB check is what covers live tokens.
- **Real gaps S-07 must decide:** the Supabase-side mechanism, ordering/failure handling of "set `blockedAt`" vs "apply ban", self-block and blocking an admin, unblock, users without a `Profile` row, in-flight generation jobs and open SSE streams, the new secret/dependency, and audit logging. Details under Open Questions.

## Detailed Findings

### 1. Backend enforcement path (inspected path: global guard → verifier → profile resolve → blocked check)

- `Profile.blockedAt DateTime?` (`backend/prisma/schema.prisma:36`); column created nullable in `backend/prisma/migrations/20261010125707_create_profile/migration.sql:9`. No index on `blockedAt`.
- `AuthGuard` is the global `APP_GUARD` (`backend/src/auth/auth.module.ts:20`). Order in `canActivate` (`backend/src/auth/auth.guard.ts:34-60`): `@Public` short-circuit (returns `true`, no token/profile/blocked check) → missing bearer 401 → `verifier.verify` → `profiles.resolve` → `blockedAt !== null` throws `ForbiddenException('Account is blocked')` → `request.user = {id, email, role}` from the DB row, not the token.
- `SupabaseJwtVerifier` checks issuer, audience, ES256/RS256, role `authenticated`, non-empty `sub`/`email`, non-anonymous (`backend/src/auth/supabase-jwt.verifier.ts:98-131`). It has no notion of blocking, so a token remains cryptographically valid until `exp`; blocking works only because the guard reads the DB afterwards.
- `ProfilesService.resolve` does one `findUnique` per call; if the row is missing it creates it (with `blockedAt` null); if the email differs it updates the email (`backend/src/profiles/profiles.service.ts:10-24`). README states the role is read from the DB on every request.
- The only `@Public` routes found are `src/app.controller.ts:5` and `src/health/health.controller.ts:10`. `GET /me` (`src/profiles/me.controller.ts:48-54`), `exercises`, `plan-generations` (including SSE), `saved-plans` and `admin/users` are gated.
- Response body for a blocked user is Nest's default `{message:'Account is blocked', error:'Forbidden', statusCode:403}`: I verified there is no `APP_FILTER`, `useGlobalFilters`, `ExceptionFilter` or `@Catch` in `backend/src` or `backend/test` (grep, zero hits). This is code inspection, not a runtime check. No other `Forbidden`/403 source was found in `src`.
- Blocked-user test exists at `backend/src/auth/auth.guard.spec.ts:292-302` (asserts `ForbiddenException` and that `request.user` stays undefined; does not assert the message string).
- Guard order: global `AuthGuard` runs before the controller-level `AdminGuard`, so a blocked admin gets 403 before the admin check (by guard registration; the admin-list e2e uses a header-driven stand-in guard, so the real chain with a blocked admin is untested, see Historical Context).

### 2. Admin determination and the existing admin-users module

- Admin = `Profile.role === 'ADMIN'` (enum `MEMBER|ADMIN`, default `MEMBER`, `schema.prisma:27-30`). `AdminGuard` returns a 404 identical to an unknown route for non-admins (`backend/src/auth/admin.guard.ts:11-20`). First admin is set by manual SQL on `Profile.id` per backend README "First admin". This matches `lessons.md:5-10` (never authorize by email).
- Module shape to extend: `AdminUsersController` (`@Controller('admin/users')`, class-level `@UseGuards(AdminGuard)`, one `@Get()` route, no `@CurrentUser`), `AdminUsersService` (`findMany` with `SUMMARY_SELECT`, newest first, no pagination), module imports `PrismaModule`, registered at `src/app.module.ts:20`. DTO is the `AdminUserSummary` interface (`id,email,role,blockedAt,createdAt`).
- There is no write endpoint, and no zod/DTO validation in this module. The saved-plans controller shows the existing conventions for a write: zod body schema and `ParseUUIDPipe` on the path param (reported by the backend survey; not re-read by me).
- Test styles available: direct-constructed controller with `vi.fn()` service; `Test.createTestingModule` with a mocked `PrismaService` asserting exact Prisma args; HTTP e2e in `backend/test/admin-users.e2e-spec.ts` using supertest, a `FakeProfileTable` as `PrismaService.profile` and a header-driven `APP_GUARD` stand-in. A block endpoint's e2e would need the fake table extended with the Prisma write method it calls.
- Nothing prevents blocking self or another admin: inspected `src/admin-users/*`, `admin.guard.ts`, `auth.guard.ts`, `profiles.service.ts`, `me.controller.ts`, a repo-wide `blockedAt`/`role` grep, schema and the create-profile migration. No constraint or rule exists, and no write path exists to violate it. If the only admin is blocked, `AuthGuard` 403s them before `AdminGuard`, and recovery is manual SQL.

### 3. Long-running work that outlives a block (inspected: plan-generation controller, pipeline, stream config, store, limiter)

- Auth runs once per HTTP request. `POST /plan-generations` calls `limiter.tryAcquire(user.id, …)` then `void this.pipeline.run(job.id, form)` (`backend/src/plan-generation/plan-generation.controller.ts:83,91`); `PlanPipelineService.run(jobId, form)` (`plan-pipeline.service.ts:62`) receives no user id and was reported to contain no `blocked`/`profile`/`auth` reference. A running job therefore continues after a block, up to its 10-minute limit (`plan-job.store.ts`, per backend survey), spending provider tokens.
- The SSE stream is guarded only at connect. Window is `PLAN_STREAM_WINDOW_MS = 240_000`, heartbeat 12 s, max 3 streams per job (`plan-stream.config.ts:3-5`). An open stream can run until its window ends (≤ 240 s on this configuration); the next reconnect or any poll/start/save call gets 403.
- Jobs are an in-memory `Map` keyed by job id with `ownerId`; the limiter is in-memory keyed by `user.id` (one active job plus a rolling daily limit). Cancelling a blocked user's jobs would need a new store method and an externally triggerable abort (the pipeline's `AbortSignal.timeout` is created locally in `run`). The app is deliberately single-machine because of this in-memory state (`first-plan-generation/plan.md:307`, per history survey), which also means a per-process blocked-cache would be safe today but would break on a second machine.

### 4. Frontend (inspected: admin page, lib, auth context, sign-in, stream clients, specs)

- `AdminUsersPage.tsx` state is a discriminated union (`loading|ready{users}|not-found|error`, lines 9-13); the user list is set once in the effect (19-44) and never mutated. The row (`:73-76`) is an `<li className="admin-users-item">` with email, role, `Status: Blocked|Active`, joined date. No button, badge or mutation state exists; a Block action needs new per-row pending/error state and a way to update `users` (or refetch).
- `lib/admin-users.ts` has `listAdminUsers` only; `apiFetch` (`lib/api.ts:3-14`) attaches the bearer token. The closest existing write helper to copy is `startPlanGeneration` (`lib/plan-generation.ts:80-105`). `authFailureOf` maps 401/403 to `unauthorized`/`blocked` results (`lib/plan-generation.ts:71-75`).
- `index.css` has one global `button` style and no danger variant; no `window.confirm`, dialog or modal component exists in the inspected frontend source, so any confirmation step is new (an inline confirm/cancel in the row is the survey's suggestion, not a convention).
- Admin routing: `/admin/users` sits under `RequireAuth`, which only checks for a session; there is no frontend admin-only guard (`router/router.tsx:15-25`). The link is rendered only when `/me` role is `ADMIN` (`pages/HomePage.tsx:81-85`).
- A blocked user with a live token: first API call 403 → `handleAuthFailure` → `signOut('blocked')` → `RequireAuth` redirect → sign-in banner. `signOutReason` is in-memory React state, so the banner only shows if the 403 happened in the same SPA session (`auth/AuthProvider.tsx`).
- Supabase-side rejection on sign-in is not mapped: `auth/auth-errors.ts:5-11` maps only `invalid_credentials`, `user_already_exists`, `email_exists`, `weak_password`, `over_request_rate_limit`, with fallback to Supabase's raw `error.message` (`auth-errors.ts:15-18`). The exact message/code a banned user receives was not verified in this research (the Auth source I read confirms `user_banned` on the refresh path). That path would not show the "Your account has been blocked" banner.
- Streams: 401/403 is detected at connect time (`lib/plan-generation-stream.ts:50-51`), via polling fallback and `settleCompleted` in `lib/plan-generation-watch.ts`, all routed to `handleAuthFailure`. A mid-stream drop falls back to polling after repeated failures, so a user blocked mid-generation is signed out within the backoff plus a poll cycle (inference from the survey).
- Test setup: CLAUDE.md's "no test framework configured" for the frontend is stale. `frontend/package.json` has `"test": "vitest run"` with `@testing-library/react`, `jsdom` and two Vitest projects in `vite.config.ts` (`unit`: node `*.spec.ts`; `components`: jsdom `*.spec.tsx`); no `user-event` and no jest-dom, so tests use `fireEvent` and plain `expect(...).toBeTruthy()`. `AdminUsersPage.spec.tsx` mocks `../lib/admin-users` with a factory, so a new `blockAdminUser` export must be added to that factory. Existing tests count `getAllByText('Status: Blocked')`; new text should not duplicate that string.

### 5. External: Supabase Auth behaviour (Context7 docs + Auth server source; not repo-verified)

- Ban vs sessions (docs, guide "managing user data"): "A temporary ban only blocks sign-in for its duration and does not revoke existing sessions." Access tokens are stateless JWTs, valid until `exp`; deleting a user does not retroactively invalidate an issued token either.
- Refresh path (Auth source, `internal/tokens/service.go`): `RefreshTokenGrant` returns `user_banned` ("Invalid Refresh Token: User Banned") if `user.IsBanned()`. I did not independently inspect the password-sign-in path; the docs state a ban blocks sign-in.
- Hooks (docs + Auth source): the custom access token hook runs for all token issuance (including `token_refresh`), and a hook returning `{error:{message,http_code}}` is surfaced to the client as an HTTP error with that status (`internal/hooks/hookserrors`, `internal/tokens/service.go`). So the roadmap's "verify it can reject issuance" has a positive answer from source; the hook would need a deployed Postgres function or HTTP endpoint reading `blockedAt`, which is new infrastructure (not found anywhere in this repo).
- Neither option affects a JWT already issued; both options affect only new sign-ins and refreshes. Default access-token lifetime of 1 h is quoted in `sign-up-and-login/plan.md:27` and the docs say "usually between 5 minutes and 1 hour"; the project's actual JWT expiry setting was not inspected.
- Not verified: the exact `ban_duration` value format for a long/permanent ban and for lifting a ban.

### 6. Backend dependencies and config for a Supabase Admin call

- `@supabase/supabase-js` is not a backend dependency (`backend/package.json` lists `jose` and `@nestjs/config`; `grep supabase package.json` returns nothing; the survey found 0 `@supabase` entries in `package-lock.json`). `@supabase/supabase-js` exists in the frontend (imported in `frontend/src/auth/auth-errors.ts:1`).
- All backend env reads go through `process.env` directly, though `ConfigModule.forRoot({isGlobal:true})` is registered (`src/app.module.ts:15`); no code injects `ConfigService`. The boot-time-validated config pattern to copy is `readRequired(env, name, example)` behind a `Provider` and `Symbol` token (`src/plan-generation/plan-generation.config.ts:30-45`); `SUPABASE_URL` is read at `src/auth/jwks.provider.ts:9` and validated at boot (archived research cites `getSupabaseUrl` at `jwks.provider.ts:9-31`; the backend survey placed the throw-on-invalid logic around `:140-166`, so the exact range was not pinned).
- `SUPABASE_SECRET_KEY`: no code reads it; documented as "reserved for admin operations" (`context/foundation/tech-stack.md:33`) and as Fly-secrets-only (`context/foundation/infrastructure.md:80,98`); listed in `backend/.env.example` and in `context/deployment/deploy-plan.md:30,45`'s planned `fly secrets set`; whether it is actually set on Fly was never verified (`admin-user-list/research.md:56,132`). `backend/.env` and `backend/.env.example` exist now, which contradicts CLAUDE.md's "No `.env` files exist in either package yet"; I did not read `.env`.

## Code References

- `backend/src/auth/auth.guard.ts:34-60` - global guard; blocked check at `:50-53`
- `backend/src/auth/auth.module.ts:20` - `APP_GUARD` registration
- `backend/src/auth/supabase-jwt.verifier.ts:98-131` - local JWT verification, no block awareness
- `backend/src/profiles/profiles.service.ts:10-24` - per-request profile resolve/create/email-sync
- `backend/src/auth/admin.guard.ts:11-20` - role check, 404 for non-admin
- `backend/src/admin-users/admin-users.{controller,service,module}.ts` - existing read-only admin module
- `backend/test/admin-users.e2e-spec.ts` - e2e pattern with fake Prisma table and header guard
- `backend/prisma/schema.prisma:27-39` - `ProfileRole` and `Profile`
- `backend/src/plan-generation/plan-generation.controller.ts:83,91` - limiter acquire and fire-and-forget pipeline
- `backend/src/plan-generation/plan-stream.config.ts:3-5` - SSE heartbeat/window/max streams
- `backend/src/plan-generation/plan-generation.config.ts:30-45` - boot-validated env config pattern
- `frontend/src/lib/auth-failure.ts:7-10` - 403 → `signOut('blocked')`
- `frontend/src/pages/AdminUsersPage.tsx:73-76` - row with `Status` text
- `frontend/src/lib/admin-users.ts` - `listAdminUsers`, `AdminUser` type
- `frontend/src/auth/auth-errors.ts:5-18` - sign-in error mapping (no ban code)
- `context/foundation/roadmap.md:168-178` - S-07 definition, open Supabase-side unknown

## Architecture Insights

- **Enforcement lives in our DB, not in Supabase.** S-01 chose this deliberately because a ban does not invalidate issued tokens; the per-request profile read makes the block immediate. A Supabase-side ban/hook would be defence in depth on sign-in and refresh, not the primary gate.
- **Status-code convention:** the repo uses 404 for "not authorized to see this" (AdminGuard, saved-plans) and reserves 403 for "account blocked", on both backend and frontend. Any S-07 rule that needs an error for the *caller* (self-block, blocking an admin, target not found) should avoid 403 or the frontend change must distinguish it.
- **Key every access decision on `Profile.id`** (lessons.md): the block target is a uuid path param, validated like `saved-plans`; never an email.
- **Single-instance in-memory state** (jobs, limiter) is a standing deployment constraint; anything block-related held in memory shares it.

## Historical Context (from prior changes)

- `context/archive/2026-10-10-sign-up-and-login/plan.md:27` - settled: "A Supabase ban does not reliably invalidate an already-issued access token (default lifetime 1 h ...) — the reason blocking is enforced from our own `Profile.blockedAt` on every request." Supported by Supabase docs retrieved here; the 1 h figure is externally cited and not re-verified in the repo.
- `.../sign-up-and-login/plan.md:39-40` - S-01 explicitly excluded a blocking UI/endpoint ("`blockedAt` is set only by SQL until S-07") and any Supabase ban integration or `SUPABASE_SECRET_KEY` use. Supported: nothing in `src` writes `blockedAt` or reads the key.
- `.../sign-up-and-login/plan.md:250,255` and `reviews/plan-review.md:39-46` - user-approved: 403 → `signOut('blocked')` + sign-in banner. Supported by `auth-failure.ts`.
- `context/archive/2026-10-31-admin-user-list/plan.md:33,37` - S-06 deliberately avoided `@supabase/supabase-js`/the secret key and audit logging of admin reads. Supported: dependency absent. Audit logging for admin *writes* is undecided.
- `.../admin-user-list/research.md:31,109` - role-based 403 would collide with the frontend's meaning of 403; 404-for-unauthorized is the convention. Supported by `admin.guard.ts` and `auth-failure.ts`.
- `.../admin-user-list/research.md:52` - "`blockedAt` is set nowhere in application code today; S-07 introduces the writer." Still supported (grep).
- `.../admin-user-list/reviews/impl-review.md` F4 (accepted) - the e2e uses a header-driven guard; a real-`AuthGuard`+`AdminGuard` test (including blocked admin rejected first) was declined. Still true: untested.
- `.../admin-user-list/plan-brief.md:54` and `research.md:50` - `Profile` has no FK to `auth.users`; rows are created lazily on first API call, so a Supabase user who never called the API has no `Profile` and cannot be blocked via `blockedAt` nor appears in the list. Supported by `profiles.service.ts:10-24`.
- Stale or contradicted: `roadmap.md:192` ("Needs S-06", S-06 is done); `roadmap.md:164,198` still list "first admin" as open though S-06 settled it (manual SQL); `prd.md:116-118` says no open questions while the roadmap carries three; CLAUDE.md's "no frontend test framework" and "no `.env` files" lines are out of date. The roadmap Unknown at `:177` claim that a hook "can reject issuance" is now supported by the Auth source; its claim that Supabase still issues sessions to a blocked user is accurate today.
- PRD (settled): guardrail `prd.md:39` "A blocked user truly loses access — no bypass path to sign in or use the app"; FR-003 `prd.md:62`; Admin role `prd.md:105`; `prd.md:108` "A blocked member cannot sign in or use the app". The PRD is silent on unblock, self-block, blocking an admin, in-flight jobs and token expiry. Scale is small (`prd.md:8-11`), so the existing per-request DB read has no scale objection.

## Related Research

- `context/archive/2026-10-31-admin-user-list/research.md` - admin module, guard order, Profile lifecycle, stale CLAUDE.md note
- `context/archive/2026-10-10-sign-up-and-login/` (plan, plan-brief, reviews) - origin of the enforcement design
- `context/archive/2026-10-14-first-plan-generation/` and `2026-10-24-live-generation-progress/` (plans) - in-memory jobs, limiter, SSE window

## Open Questions

Each needs a decision in `/10x-plan` (none is answered in the code or `context/`):

1. **Supabase-side mechanism:** Admin API ban (needs `@supabase/supabase-js` or raw GoTrue calls, plus `SUPABASE_SECRET_KEY` as a boot-validated config), Auth Hook (needs a deployed hook function/endpoint reading `blockedAt`), or DB check only. Roadmap marks it as the user's call.
2. **Ordering and failure handling** of "set `blockedAt`" vs "apply the Supabase ban": which first, and what the admin sees if one step fails (not a transaction).
3. **Self-block and blocking an admin:** forbid, allow, or keep at least one admin; and with which status code (not 403, per the convention above).
4. **Unblock:** absent from PRD, roadmap and the S-07 outcome; S-01 only verified clearing `blockedAt` by SQL. If in scope, a ban must be lifted symmetrically.
5. **Target without a `Profile` row:** respond 404, or upsert a blocked profile.
6. **Idempotence:** repeat block on an already-blocked user (200 no-op vs 409).
7. **In-flight work:** cancel the blocked user's running job and open SSE streams, or accept ≤ 10 min of job time and ≤ 240 s of stream (needs a store method and an abortable pipeline).
8. **Is `SUPABASE_SECRET_KEY` set on Fly**, and the project's real JWT expiry and exact `ban_duration` value format (all unverified here).
9. **Audit logging** for the block action (no decision exists for admin writes).
10. **Frontend:** confirmation UX (no pattern exists), per-row pending/error state, how the list updates after a block, mapping a banned-user sign-in error, and updating the `AdminUsersPage.spec.tsx` mock factory.
