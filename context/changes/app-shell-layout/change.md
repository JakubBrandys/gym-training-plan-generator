---
change_id: app-shell-layout
title: App shell with header, main content and footer
status: implementing
created: 2026-11-02
updated: 2026-11-02
archived_at: null
---

## Notes

add a shared app shell for signed-in pages: sticky header (brand link, nav Create plan / My plans / Users for admins, email·role and Sign out on the right), centred main column wider than 28rem, minimal footer text line; separate minimal layout for sign-in/sign-up; removes the 6 "Back to home" links and moves Sign out out of HomeView

Decisions already made (2026-11-02, with the user):

- Delivered as its own change after `home-ui-contract` (charge C4, deferred there); work on branch `ui-redesign`, the larger branch for all UI changes.
- Header: brand link, nav (Create plan, My plans, Users for admins only), email and role plus Sign out on the right; wraps to two rows on narrow screens, no hamburger.
- Footer: minimal muted text line (app name plus a one-line note such as "AI-generated plans, not medical advice"); the wording is a product choice to confirm during planning.
- Home keeps the primary "Create a training plan" and loses "My plans", the admin link and Sign out (they move to the header).
- Contract variant: extend the existing plain-CSS-variables system in `frontend/src/index.css`; at most one new token (`--content-width`), no new colours, no new dependency.
- Constraints: 4 assertions in 3 specs check "Back to home" (`SavedPlanPage.spec.tsx:170`, `AdminUsersPage.spec.tsx:144,156`, `SavedPlansPage.spec.tsx:129`); `HomePage.spec.tsx` pins link names and Sign out behaviour; the UI guard spec `frontend/src/ui-contract.spec.ts` and the kitchen sink at `/dev/kitchen-sink` must cover the new components.
- Depends on: `home-ui-contract` (Button, ButtonLink, tokens, guard), committed as `69fc23b` on `ui-redesign`.
