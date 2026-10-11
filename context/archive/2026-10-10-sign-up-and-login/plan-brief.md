# Sign Up and Log In — Plan Brief

> Full plan: `context/changes/sign-up-and-login/plan.md`

## What & Why

Roadmap S-01: a user can sign up and log in with email + password via Supabase Auth, gated SPA routes redirect to sign-in, and the API rejects unauthenticated calls to gated endpoints (PRD FR-001, US-01). It gates every user-facing slice — S-02 (the north star) needs a signed-in user — and this plan also lays the account foundation S-05/S-06/S-07 build on.

## Starting Point

No auth exists: the backend has only `GET /` and `GET /health`, no JWT library or guard; the frontend is the untouched Vite template with no router or supabase-js. The stack decision (supabase-js in the SPA, local JWKS verification in NestJS) is already settled in `tech-stack.md`. The shared Supabase DB holds only the `Exercise` table.

## Desired End State

A visitor is redirected to `/sign-in`, can register at `/sign-up`, and lands on a gated home that shows their email and role from `GET /me`; sign-out and sign-in return them where they were going. Any non-public API route without a valid Supabase token returns 401; a user whose `Profile.blockedAt` is set gets 403 everywhere — even with a still-valid JWT — and the SPA signs them out and shows a "blocked" banner on the sign-in page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Email confirmation | Off for v1 ("Confirm email" disabled) | Supabase's built-in mailer sends ~2 emails/hour to team addresses only; custom SMTP is deferred until opening to others. |
| User table | `Profile` now: `id` (= JWT `sub`), `email`, `role` MEMBER/ADMIN, `blockedAt`, `createdAt` | Gives S-05 a FK target and S-06/S-07 the role and blocking columns without retrofitting the guard. |
| Blocking enforcement | Guard returns 403 when `blockedAt` is set, on every request | A Supabase ban does not reliably revoke an issued access token (1 h lifetime), so enforcement lives in our DB. |
| Auth-provider outage | JWKS fetch failure → 503 (not 401); SPA keeps the session on 5xx | A paused or unreachable Supabase must not log every user out. |
| Route gating | Global `APP_GUARD`, fail-closed, `@Public()` opt-out on `/` and `/health` | New S-02+ endpoints are protected unless someone deliberately opts out. |
| Token verification | `jose` `createRemoteJWKSet` + `jwtVerify` (issuer, `aud=authenticated`, ES256/RS256) | Local verification, no per-request Supabase call; jose is ESM like the backend. |
| Profile writes | Find-or-create on each request; update only on email change; `P2002` re-read | One PK read per request, write only when needed, safe under concurrent first requests. |
| Screens | `/sign-up`, `/sign-in`, sign-out, gated placeholder home calling `GET /me` | Exactly the roadmap outcome; S-02 replaces the home with the plan form. |
| Router | React Router v8, `react-router` package only, declarative mode | v8 is current and removed `react-router-dom`. |
| Testing | Backend unit specs with a local ES256 key pair; frontend manual | Covers the security path deterministically; no shared-DB or network tests. |
| Review follow-ups | F1 DB-role check, F3 `Object.hasOwn`, F5 lint `prisma/` | F1 becomes load-bearing with a new RLS table; F3/F5 are cheap. |

## Scope

**In scope:** `Profile` model + migration (RLS on); JWKS verifier, global guard, `@Public`/`@CurrentUser`, `ProfilesService`, `GET /me`; sign-up/sign-in/home pages, `AuthProvider`, `RequireAuth`; Supabase/Fly configuration and a production run; review follow-ups F1/F3/F5.

**Out of scope:** email confirmation and SMTP, password reset, OAuth, admin UI/endpoints and first-admin designation (SQL only until S-06), setting `blockedAt` from the app (S-07), Supabase ban integration and `SUPABASE_SECRET_KEY`, FK to `auth.users`, frontend test framework, CI lint/test steps, RLS policies, rollback scripts.

## Architecture / Approach

SPA (supabase-js) → signs up/in against Supabase Auth → stores the session in localStorage → `apiFetch` sends `Authorization: Bearer <access_token>` → NestJS `AuthGuard` verifies the JWT against the cached JWKS → `ProfilesService` find-or-creates the `Profile` → 403 if blocked, else `request.user` is set → `GET /me` returns `{ id, email, role }`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Profile data model and catalog follow-ups | `Profile` table in Supabase with RLS; F1 checked, F3/F5 fixed | Migration hits the shared prod DB; wrong Fly DB role would make the table unreadable |
| 2. Backend authentication and GET /me | Fail-closed guard, profile resolution, 401/403, `GET /me`, unit specs | Project still on legacy HS256 keys → empty JWKS (checked first) |
| 3. Frontend sign-up, sign-in and gated home | Routed SPA with auth pages, redirect guard, `/me` round-trip | Session-loading flicker or redirect loops in `RequireAuth` |
| 4. Configuration and production verification | Supabase settings, Fly secret, deployed end-to-end check | Merging before `SUPABASE_URL` is set crashes the deployed backend |

**Prerequisites:** Supabase project un-paused; access to the Supabase dashboard, `fly` CLI and GitHub secrets; `SUPABASE_URL` added to local `backend/.env`.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes the Supabase project signs with asymmetric keys (default since 2025-10-01); Phase 2 checks the JWKS before relying on it.
- Assumes Fly's `DATABASE_URL` uses the table-owning `postgres.<ref>` user; Phase 1 verifies it.
- Sign-up is open to anyone with an unverified email until confirmation is turned on — acceptable for a solo v1.

## Success Criteria (Summary)

- A new user can sign up, sign in, sign out, and is redirected to sign-in from gated pages — locally and in production.
- The API returns 401 for unauthenticated gated calls and 403 for blocked users, with `/health` still public.
- Backend tests, lint and build pass; frontend lint and build pass.
