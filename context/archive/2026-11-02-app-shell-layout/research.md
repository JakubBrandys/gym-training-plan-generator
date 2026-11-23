---
date: 2026-11-02T18:38:05+01:00
researcher: Claude Sonnet 5.5
git_commit: 6ce1494c21b8b1af69290d86989d9c3f7926848b
branch: ui-redesign
repository: 10xdevs
topic: "Ground a shared app shell (header, nav, main, footer, auth layout) against the plain-CSS-variables contract"
tags: [research, codebase, ui, layout, app-shell, router, auth, specs]
status: complete
last_updated: 2026-11-02
last_updated_by: Claude Sonnet 5.5
---

# Research: Ground a shared app shell (header, nav, main, footer, auth layout)

**Date**: 2026-11-02T18:38:05+01:00
**Researcher**: Claude Sonnet 5.5
**Git Commit**: 6ce1494c21b8b1af69290d86989d9c3f7926848b
**Branch**: ui-redesign
**Repository**: 10xdevs

## Research Question

Audit the signed-in pages and the auth pages against the plain-CSS-variables contract (tokens in `frontend/src/index.css`, components in `frontend/src/components/`) to ground a shared app shell: sticky header with brand, nav, `email · role` and Sign out; a centred main wider than 28rem; a minimal footer; and a separate minimal layout for sign-in and sign-up. Answer six questions: (1) who should own `<main>`; (2) how role and email reach the header and how `handleAuthFailure`/`signOut` behave; (3) how Home changes; (4) which specs assert the moving parts; (5) auth pages, width and the `RequireAuth` loading placeholder; (6) which new states the shell adds and whether the kitchen sink and guard spec must cover them. Write 3–5 charges. No CSS proposals.

## Summary

There is no layout layer today. Gated routes are children of `RequireAuth`, which renders a bare `<Outlet />` (`frontend/src/auth/RequireAuth.tsx:16`, `frontend/src/router/router.tsx:28-37`), so every page draws its own chrome. The inspected `src/pages` files contain 10 `<main` openings in 8 files and 6 hand-written "Back to home" links in 5 files. The profile (`email`, `role`) is fetched in exactly one place, `HomePage.tsx:19`, so the header cannot show the Users link or `email · role` on any other page without a new shared source. `#root` caps every route at `28rem` (`index.css:37-41`), including sign-in, sign-up, the `RequireAuth` loading paragraph and the dev kitchen sink.

The cheapest shape found is a layout route under `RequireAuth` that renders `<header>`, the page's own `<main>` through `<Outlet />`, and `<footer>` as siblings. That needs 0 page markup changes because header, main and footer are siblings, not nested (inspected `src/pages`, `src/auth`, `src/router`). Having the shell own `<main>` would instead convert 10 openings in 8 files to non-`main` elements; no inspected spec queries the `main` landmark, so that costs markup edits but no spec edits.

The test impact is smaller than feared but has two traps. Two specs render the real `router.routes` (`SavedPlanPage.spec.tsx:274-292`, `AdminUsersPage.spec.tsx:178-189`) with `supabase` mocked as `{}` and `RequireAuth` mocked to `Outlet`, so a shell inside the route tree will run there and its `/me` call will throw inside `apiFetch`; the shell must treat that as a profile error without signing out and without crashing. And all 5 page specs mock `useAuth` with `session: null`, so any code reading `session.user.email` must tolerate `null`.

Five charges follow; C5 is low priority and partly deferrable.

## Charges

**C1 — Accidental architecture: no layout route, so every page draws its own navigation** (priority: high)
- Evidence: `RequireAuth` returns a bare `<Outlet />` (`frontend/src/auth/RequireAuth.tsx:16`); the router has no layout route besides it (`frontend/src/router/router.tsx:28-37`). "Back to home" is hand-written 6 times across 5 files (`NewPlanPage.tsx:166`, `AdminUsersPage.tsx:188,223`, `SavedPlanPage.tsx:82`, `PlanGenerationPage.tsx:202`, `SavedPlansPage.tsx:66`); `SavedPlanPage.tsx:79` adds a hand-written "My plans" link. The only other navigation is Home's three action links (`HomeView.tsx:43-50`). Sign out exists only in `HomeView.tsx:53`.
- User impact: from any page except Home, signing out or reaching another section means going back to Home first.

**C2 — Accidental architecture: one global width cap for every route** (priority: high)
- Evidence: `#root { max-width: 28rem; … }` (`frontend/src/index.css:37-41`) applies to all routes, including `/sign-in`, `/sign-up` (`router.tsx:25-26`), the bare `Loading…` paragraph in `RequireAuth.tsx:9`, and `/dev/kitchen-sink` (`router.tsx:12-22`). The auth pages use `<main className="auth">` (`SignInPage.tsx:61`, `SignUpPage.tsx:48,59`) and the class `auth` has no CSS rule (0 matches for `.auth` in `index.css`).
- User impact: on a desktop screen every signed-in page is a 28rem strip, and widening the cap for the shell would also stretch the sign-in and sign-up forms unless they keep their own narrow layout.

**C3 — Accidental architecture: the profile lives in `HomePage` state and sign-out handling is repeated per page** (priority: high)
- Evidence: `/me` is requested only at `HomePage.tsx:19` (grep over `src` excluding specs finds no other `apiFetch('/me')`); the backend returns `{ id, email, role }` (`backend/src/auth/me.controller.ts:5-11`), and `role` comes from the database profile, not from the token (`backend/src/auth/auth.guard.ts:47-60`). `handleAuthFailure(status, signOut)` (`frontend/src/lib/auth-failure.ts:3-18`: 403 → `signOut('blocked')`, 401 → `signOut()`) is called from 6 page files (`HomePage.tsx:26`, `NewPlanPage.tsx:51`, `SavedPlanPage.tsx:37`, `AdminUsersPage.tsx:45,96`, `SavedPlansPage.tsx:26`, `PlanGenerationPage.tsx:95,156`). `AuthProvider.signOut` sets `signOutReason` to `reason ?? null` before awaiting (`AuthProvider.tsx:29-31`), so a later `signOut()` without a reason clears an earlier `blocked`.
- User impact: the Users link and `email · role` cannot appear outside Home without a shared profile source, and a shell-level `/me` call adds a second signer-out: on this inspected path both a page request and the shell request return 403 for a blocked user, so the reason stays `blocked`, but a mixed 401/403 outcome would drop the blocked banner.

**C4 — Missing shared component: no shell, header, nav or footer primitives** (priority: high)
- Evidence: `frontend/src/components/` holds `Button`, `ButtonLink`, `button-class`, `PlanView`, `SavedPlanDetails` and their specs only. Navigation links are plain `<p><Link>` rows and plain `<a>`; there is no active-page indication (0 `NavLink` or `aria-current` matches in `src`). The global `:focus-visible` rule (`index.css:151-154`) already covers links, and `ButtonLink` already covers action buttons.
- User impact: nothing tells the user which section they are in, and every page ends differently (some with one link, some with two).

**C5 — Missing tokens: no content-width token, and the shell adds states the kitchen sink and guard do not cover** (priority: low; the token part is small, the coverage part is required)
- Evidence: the width is the literal `28rem` at `index.css:38`; header and footer surfaces can reuse `--bg`, `--border` and `--text-muted` (`index.css:2-11`), so no new colour token is needed. `KitchenSinkPage.tsx` renders `HomeView` states only, and `ui-contract.spec.ts:6-14` guards a fixed file list that does not include any shell file.
- User impact: none visible today; without kitchen-sink and guard coverage, the shell's loading, error and narrow-screen states would ship unreviewed and its files would not be scanned for colour literals.

**Deferred candidates (not charges):** a hamburger menu (3–4 links fit a wrapped row), a footer with links to pages that do not exist, a profile or settings page, per-page width variants, and the `GENERIC_PLAN_ERROR` rename already deferred in `home-ui-contract`.

## Detailed Findings

### (1) Who owns `<main>`

- Observed: `src/pages` has 10 `<main` openings in 8 files: `AdminUsersPage.tsx:183,195`, `SignInPage.tsx:61`, `HomeView.tsx:24`, `SignUpPage.tsx:48,59`, `PlanGenerationPage.tsx:164`, `SavedPlansPage.tsx:41`, `SavedPlanPage.tsx:57`, `NewPlanPage.tsx:74`. Each of the 9 `<h1>` elements in `src/pages` sits inside those `<main>` elements (`grep -n "<h1"`).
- Option A, pages keep `<main>` and the shell renders `<header>`, `<Outlet />`, `<footer>` as siblings: valid landmarks (banner, main, contentinfo are siblings), 0 page markup edits, and centring has to target the page's own `main`. Side effect: a skip-to-content link needs an `id` on each page's `<main>` or a `tabindex` target the shell can find, so it is cheaper to defer.
- Option B, the shell owns `<main>` and pages change their root: 10 openings in 8 files change, including the `AdminUsersPage.tsx:183` not-found branch and the `SignUpPage.tsx:48` confirmation branch; nested `<main>` is the failure this avoids. No inspected spec asserts the `main` landmark (grep over `src/**/*.spec.tsx` for `getByRole('main'`, `getAllByRole('main'`, `role: 'main'`, `banner`, `contentinfo`, `navigation`: 0 matches), so Option B costs markup edits but no spec edits.
- This is a design choice for the plan, not a defect. Recommendation if asked: Option A for this change.

### (2) How role and email reach the header; auth behaviour

- Email is also in `session.user.email` once a session exists, but `role` is only in `/me` (`me.controller.ts:5-11`; guard sets `role: profile.role` at `auth.guard.ts:56-60`), so the header needs the same `/me` result the Home page uses.
- The shell mounts once as a layout route and stays mounted across child navigations (inspected `createBrowserRouter` layout structure at `router.tsx:27-37`), so a shell-owned fetch runs once per shell mount, not per page. Home then needs to read the same result (shared hook or context, or an `Outlet` context) instead of fetching again.
- Failure behaviour to decide: for 401/403 the shell should call `handleAuthFailure(response.status, signOut)` like the pages (`auth-failure.ts:3-18`); for other failures it should show the nav without Users and not sign out.
- Dev note: under `StrictMode` the existing effect already runs twice in development (`main.tsx:9-13`); a shell fetch would too.

### (3) How Home changes

- `HomeView` currently renders `h1`, a `.status` line, `home-actions` with "Create a training plan", "My plans" and, for ADMIN, "Registered users" (`HomeView.tsx:42-51`), then Sign out (`HomeView.tsx:53-55`). With the header carrying "My plans", "Registered users", `email · role` and Sign out, Home keeps the heading and the primary "Create a training plan" action; its `signingOut` state and `onSignOut` prop move out of `HomePage.tsx:11,53-61`.
- `HomePage` still owns the Retry behaviour for its own profile read only if Home keeps reading `/me`; if the profile moves to a shared source, the Retry also moves to the source's owner (shell or Home) — a plan decision.

### (4) Specs that assert the moving parts

- "Back to home": 4 assertions in 3 specs: `SavedPlanPage.spec.tsx:170`, `AdminUsersPage.spec.tsx:144,156`, `SavedPlansPage.spec.tsx:129`. These pages are not edited if the "Back to home" links stay; if the links are removed (the stated intent), these 4 assertions are removed or rewritten.
- Home: `HomePage.spec.tsx` has 4 role-link tests for the Users link and My plans link (`:46-76`), plus my added tests for email/role, action hrefs, Retry and Sign out pending (`:79-137`). The Users-link and Sign out tests move to a shell spec; the email/role test moves with the profile.
- Real-router specs: `SavedPlanPage.spec.tsx:274-292` and `AdminUsersPage.spec.tsx:178-189` build `createMemoryRouter(router.routes, …)`, with `supabase` mocked as `{}` (`SavedPlanPage.spec.tsx:22`, `AdminUsersPage.spec.tsx:16`) and `RequireAuth` mocked to `Outlet` (`:23-26`, `:17-20`). A shell in `router.routes` will render there; `apiFetch` calls `supabase.auth.getSession()` (`api.ts:3-6`), which throws on `{}`. The shell must absorb that as a profile error. Their assertions find headings by name (`level: 1`, `name: 'New training plan'` / `'Saved plan'` / `'Registered users'`), so a shell brand that is not a heading does not collide.
- `useAuth` mocks return `session: null` in 5 page specs (`AdminUsersPage.spec.tsx:67`, `HomePage.spec.tsx:35`, `PlanGenerationPage.spec.tsx:81`, `SavedPlanPage.spec.tsx:117`, `SavedPlansPage.spec.tsx:56`); shell code reading `session.user.email` needs a null guard.
- `AdminUsersPage.spec.tsx:154` asserts `queryByRole('heading')` is null for the not-found page in a `MemoryRouter` that renders only that page (`AdminUsersPage.spec.tsx:53-58`), so a shell heading would not affect it, but a heading-free shell is the safe choice.

### (5) Auth pages, width and the loading placeholder

- `/sign-in` and `/sign-up` are top-level routes outside `RequireAuth` (`router.tsx:25-26`); a separate minimal layout means a second layout route or a wrapper for those two routes, not a change to their forms. Their class `auth` has no CSS rule today.
- `RequireAuth` renders `<p className="status">Loading…</p>` while the session resolves (`RequireAuth.tsx:8-10`); if the shell is a child of `RequireAuth`, that placeholder shows unframed and the shell appears after it, a visible layout jump on first load. The plan can either accept that or wrap the placeholder in the shell frame.
- The signed-in user visiting `/sign-in` is redirected (`SignInPage.tsx:38-40`), unchanged by a layout route.

### (6) New states, kitchen sink and guard

- States the shell adds: profile loading (nav visible, Users link absent, `email · role` slot reserved to avoid a jump), profile error (nav stays; Retry placement is a decision), sign-out pending (moves from Home with its tests), narrow-screen wrap at 375 px, active nav link (react-router's `NavLink` sets `aria-current="page"` on the active link), and keyboard focus on nav links (covered by the global `:focus-visible` rule at `index.css:151-154`). A skip-to-content link is optional (see Option A in finding 1).
- Coverage: `KitchenSinkPage.tsx` currently imports only `Button` and `HomeView` (`KitchenSinkPage.tsx:1-4`); it needs shell cases (member, admin, loading, error, pending sign-out) for the 7-state gate. The guard `GUARDED_FILES` list (`ui-contract.spec.ts:6-14`) needs the new shell files; shell rules in `index.css` are scanned automatically by the existing outside-the-token-blocks check.
- The `CLAUDE.md` UI block should mention the shell once it exists, in the repo-owned part above the CLI marker.

### Lessons applied

- `context/foundation/lessons.md` "Never authorize by email — key access on Profile.id": the header shows the email for display only and gates the Users link on `role` from `/me`; access stays enforced by the backend guard, so this is consistent with the lesson.
- "Amend plan.md when implementation deviates from its contract": the plan for this change should expect Deviation notes, as in `home-ui-contract`.

## Code References

- `frontend/src/auth/RequireAuth.tsx:8-16` - loading placeholder, redirect, bare `<Outlet />`
- `frontend/src/router/router.tsx:12-38` - dev route, public auth routes, gated children, catch-all
- `frontend/src/index.css:37-41` - global `#root` 28rem cap
- `frontend/src/index.css:147-154` - link colour and global `:focus-visible`
- `frontend/src/pages/HomePage.tsx:19` - the only `/me` request
- `frontend/src/pages/HomeView.tsx:24-56` - Home markup incl. actions and Sign out
- `frontend/src/lib/auth-failure.ts:3-18` - 401/403 sign-out mapping
- `frontend/src/auth/AuthProvider.tsx:29-31` - `signOut` and `signOutReason`
- `backend/src/auth/me.controller.ts:5-11` - `/me` response shape
- `backend/src/auth/auth.guard.ts:47-60` - 403 for blocked, `role` from profile
- `frontend/src/pages/SavedPlanPage.spec.tsx:274-292`, `frontend/src/pages/AdminUsersPage.spec.tsx:178-189` - specs that render the real router
- `frontend/src/ui-contract.spec.ts:6-14` - guarded file list

## Architecture Insights

- The app is "pages with chrome": each page file owns its landmarks, its heading and its way back; `RequireAuth` is the only shared route element and carries no UI. The cheapest shell therefore wraps pages rather than restructuring them.
- Auth handling is duplicated per call site because the lib functions return `unauthorized`/`blocked` kinds that each page maps to `handleAuthFailure`; a shell-owned fetch is a new, parallel call site, not a replacement.
- The existing UI contract holds up: tokens are colour-only plus `--radius`, `ButtonLink` covers action links, and the guard scans `index.css` outside the token blocks, so shell CSS written with existing tokens is checked automatically.

## Historical Context (from prior changes)

- `context/archive/2026-10-31-admin-user-list/research.md:67` says the only navigation lives in `HomePage` (`HomePage.tsx:75-83`). Verdict: supported in substance (the only navigation is Home's action links), with the anchor moved to `HomeView.tsx:42-51` after `home-ui-contract`.
- `context/archive/2026-10-31-admin-user-list/research.md:62` says `RequireAuth` checks only session and loading. Verdict: supported (`RequireAuth.tsx:4-17`).
- `context/archive/2026-10-31-admin-block-user/research.md:68` says a blocked user's first API call gets 403, then `handleAuthFailure`, `signOut('blocked')`, redirect and the sign-in banner. Verdict: supported (`auth-failure.ts:7-10`, `SignInPage.tsx:32,63-67`).
- `context/archive/2026-10-10-sign-up-and-login/plan.md:250` says Home signs out and navigates with router state `{ blocked: true }` on 403. Verdict: superseded by the Deviation at `plan.md:255`; the current code keeps the reason in `AuthProvider` state (`AuthProvider.tsx:29-31`).
- `context/changes/home-ui-contract/research.md` charge C4 deferred exactly this work (shared layout, nav, `28rem` cap); `home-ui-contract` delivered `Button`, `ButtonLink`, tokens, the kitchen sink and the guard that this change builds on (`69fc23b`).

## Related Research

- `context/changes/home-ui-contract/research.md` - the audit that deferred charge C4
- `context/archive/2026-10-31-admin-user-list/research.md`, `context/archive/2026-10-31-admin-block-user/research.md` - routing and blocked-user behaviour

## Open Questions

- **Plan decision, who owns the profile:** shell-owned fetch exposed to Home (context or `Outlet` context) versus Home keeping its own fetch and the shell fetching separately (two `/me` calls). Research found no existing shared-state mechanism to reuse.
- **Plan decision, who owns `<main>`:** Option A (pages keep `<main>`) versus Option B (shell owns it); Option A is the lower-cost path found.
- **Plan decision, "Back to home" links:** the stated intent removes them, which edits 5 page files and 4 spec assertions in 3 specs; keeping them is also possible while the header exists.
- **Product choice:** footer wording ("AI-generated plans, not medical advice") is not in `prd.md` or `roadmap.md` (grep for header/footer/nav/layout/shell found no layout requirement); the owner should confirm it.
- **Not seen in a browser:** the signed-in app has not been viewed with this shell design; the 375 px wrap behaviour is untested until the kitchen sink exists.
- **Plan scope:** whether the loading placeholder in `RequireAuth.tsx:9` is framed by the shell or left as is.
