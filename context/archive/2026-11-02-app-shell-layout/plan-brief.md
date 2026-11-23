# App Shell Layout — Plan Brief

> Full plan: `context/changes/app-shell-layout/plan.md`
> Research: `context/changes/app-shell-layout/research.md`

## What & Why

Give every signed-in page a shared frame: a header (brand, nav, `email · role`, Sign out), a wider centred main and a minimal footer, with a separate narrow layout for sign-in and sign-up. It fixes the deferred charge C4 from `home-ui-contract`: today each page draws its own navigation, Sign out lives only on Home, and `#root` caps every route at 28rem.

## Starting Point

`RequireAuth` renders a bare `<Outlet />`, 10 `<main>` openings in 8 page files each own their landmarks, and 6 hand-written "Back to home" links in 5 files are the only way back. The profile is fetched in one place (`HomePage.tsx:19`), so the header could not show a role-dependent link elsewhere. The contract from `home-ui-contract` (tokens, `Button`, `ButtonLink`, kitchen sink, guard spec) is in place on branch `ui-redesign`.

## Desired End State

Signed-in pages sit in one frame with exactly one active nav link where a section applies, a header that sticks from 40rem up and scrolls away on phones, and a footer line. `/me` is fetched once and read through `useProfile()`. Home is "Welcome", one sentence and the primary "Create a training plan" button. Sign-in and sign-up use a narrow centred layout. A dev-only kitchen sink shows every shell state, and the guard spec scans the new files.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Delivery | Its own change after `home-ui-contract`, on branch `ui-redesign` | Keeps `home-ui-contract` reviewable as one view | Plan |
| Header content | Brand, nav (Create plan, My plans, Users for admins), `email · role`, Sign out | Replaces every Back link and makes Sign out reachable everywhere | Plan |
| Footer | Muted line: "Gym Training Plan Generator · AI-generated plans, not medical advice" | Frames the page without inventing links; wording is a product choice | Plan |
| Profile source | Shell fetches `/me` once, shared through a context hook | One request and one place for 401/403 handling | Plan |
| `<main>` ownership | Pages keep `<main>`; shell renders header, Outlet, footer as siblings | 0 page markup edits and no landmark nesting | Research |
| Active nav rule | Section-aware: My plans on `/plans` and `/plans/:id`; Create plan on `/plans/new` and `/plans/generate/:jobId`; Users on `/admin/users`; none on `/` | `NavLink` prefix match would light two links on `/plans/new` | Plan |
| Sticky header | Sticky from 40rem up, static below | A two-row header would hold about an eighth of a phone viewport | Plan |
| Home | "Welcome", one sentence, primary action only | Header already carries the brand and the other links | Plan |
| Header data | Email and role from `/me`, not the session; error keeps nav and Sign out | The 5 page specs mock `session: null`, and the role exists only in `/me` | Research |
| Loading placeholder | `RequireAuth` "Loading…" stays unframed | Transient; framing it is a larger change | Plan |

## Scope

**In scope:** `profile/` context and hook; `--content-width` and `--narrow-width` tokens; `AppHeader`, `AppFooter`, `AppShell`, `AuthLayout` and the active-link rule; layout routes; dropping the `#root` cap; static Home; removing the 6 "Back to home" links and their 4 assertions; kitchen-sink shell cases and screenshots; guard and `CLAUDE.md` updates.

**Out of scope:** hamburger menu, skip link, footer links, profile page, per-page widths, framing the loading placeholder, the "My plans" link inside `SavedPlanPage`, `Card`, spacing and type scales, the `GENERIC_PLAN_ERROR` rename, any backend change.

## Architecture / Approach

Build bottom-up and keep visual risk late: the profile source (no visible change), then tokens and shell components that are not yet mounted, then one phase that wires the layout routes and rewrites Home and the pages, then the kitchen-sink gate, then the guard. The shell inside `router.routes` also runs in two specs that render the real router with `supabase` mocked as `{}`, so the profile source must turn a failed request into an error state without signing out.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Profile source | `ProfileProvider`, `useProfile`, specs; no UI change | A rejected request signing the user out |
| 2. Shell components and tokens | Width tokens, active rule, header, footer, shell, auth layout, specs | Heading or landmark collisions with existing specs |
| 3. Wire routes, Home and pages | Layouts mounted, `#root` cap dropped, static Home, Back links removed | Real-router specs and about a dozen assertions changing at once |
| 4. States and visual gate | Kitchen-sink shell cases, four screenshots, sticky and overflow checks | Sink code leaking into the production build |
| 5. Guard and rule | Extended guard spec, `CLAUDE.md` update | Editing inside the CLI-managed block |

**Prerequisites:** `home-ui-contract` committed on `ui-redesign` (done, `69fc23b`); a signed-in session (and an admin account for the Users link) for the Phase 3 manual checks; the Playwright MCP for screenshots.
**Estimated effort:** about 3–4 sessions across 5 phases.

## Open Risks & Assumptions

- The signed-in app has not been seen with the shell; layout and the 375 px wrap are code-derived until Phase 3 and 4.
- `home-ui-contract` has 13 open manual rows; rows 3.4–3.8 describe the old Home and need resolving or superseding before that change is archived.
- The footer disclaimer wording is a product statement the owner should be comfortable with.
- A failing `/me` hides the Users link even for an admin until `reload` succeeds; this is an accepted degradation.

## Success Criteria (Summary)

- Every signed-in page shows the header and footer, with exactly one active nav link where a section applies and a sticky header only from 40rem up.
- No "Back to home" link remains, Sign out works from any page, and sign-in and sign-up keep unchanged forms in a narrow centred layout.
- All shell states are in the kitchen sink and screenshotted at desktop and 375 px in light and dark, and a colour literal in a shell file fails `npm test`.
