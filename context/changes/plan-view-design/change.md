---
change_id: plan-view-design
title: Plan view redesign with week switcher, session cards and compact rows
status: implementing
created: 2026-11-02
updated: 2026-11-02
archived_at: null
---

## Notes

redesign how a generated or saved training plan is shown (PlanView, used by PlanGenerationPage and SavedPlanPage): a summary card (weeks, frequency ramp, exercise count, goals), a week switcher showing one week at a time (W1-W8 with prev/next and a #week-N link), session cards (number, title, exercise count), and compact exercise rows (56-64px thumbnail, bold name, sets x reps and rest as chips, muted note); needs a --surface token and Card, Chip and WeekSwitcher components; kitchen sink gets a realistic 8-week plan case (frontend/src/dev/sample-plan.ts, already drafted). Evidence: current plan view is about 29,600px tall on desktop and 47,800px on a phone for 222 exercises, rows are 114px (222px on a phone), week heading 20px vs session 16px.

Decisions already made (2026-11-02, with the user):

- Delivered as its own change after `app-shell-layout` (committed as `1167b12` on branch `ui-redesign`, the larger branch for all UI changes).
- Layout: one week at a time with a week switcher (W1-W8, prev/next, `#week-N` link), not all weeks collapsible and not a compacted single page.
- Exercise row: small thumbnail (56-64px) plus chips for sets x reps and rest, muted note below; the two-position catalog image stays visible.
- Contract variant: extend the existing plain-CSS-variables system in `frontend/src/index.css`; one new surface token for cards, components in `frontend/src/components/`, no new dependency.

Evidence and groundwork:

- Measured on a realistic sample plan (8 weeks, 37 sessions, 222 exercises, 222 images, rendered in the shell): plan view is 29,640px tall at 1280px and 47,832px at 375px; exercise rows are 114px (desktop) and 222px (phone); week heading 20px, session heading 16px; sets x reps and rest are inline after the name at the same weight.
- Screenshots of the current view: `screenshots/plan-current-desktop-top.png`, `screenshots/plan-current-mobile-top.png`.
- Uncommitted groundwork on the branch: `frontend/src/dev/sample-plan.ts` (realistic 8-week sample using the real catalog images), a plan case in `frontend/src/dev/KitchenSinkPage.tsx`, and the `.kitchen-sink-case > h2` scoping fix in `frontend/src/dev/kitchen-sink.css`.

Constraints and open questions for research and planning:

- `PlanView.spec.tsx:68-69` expects the headings `Week 1` and `Week 2` (level 2) to be present at the same time; `SavedPlanPage.spec.tsx` and `PlanGenerationPage.spec.tsx` also query `Week 1` as a level-2 heading. Showing one week at a time changes those assertions.
- `PlanView` is used by two pages: the saved plan page (has the form: goals, frequency, created date) and the generation page (job result only, no form), so the summary card cannot show goals on the generation page unless the data is passed in.
- The `background: #fff` on `.plan-exercise-image` is the one allowlisted literal in the guard spec (`frontend/src/ui-contract.spec.ts`); a redesign of the image should tokenise it and drop the allowlist entry if possible.
- Shell facts to keep: header is sticky from 40rem up, `<main>` is capped at `--content-width` (48rem), sections inside pages must not add headings that collide with the existing heading-by-name specs.
- Depends on: `app-shell-layout` and `home-ui-contract` (tokens, Button, ButtonLink, shell, kitchen sink, guard).
