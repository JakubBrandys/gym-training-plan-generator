# Plan View Design — Plan Brief

> Full plan: `context/changes/plan-view-design/plan.md`
> Research: `context/changes/plan-view-design/research.md`

## What & Why

Redesign how a generated or saved training plan is shown: a summary card, a week switcher that shows one week at a time, session cards and compact exercise rows. Today `PlanView` is one flat list that measured 29,640 px tall on desktop and 47,832 px on a phone for a realistic 8-week plan, with 114 px rows (222 px on a phone) and numbers that read like body text.

## Starting Point

`PlanView` (`frontend/src/components/PlanView.tsx`) renders every week, session and exercise in one pass and is used by exactly two pages. The saved page has the stored form, the generation page gets the plan only (the job view hides the form). Tokens are colour-only plus radius and widths, there is no surface token, and the one allowlisted literal in the guard is the image backdrop `#fff`. The shell, `Button`, `ButtonLink`, the kitchen sink and the guard come from the two earlier changes.

## Desired End State

A plan opens on a summary card, a week switcher (W1–W8) and one week of session cards with compact rows (64 px thumbnail, bold name, sets × reps and rest as chips), with a pager at the bottom. The URL hash selects the week and switching replaces the history entry, so Back leaves the plan. A typical week is a few screens instead of about 33. The kitchen sink shows every state, and the guard scans the new files with no allowlisted literal.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Delivery | Its own change after `app-shell-layout`, on `ui-redesign` | Keeps each change reviewable | Plan |
| Layout | One week at a time with a switcher | Cuts each view to a few screens and gives orientation | Plan |
| Exercise row | 64 px thumbnail plus chips for sets × reps and rest | A/B positions stay recognisable at 64 px, marginal at 56 px | Research |
| Summary on generation page | Derived stats only; goals and date on the saved page via a slot | The job view deliberately hides the form; no backend change | Research |
| "Exercise count" | "N sessions · M different exercises" (by slug) | 222 entries would read as 222 different exercises | Plan |
| Switcher pattern | Hash links with `aria-current`, `replace` | Real links, shareable, same pattern as the header | Plan |
| Save control | Stays above the plan, becomes a `Button` | Placement settled in `save-and-view-plan`; visible without scrolling | Research |
| Defaults | Week 1; invalid hash falls back to week 1; no sticky switcher | Predictable and no scroll offset to manage | Plan |
| Image backdrop | `--surface` replaces `#fff`; allowlist emptied in the same phase | The guard fails if only one side changes | Plan |
| Router coupling | `PlanView` reads the hash; `PlanViewContent` takes `week` | Kitchen sink renders fixed weeks without a nested router | Plan |

## Scope

**In scope:** `--surface` token; `plan-stats` and `week-hash` helpers; `Card`, `Chip`, `WeekSwitcher`, `WeekPager`, `PlanSummary`; `PlanView` rewrite; saved-page details slot; Save as `Button`; spec rewrites; kitchen-sink plan cases and screenshots; guard and `CLAUDE.md` updates.

**Out of scope:** backend changes, responsive images, lightbox, all-weeks or print view, workout tracking, sticky switcher, skip link, ARIA tabs, the generation page's Retry and follow-up link, the `SavedPlanPage` My plans link, spacing and type-scale tokens.

## Architecture / Approach

Pure logic first (stats, hash), then presentational components, then one phase that rewrites `PlanView` and the two pages, then the visual gate, then the guard. `PlanView` reads the router hash and delegates to `PlanViewContent`, which takes the week as a prop. The existing `loading="lazy"` plus rendering one week at a time limits image requests; source images stay 800 px.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Token and derived data | `--surface`, `plan-stats`, `week-hash`, unit specs | Surface contrast below 4.5:1 for muted text |
| 2. Plan components | `Card`, `Chip`, `WeekSwitcher`, `WeekPager`, `PlanSummary` | Duplicate link names between switcher and pager |
| 3. PlanView rewrite and pages | One-week view, compact rows, details slot, Save as `Button`, rewritten specs | Five `PlanView.spec` tests and the guard allowlist changing together |
| 4. States and visual gate | Kitchen-sink plan cases, screenshots, measurements | Edge-length content breaking the layout |
| 5. Guard and rule | Extended guard, `--surface` required, `CLAUDE.md` block | Editing inside the CLI-managed block |

**Prerequisites:** `app-shell-layout` committed (done, `1167b12`); a signed-in session and a generated plan for the Phase 3 manual checks; the Playwright MCP for screenshots.
**Estimated effort:** about 3 sessions across 5 phases.

## Open Risks & Assumptions

- The layout is validated against `sample-plan.ts`, not a plan from the live pipeline; real output may have longer text than the sample.
- `app-shell-layout` has 13 open manual rows and `home-ui-contract` has open rows; archive those first or alongside.
- Thumbnails at 64 px are recognisable but small; the 800 px source files mean transfer per image is unchanged.
- The summary on the generation page has no goals; widening the backend job view is a separate, deferred change.

## Success Criteria (Summary)

- A week is a few screens instead of about 33, with rows at most about 80 px tall and no horizontal overflow at 375 px.
- The week lives in the URL hash, Back leaves the plan, and an invalid hash shows week 1.
- All plan states are in the kitchen sink and screenshotted at desktop and 375 px in light and dark, and a colour literal in a plan file fails `npm test`.
