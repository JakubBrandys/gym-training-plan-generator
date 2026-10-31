# Admin User List — Plan Brief

> Full plan: `context/changes/admin-user-list/plan.md`
> Research: `context/changes/admin-user-list/research.md`

## What & Why

Add the first admin-only capability (roadmap S-06, PRD FR-002): an admin can view the list of registered users, and a member cannot reach it. The admin/member split exists in the data but nothing enforces it yet; this slice adds the enforcement S-07 (blocking) will reuse.

## Starting Point

`Profile` already has `role`, `blockedAt`, `createdAt` and `email`, and the global auth guard puts the DB-sourced role on `request.user`. There is no role guard, no admin endpoint, no way to make an admin except SQL, and the frontend only learns the role inside `HomePage`.

## Desired End State

An admin sees a "Registered users" link on the home page and a newest-first list on `/admin/users` (email, role, active/blocked, joined date). A member sees no link, and opening the URL or calling `GET /admin/users` gives a 404 / "Page not found" without signing them out. The first admin is designated by a documented SQL statement keyed on `Profile.id`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| First admin | Manual SQL on `Profile.id`, documented in the backend README | Matches S-01's recorded stance and adds no endpoint, secret or second source of truth. | Plan |
| Non-admin response | 404 with the unknown-route body | Follows the repo's 404-for-unauthorized convention and avoids the frontend's 403-means-blocked sign-out. | Plan |
| Who is listed | `Profile` rows only | No new dependency or secret; sign-up already lands on the home page, which creates the row. | Plan |
| List shape | `id`, `email`, `role`, `blockedAt`, `createdAt`; newest first, id tiebreak, no pagination | Gives S-07 what it needs and matches saved plans at the PRD's small scale. | Plan |
| Frontend role source | Link from the role `HomePage` already has; the page handles 404 | The backend stays the only authority and no shared state or guard is added. | Plan |
| Enforcement | Reusable `AdminGuard` via `@UseGuards`, keyed on `request.user.role` | Reads the role by id, never email, and S-07 can reuse it. | Research |
| Page layout | Stacked `<ul>` cards, no table | Fits the 28rem column and phone width and matches the saved-plans list. | Research |
| Schema | No migration or index | `role`, `blockedAt` and `createdAt` already exist. | Research |

## Scope

**In scope:** `AdminGuard`; `GET /admin/users`; unit and e2e specs; README "First admin" section; frontend lib, page, route and home link; styling; frontend specs; live manual check.

**Out of scope:** blocking users (S-07); pagination, search or filtering; Supabase `auth.users`; any change to the shared 403 handling; a frontend route guard or `/me` in `AuthProvider`; an admin-promotion endpoint or script; audit logging.

## Architecture / Approach

The global `AuthGuard` resolves the Profile and sets `request.user`. A controller-level `AdminGuard` then allows only `role === 'ADMIN'` and otherwise throws the same 404 Nest gives an unmatched route. `AdminUsersService.list` runs one `profile.findMany` with a five-field `select`. On the frontend, `listAdminUsers()` maps every outcome to a result union and `AdminUsersPage` renders list, empty, error and not-found states following `SavedPlansPage`, with the admin link shown from the role `HomePage` already fetches.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend admin endpoint | `AdminGuard`, `admin-users` module, `GET /admin/users`, specs, README first-admin SQL | A guard that fails open would expose all user emails; covered by member-denied and admin-looking-email tests plus a revert check. |
| 2. Frontend page and admin link | `/admin/users` page, route, home link, styling, specs, live check | A 403 anywhere would sign a member out as "blocked"; avoided by the 404 choice and a no-sign-out test. |

**Prerequisites:** S-01 is done; your own user id from Supabase dashboard → Authentication → Users for the manual check.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- The manual SQL runs against the single shared Supabase database, so promoting yourself changes production data.
- Users who signed up but never made an API call have no `Profile` and are not listed; the sign-up flow normally prevents this.
- `blockedAt` is set nowhere until S-07, so every row shows `Status: Active` unless set by SQL.
- Whether `SUPABASE_SECRET_KEY` is set on Fly was not verified; this plan does not need it.

## Success Criteria (Summary)

- An admin can open the user list from the home page and sees every Profile newest first.
- A member gets no link and a "Page not found" on the URL, and stays signed in.
- Backend and frontend lint, build and spec suites pass, including the member-denied cases.
