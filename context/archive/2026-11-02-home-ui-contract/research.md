---
date: 2026-11-02T18:06:59+01:00
researcher: Claude Sonnet 5.5
git_commit: 0f2a8dff202566e6760e1e5b62b89eb0c3b9ae96
branch: main
repository: 10xdevs
topic: "Audit HomePage (route /) against the plain-CSS-variables design-system contract"
tags: [research, codebase, ui, design-tokens, HomePage, index.css]
status: complete
last_updated: 2026-11-02
last_updated_by: Claude Sonnet 5.5
---

# Research: Audit HomePage (route /) against the plain-CSS-variables design-system contract

**Date**: 2026-11-02T18:06:59+01:00
**Researcher**: Claude Sonnet 5.5
**Git Commit**: 0f2a8dff202566e6760e1e5b62b89eb0c3b9ae96
**Branch**: main
**Repository**: 10xdevs

## Research Question

Audit the `HomePage` view (route `/`, `frontend/src/pages/HomePage.tsx`) against the plain-CSS-variables design-system contract in `frontend/src/index.css`. Work source→views and view→source, check the repo-owned part of `CLAUDE.md` for UI rules, and write 3–5 charges (file:line, one sentence of user impact each) grouped as missing tokens, missing shared component, or accidental architecture. No CSS proposals.

## Summary

The repo has a working but thin token layer: seven colour tokens plus a dark override in one file, `frontend/src/index.css:1-26`. Every view is styled only through global element selectors and class hooks in that same file, and no `.tsx` file in `frontend/src` references a token. There are no primitive components, so `HomePage` is built from raw `<button>`, `<a>`, `<dl>` and `<p>`. The hardcoded-value scan finds 0 hits in `HomePage.tsx` and 2 literal `#fff` values in `index.css` outside the token blocks (lines 91, 173).

The decisive defect is in the token layer: the global `button` rule hardcodes `color: #fff` over `--accent` (`index.css:90-91`), and in the dark theme `--accent` is `#c084fc` (`index.css:22`), which gives a computed contrast of 2.64:1 for the label (7.13:1 in the light theme). Home's only `<button>` ("Sign out") is affected.

Five charges follow. The seed hypothesis about `GENERIC_PLAN_ERROR` on the `/me` error state was checked and not confirmed as a user-visible defect (see Detailed Findings).

## Charges

**C1 — Missing tokens: no on-accent colour; white label on the dark-theme accent fails contrast** (priority: high)
- Evidence: `frontend/src/index.css:90-91` (`background: var(--accent); color: #fff`), dark `--accent: #c084fc` at `index.css:22`; `button:disabled { opacity: 0.6 }` at `index.css:95-98`. The `#fff` should be a role token (an "on-accent" colour) defined per theme beside `--accent`. A second literal `#fff` at `index.css:173` backs `.plan-exercise-image`; it is not on Home and may be deliberate (exercise images on a white backdrop), so it is recorded but not scoped here.
- User impact: in dark mode the "Sign out" label on Home (and every other button in the app) is white on light purple at 2.64:1, below the 4.5:1 text threshold, and the disabled state dims it further.

**C2 — Missing tokens: no radius, spacing or type-scale tokens** (priority: low)
- Evidence: `border-radius: 4px` appears in 7 rules (`index.css:60,76,89,119,172,194,229`); padding/gap/margin values are rem literals in every rule (for example `index.css:35,58,74,87,120`); the `h1` size `1.75rem` is a literal at `index.css:39`. Only colour has tokens (`index.css:2-8`).
- User impact: none visible today; it matters because any Home restyle or the next view has to re-type the same literals, which is how the views drift apart.

**C3 — Missing shared component: no Button (with variants), Card or page layout primitive** (priority: high)
- Evidence: a single global `button` rule with no variants (`index.css:84-93`), plus an override that exists only for one container (`index.css:244-246`, `.admin-users-actions button { margin-top: 0 }`); "Confirm" and "Cancel" are styled identically (`AdminUsersPage.tsx:161-175`). The bordered-card pattern is written twice with the same values (`index.css:190-197` for `.saved-plans-list a` and `index.css:223-230` for `.admin-users-item`). On Home the "Create a training plan" and "My plans" actions are bare `<p><Link>` (`HomePage.tsx:75-80`) while "Sign out" is the only filled button (`HomePage.tsx:86-88`). `frontend/src/components/` contains `PlanView.tsx` and `SavedPlanDetails.tsx` only.
- User impact: the least important action on Home is the one that looks like a primary action, and the main actions (create a plan, open my plans) look like plain text links.

**C4 — Accidental architecture: no shared layout or navigation; Home is a hub plus a profile dump** (priority: high)
- Evidence: `RequireAuth` renders a bare `<Outlet />` with no layout (`frontend/src/auth/RequireAuth.tsx:16`); the router has no layout route besides it (`frontend/src/router/router.tsx:13-23`). The same `<p><Link to="/">Back to home</Link></p>` is hand-written 6 times across 5 page files (`NewPlanPage.tsx:166`, `AdminUsersPage.tsx:188,223`, `SavedPlanPage.tsx:82`, `PlanGenerationPage.tsx:202`, `SavedPlansPage.tsx:66`). Home's content is the signed-in user's email and role in a `<dl>` (`HomePage.tsx:68-73`), and sign-out exists only on Home (`HomePage.tsx:86`). `#root` caps every view at `max-width: 28rem` (`index.css:32-36`).
- User impact: from any page except Home the only way to sign out or reach another section is to go back to Home first, and on a desktop screen the whole app is a 28rem strip.

**C5 — Accidental architecture: Home's states are unfinished** (priority: medium)
- Evidence: loading is a bare `Loading…` paragraph (`HomePage.tsx:61`) that is replaced by the `<dl>`, so content shifts when data arrives; the error state shows the alert but no retry (`HomePage.tsx:62-66`); `index.css` has no `:hover` or `:active` rule and no `transition` (grep over the file, 0 matches); the Sign out handler has no pending state (`HomePage.tsx:86`), while `signOut` awaits `supabase.auth.signOut()` (`AuthProvider.tsx:29-31`). Focus uses the accent through one global rule (`index.css:104-107`) with no separate focus token.
- User impact: Home gives no feedback when hovering, no feedback while signing out, and no way to recover from a failed `/me` load except reloading the page.

**Not a charge (seed hypothesis not confirmed): `GENERIC_PLAN_ERROR` on the `/me` error state.** The constant's text is `Something went wrong, try again` (`frontend/src/lib/error-messages.ts:1`), which is not plan-specific; only the identifier name is. It is imported in 6 files (`HomePage.tsx:5`, `SavedPlanPage.tsx:7`, `SavedPlansPage.tsx:6`, `NewPlanPage.tsx:5`, `AdminUsersPage.tsx:11`, `PlanGenerationPage.tsx:6`). A rename is a naming nit, outside this change.

## Detailed Findings

### Source → views (token and component usage)

- Token source: `frontend/src/index.css:1-26` defines `--text`, `--text-muted`, `--bg`, `--border`, `--accent`, `--error`, `--error-bg`, with the dark override in `@media (prefers-color-scheme: dark)` (`index.css:16-26`). There is no manual theme toggle in the inspected CSS.
- Usage: a `var(--` grep over `frontend/src/**/*.css` and `**/*.tsx` matched 17 lines, all in `index.css`; no `.tsx` file matches. Views therefore depend on the CSS file only through class names and element selectors.
- View files inspected: 8 page files and 2 component files, each with 3–11 `className` attributes. Class hooks with no rule in `index.css`: `home`, `auth`, `saved-plan`, `plan-form`, `plan-generation` (0 matches each).
- Components: no `Button`, `Input`, `Field`, `Card` or layout component exists in `frontend/src/components/` (2 files, both feature components).

### View → source (HomePage)

- `HomePage.tsx` has 0 hits for hex, `rgb(`, `hsl(`, `oklch(`, arbitrary-value and Tailwind palette patterns. Its look comes from element selectors (`h1`, `dl`, `dt`, `dd`, `button`, `a`) and `.status`, `.error` (`index.css:38-41,109-113,115-122,124-134`).
- Contrast, computed with the WCAG relative-luminance formula on the token values: `#fff` on `#7a1fd1` = 7.13; `#fff` on `#c084fc` = 2.64; `#c084fc` link text on `#16171d` = 6.77; `--text-muted` on `--bg` = 5.73 (light) and 7.04 (dark). Only the button label fails.

### Agent rules

- The repo-owned part of `CLAUDE.md` (lines 1-36) has no UI, styling or token instruction and no rule that invites one-off values. The CLI-managed block from line 38 describes the `/10x-ui` workflow; any UI rule for this repo must be added outside it.

### Constraints for the plan (existing tests)

- `frontend/src/pages/HomePage.spec.tsx` asserts: link names `Registered users` (admin only, `href="/admin/users"`) and `My plans`, the text `MEMBER`, the text `Loading…`, and `role="alert"` on error (`HomePage.spec.tsx:46-76`). A Home restyle has to keep these roles and names, or update the spec in the same phase.

## Code References

- `frontend/src/index.css:1-26` - token block and dark override
- `frontend/src/index.css:32-36` - `#root` `max-width: 28rem`
- `frontend/src/index.css:84-98` - global `button` and `button:disabled`
- `frontend/src/index.css:91` - `color: #fff` literal over `--accent`
- `frontend/src/index.css:104-107` - global `:focus-visible`
- `frontend/src/index.css:173` - `background: #fff` on `.plan-exercise-image`
- `frontend/src/index.css:190-197,223-230` - duplicated bordered-card pattern
- `frontend/src/index.css:244-246` - one-container override of `button` margin
- `frontend/src/pages/HomePage.tsx:59-89` - Home markup (profile `dl`, three links, sign-out button)
- `frontend/src/auth/RequireAuth.tsx:16` - `<Outlet />` with no layout
- `frontend/src/router/router.tsx:13-23` - route table, no layout route besides `RequireAuth`
- `frontend/src/lib/error-messages.ts:1` - `GENERIC_PLAN_ERROR` text

## Architecture Insights

- The design system is "one global stylesheet": tokens, element defaults and per-feature class rules share `index.css`, and each feature change added its own class block (`admin-users-*`, `saved-plans-*`, `plan-*`). Nothing is wrong with one file, but there is no component layer between the tokens and the views, which is why the same card and the same "Back to home" link were re-created per page.
- Only colour is tokenised, so spacing and radius decisions live inside rule bodies.

## Historical Context (from prior changes)

- `context/archive/2026-10-31-admin-user-list/plan.md:13` states there is no table or shared layout in the SPA and that `#root` is capped at `max-width: 28rem` at `index.css:32-36`. Verdict: supported on both points as of commit `0f2a8df` (the cap is at `index.css:32-36`; no layout component exists).
- `context/archive/2026-10-31-admin-block-user/research.md:66` states `index.css` has one global `button` style and no danger variant. Verdict: supported (`index.css:84-93`; the only related rule is the margin override at `index.css:244-246`).
- `context/archive/2026-10-10-sign-up-and-login/plan.md:251` says the Vite template CSS was removed in that change. Verdict: consistent with the current file, which holds no template demo rules in the inspected lines.

## Related Research

- None on UI or design tokens under `context/changes/**/research.md` (only this change) or in the 8 archived changes listed in `context/archive/`.

## Open Questions

- The authenticated `/` view has not been seen in a browser (the app redirects to `/sign-in` without a session), so the layout findings come from markup and CSS, not from a screenshot. The contrast figures are computed, not measured on screen.
- Does the owner want Home to stay a hub (links plus profile) or become a real landing page? C3/C4 changes differ in size depending on that; this is a product choice for `/10x-plan`.
- Is `#fff` at `index.css:173` a deliberate white backdrop for exercise images? It is outside Home and is left out of the charges unless the plan widens scope.
- Charges the plan does not address must stay here marked **deferred** with a reason (C2 is the likely candidate if the plan stays to colour and component work).
