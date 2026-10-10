# Sign Up and Log In — Implementation Plan

## Overview

Roadmap item S-01 (Stream B, milestone M-1): a user can sign up and log in with email + password through Supabase Auth, an unauthenticated user hitting a gated SPA route is redirected to sign-in, and the NestJS API rejects unauthenticated requests to gated endpoints (PRD FR-001, US-01, Access Control). This slice also lays the account foundation the next slices consume: a `Profile` row per user (stable FK target for saved plans in S-05) carrying `role` and `blockedAt`, with the "blocked users truly lose access" rule (PRD `prd.md:39,108`) already enforced by the API guard so S-06/S-07 only add admin endpoints. It folds in three follow-ups from the exercise-catalog review (DB role verification, seed level check, linting `prisma/`).

## Current State Analysis

- **Backend auth is absent.** No JWT library, guard, decorator or middleware exists; the only routes are `GET /` (`backend/src/app.controller.ts:8`) and `GET /health` (`backend/src/health/health.controller.ts:9-22`, used by Fly's health check, `backend/fly.toml:25`). `ExercisesModule` has no controller. Env vars are read with raw `process.env` everywhere (`main.ts:7,9`, `prisma.service.ts:12`); `ConfigModule.forRoot({ isGlobal: true })` is registered (`app.module.ts:11`) but `ConfigService` is never injected.
- **The backend is ESM** (`backend/package.json:8` `"type": "module"`, tsconfig `nodenext`), NestJS 12, Node 24 locally. CORS is `enableCors({ origin: FRONTEND_URL.split(',') })` (`main.ts:6-8`) with default allowed headers, which reflect the request's `Access-Control-Request-Headers` — so an `Authorization` header passes preflight without config changes.
- **Data:** the Prisma schema holds only `Exercise`/`ExerciseLevel` (`backend/prisma/schema.prisma:11-25`); one migration, which enables RLS with no policies (`prisma/migrations/20261004181902_create_exercise/migration.sql:22`). Nothing references users.
- **Frontend is the untouched Vite template:** deps are only `react`/`react-dom` 19.2; `src/App.tsx` is the counter demo; no router, no supabase-js, no `import.meta.env` usage, no `vite-env.d.ts`. `frontend/.env.example` lists `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` but not `VITE_API_URL`. `frontend/wrangler.jsonc:6-9` already sets `not_found_handling: "single-page-application"`, so client routes like `/sign-in` deep-link correctly.
- **CI/deploy:** `deploy-frontend.yml:28-31` already passes all three `VITE_*` secrets to `npm run build`. `deploy-backend.yml` runs `prisma:migrate:deploy` then `flyctl deploy`; runtime env comes only from Fly secrets — `SUPABASE_URL` is listed as an intended secret (`context/deployment/deploy-plan.md:42-45`) but nothing reads it yet. Neither workflow runs lint or tests.
- **Shared database:** one Supabase project serves dev and prod; migrations are forward-only and applied locally before merge so the CI migrate step is a no-op (pattern from the archived exercise-catalog plan).

## Desired End State

A visitor opens the SPA, is redirected from `/` to `/sign-in`, follows a link to `/sign-up`, registers with email + password and lands on the gated home, which shows their email and role fetched from `GET /me`. Signing out returns them to `/sign-in`; logging back in returns them to the page they originally requested. A request to any non-public API route without a valid Supabase access token gets 401; a user whose `Profile.blockedAt` is set gets 403 on every gated route even while their JWT is still valid, and the SPA signs them out and shows a "blocked" banner on the sign-in page. The `Profile` table exists in Supabase with RLS on, one row per user who has called the API.

Verify: `npm test`, `npm run lint`, `npm run build` pass in `backend/`; `npm run lint` and `npm run build` pass in `frontend/`; the deployed SPA completes sign-up → home → sign-out → sign-in against the deployed API; `curl` to `/me` without a token returns 401.

### Key Discoveries:

- `context/foundation/tech-stack.md:33` — settled: supabase-js (publishable key) in the frontend; NestJS verifies JWTs locally via `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`; the secret key is reserved for admin operations, not routine request auth (so this slice needs no `SUPABASE_SECRET_KEY`).
- `jose` 6 (ESM-only, fits the ESM backend): `createRemoteJWKSet` caches keys 10 min with a 30 s cooldown on unknown `kid`, so it must be a singleton. `jwtVerify(token, jwks, { issuer: '<SUPABASE_URL>/auth/v1', audience: 'authenticated', algorithms: ['ES256', 'RS256'] })` checks `exp`/`nbf`; `role === 'authenticated'` and a non-empty `sub`/`email` are checked by hand. New Supabase projects sign with asymmetric keys by default since 2025-10-01; a project still on the legacy HS256 secret serves an empty JWKS — checked in Phase 2 (https://supabase.com/docs/guides/auth/jwts, /signing-keys).
- Supabase "Confirm email" is on by default for hosted projects; with it off, `signUp` returns a session immediately. The built-in mailer sends ~2 emails/hour and only to project-team addresses (https://supabase.com/docs/guides/auth/auth-smtp), hence the decision to turn confirmation off for v1.
- A Supabase ban does not reliably invalidate an already-issued access token (default lifetime 1 h; https://supabase.com/docs/guides/auth/sessions) — the reason blocking is enforced from our own `Profile.blockedAt` on every request.
- supabase-js 2.117: `persistSession`/`autoRefreshToken` default on (localStorage); use the **synchronous** `onAuthStateChange` callback (the async overload is deprecated for deadlock risk); read the token via `getSession()` right before each API call so a refreshed token is used.
- React Router is now v8 (8.4): install `react-router` only (`react-router-dom` was removed), declarative mode with `BrowserRouter`/`Routes`/`Route`/`Navigate`/`Outlet` imported from `react-router`; requires React ≥ 19.2.7, Vite ≥ 7 — both met.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (Prisma 7 flag, confirmed via `--help` on 2026-10-10) diffs the live DB against the schema read-only, without a shadow database — the way to author the second migration.
- Review follow-ups (archived `2026-10-04-exercise-catalog-seed`, review of 2026-10-07): F1 the runtime `DATABASE_URL` role must own RLS tables or have `BYPASSRLS` (local `.env` uses `postgres.<ref>` for both URLs; Fly unverified); F3 `backend/prisma/seed.ts:41` `e.level in LEVELS` accepts prototype keys; F5 `backend/package.json:17` lints only `src/ test/`.

## What We're NOT Doing

- No email confirmation, custom SMTP, or "check your email" flow — "Confirm email" is turned off for v1; revisit before opening sign-up to others.
- No password reset / "forgot password" — needs working email delivery; a locked-out user is reset manually in the Supabase dashboard.
- No OAuth providers — email + password only.
- No admin UI or admin endpoints, and no way to designate the first admin — `role` defaults to `MEMBER` and is changed only by SQL until S-06 (roadmap open question "how is the first admin designated?" stays with S-06).
- No blocking UI or endpoint — `blockedAt` is set only by SQL until S-07; this slice enforces it but does not set it.
- No Supabase ban (`auth.admin.updateUserById`) integration and no use of `SUPABASE_SECRET_KEY`.
- No FK from `Profile.id` to `auth.users` — Prisma does not model Supabase's `auth` schema; the id is trusted from the verified JWT `sub`.
- No profile editing, no account deletion, no cleanup of profiles whose auth user was deleted.
- No frontend test framework — frontend auth is verified manually (decision recorded for a later slice).
- No backend e2e auth tests against real Supabase tokens — guard behavior is unit-tested with locally generated keys.
- No CI lint/test steps added to the deploy workflows.
- No RLS policies on `Profile`, and no Data API access — RLS on with none, backend-only, same as `Exercise`.
- No rollback scripts — migrations are forward-only.

## Implementation Approach

Four phases, each verifiable on its own; the production-touching steps (migration, Fly secret, dashboard settings) are isolated and ordered so a merge never deploys a backend that cannot boot.

1. **Data model + follow-ups** — `Profile` model and `ProfileRole` enum, migration authored with `migrate diff --from-config-datasource` and applied locally, RLS appended by hand; F1 DB-role check documented; F3 and F5 fixes.
2. **Backend auth** — a `jose`-based verifier on a singleton JWKS provider, a global `AuthGuard` (fail-closed) with `@Public()` opt-out, `ProfilesService` find-or-create, 403 for blocked profiles, `GET /me`, and unit specs signing tokens with a locally generated ES256 key pair.
3. **Frontend auth** — supabase-js client, React Router v8, an `AuthProvider` + `RequireAuth` layout route, sign-up / sign-in pages, a gated home that calls `GET /me`, sign-out; the Vite template is removed.
4. **Configuration and production check** — Supabase dashboard settings, Fly `SUPABASE_URL` secret set before merge, env examples completed, and a manual end-to-end run on the deployed stack including a SQL-driven block.

Identity is the Supabase user id (JWT `sub`, a UUID) used directly as `Profile.id`.

## Critical Implementation Details

- **State sequencing** — The backend refuses to start without `SUPABASE_URL` (Phase 2). Merging to `main` deploys the backend, so `fly secrets set SUPABASE_URL=...` must happen before the merge (Phase 4 step 1), and the migration must be applied locally before the merge (Phase 1) so CI's migrate step is a no-op. The local `backend/.env` also needs `SUPABASE_URL`, or `npm run start:dev` and `npm run test:e2e` stop booting.
- **Timing & lifecycle** — The guard runs for every request, so the JWKS set must be created once at module init (a provider), never per request; and concurrent first requests from a new user can race on the profile insert, so the create path must tolerate a unique-violation (`P2002`) by re-reading the row instead of failing the request.

## Phase 1: Profile data model and catalog follow-ups

### Overview

Add the `Profile` table with its role enum, generate and apply the second migration with RLS, and close the three exercise-catalog review follow-ups.

### Changes Required:

#### 1. Prisma schema

**File**: `backend/prisma/schema.prisma`

**Intent**: Give every authenticated user a row in our database: a stable FK target for saved plans (S-05), and the place where role (S-06) and blocking (S-07) live, so enforcement does not depend on Supabase token revocation.

**Contract**: `enum ProfileRole { MEMBER ADMIN }` and `model Profile` with `id String @id @db.Uuid` (the Supabase auth user id / JWT `sub`), `email String`, `role ProfileRole @default(MEMBER)`, `blockedAt DateTime?`, `createdAt DateTime @default(now())`. Table name `Profile`. No relations; `Exercise` unchanged.

#### 2. Second migration

**File**: `backend/prisma/migrations/<UTC yyyymmddhhmmss>_create_profile/migration.sql`

**Intent**: Create the enum and table against the shared database without a shadow database, and close the table to the Supabase Data API.

**Contract**: SQL produced by `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (run from `backend/`; it reads the live DB through `DIRECT_URL`, read-only), reviewed to contain only `CREATE TYPE "ProfileRole"` and `CREATE TABLE "Profile"` (no `DROP`/`ALTER` of existing objects), then ending with a hand-appended `ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;` and no policies — the same rule and comment as the first migration. Applied with `npm run prisma:migrate:deploy`, then `npm run prisma:generate`.

#### 3. DB role requirement (review F1)

**File**: `backend/README.md` ("Deployment" section)

**Intent**: Make the RLS assumption explicit and checked, since the guard now reads and writes an RLS-enabled table on every request: a non-owning role would see no rows and fail every profile insert.

**Contract**: a short note that `DATABASE_URL` and `DIRECT_URL` must both connect as the `postgres.<project-ref>` user (the role that runs migrations and therefore owns every table) or a role with `BYPASSRLS`, how to check the Fly value's username without printing the password, and that every new table needs `ENABLE ROW LEVEL SECURITY` appended to its migration by hand.

#### 4. Seed level check (review F3)

**File**: `backend/prisma/seed.ts`

**Intent**: The shape check accepts inherited keys such as `"toString"` as a level; restrict it to the three real levels.

**Contract**: `isSeedExercise` (`seed.ts:41`) uses `Object.hasOwn(LEVELS, e.level)` instead of `e.level in LEVELS`. No other behavior change.

#### 5. Lint coverage (review F5)

**File**: `backend/package.json`

**Intent**: Bring the seed script and Prisma config under the type-aware lint (including `no-floating-promises`), which today covers only `src/` and `test/`.

**Contract**: the `lint` script becomes `oxlint --type-aware src/ test/ prisma/ prisma.config.ts`. Any findings it surfaces in those files are fixed in this phase.

### Success Criteria:

#### Automated Verification:

- Schema validates: `cd backend && npx prisma validate`
- Migration SQL creates both objects, enables RLS, and touches nothing else: `grep -q 'CREATE TYPE "ProfileRole"'`, `grep -q 'CREATE TABLE "Profile"'` and `grep -q 'ENABLE ROW LEVEL SECURITY'` on `backend/prisma/migrations/*_create_profile/migration.sql`, and `grep -c 'DROP\|ALTER TABLE "Exercise"'` on the same file prints 0
- Migration applies, then reports nothing pending on re-run, and the schema matches the DB: `cd backend && npm run prisma:migrate:deploy` twice, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` exits 0
- Client regenerates; tests, lint (now including `prisma/`) and build pass: `cd backend && npm run prisma:generate && npm test && npm run lint && npm run build`

#### Manual Verification:

- In the Supabase SQL editor, `select relrowsecurity from pg_class where relname = 'Profile'` returns `true` and `_prisma_migrations` lists `<ts>_create_profile` as finished
- The Fly app's `DATABASE_URL` user is `postgres.<project-ref>`: `fly ssh console -C "sh -c 'echo \$DATABASE_URL | cut -d: -f2'"` prints `//postgres.<project-ref>` (username only, no password); if it differs, stop and resolve before Phase 2
- `backend/README.md` states the role requirement and the RLS-per-table rule

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Backend authentication and GET /me

### Overview

Verify Supabase access tokens locally, gate every route by default, resolve each caller to a `Profile`, reject blocked users, and expose `GET /me` as the first gated endpoint.

### Changes Required:

#### 1. Token verification

**File**: `backend/src/auth/jwks.provider.ts`, `backend/src/auth/supabase-jwt.verifier.ts`

**Intent**: Turn a bearer token into a trusted identity without calling Supabase per request, and keep the key source injectable so tests can sign tokens with a local key pair.

**Contract**: a provider under an exported injection token (e.g. `SUPABASE_JWKS`) whose factory reads `SUPABASE_URL` (throwing a clear startup error if unset) and returns a single `createRemoteJWKSet(new URL('<SUPABASE_URL>/auth/v1/.well-known/jwks.json'))`. An `@Injectable() SupabaseJwtVerifier` with `verify(token: string): Promise<AuthUser>`, where `AuthUser = { id: string; email: string }`; it calls `jwtVerify` with issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, algorithms `['ES256', 'RS256']`, then requires `role === 'authenticated'`, a non-empty `sub` and `email`, and `is_anonymous !== true`. Token-level failures — jose's `JWTExpired`, `JWTClaimValidationFailed`, `JWTInvalid`, `JWSInvalid`, `JWSSignatureVerificationFailed`, `JOSEAlgNotAllowed`, `JOSENotSupported`, `JWKSNoMatchingKey`, and the hand-checked claims above — throw `UnauthorizedException` (401). Any other error (e.g. `JWKSTimeout`, a network or non-200 failure fetching the JWKS while Supabase is paused or unreachable) throws `ServiceUnavailableException` (503), so an auth-provider outage never reads as "your token is invalid". Either way access is denied, and the underlying jose error is not echoed to the client. Adds dependency `jose`.

#### 2. Profile resolution

**File**: `backend/src/profiles/profiles.service.ts`, `backend/src/profiles/profiles.module.ts`

**Intent**: Ensure every verified user has a `Profile`, kept in sync with their auth email, without writing on every request.

**Contract**: `ProfilesService.resolve(user: AuthUser): Promise<Profile>` — `findUnique` by id; if absent, `create({ id, email })`, and on a `P2002` unique violation re-read the row; if present with a different email, update the email; otherwise return as-is. `ProfilesModule` imports `PrismaModule` and exports `ProfilesService`.

#### 3. Global guard and decorators

**File**: `backend/src/auth/auth.guard.ts`, `backend/src/auth/public.decorator.ts`, `backend/src/auth/current-user.decorator.ts`, `backend/src/auth/auth.module.ts`, `backend/src/app.module.ts`

**Intent**: Fail closed: every current and future route requires a valid token unless explicitly marked public, and blocked users lose access even while their JWT is still valid.

**Contract**: `@Public()` sets metadata read through `Reflector.getAllAndOverride` (handler, then class). `AuthGuard implements CanActivate`: public route → allow; otherwise require `Authorization: Bearer <token>` (missing or malformed → 401), verify (→ 401 for an invalid token, 503 when the JWKS is unreachable, per the verifier), `ProfilesService.resolve`, `blockedAt !== null` → `ForbiddenException` (403); on success attach `request.user = { id, email, role }`. `@CurrentUser()` is a param decorator returning `request.user`. `AuthModule` imports `ProfilesModule`, provides the JWKS provider and verifier, and registers the guard as `APP_GUARD`; `AppModule` imports `AuthModule`.

#### 4. Public routes and GET /me

**File**: `backend/src/app.controller.ts`, `backend/src/health/health.controller.ts`, `backend/src/profiles/me.controller.ts`

**Intent**: Keep the root and the Fly health check reachable without a token, and give the SPA one gated endpoint that proves the token round-trip.

**Contract**: `AppController` and `HealthController` are marked `@Public()` at class level. `MeController` (`@Controller('me')`, registered in `ProfilesModule`): `GET /me` returns `{ id, email, role }` of `@CurrentUser()`.

#### 5. Unit specs

**File**: `backend/src/auth/auth.guard.spec.ts`, `backend/src/profiles/profiles.service.spec.ts`

**Intent**: Pin the security-critical behavior deterministically, without network or the shared database.

**Contract**: the guard spec generates an ES256 key pair with `jose` (`generateKeyPair`, `exportJWK`), overrides `SUPABASE_JWKS` with `createLocalJWKSet`, signs tokens with `SignJWT`, uses a mocked `ProfilesService`, and covers: public route allowed with no header; missing header → 401; non-Bearer scheme → 401; valid token → allowed and `request.user` set; expired token → 401; wrong issuer → 401; wrong audience → 401; token signed by a different key → 401; `role` other than `authenticated` → 401; JWKS that rejects with a fetch error → 503; blocked profile → 403. The service spec uses a mocked `PrismaService` and covers: existing profile returned without writes; missing profile created; email change updated; `P2002` on create resolved by re-reading. Follows the `Test.createTestingModule` pattern of `backend/src/exercises/exercises.service.spec.ts`.

#### 6. Env example

**File**: `backend/.env.example`

**Intent**: Document the new required variable for local setup.

**Contract**: adds `SUPABASE_URL=https://<project-ref>.supabase.co` (placeholder, no real value). **Edited by hand by the user** — the agent's permission rules deny access to `.env*` files, so the implementer asks for this line instead of writing it.

### Success Criteria:

#### Automated Verification:

- Guard and profile specs pass: `cd backend && npx vitest run src/auth/auth.guard.spec.ts src/profiles/profiles.service.spec.ts`
- Full unit suite passes: `cd backend && npm test`
- Linting passes, including `no-floating-promises`: `cd backend && npm run lint`
- Build passes: `cd backend && npm run build`

#### Manual Verification:

- The project serves asymmetric signing keys: `curl -s "$SUPABASE_URL/auth/v1/.well-known/jwks.json"` returns a `keys` array with at least one key (`kty` `EC` or `RSA`); if it is empty, migrate the project to asymmetric JWT signing keys in the Supabase dashboard (Project Settings → JWT Keys) before continuing
- With `SUPABASE_URL` in `backend/.env`, `cd backend && npm run start:dev` boots; `curl -i localhost:3000/health` returns 200, `curl -i localhost:3000/me` returns 401, and `curl -i -H 'Authorization: Bearer garbage' localhost:3000/me` returns 401
- With `SUPABASE_URL` removed from the environment, `npm run start:dev` fails at startup with an error naming `SUPABASE_URL`
- `backend/.env.example` contains the `SUPABASE_URL` placeholder line (added by hand)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Frontend sign-up, sign-in and gated home

### Overview

Replace the Vite template with a routed SPA: a Supabase client, session state, sign-up and sign-in pages, a redirecting guard for gated routes, and a home that calls `GET /me`.

### Changes Required:

#### 1. Dependencies and typed env

**File**: `frontend/package.json` (+ `package-lock.json`), `frontend/src/vite-env.d.ts`, `frontend/.env.example`

**Intent**: Add the auth client and router, and make the three build-time variables typed so a misspelled variable name fails `tsc -b` instead of silently reading `undefined`.

**Contract**: dependencies `@supabase/supabase-js` and `react-router` (v8; not `react-router-dom`). `vite-env.d.ts` references `vite/client` and declares `ImportMetaEnv` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` as `string`. `.env.example` gains `VITE_API_URL=http://localhost:3000` — **edited by hand by the user**, since the agent's permission rules deny access to `.env*` files. Commit the updated lockfile (the deploy workflow runs `npm ci`).

#### 2. Supabase client and API helper

**File**: `frontend/src/lib/supabase.ts`, `frontend/src/lib/api.ts`

**Intent**: One shared auth client, and one place that attaches the current access token to backend calls.

**Contract**: `supabase` is a module-level `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)` with default options (persisted session, auto refresh). `apiFetch(path, init?)` reads the token with `supabase.auth.getSession()` immediately before each call, sends `Authorization: Bearer <access_token>` to `VITE_API_URL + path`, and returns the `Response`; it does not swallow non-2xx statuses.

#### 3. Session state and route guard

**File**: `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/RequireAuth.tsx`

**Intent**: Expose the current session to the app and redirect unauthenticated visitors from gated routes to sign-in, remembering where they were going.

**Contract**: `AuthProvider` holds `{ session, loading }`, seeds from `getSession()`, subscribes with the synchronous `onAuthStateChange` callback and unsubscribes on unmount; `useAuth()` returns `{ session, loading, signOut }`. `RequireAuth` is a layout route: while `loading`, render a minimal placeholder (no redirect); with no session, `<Navigate to="/sign-in" replace state={{ from: location }} />`; otherwise `<Outlet />`.

#### 4. Pages and routing

**File**: `frontend/src/pages/SignUpPage.tsx`, `frontend/src/pages/SignInPage.tsx`, `frontend/src/pages/HomePage.tsx`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/index.html`, template files under `frontend/src/`

**Intent**: The minimal user-facing flow for FR-001, with the home as a placeholder S-02 replaces with the plan form.

**Contract**:
- Routes: `/sign-up` and `/sign-in` are public; `/` sits under `RequireAuth`; unknown paths redirect to `/`. A signed-in user visiting `/sign-in` or `/sign-up` is redirected to `/`. `main.tsx` wraps the app in `BrowserRouter` and `AuthProvider`.
- Sign-up: labelled email and password fields (password `minLength={6}`, Supabase's default minimum) and a link to sign-in; calls `supabase.auth.signUp`; on success with a session navigates to `/`; if no session comes back (confirmation unexpectedly on) shows "Check your email to confirm your account"; Supabase error messages are shown inline; the submit button is disabled while the request is pending.
- Sign-in: same form shape with a link to sign-up; calls `signInWithPassword`; on success navigates to `location.state.from` or `/`; errors inline; when `location.state.blocked` is set, shows the banner "Your account has been blocked" above the form.
- Home: calls `apiFetch('/me')` on mount and shows the email and role; on 403 signs out and navigates to `/sign-in` with `state: { blocked: true }` (showing the message on Home would be lost, because signing out makes `RequireAuth` redirect immediately); on 401 signs out (which redirects to `/sign-in`); 5xx and network failures show a generic "try again" error and do **not** sign out (a 503 means the auth provider is unreachable, not that the session is bad); includes a sign-out button.
- The Vite demo content is removed: `App.tsx` contains only routing, unused template assets and CSS are deleted, and the `index.html` title becomes the app name.

### Success Criteria:

#### Automated Verification:

- Frontend lint passes, including `react/rules-of-hooks`: `cd frontend && npm run lint`
- Frontend typechecks and builds: `cd frontend && npm run build`
- No `react-router-dom` import or dependency: `! grep -rq 'react-router-dom' frontend/src frontend/package.json`

#### Manual Verification:

- With both dev servers running (`backend: npm run start:dev`, `frontend: npm run dev`), opening `http://localhost:5173/` redirects to `/sign-in`
- Sign up with a new email lands on home showing that email and role `MEMBER`; a `Profile` row with that email exists in Supabase
- Sign out returns to `/sign-in`; signing in again lands on home; reloading the page keeps the session
- Opening `/` while signed out, then signing in, returns to `/` (the remembered location)
- Wrong password and an already-registered email each show an inline error and stay on the form
- Set `blockedAt = now()` on that profile in the Supabase SQL editor, reload home: the user is signed out and `/sign-in` shows the "Your account has been blocked" banner; clear `blockedAt` and sign in again successfully
- The browser console shows no CORS error on the `/me` call
- `frontend/.env.example` contains the `VITE_API_URL` placeholder line (added by hand)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Configuration and production verification

### Overview

Configure Supabase and Fly for the new flow, merge in the safe order, and verify the full flow on the deployed stack.

### Changes Required:

#### 1. Supabase project settings

**File**: Supabase dashboard (no repo file)

**Intent**: Make sign-up return a session immediately and point auth redirects at the real SPA.

**Contract**: Authentication → Sign In / Providers → Email: "Confirm email" off. Authentication → URL Configuration: Site URL = the production Worker URL; Redirect URLs include `http://localhost:5173/**`.

#### 2. Deploy configuration

**File**: Fly secrets, GitHub secrets (no repo file)

**Intent**: Give the deployed backend what it now requires at boot, and confirm the frontend build points at the deployed API, before the merge triggers both deploys.

**Contract**: `fly secrets set SUPABASE_URL=https://<project-ref>.supabase.co` on `gym-training-plan-generator-api` **before** merging; `FRONTEND_URL` on Fly includes the production Worker origin; the GitHub `VITE_API_URL` secret is the Fly app's `https://<app>.fly.dev` URL.

#### 3. Runbook note

**File**: `backend/README.md` ("Deployment" section)

**Intent**: Record the new secret and the Supabase settings so a fresh environment can be set up again.

**Contract**: lists `SUPABASE_URL` as a required Fly secret and the two Supabase auth settings above ("Confirm email" off for v1, Site URL / Redirect URLs).

### Success Criteria:

#### Automated Verification:

- Runbook lists the new secret: `grep -q 'SUPABASE_URL' backend/README.md`

#### Manual Verification:

- After the merge deploys, the public health check is unaffected: `curl -s -o /dev/null -w '%{http_code}' https://<app>.fly.dev/health` prints 200 (run after merge)
- After the merge deploys, the API rejects unauthenticated gated calls: `curl -s -o /dev/null -w '%{http_code}' https://<app>.fly.dev/me` prints 401 (run after merge)
- `fly secrets list` shows `SUPABASE_URL` before the merge, and the backend deploy after the merge reaches a healthy state
- On the production Worker URL: `/` redirects to `/sign-in`; sign-up with a new email lands on home showing the email; sign-out and sign-in work; a deep link to `/sign-in` loads directly
- Blocking in production: set `blockedAt` on that profile via SQL, reload home, land on `/sign-in` with the blocked banner; clear it afterwards
- A `Profile` row exists for the production test user, confirming the runtime role can read and write the RLS-enabled table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `auth.guard.spec.ts`: public bypass; missing/malformed header; valid token sets `request.user`; expired, wrong issuer, wrong audience, foreign key, non-`authenticated` role → 401; JWKS fetch failure → 503; blocked profile → 403 — all with a locally generated ES256 key pair, no network
- `profiles.service.spec.ts`: existing profile without writes; create on first sight; email sync; `P2002` race resolved by re-read — mocked `PrismaService`

### Integration Tests:

- None automated by decision: no test database (the single Supabase DB is shared with production) and no frontend test framework yet. The token round-trip, profile creation and blocking are verified manually in Phases 3 and 4. The existing `test/app.e2e-spec.ts` keeps working because `GET /` is `@Public()` (it needs `SUPABASE_URL` and `DATABASE_URL` in `backend/.env`, as before for the DB).

### Manual Testing Steps:

1. Local: sign up, see home with email and `MEMBER`, sign out, sign in, reload — session persists.
2. Local: visit `/` signed out, sign in, return to `/`; wrong password and duplicate email show inline errors.
3. Local and production: set `blockedAt` via SQL → signed out, blocked banner on `/sign-in`; clear it.
4. Production: `curl` `/health` → 200 and `/me` → 401; full sign-up/sign-in flow on the Worker URL.

## Performance Considerations

Each authenticated request adds one indexed primary-key read on `Profile` (a write only on first sight or email change) through the transaction pooler, and local JWT verification with keys cached by `jose` for 10 minutes — negligible at this scale. No per-request call to Supabase Auth.

## Migration Notes

- One shared Supabase DB: the migration is additive (one enum, one table) and is applied locally in Phase 1 before merge, so the `deploy-backend.yml` migrate step finds nothing to do.
- Order before merge: migration applied (Phase 1) → `SUPABASE_URL` Fly secret set and Supabase settings changed (Phase 4) → merge. Merging triggers both deploys; the backend boots only if `SUPABASE_URL` is present.
- The Supabase free tier pauses after ~1 week idle; un-pause before Phases 1 and 4.
- Forward-only: no rollback scripts. Undoing anything is a new migration. Profiles created during testing can be deleted with SQL; the matching auth users are deleted in the Supabase dashboard.

## References

- Roadmap: `context/foundation/roadmap.md:94-104` (S-01); PRD: `context/foundation/prd.md:39,56-63,101-108`
- Tech stack (auth decision): `context/foundation/tech-stack.md:33`; infra secrets: `context/foundation/infrastructure.md:76,80,98`
- Existing patterns: `backend/src/exercises/exercises.service.spec.ts`, `backend/src/prisma/prisma.service.ts:10-14`, `backend/src/main.ts:6-8`, archived migration `backend/prisma/migrations/20261004181902_create_exercise/migration.sql:22`
- Review follow-ups: archived change `context/archive/2026-10-04-exercise-catalog-seed/` (findings F1, F3, F5 of the 2026-10-07 review)
- Supabase: https://supabase.com/docs/guides/auth/jwts, https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/passwords, https://supabase.com/docs/guides/auth/auth-smtp, https://supabase.com/docs/guides/auth/sessions
- jose: https://github.com/panva/jose; React Router v8: https://reactrouter.com/start/declarative/installation

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Profile data model and catalog follow-ups

#### Automated

- [x] 1.1 Schema validates: `cd backend && npx prisma validate` — cca2aa7
- [x] 1.2 Migration SQL creates both objects, enables RLS, and touches nothing else: `grep -q 'CREATE TYPE "ProfileRole"'`, `grep -q 'CREATE TABLE "Profile"'` and `grep -q 'ENABLE ROW LEVEL SECURITY'` on `backend/prisma/migrations/*_create_profile/migration.sql`, and `grep -c 'DROP\|ALTER TABLE "Exercise"'` on the same file prints 0 — cca2aa7
- [x] 1.3 Migration applies, then reports nothing pending on re-run, and the schema matches the DB: `cd backend && npm run prisma:migrate:deploy` twice, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` exits 0 — cca2aa7
- [x] 1.4 Client regenerates; tests, lint (now including `prisma/`) and build pass: `cd backend && npm run prisma:generate && npm test && npm run lint && npm run build` — cca2aa7

#### Manual

- [x] 1.5 In the Supabase SQL editor, `select relrowsecurity from pg_class where relname = 'Profile'` returns `true` and `_prisma_migrations` lists `<ts>_create_profile` as finished — cca2aa7
- [x] 1.6 The Fly app's `DATABASE_URL` user is `postgres.<project-ref>`: `fly ssh console -C "sh -c 'echo \$DATABASE_URL | cut -d: -f2'"` prints `//postgres.<project-ref>` (username only, no password); if it differs, stop and resolve before Phase 2 — cca2aa7
- [x] 1.7 `backend/README.md` states the role requirement and the RLS-per-table rule — cca2aa7

### Phase 2: Backend authentication and GET /me

#### Automated

- [x] 2.1 Guard and profile specs pass: `cd backend && npx vitest run src/auth/auth.guard.spec.ts src/profiles/profiles.service.spec.ts`
- [x] 2.2 Full unit suite passes: `cd backend && npm test`
- [x] 2.3 Linting passes, including `no-floating-promises`: `cd backend && npm run lint`
- [x] 2.4 Build passes: `cd backend && npm run build`

#### Manual

- [x] 2.5 The project serves asymmetric signing keys: `curl -s "$SUPABASE_URL/auth/v1/.well-known/jwks.json"` returns a `keys` array with at least one key (`kty` `EC` or `RSA`); if it is empty, migrate the project to asymmetric JWT signing keys in the Supabase dashboard (Project Settings → JWT Keys) before continuing
- [x] 2.6 With `SUPABASE_URL` in `backend/.env`, `cd backend && npm run start:dev` boots; `curl -i localhost:3000/health` returns 200, `curl -i localhost:3000/me` returns 401, and `curl -i -H 'Authorization: Bearer garbage' localhost:3000/me` returns 401
- [x] 2.7 With `SUPABASE_URL` removed from the environment, `npm run start:dev` fails at startup with an error naming `SUPABASE_URL`
- [x] 2.8 `backend/.env.example` contains the `SUPABASE_URL` placeholder line (added by hand)

### Phase 3: Frontend sign-up, sign-in and gated home

#### Automated

- [ ] 3.1 Frontend lint passes, including `react/rules-of-hooks`: `cd frontend && npm run lint`
- [ ] 3.2 Frontend typechecks and builds: `cd frontend && npm run build`
- [ ] 3.3 No `react-router-dom` import or dependency: `! grep -rq 'react-router-dom' frontend/src frontend/package.json`

#### Manual

- [ ] 3.4 With both dev servers running (`backend: npm run start:dev`, `frontend: npm run dev`), opening `http://localhost:5173/` redirects to `/sign-in`
- [ ] 3.5 Sign up with a new email lands on home showing that email and role `MEMBER`; a `Profile` row with that email exists in Supabase
- [ ] 3.6 Sign out returns to `/sign-in`; signing in again lands on home; reloading the page keeps the session
- [ ] 3.7 Opening `/` while signed out, then signing in, returns to `/` (the remembered location)
- [ ] 3.8 Wrong password and an already-registered email each show an inline error and stay on the form
- [ ] 3.9 Set `blockedAt = now()` on that profile in the Supabase SQL editor, reload home: the user is signed out and `/sign-in` shows the "Your account has been blocked" banner; clear `blockedAt` and sign in again successfully
- [ ] 3.10 The browser console shows no CORS error on the `/me` call
- [ ] 3.11 `frontend/.env.example` contains the `VITE_API_URL` placeholder line (added by hand)

### Phase 4: Configuration and production verification

#### Automated

- [ ] 4.1 Runbook lists the new secret: `grep -q 'SUPABASE_URL' backend/README.md`

#### Manual

- [ ] 4.2 After the merge deploys, the public health check is unaffected: `curl -s -o /dev/null -w '%{http_code}' https://<app>.fly.dev/health` prints 200 (run after merge)
- [ ] 4.3 After the merge deploys, the API rejects unauthenticated gated calls: `curl -s -o /dev/null -w '%{http_code}' https://<app>.fly.dev/me` prints 401 (run after merge)
- [ ] 4.4 `fly secrets list` shows `SUPABASE_URL` before the merge, and the backend deploy after the merge reaches a healthy state
- [ ] 4.5 On the production Worker URL: `/` redirects to `/sign-in`; sign-up with a new email lands on home showing the email; sign-out and sign-in work; a deep link to `/sign-in` loads directly
- [ ] 4.6 Blocking in production: set `blockedAt` on that profile via SQL, reload home, land on `/sign-in` with the blocked banner; clear it afterwards
- [ ] 4.7 A `Profile` row exists for the production test user, confirming the runtime role can read and write the RLS-enabled table
