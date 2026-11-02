# Admin Block User — Plan Brief

> Full plan: `context/changes/admin-block-user/plan.md`
> Research: `context/changes/admin-block-user/research.md`

## What & Why

Let an admin block a member from the registered-users page (FR-003, roadmap S-07). The PRD guardrail is that a blocked user truly loses access, with no bypass path to sign in or use the app. Blocking sets `Profile.blockedAt` and bans the user at Supabase so sign-in and token refresh stop too.

## Starting Point

The enforcement half already exists: the global `AuthGuard` returns 403 for any profile with `blockedAt` set, reading the profile on every request. Nothing writes `blockedAt`, the backend has no Supabase client or secret, and the admin page lists users with a `Status` but has no actions. The frontend already signs a user out with a blocked banner on any 403.

## Desired End State

An admin presses Block on a member, confirms inline, and the row flips to Blocked. That member's API calls return 403, Supabase refuses their sign-in and refresh, and admins (including the caller) cannot be blocked. If the Supabase ban fails, the app-side block stays and a Re-apply block button repeats the ban.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Per-request enforcement | Keep the existing DB check as the primary gate | Already holds for live tokens; Supabase cannot revoke issued JWTs | Research |
| Supabase-side block | Admin API ban (`ban_duration: 876000h`) | Meets "cannot sign in" and lives in reviewable backend code | Plan |
| Write ordering | Set `blockedAt` first, then ban; keep the block if the ban fails (502) | A Supabase outage must never leave API access open | Plan |
| Who can be blocked | Members only; self and admins get 409, never 403 | Avoids locking out the sole admin; 403 would sign the caller out | Plan |
| Unblock | Out of scope; manual SQL plus lifting the ban, documented | Roadmap outcome covers blocking only; deadline is tight | Plan |
| Running jobs and streams | Let them finish; every next request gets 403 | Exposure is bounded (one job, ≤10 min, ≤240 s stream) and avoids touching the pipeline | Plan |
| Block of an already-blocked user | Keep original `blockedAt`, re-apply the ban | Makes a retry repair a failed ban | Plan |
| User with no `Profile` row | 404 | Such a user is not listed, so the UI cannot target them | Plan |
| Endpoint | `POST /admin/users/:id/block`, 200 with the updated summary, uuid param answers 404 | Follows the saved-plans pattern and lets the UI swap the row | Plan |
| UI | Inline Confirm/Cancel, Re-apply block for blocked members | No dialog pattern exists; retry must be possible from the UI | Plan |

## Scope

**In scope:** Supabase admin client and boot-validated `SUPABASE_SECRET_KEY`, block endpoint and service, README (secret, manual unblock), admin-page Block action, tests in both packages.

**Out of scope:** unblock, cancelling running jobs or streams, audit logging, blocking admins, schema changes, Auth Hook, mapping Supabase's banned-sign-in error to the banner, pagination.

## Architecture / Approach

`AdminUsersService.block(id)` reads the target, rejects admins (409), sets `blockedAt` if null, then calls a new injectable `SupabaseAdminClient.banUser(id)`, and answers 502 if only the ban fails. The client and its config live in a new `supabase-admin` module imported by `AdminUsersModule`. The frontend adds `blockAdminUser` and per-row state on `AdminUsersPage`, routing 401/403 through the existing `handleAuthFailure`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Supabase admin client, config, `POST /admin/users/:id/block`, README, tests | New required secret: backend won't start until `SUPABASE_SECRET_KEY` is set locally and on Fly |
| 2. Frontend | Block / Re-apply block action with inline confirm, pending and error states | Row state and error handling on a page that currently has no mutations |

**Prerequisites:** S-06 (done); `SUPABASE_SECRET_KEY` available from the Supabase project; a throwaway test user (dev and prod share one database).
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- `SUPABASE_SECRET_KEY` was never verified as set on Fly; the backend refuses to start without it once this ships.
- The exact error Supabase returns to a banned user's sign-in was not verified; it is recorded in Phase 1 manual verification.
- Env files are read-protected here, so adding the key to `.env` and `.env.example` is a manual step.
- The real `AuthGuard` plus `AdminGuard` chain stays untested end to end (the e2e uses a header-driven guard), as in S-06.

## Success Criteria (Summary)

- An admin can block a member from the admin page and the row shows Blocked.
- The blocked member cannot sign in or refresh at Supabase, and any live session is signed out with the banner on its next request.
- Admins and the caller cannot be blocked, and a failed Supabase ban is visible and retryable.
