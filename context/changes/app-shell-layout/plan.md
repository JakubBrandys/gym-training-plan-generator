# App Shell Layout Implementation Plan

## Overview

Add a shared app shell for the signed-in pages: a header with the brand, nav (Create plan, My plans, Users for admins), `email · role` and Sign out; a wider centred main; and a minimal footer. The shell fetches `/me` once and shares it through a small context hook, and sign-in and sign-up get a separate narrow layout. The 6 hand-written "Back to home" links go, Sign out leaves Home, and Home becomes a short welcome with one primary action. It extends the existing plain-CSS-variables system from `home-ui-contract`; no new dependency.

## Current State Analysis

- No layout layer: `RequireAuth` returns a bare `<Outlet />` (`frontend/src/auth/RequireAuth.tsx:16`) and the router has no layout route besides it (`frontend/src/router/router.tsx:28-37`). Every page draws its own chrome: the inspected `src/pages` files hold 10 `<main` openings in 8 files and 6 "Back to home" links in 5 files (`NewPlanPage.tsx:166`, `AdminUsersPage.tsx:188,223`, `SavedPlanPage.tsx:82`, `PlanGenerationPage.tsx:202`, `SavedPlansPage.tsx:66`).
- The profile (`email`, `role`) is requested only at `HomePage.tsx:19`; `role` exists only in `/me` (`backend/src/auth/me.controller.ts:5-11`; `backend/src/auth/auth.guard.ts:51-58`). Sign out exists only in `HomeView.tsx:53` with its pending state in `HomePage.tsx:11,53-61`.
- `#root { max-width: 28rem }` (`frontend/src/index.css:37-41`) caps every route, including sign-in, sign-up, the `RequireAuth` loading paragraph and `/dev/kitchen-sink`. The class `auth` has no CSS rule.
- `handleAuthFailure(status, signOut)` (`frontend/src/lib/auth-failure.ts:3-18`) maps 403 to `signOut('blocked')` and 401 to `signOut()`; `AuthProvider.signOut` writes `signOutReason` as `reason ?? null` before awaiting (`AuthProvider.tsx:29-31`), so a later reason-less call clears `blocked`.
- Contract in place from `home-ui-contract`: tokens in `index.css` (colour plus `--radius`), `Button` and `ButtonLink` in `frontend/src/components/`, the dev-only kitchen sink at `/dev/kitchen-sink`, and the guard `frontend/src/ui-contract.spec.ts` that scans a fixed file list and `index.css` outside the token blocks.
- Specs: 4 "Back to home" assertions in 3 specs (`SavedPlanPage.spec.tsx:170`, `AdminUsersPage.spec.tsx:144,156`, `SavedPlansPage.spec.tsx:129`); two specs render the real `router.routes` with `supabase` mocked as `{}` and `RequireAuth` mocked to `Outlet` (`SavedPlanPage.spec.tsx:274-292`, `AdminUsersPage.spec.tsx:178-189`); 5 page specs mock `useAuth` with `session: null`.

## Desired End State

Every signed-in page sits in one frame: a header (brand link, nav with exactly one active link where a section applies, `email · role`, Sign out), the page's own `<main>` centred at a wider column, and a muted footer line. The header is sticky from a width breakpoint up and scrolls away on narrow screens. Sign-in and sign-up render in a separate narrow centred layout. `/me` is requested once per shell mount and read through `useProfile()`. Home shows a "Welcome" heading, one sentence and the primary "Create a training plan" button. A dev-only kitchen sink shows every shell state, and the guard spec scans the new files.

Verification: the per-phase checks below, plus screenshots at 1280 px and 375 px in light and dark.

### Key Discoveries:

- Landmarks stay valid when pages keep `<main>` and the shell renders `<header>`, the Outlet and `<footer>` as siblings: 0 page markup edits. No inspected spec queries the `main` landmark.
- A shell inside `router.routes` runs in the two real-router specs; their `apiFetch` rejects (`supabase` is `{}`, `frontend/src/lib/api.ts:3-6`), so the profile source must turn a rejected request into an error state without calling `signOut`.
- `NavLink`'s default prefix match would light My plans and Create plan together on `/plans/new`; the chosen rule is explicit per link.
- The brand must not be a heading: `AdminUsersPage.spec.tsx:154` asserts no heading, and real-router specs query headings by name.
- Code style from the project: `const` arrow functions and no code comments in `frontend/` code.

## What We're NOT Doing

- No hamburger menu, no skip-to-content link (needs an id on each page's `<main>`), no footer links, no profile or settings page, no per-page widths.
- No framing of the `RequireAuth` "Loading…" paragraph: it stays unframed.
- No removal of the "My plans" link inside `SavedPlanPage` (`SavedPlanPage.tsx:79`), no change to the "Back to sign in" link on the sign-up confirmation, and no change to the "Start again" and "Create another plan" links on the generation page.
- No `Card` component, no spacing or type-scale tokens, no change to the `#fff` at `.plan-exercise-image`, no `GENERIC_PLAN_ERROR` rename (still deferred from `home-ui-contract`).
- No backend change and no new dependency; no Tailwind, shadcn or Playwright dependency.
- No "Recent plans" preview or any other new data on Home.

## Implementation Approach

Build bottom-up: the shared profile source first (no visible change), then the tokens and shell components (not yet mounted), then wire the routes and rewrite Home and the pages in one phase, then show every state in the kitchen sink and screenshot it, and finally extend the guard and the rule. Settled decisions: the shell fetches `/me` once and shares it through a context hook; pages keep `<main>`; the active rule is section-aware (My plans on `/plans` and `/plans/:id`, Create plan on `/plans/new` and `/plans/generate/:jobId`, Users on `/admin/users`, none on `/`); the header is sticky from a breakpoint up (40rem) and static below; the footer reads "Gym Training Plan Generator · AI-generated plans, not medical advice"; Home is "Welcome", one muted sentence and the primary action. The header takes email and role from `/me`, not from the session, and a failed `/me` keeps the nav and Sign out while hiding only the role-dependent items. All new code uses `const` arrow functions and no comments; shell CSS lives in `index.css` and uses tokens only. Each visual phase re-runs the hardcoded-value scan:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(' <new files>
```

## Critical Implementation Details

- **Real-router specs:** the shell mounts inside `router.routes` in `SavedPlanPage.spec.tsx:274-292` and `AdminUsersPage.spec.tsx:178-189`, where `supabase` is `{}`; `apiFetch` rejects there, and the profile provider must set an error state, not call `signOut`, and not throw.
- **Sign-out reasons:** the provider must call `handleAuthFailure(response.status, signOut)` exactly like the pages so a 403 produces `signOut('blocked')`; a reason-less `signOut()` clears the blocked reason (`AuthProvider.tsx:29-31`).
- **No heading in the shell:** the brand is a link; the shell adds no `h1`–`h6`.

## Phase 1: Profile source

### Overview

Move the `/me` request out of `HomePage` into a shared context so the header and later pages read one result. No visible change yet: `HomePage` keeps its own fetch until Phase 3.

### Changes Required:

#### 1. Profile context, provider and hook

**File**: `frontend/src/profile/profile-context.ts`, `frontend/src/profile/ProfileProvider.tsx`, `frontend/src/profile/useProfile.ts`

**Intent**: Fetch `/me` once per provider mount, expose the result and a reload, and handle auth failures the way pages already do. The structure mirrors `frontend/src/auth/`.

**Contract**: `Profile = { id: string; email: string; role: 'MEMBER' | 'ADMIN' }`; `ProfileState = { status: 'loading' } | { status: 'ready'; profile: Profile } | { status: 'error' }`; context value `{ state: ProfileState; reload: () => void }`. `ProfileProvider` requests `apiFetch('/me')`, calls `handleAuthFailure(status, signOut)` (401/403 sign out and leave state as is), sets `error` for a rejected request, a non-OK response or an unparsable body, ignores results after unmount, and re-runs on `reload` after resetting to `loading`. `useProfile()` throws outside the provider, like `useAuth`.

#### 2. Provider specs

**File**: `frontend/src/profile/ProfileProvider.spec.tsx`

**Intent**: Pin the states and the auth behaviour so later phases can rely on them.

**Contract**: Specs in the `components` Vitest project mock `../lib/api` and `../auth/useAuth`. Cases: ready; 500 gives error; a rejected `apiFetch` gives error and does not call `signOut`; 401 calls `signOut()` with no argument; 403 calls `signOut('blocked')`; `reload` re-requests and recovers; no state update after unmount.

### Success Criteria:

#### Automated Verification:

- Profile provider specs pass: `cd frontend && npx vitest run src/profile/ProfileProvider.spec.tsx`
- No colour literals in the profile files: `cd frontend && grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/profile` prints nothing
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

---

## Phase 2: Shell components and tokens

### Overview

Add the width tokens, the section-aware active rule, and the presentational and container components for the shell and the auth layout, with their CSS. Nothing is mounted yet, so no page changes.

### Changes Required:

#### 1. Width tokens

**File**: `frontend/src/index.css`, `context/changes/app-shell-layout/tokens.md`

**Intent**: Replace the literal `28rem` with named widths and deposit their values in the change folder.

**Contract**: `--content-width: 48rem` and `--narrow-width: 28rem` in the light token block beside `--radius` (theme-independent, so the dark block does not repeat them). `tokens.md` records token, value, role and source (this plan).

#### 2. Active-link rule

**File**: `frontend/src/components/nav-active.ts`, `frontend/src/components/nav-active.spec.ts`

**Intent**: One place that says which nav link is active for a pathname.

**Contract**: `NAV_ITEMS` lists `{ key, to, label, adminOnly, isActive(pathname) }` for Create plan (`/plans/new`; active on `/plans/new` and `/plans/generate/*`), My plans (`/plans`; active on `/plans` and `/plans/<id>` but not on `/plans/new` or `/plans/generate/*`) and Users (`/admin/users`, admin only; active on `/admin/users`). On `/` none is active. The spec (the `unit` project, `.ts`) asserts exactly one active key, or none, for `/`, `/plans`, `/plans/<uuid>`, `/plans/new`, `/plans/generate/<job>` and `/admin/users`.

#### 3. Header, footer, shell and auth layout

**File**: `frontend/src/components/AppHeader.tsx`, `AppFooter.tsx`, `AppShell.tsx`, `AuthLayout.tsx`, `frontend/src/index.css`

**Intent**: Presentational header and footer (so the kitchen sink can render states with fixed props), a container shell that wires the profile, sign-out and location, and a narrow layout for the auth pages.

**Contract**:
- `AppHeader` props: `profile: ProfileState`, `pathname: string`, `signingOut: boolean`, `onSignOut: () => void`. Renders `<header>` with the brand as a `Link` to `/` (not a heading), `<nav aria-label="Main">` from `NAV_ITEMS` (Users only when `profile.status === 'ready'` and the role is `ADMIN`), `aria-current="page"` on the active link, a muted `email · role` with the role in its own element when ready, and a secondary `Button` "Sign out" that shows `Signing out…` and is disabled while `signingOut`. On `loading` and `error` the email slot is empty and Sign out stays.
- `AppFooter` renders `<footer>` with the text `Gym Training Plan Generator · AI-generated plans, not medical advice`.
- `AppShell` wraps `ProfileProvider`; inside it reads `useProfile()`, `useAuth().signOut` and `useLocation().pathname`, keeps `signingOut` (set before awaiting, cleared in a `finally`), and renders `AppHeader`, `<Outlet />`, `AppFooter` as siblings.
- `AuthLayout` renders a narrow centred wrapper with the app name as a non-heading line and `<Outlet />`.
- CSS in `index.css`, tokens only: the shell is a full-height column; header and footer use `--bg`, `--border` and `--text-muted`; header content and the pages' `<main>` are centred up to `--content-width`; the header wraps to two rows when narrow and is `position: sticky` only from `min-width: 40rem`; the active link is styled through `[aria-current="page"]` with `--accent`; `AuthLayout` is capped at `--narrow-width`.

#### 4. Component specs

**File**: `frontend/src/components/AppHeader.spec.tsx`, `AppShell.spec.tsx`, `AuthLayout.spec.tsx`

**Intent**: Pin header states, the shell wiring and the auth layout.

**Contract**: `AppHeader`: loading shows no email and no Users link; ready MEMBER shows `email` and role and no Users link; ready ADMIN shows Users; error keeps nav and Sign out and hides Users; `signingOut` shows `Signing out…` disabled; on `/plans/new` exactly one link has `aria-current="page"`; the brand is a link and the header has no heading. `AppShell`: renders header, a child route and the footer text; Sign out calls `signOut` once and shows the pending label; a profile error still renders the child route and Sign out. `AuthLayout`: renders its child route and no nav.

### Success Criteria:

#### Automated Verification:

- Nav rule and shell component specs pass: `cd frontend && npx vitest run src/components/nav-active.spec.ts src/components/AppHeader.spec.tsx src/components/AppShell.spec.tsx src/components/AuthLayout.spec.tsx`
- Guard spec still passes, so the shell CSS uses tokens only: `cd frontend && npx vitest run src/ui-contract.spec.ts`
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- `tokens.md` records `--content-width` and `--narrow-width` with value, role and source
- Sign-in, Home and the other pages look unchanged, because the shell is not mounted yet

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Wire routes, Home and pages

### Overview

Mount the layouts, drop the global width cap, rewrite Home, remove the 6 "Back to home" links and update the affected specs. This is the phase where the shell becomes visible.

### Changes Required:

#### 1. Layout routes

**File**: `frontend/src/router/router.tsx`

**Intent**: Give gated pages the shell and the auth pages the narrow layout.

**Contract**: Route tree: the dev route stays top-level; `/sign-up` and `/sign-in` become children of a pathless `AuthLayout` route; the gated routes become children of an `AppShell` route that is itself a child of the existing `RequireAuth` route; the `*` redirect is unchanged. Route paths are unchanged.

#### 2. Width cap and kitchen-sink wrapper

**File**: `frontend/src/index.css`, `frontend/src/dev/kitchen-sink.css`

**Intent**: Stop capping every route at `28rem`; the layouts own widths now.

**Contract**: `#root` loses `max-width: 28rem` (padding and auto margins follow the layouts); `.kitchen-sink` gets its own `max-width: var(--narrow-width)` and auto margins in `kitchen-sink.css` so the sink does not become full-bleed.

#### 3. Home

**File**: `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/HomeView.tsx` (deleted), `frontend/src/pages/HomePage.spec.tsx`, `frontend/src/dev/KitchenSinkPage.tsx`

**Intent**: Home keeps one job: a welcome and the primary action. Its fetch, Retry and Sign out move to the shell.

**Contract**: `HomePage` is static: `<main className="home">` with `<h1>Welcome</h1>`, one muted sentence about generating an 8-week plan, and a primary `ButtonLink` "Create a training plan" to `/plans/new`. `HomeView.tsx` is removed and the kitchen sink renders `HomePage` where it rendered `HomeView`. `HomePage.spec.tsx` is rewritten: the heading, the sentence, the primary link `href`, and the absence of Sign out, My plans and Users on Home.

#### 4. Remove "Back to home"

**File**: `frontend/src/pages/NewPlanPage.tsx`, `AdminUsersPage.tsx`, `SavedPlanPage.tsx`, `PlanGenerationPage.tsx`, `SavedPlansPage.tsx`, and their specs

**Intent**: Remove the 6 links now that the header provides the way back.

**Contract**: Delete the six `<p><Link to="/">Back to home</Link></p>` blocks (`NewPlanPage.tsx:166`, `AdminUsersPage.tsx:188,223`, `SavedPlanPage.tsx:82`, `PlanGenerationPage.tsx:202`, `SavedPlansPage.tsx:66`). Specs: delete the test `links back to home` in `SavedPlansPage.spec.tsx` and in `AdminUsersPage.spec.tsx`; remove the `Back to home` assertion from the test `links to My plans and home` in `SavedPlanPage.spec.tsx` and from the not-found test in `AdminUsersPage.spec.tsx`. The `AdminUsersPage` not-found branch keeps its `<main>` and alert. The "My plans" link in `SavedPlanPage` stays.

**Deviation (2026-11-02)**: (1) The guard spec's `GUARDED_FILES` loses `./pages/HomeView.tsx` in this phase, not Phase 5, because deleting `HomeView.tsx` here would otherwise break the full suite (`readFileSync` on a missing file). (2) `index.css` replaces the removed `#root` rule with `#root > .status { padding: 2rem 1rem; }` so the unframed `RequireAuth` "Loading…" paragraph keeps its padding now that `#root` no longer provides it. (3) The not-found test in `AdminUsersPage.spec.tsx` asserts `queryByRole('link')` is null in place of the removed Back-link assertion, so a stray link cannot return. (4) `KitchenSinkPage.tsx` drops the old Home state cases (they belonged to the deleted `HomeView`) and renders `HomePage` plus the buttons and an empty-state note; Phase 4 adds the shell cases. `.kitchen-sink` gets its own `--narrow-width` wrapper in `kitchen-sink.css`.

**Deviation (2026-11-02, found in the manual check)**: With Sign out available on every page, `RequireAuth` (`RequireAuth.tsx:12-13`) redirected to `/sign-in` with `from` set to the current page and `SignInPage` (`SignInPage.tsx:31,38-39,52`) returned the next person to sign in to it, so a second user landed on the first user's `/plans/<id>` and saw "This saved plan could not be found." Before this change Sign out existed only on Home, so `from` was always `/`. Fix: `SignOutReason` gains `'user'` (`auth-context.ts`); `AppShell` signs out with `signOut('user')`; `RequireAuth` omits `from` when the reason is `'user'` and keeps it for a lost session (401) and a blocked account. New `frontend/src/auth/RequireAuth.spec.tsx` covers loading, signed in, no reason, `blocked` and `user`; `AppShell.spec.tsx` asserts `signOut('user')`. Known effect: after an explicit sign-out the next sign-in always lands on `/`, even if the person had typed a gated URL first.

### Success Criteria:

#### Automated Verification:

- Page and router specs pass, including the two that render the real router: `cd frontend && npx vitest run src/pages`
- No "Back to home" link remains in the source: `cd frontend && grep -rn "Back to home" src` prints nothing
- `#root` no longer caps the width: `cd frontend && grep -n "max-width: 28rem" src/index.css` prints nothing
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- Signed in, every gated page shows the header (brand, Create plan, My plans, Users for an ADMIN only, `email · role`, Sign out) and the footer text
- Exactly one nav link is active on `/plans`, `/plans/<id>`, `/plans/new`, `/plans/generate/<job>` and `/admin/users`, and none on `/`
- Sign out from a page other than Home shows `Signing out…` and then lands on `/sign-in`
- Sign-in and sign-up show the narrow centred layout with unchanged forms
- At 375 px the header wraps to two rows and scrolls away; from 40rem up it sticks

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: States and visual gate

### Overview

Show every shell state in the kitchen sink and screenshot it, so the gate does not depend on the happy path.

### Changes Required:

#### 1. Kitchen-sink shell cases

**File**: `frontend/src/dev/KitchenSinkPage.tsx`, `frontend/src/dev/kitchen-sink.css`

**Intent**: Render the header and footer in every state with fixed props, plus a composed full frame.

**Contract**: Cases: header loading, ready MEMBER, ready ADMIN, error, signing out; one header per active-link case (`/`, `/plans`, `/plans/<id>`, `/plans/new`, `/plans/generate/<job>`, `/admin/users`); the footer; a full frame (`AppHeader` + `HomePage` + `AppFooter`) for a member; Home; and an "empty" case marked N/A with the reason (the shell has no list). Hover and focus-visible are exercised on the real controls with Playwright hover and Tab.

#### 2. Screenshots

**File**: `context/changes/app-shell-layout/screenshots/`

**Intent**: Keep the review evidence next to the change.

**Contract**: Four images from the Playwright MCP: 1280 px and 375 px wide, each in light and dark. Also record computed `position` of the header at both widths and the horizontal scroll width at 375 px.

**Deviation (2026-11-02)**: `.kitchen-sink` is capped at `--content-width` (not `--narrow-width` as set in Phase 3) so the header is shown at a realistic width; the cases' own padding still makes the header narrower than in the real shell, so the user area wraps to a second row in the sink earlier than it would on a signed-in page. Evidence recorded from the Playwright run (1280 px and 375 px): header `position` is `sticky` at 1280 px and `static` at 375 px; `scrollWidth` equals `clientWidth` at both widths; each active-link case has exactly one `aria-current="page"` (none on home); hover and focus-visible use `--accent` on the brand, nav links and Sign out in light and dark; no control lacks an accessible name; the header has 0 headings.

### Success Criteria:

#### Automated Verification:

- Production build contains no kitchen-sink code: `cd frontend && npm run build && grep -rli 'kitchen-sink' dist` prints nothing
- Full suite and lint pass: `cd frontend && npm test && npm run lint`

#### Manual Verification:

- `/dev/kitchen-sink` under `npm run dev` shows the header states, each active-link case, the footer, the full frame and Home, and marks empty N/A with a reason
- Hover and keyboard focus are visible on the brand, every nav link and Sign out, driven by tokens, in light and dark
- The four screenshots are saved and show no horizontal overflow at 375 px, a sticky header only from 40rem up, and readable labels in dark mode
- Every control has an accessible name, and each active-link case has exactly one `aria-current="page"`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Guard and rule

### Overview

Make the shell survive the next session: extend the guard to the new files and tokens, and update the rule block.

### Changes Required:

#### 1. Guard spec

**File**: `frontend/src/ui-contract.spec.ts`

**Intent**: Scan the shell files for colour literals and require the width tokens.

**Contract**: Add to `GUARDED_FILES`: `./components/AppHeader.tsx`, `./components/AppShell.tsx`, `./components/AppFooter.tsx`, `./components/AuthLayout.tsx`, `./components/nav-active.ts`, `./profile/profile-context.ts`, `./profile/ProfileProvider.tsx`, `./profile/useProfile.ts`; remove `./pages/HomeView.tsx` (deleted in Phase 3). Add `--content-width` and `--narrow-width` to `REQUIRED_TOKENS`. The one allowlist entry for `.plan-exercise-image` stays.

#### 2. UI rule block

**File**: `CLAUDE.md`

**Intent**: Tell the next agent about the shell and the profile hook.

**Contract**: Update the existing `### UI contract` section above the CLI marker: the components list adds `AppShell`, `AppHeader`, `AppFooter` and `AuthLayout`; one line says signed-in pages render inside the shell and read the profile through `useProfile()` from `frontend/src/profile/`, and that new nav entries go in `nav-active.ts`; widths come from `--content-width` and `--narrow-width`; the kitchen-sink line covers the shell states. Nothing inside the marker block changes.

### Success Criteria:

#### Automated Verification:

- Guard spec passes with the extended file list and width tokens: `cd frontend && npx vitest run src/ui-contract.spec.ts`
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`
- The CLI-managed block is unchanged by this phase: `sed -n '/BEGIN @przeprogramowani/,/END @przeprogramowani/p' CLAUDE.md | sha256sum` equals the hash taken before the edit

#### Manual Verification:

- Temporarily adding `color: #123456` to `AppHeader.tsx` makes the guard spec fail, and it passes again after reverting
- The `CLAUDE.md` UI block mentions the shell, the profile hook and the kitchen-sink coverage, and sits outside the CLI marker block

---

## Testing Strategy

### Unit Tests:

- `ProfileProvider`: ready, error, rejected request without `signOut`, 401 and 403 mapping, reload, unmount.
- `nav-active`: exactly one or no active key for six representative paths.
- `AppHeader`, `AppShell`, `AuthLayout`: states, wiring, pending Sign out, no heading, one `aria-current`.
- `HomePage`: heading, sentence, primary link, absence of moved controls.
- The two real-router specs stay green with the shell in the tree.
- `ui-contract.spec.ts`: extended file list and width tokens.

### Integration Tests:

- None added; the frontend has no browser test runner and none is installed for this change.

### Manual Testing Steps:

1. Run `cd frontend && npm run dev`, sign in, and walk Home, My plans, a saved plan, Create plan, a generation page and (as an admin) Users, checking header, active link and footer in light and dark.
2. Sign out from a non-Home page; sign in again; open sign-in and sign-up and check the narrow layout.
3. Open `/dev/kitchen-sink`, Tab through the header, hover each link, and capture the four screenshots with the Playwright MCP.

## Performance Considerations

`/me` is requested once per shell mount instead of once per Home visit; under `StrictMode` in development the effect runs twice, as it does today. The kitchen sink stays out of the production bundle (checked in Phase 4).

## Migration Notes

- Work continues on branch `ui-redesign`, after `home-ui-contract` (`69fc23b`).
- `home-ui-contract` still has 13 open manual rows; rows 3.4–3.8 describe the old Home, which this change rewrites. Resolve them against the new Home, or mark them superseded, before archiving `home-ui-contract`.
- Deferred items stay in `research.md`: hamburger menu, skip link, framing the loading placeholder, the `SavedPlanPage` My plans link, footer links, per-page widths.

## References

- Related research: `context/changes/app-shell-layout/research.md`
- Earlier change this builds on: `context/changes/home-ui-contract/plan.md`
- Layout facts: `frontend/src/auth/RequireAuth.tsx:16`, `frontend/src/router/router.tsx:28-37`, `frontend/src/index.css:37-41`
- Profile and auth: `frontend/src/pages/HomePage.tsx:19`, `frontend/src/lib/auth-failure.ts:3-18`, `frontend/src/auth/AuthProvider.tsx:29-31`, `backend/src/auth/me.controller.ts:5-11`
- Real-router specs: `frontend/src/pages/SavedPlanPage.spec.tsx:274-292`, `frontend/src/pages/AdminUsersPage.spec.tsx:178-189`
- Guard: `frontend/src/ui-contract.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Profile source

#### Automated

- [x] 1.1 Profile provider specs pass — 1167b12
- [x] 1.2 No colour literals in the profile files — 1167b12
- [x] 1.3 Full suite, build and lint pass — 1167b12

### Phase 2: Shell components and tokens

#### Automated

- [x] 2.1 Nav rule and shell component specs pass — 1167b12
- [x] 2.2 Guard spec still passes, so the shell CSS uses tokens only — 1167b12
- [x] 2.3 Full suite, build and lint pass — 1167b12

#### Manual

- [ ] 2.4 `tokens.md` records `--content-width` and `--narrow-width` with value, role and source
- [ ] 2.5 Sign-in, Home and the other pages look unchanged, because the shell is not mounted yet

### Phase 3: Wire routes, Home and pages

#### Automated

- [x] 3.1 Page and router specs pass, including the two that render the real router — 1167b12
- [x] 3.2 No "Back to home" link remains in the source — 1167b12
- [x] 3.3 `#root` no longer caps the width — 1167b12
- [x] 3.4 Full suite, build and lint pass — 1167b12

#### Manual

- [ ] 3.5 Signed in, every gated page shows the header (brand, Create plan, My plans, Users for an ADMIN only, `email · role`, Sign out) and the footer text
- [ ] 3.6 Exactly one nav link is active on `/plans`, `/plans/<id>`, `/plans/new`, `/plans/generate/<job>` and `/admin/users`, and none on `/`
- [ ] 3.7 Sign out from a page other than Home shows `Signing out…` and then lands on `/sign-in`
- [ ] 3.8 Sign-in and sign-up show the narrow centred layout with unchanged forms
- [ ] 3.9 At 375 px the header wraps to two rows and scrolls away; from 40rem up it sticks

### Phase 4: States and visual gate

#### Automated

- [x] 4.1 Production build contains no kitchen-sink code — 1167b12
- [x] 4.2 Full suite and lint pass — 1167b12

#### Manual

- [ ] 4.3 `/dev/kitchen-sink` under `npm run dev` shows the header states, each active-link case, the footer, the full frame and Home, and marks empty N/A with a reason
- [ ] 4.4 Hover and keyboard focus are visible on the brand, every nav link and Sign out, driven by tokens, in light and dark
- [ ] 4.5 The four screenshots are saved and show no horizontal overflow at 375 px, a sticky header only from 40rem up, and readable labels in dark mode
- [ ] 4.6 Every control has an accessible name, and each active-link case has exactly one `aria-current="page"`

### Phase 5: Guard and rule

#### Automated

- [x] 5.1 Guard spec passes with the extended file list and width tokens — 1167b12
- [x] 5.2 Full suite, build and lint pass — 1167b12
- [x] 5.3 The CLI-managed block is unchanged by this phase — 1167b12

#### Manual

- [ ] 5.4 Temporarily adding `color: #123456` to `AppHeader.tsx` makes the guard spec fail, and it passes again after reverting
- [ ] 5.5 The `CLAUDE.md` UI block mentions the shell, the profile hook and the kitchen-sink coverage, and sits outside the CLI marker block
