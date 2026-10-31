---
date: 2026-10-31T10:57:30+01:00
researcher: Jakub Brandys
git_commit: 75f797c4b494b1539828293c7a9d802973f15a38
branch: main
repository: 10xdevs
topic: "What does the codebase already provide for S-06 admin-user-list (admin views registered users; a member cannot reach it), and what must be decided before planning?"
tags: [research, codebase, auth, profiles, roles, admin, saved-plans, router]
status: complete
last_updated: 2026-10-31
last_updated_by: Jakub Brandys
---

# Research: admin-user-list (S-06)

**Date**: 2026-10-31T10:57:30+01:00
**Researcher**: Jakub Brandys
**Git Commit**: 75f797c4b494b1539828293c7a9d802973f15a38 (working tree clean apart from the new `context/changes/admin-user-list/` folder)
**Branch**: main
**Repository**: 10xdevs

## Research Question

`change.md` carries no intent, so the question comes from roadmap slice S-06 (`context/foundation/roadmap.md:155-166`) and PRD FR-002 (`context/foundation/prd.md:60`): _an admin can view the list of registered users; a member cannot reach it._ The research asks what the existing backend, frontend and prior change records already provide for that, which conventions a new admin endpoint and page must follow, and which decisions are still open.

## Summary

- **The role split already exists in data, but nothing enforces it.** `Profile.role` (`MEMBER` | `ADMIN`, default `MEMBER`) is in the schema (`backend/prisma/schema.prisma:27-39`). The global guard reads it from the Profile row by id and puts it on `request.user` (`backend/src/auth/auth.guard.ts:55-60`). `GET /me` returns it (`backend/src/profiles/me.controller.ts:8-10`) and `HomePage` displays it (`frontend/src/pages/HomePage.tsx:71-72`). In the inspected backend and frontend source there is no role guard, no `@Roles` decorator, no admin endpoint and no frontend role check.
- **There is no way to create an admin other than SQL.** S-01 deferred this on purpose (`context/archive/2026-10-10-sign-up-and-login/plan.md:38`). No seed or script sets `ADMIN` (`backend/prisma/seed.ts` seeds exercises only). "How is the first admin designated?" is open at `roadmap.md:164` and `roadmap.md:198`.
- **The only data source for "registered users" today is the `Profile` table.** The backend has no Supabase admin client and no `@supabase/supabase-js` dependency, and `SUPABASE_SECRET_KEY` appears only in `backend/.env.example`. Profile rows are created lazily on the first authenticated request, so `Profile` is a list of users who have called the API, not of every Supabase sign-up (see Detailed Findings).
- **A role-based 403 would collide with the frontend's meaning of 403.** In the inspected code every 403 means "account blocked": `handleAuthFailure` signs the user out and shows the blocked banner (`frontend/src/lib/auth-failure.ts:7-10`). A member hitting an admin endpoint that answers 403 would be signed out as "blocked" unless the frontend or the status choice changes. This is a design decision for the plan.
- **One CLAUDE.md statement is stale for this slice.** `frontend/` has Vitest configured and 8 spec files (`frontend/package.json:10,30`), so "no test framework configured yet" no longer holds for the frontend.

## Detailed Findings

### Authentication and request user (backend)

- JWT verification is `SupabaseJwtVerifier` (`backend/src/auth/supabase-jwt.verifier.ts:32-36`): `jwtVerify` against the Supabase JWKS with issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, algorithms ES256/RS256. It returns only `{id: sub, email}` (`:64`). The JWT `role` claim is Supabase's (`authenticated`), not the app role.
- `AuthGuard` is registered globally as `APP_GUARD` (`backend/src/auth/auth.module.ts:10`), so any controller reachable from `AppModule` is gated without `@UseGuards`. Opt-out is `@Public()` (`backend/src/auth/public.decorator.ts`), used on `AppController` and `HealthController` only.
- Guard order on a non-public route (`backend/src/auth/auth.guard.ts:34-60`): bearer token (401 `Missing bearer token`, `:45-47`) → `verifier.verify` (401 invalid / 503 JWKS unavailable, `:49`) → `profiles.resolve` (`:50`) → `blockedAt !== null` throws `ForbiddenException('Account is blocked')` (403, `:51-53`) → `request.user = {id, email, role}` taken from the DB Profile row (`:55-60`).
- `RequestUser = AuthUser & {role: ProfileRole}` (`backend/src/auth/auth-user.ts:9-11`); `@CurrentUser()` returns it (`backend/src/auth/current-user.decorator.ts:4-6`).
- In the inspected `backend/src`, `backend/test` and `backend/prisma` (excluding `src/generated`) there is no `RolesGuard`, no `@Roles()`, no `UseGuards`, no global exception filter and no global pipe. The only `role` usages are the type, the guard's attach, `/me`, the verifier's Supabase-claim check, and test fixtures that always use `role: 'MEMBER'`.
- The lesson in `context/foundation/lessons.md:5-10` (never authorize by email; key on `Profile.id`) is satisfied by the current code: `profiles.resolve` finds by id, and the role is read by id. An admin check must read `request.user.role` and must not compare emails.

### Profile model and how rows come to exist

- `Profile` (`backend/prisma/schema.prisma:32-39`): `id` uuid PK (no default, equals the JWT `sub`), `email` (no `@unique`, no index), `role` default `MEMBER`, `blockedAt` nullable, `createdAt` default now, relation `savedPlans`. No `@@index` on `Profile` besides the primary key.
- The migration `backend/prisma/migrations/20261010125707_create_profile` creates the enum and table and enables RLS with no policies. `role`, `blockedAt` and `createdAt` therefore already exist: a list endpoint needs no migration unless a new column or index is wanted.
- Rows are created lazily by `ProfilesService.resolve` (`backend/src/profiles/profiles.service.ts:10-24`): find by id, create on a miss (P2002 race re-read), update the email if it changed. It is the only public method; there are no list, block or role methods.
- Design intent recorded in S-01: no FK to `auth.users`, no cleanup of profiles whose auth user was deleted (`context/archive/2026-10-10-sign-up-and-login/plan.md:41-42`), and "one row per user who has called the API" (`plan.md:18`).
- In the current flow a new sign-up navigates to `/` when Supabase returns a session (`frontend/src/pages/SignUpPage.tsx:34-38`); `/` is `HomePage`, which calls `GET /me` (`frontend/src/pages/HomePage.tsx:29`), and that request creates the Profile. Inference from this inspected path: a sign-up that returns a session and loads the home page gets a Profile; a sign-up that returns no session (`SignUpPage.tsx:34`) or whose `/me` call never completes does not. Whether any Supabase user lacks a Profile in the live database was not checked.
- `blockedAt` is set nowhere in application code today; S-07 introduces the writer. The list will show `blockedAt` as always null until then unless set by SQL.

### Supabase as an alternative source

- `SUPABASE_SECRET_KEY` appears in `backend/.env.example:2` and is documented as reserved for admin operations (`context/foundation/tech-stack.md:33`). No code reads it; the backend README secrets table does not list it. Whether it is set on Fly was not verified (`fly secrets list` would show).
- Nothing in the inspected archives or tech-stack mentions `auth.admin.listUsers` for S-06. Using it would add a dependency and a server-side secret; reading `Profile` adds neither.

### Frontend routing, auth state and 403 handling

- Router: `react-router` ^8.4 data router (`frontend/src/router/router.tsx:11-25`). Gated routes are children of a pathless `RequireAuth` layout (`:14-23`): `index` HomePage, `/plans`, `/plans/new`, `/plans/:id`, `/plans/generate/:jobId`. A catch-all redirects to `/` (`:24`).
- `RequireAuth` checks only `session` and `loading` (`frontend/src/auth/RequireAuth.tsx:4-17`); there is no role-aware guard.
- Auth state is the raw Supabase `Session` in `AuthProvider` (`frontend/src/auth/auth-context.ts:6-13`); no derived `user`, `role` or `isAdmin`. The role is known only in `HomePage` local state (`HomePage.tsx:8-12,29`), so a nav link or guard elsewhere needs a shared role source or its own `/me` fetch.
- `handleAuthFailure(403)` calls `signOut('blocked')`; `401` calls `signOut()` (`frontend/src/lib/auth-failure.ts:7-15`). `SignInPage` shows "Your account has been blocked" for that reason. `authFailureOf` maps 401/403 to `unauthorized`/`blocked` result kinds (`frontend/src/lib/plan-generation.ts:71-75`).
- API access is `apiFetch` (plain `fetch` plus bearer token, `frontend/src/lib/api.ts:3-14`). Domain modules in `src/lib/*.ts` return discriminated unions and never throw (`listSavedPlans`, `frontend/src/lib/saved-plans.ts:65-81`), with `AbortSignal.timeout(15_000)`.
- Closest list page: `SavedPlansPage` (`frontend/src/pages/SavedPlansPage.tsx:40-69`): loading `<p className="status">`, error `role="alert"`, empty state, a `<ul>` list, "Back to home" link. There is no `<table>` anywhere in the inspected frontend, no shared layout or header, and `#root` is capped at `max-width: 28rem` (`frontend/src/index.css:32-36`), which matters for a multi-column list.
- The only navigation lives in `HomePage` (`HomePage.tsx:75-83`): an admin-only link would go there, conditioned on `state.me.role === 'ADMIN'`.
- Frontend tests: Vitest with two projects, `unit` (node, `src/**/*.spec.ts`) and `components` (jsdom, `src/**/*.spec.tsx`) (`frontend/vite.config.ts:6-24`). `SavedPlanPage.spec.tsx` loads the real `router.routes` into a memory router (reported at lines 274-290; not re-read here), so a new route is likely to be exercised by those tests.

### Backend conventions for a new endpoint

- Feature folder with module/controller/service and a co-located spec (`backend/src/saved-plans/`); modules import `PrismaModule`; `AppModule` imports the feature module; relative imports use a `.js` suffix.
- No DTO classes and no class-validator: zod v4 through `ZodValidationPipe` (`backend/src/plan-generation/zod-validation.pipe.ts:16-35`), used on `@Body` only so far. Response shapes are plain exported interfaces mapped from Prisma `select` consts (`backend/src/saved-plans/saved-plans.service.ts:14-45`); no envelope or interceptor.
- The closest list analogue is `SavedPlansService.list`: `findMany` with `select`, `orderBy [{createdAt:'desc'},{id:'desc'}]`, returning a bare unbounded array (`saved-plans.service.ts:100-107`). No pagination exists anywhere in non-spec `backend/src`. The save-and-view-plan plan lists "pagination or search of the list" as out of scope (`context/archive/2026-10-27-save-and-view-plan/plan.md:33`).
- Error style: built-in Nest exceptions; ownership failures answer 404, never 403, to avoid leaking existence (`saved-plans.service.ts`, `saved-plans.controller.ts:44-47`); machine codes via `HttpException({code}, status)`.
- Test patterns: controller unit specs construct the controller with a `vi.fn()` service and a fixed `RequestUser` (`saved-plans.controller.spec.ts:14-43`); guard specs use real `AuthGuard` with a local ES256 JWKS and a mocked `ProfilesService` (`backend/src/auth/auth.guard.spec.ts`); e2e specs replace the guard with a header-driven `HeaderUserGuard` that always sets `role: 'MEMBER'` and replace Prisma with an in-memory fake (`backend/test/saved-plans.e2e-spec.ts:24-39,64-176`). An admin e2e needs a guard that can set `role: 'ADMIN'` and a fake `profile.findMany`. `GET /me` has no spec.

### Prior decisions that bind or leave room

- Admin is "the participant, initially the only admin" (`prd.md:105`); a member "can manage their own profile and training plans only" (`prd.md:106`).
- First-admin designation was explicitly left to S-06 (`sign-up-and-login/plan.md:38`; `roadmap.md:164,198`). The PRD says no open questions were carried forward (`prd.md:116-118`), which does not match the roadmap's open question; the roadmap is the more recent record.
- Scale: `target_scale` is users small, qps low, data volume small (`prd.md:8-11`); the PRD sets no NFR for list size or latency.
- Migrations are forward-only (user decision, `exercise-catalog-seed/plan.md:51`; `sign-up-and-login/plan.md:47`), there is one shared Supabase database for dev and prod, and migrations run on push to `main` for `backend/**` changes via `.github/workflows/deploy-backend.yml` (reported by a worker; not re-read). Any new table needs a hand-appended `ENABLE ROW LEVEL SECURITY`.
- Boot-time env validation precedent: `getSupabaseUrl` in `backend/src/auth/jwks.provider.ts:9-31` throws at startup naming the bad variable. A new required env var would need a matching `fly secrets set` before merge.
- Accessibility items recorded in earlier plans: labelled inputs, `role="alert"` for errors, keyboard operability, visible `:focus-visible`, phone-width usability. No automated accessibility tooling is recorded.

## Code References

- `backend/prisma/schema.prisma:27-39` - `ProfileRole` enum and `Profile` model (no index besides PK)
- `backend/src/auth/auth.guard.ts:34-60` - global guard: public check, bearer, verify, resolve, blocked 403, attach `role`
- `backend/src/auth/auth.module.ts:10` - `APP_GUARD` registration
- `backend/src/auth/auth-user.ts:9-11` - `RequestUser` with `role`
- `backend/src/profiles/profiles.service.ts:10-24` - lazy Profile creation (`resolve`)
- `backend/src/profiles/me.controller.ts:5-10` - `GET /me` returns `{id, email, role}`
- `backend/src/saved-plans/saved-plans.service.ts:100-107` - closest list analogue
- `backend/test/saved-plans.e2e-spec.ts:24-39` - header-driven test guard (always MEMBER)
- `frontend/src/router/router.tsx:11-25` - route table; gated children of `RequireAuth`
- `frontend/src/auth/RequireAuth.tsx:4-17` - session-only guard
- `frontend/src/lib/auth-failure.ts:3-18` - 403 → `signOut('blocked')`
- `frontend/src/pages/HomePage.tsx:8-12,29,71-83` - `/me` fetch, role display, only navigation
- `frontend/src/pages/SavedPlansPage.tsx:40-69` - list page pattern
- `frontend/src/pages/SignUpPage.tsx:34-38` - sign-up navigates to `/` when a session exists
- `context/archive/2026-10-10-sign-up-and-login/plan.md:18,38,41-42` - one row per API user; first admin deferred; no FK to `auth.users`
- `context/foundation/roadmap.md:155-166,198` - S-06 definition and open question

## Architecture Insights

- Authorization is fail-closed by default (global `APP_GUARD`), and identity is by `Profile.id`. An admin check fits as a second layer on top (role guard/decorator or a check in the controller) reading `request.user.role`; the data it needs is already on the request.
- 404-for-unauthorized is the repository's convention for hiding resources (`saved-plans`), while 403 is reserved for blocked accounts in both backend (`auth.guard.ts`) and frontend (`auth-failure.ts`). The two conventions point to different answers for a non-admin on an admin route.
- The list is the first query not scoped to `request.user.id`; the existing contract and tests assert every call keys on `user.id` (`saved-plans.controller.spec.ts:73-87`), so cross-user exposure needs its own explicit test (member rejected).
- Output fields should be chosen deliberately: `Profile.email` comes from an unverified sign-up while Confirm email is off (`lessons.md:7`), so displaying it is fine but it must never drive any decision.

## Historical Context (from prior changes)

- `context/archive/2026-10-10-sign-up-and-login/plan.md` - introduced `Profile` with `role`/`blockedAt` so S-06/S-07 need no guard retrofit; deferred admin UI, admin endpoints and first-admin designation to S-06; accepted divergence between `Profile` and `auth.users`; blocked enforcement lives in our DB because a Supabase ban does not reliably invalidate an issued token (`plan.md:27`).
- `context/archive/2026-10-27-save-and-view-plan/plan.md:33` - list pagination/search ruled out of scope at PRD scale; list returns summaries ordered `createdAt desc, id desc`.
- `context/archive/2026-10-04-exercise-catalog-seed/plan.md:51` - forward-only migrations decision (2026-10-04).
- `context/foundation/roadmap.md:168-178` - S-07 (block user) builds on S-06; its Supabase-side enforcement question is separate.

## Related Research

- `context/archive/2026-10-14-first-plan-generation/research.md` - the only other `research.md` in the repo; it documents guard and module patterns this change reuses. No research exists for sign-up-and-login.

## Open Questions

1. **How is the first admin designated?** (user-owned, non-blocking per `roadmap.md:164`, but `/10x-plan` must pick a mechanism or explicitly keep it as manual SQL.) The lesson forbids an email-based designation; id-based options are SQL on `Profile.id`, or a seed/script keyed on id.
2. **Source of "registered users":** `Profile` table only, or also Supabase `auth.users` (needs the secret key and a new dependency)? Not decided in any prior record.
3. **Status for a non-admin on the admin endpoint:** 403 collides with the frontend's "blocked" handling; 404 matches the ownership convention. Either way the frontend needs a defined behavior for a member who navigates to the admin route.
4. **Frontend role source:** lift `/me` into `AuthProvider` or a new hook/context, or give the admin page its own `/me`-style check. Today only `HomePage` knows the role.
5. **List contents and shape:** which fields (`id`, `email`, `role`, `blockedAt`, `createdAt` exist; none beyond these), ordering, and whether pagination is skipped at PRD scale as in saved plans. The `Profile` table has no index on `createdAt`.
6. **Layout:** no table or wide-layout precedent; `#root` is `max-width: 28rem`.
7. **Unverified facts:** whether `SUPABASE_SECRET_KEY` is set on Fly, how many Profile/auth users exist in the shared database, and whether any Supabase user lacks a Profile. Those need a live check and were not performed.
