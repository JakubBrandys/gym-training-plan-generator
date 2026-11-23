---
date: 2026-11-02T19:24:21+01:00
researcher: Claude Sonnet 5.5
git_commit: f300fa7045b31a2cb7aa0b9bba799ead83502c82
branch: ui-redesign
repository: 10xdevs
topic: "Ground a plan-view redesign (summary card, week switcher, session cards, compact exercise rows) against the plain-CSS-variables contract"
tags: [research, codebase, ui, plan-view, PlanView, images, specs, router]
status: complete
last_updated: 2026-11-02
last_updated_by: Claude Sonnet 5.5
---

# Research: Ground a plan-view redesign against the plain-CSS-variables contract

**Date**: 2026-11-02T19:24:21+01:00
**Researcher**: Claude Sonnet 5.5
**Git Commit**: f300fa7045b31a2cb7aa0b9bba799ead83502c82
**Branch**: ui-redesign
**Repository**: 10xdevs

## Research Question

Audit how a generated or saved plan is shown (`PlanView`, used by `PlanGenerationPage` and `SavedPlanPage`) against the plain-CSS-variables contract, to ground the decided redesign: a summary card, a week switcher showing one week at a time (W1–W8, prev/next, `#week-N` link), session cards, and compact exercise rows (56–64 px thumbnail, bold name, sets × reps and rest as chips, muted note). Answer: where the data for each part comes from on each page; which specs and assertions change; how the hash-based week state behaves in react-router 8; whether 56–64 px thumbnails stay legible and what they cost in transfer; what limits the layout must survive; and which tokens and components are missing. Write 3–5 charges. No CSS proposals.

## Summary

`PlanView` renders every week, session and exercise as one flat list (`frontend/src/components/PlanView.tsx:24-55`) and is the only plan renderer, mounted in exactly 2 places: `SavedPlanPage.tsx:75` and `PlanGenerationPage.tsx:168` (inspected `src` excluding specs and `src/dev`). In a kitchen-sink render of a realistic 8-week plan (8 weeks, 37 sessions, 222 exercises, 222 images, `frontend/src/dev/sample-plan.ts`) the view is 29,640 px tall with a 700 px main and 47,832 px with a 292 px main; exercise rows are 114 px and 222 px; the week heading computes to 20 px and the session heading to 16 px.

The decided design is feasible with four facts the plan has to respect. (1) The summary card's data is not the same on the two pages: the saved page has the stored form (goals, frequency, created date), while the generation page receives only the plan, because the job view deliberately returns only `status`, `stage`, `week`, `plan`, `error`. (2) Of the 7 `PlanView.spec.tsx` tests, 5 depend on all weeks being rendered at once or on the single-text-node `3 × 8-10, rest 90 s` format and will need rewriting; the two page specs only query `Week 1`, so they keep passing if week 1 is the default and stays an `h2`. (3) `PlanView.spec.tsx` renders without a router, so hash-based week state needs a `MemoryRouter` in the spec. (4) The app does not use `<ScrollRestoration>`, so switching weeks through hash links does not move the scroll position by itself.

Thumbnails: at 64 px the A/B start and end positions of the catalog images are still recognisable, at 56 px they are marginal, at 48 px they are not (screenshot `screenshots/thumbnail-size-test.png`). The 32 source files are 800 px wide and 14–54 KB each, so a smaller display size does not reduce per-image transfer; rendering one week at a time with the existing `loading="lazy"` does.

Five charges follow.

## Charges

**C1 — Accidental architecture: the whole plan is one flat list with no navigation** (priority: high)
- Evidence: `PlanView` maps all weeks, sessions and exercises in one pass (`frontend/src/components/PlanView.tsx:26-53`); the plan has exactly 8 weeks, 3–10 exercises per session and up to 7 sessions per week by validation (`backend/src/plan-generation/plan.prompts.ts` rules block; `backend/src/plan-generation/plan.validator.ts:8-9`; `plan-form.schema.ts:11-12`). In the sample render: 29,640 px (desktop, main 700 px) and 47,832 px (phone, main 292 px).
- User impact: finding week 6 means scrolling past five weeks, on a phone about 60 viewport heights of content, with no summary or orientation.

**C2 — Missing shared component: no Card, Chip, WeekSwitcher or plan summary, and the exercise numbers are inline text** (priority: high)
- Evidence: sets, reps and rest are one inline `<span>` after the name, `{exercise.sets} × {exercise.reps}, rest {exercise.restSeconds} s` (`PlanView.tsx:39-43`); `SavedPlanDetails` is a loose block of four spans (`frontend/src/components/SavedPlanDetails.tsx:9-16`), rendered inside a bare `<p>` on the saved page (`SavedPlanPage.tsx:72-74`) and not at all on the generation page; the generation page's Save and Retry controls are raw `<button>` elements and its follow-ups are plain `<p><Link>` (`PlanGenerationPage.tsx:124,191,198`). `frontend/src/components/` has `Button`, `ButtonLink`, the shell components and the two plan components only.
- User impact: the numbers that matter during a workout (sets × reps, rest) have the same weight as the exercise name, and nothing groups a session's rows as one unit.

**C3 — Missing tokens: no surface token, and the image backdrop is the one allowlisted literal** (priority: medium)
- Evidence: the token block has `--text`, `--text-muted`, `--bg`, `--border`, `--accent`, `--accent-hover`, `--on-accent`, `--error`, `--error-bg`, `--radius`, `--content-width`, `--narrow-width` and no raised-surface colour (`frontend/src/index.css:1-16` and the dark override); `.plan-exercise-image` has `background: #fff` (`index.css:321`), the single entry in `ALLOWED_INDEX_CSS_LITERALS` (`frontend/src/ui-contract.spec.ts:24`); headings are 20 px and 16 px (`index.css:284-292`).
- User impact: cards would need a distinguishable background in both themes, and in dark mode the image slot is a white box before the image loads (the files are opaque JPEGs, so the backdrop is visible only while loading).

**C4 — Accidental architecture: the summary data differs between the two pages** (priority: high for the plan, not a code defect)
- Evidence: the saved page has `SavedPlan` = summary plus `plan` (`frontend/src/lib/saved-plans.ts:9-16`), so goals, experience, frequency and `createdAt` are available; the generation page renders `state.plan` only (`PlanGenerationPage.tsx:168`). The backend job holds the form (`backend/src/plan-generation/plan-job.store.ts:21`), but `getJob` returns only `status`, `stage`, `week`, `plan`, `error` (`plan-generation.controller.ts:39-43,209-216`), a deliberate contract from `save-and-view-plan` (`context/archive/2026-10-27-save-and-view-plan/plan.md:92`).
- User impact: a summary card showing goals can exist on the saved page only; on the generation page it can show derived facts (weeks, sessions per week, exercise count) unless the backend contract is widened.

**C5 — Accidental architecture: spec and routing coupling to "all weeks at once"** (priority: medium)
- Evidence: `PlanView.spec.tsx:68-69` asserts both `Week 1` and `Week 2` level-2 headings; `:72-78` asserts three exercise names across both weeks; `:80-86` asserts the single text nodes `3 × 8-10, rest 90 s`, `4 × 6, rest 120 s`, `5 × 5, rest 150 s`; `:88-96` and `:98-109` assert images by alt and `getAllByRole('img')` length 2 across both weeks; the spec renders `<PlanView plan={plan} />` with no router. `Week 1` is the only plan-content heading the page specs query (`SavedPlanPage.spec.tsx:139,148,157,168`; `PlanGenerationPage.spec.tsx:153,167`), and their fixtures have a single week.
- User impact: none directly; it fixes how much test work the redesign carries and that week state through the URL hash needs a router in the component's spec.

**Deferred candidates (not charges):** responsive image variants (the catalog has one 800 px file per exercise and no image pipeline), an "all weeks" or print view, an image lightbox, the "My plans" link on `SavedPlanPage.tsx:79` (redundant with the header nav), workout tracking or per-week completion, and any backend change to expose the form on the generation job.

## Detailed Findings

### Source → views (where the plan is shown and what data each page has)

- `PlanView` takes `{ plan: PlanResult }` (`PlanView.tsx:24`); `PlanResult` is `{ weeks: PlanResultWeek[] }`, each week `{ week, goal, sessions }`, each session `{ title, exercises }`, each exercise `{ slug, name, sets, reps, restSeconds, note, imageKey }` (`frontend/src/lib/plan-generation.ts:14-37`).
- Saved page: heading `Saved plan` (`SavedPlanPage.tsx:58`), then `SavedPlanDetails` (date, `Experience: …`, `Days per week: a → b`, goals) and `PlanView` (`:72-75`), then a "My plans" link (`:78-80`). `SavedPlanDetails` also renders the rows of the saved-plans list (`SavedPlansPage.tsx:59`), and `SavedPlanPage.spec.tsx:160` asserts `Days per week: 3 → 5` and `:161` asserts `Run a faster 5k`.
- Generation page: heading `Your training plan` (`PlanGenerationPage.tsx:165`); in the `completed` state it renders `SavePlanControl` (Save plan button, `:124`) above `PlanView` (`:167-168`) and a "Create another plan" link (`:198`). The Save control sits above the plan so it stays visible on a long page (`save-and-view-plan` Deviation, `plan.md:223`).
- Derived summary facts are computable from `PlanResult` on both pages: week count, sessions per week for each week (first and last give the ramp), exercise count.

### View → source (PlanView markup and styling)

- Structure: `div.plan-view` → per week `section` with `h2` "Week N", a `p.hint` goal, `ul.plan-sessions` → per session `li` with `h3` title and `ul.plan-exercises` → per exercise `li` with an optional image and a text block (`PlanView.tsx:25-53`). Weeks have no `id`, no landmark label and no aria wiring (grep for `id=` and `aria-` in `PlanView.tsx`: 0 matches).
- Image: fixed `width`/`height` 112 with `loading="lazy"`, alt `"{name}, start and end position"`, hidden through `onError` (`PlanView.tsx:4-22`); CSS is a 7rem square with `object-fit: cover`, a border, the radius token and the `#fff` backdrop (`index.css:314-322`).
- Measured in the sample render (`frontend/src/dev/KitchenSinkPage.tsx` plan case, 1280 px and 375 px viewports): `h2` 20 px, `h3` 16 px, first exercise rows 114 px (main 700 px) and 222 px (main 292 px).

### Limits the layout must survive (from validation)

- Exactly 8 weeks; 3–10 exercises per session; sets 1–8; rest 15–600 s; reps at most 20 characters; note at most 200 characters; session title at most 80; week goal at most 200 (`plan.validator.ts:8-17`; `plan.prompts.ts` rules block). Frequency is 1–7 sessions per week, so a week has at most 7 sessions and up to 70 exercise rows by these limits.
- Estimate, not measured: a typical week of 5 sessions × 6 exercises at roughly 70 px per compact row is about 2,100–2,500 px, versus 29,640 px for the whole sample plan; the worst case by the limits (7 × 10) is about 5,000 px or more.

### Hash-based week state in react-router 8 (external check)

- Declared dependency: `react-router ^8.4.0` (`frontend/package.json`). The docs state `Link` accepts `to` as a string or a partial path including `hash`, supports `replace`, and that `preventScrollReset` only matters when `<ScrollRestoration>` is used (reactrouter.com/api/components/Link and NavLink, retrieved via Context7 on 2026-11-02).
- The app uses `<ScrollRestoration>` in 0 files (grep over `src`), so a week switch through a hash link neither resets nor restores scroll on its own; the page stays where the switcher was clicked.
- A saved-plan sign-in return path keeps the hash (`SignInPage.tsx:13-19` appends `state.from.hash`), so `/plans/<id>#week-3` survives a session-expiry sign-in; an explicit Sign out now drops the return path (`RequireAuth.tsx`).
- `PlanView.spec.tsx` has no router today, so a component that reads `useLocation` or renders `Link` needs `MemoryRouter` in that spec.

### Images: legibility and transfer

- Legibility, from `screenshots/thumbnail-size-test.png` (six catalog images at 112, 64, 56 and 48 px, rendered in the app): at 64 px both positions and the A/B markers are recognisable though small; at 56 px they are marginal; at 48 px they are not legible.
- Source files: 32 JPEGs in `frontend/public/exercises`, widths 800 px, three observed dimensions (800×800, 800×600, 800×533), 14–54 KB each, about 955 KB in total. The thumbnail size therefore does not change the bytes per image; only how many images are fetched does. With `loading="lazy"` already on every image and only the selected week rendered, a week's images are the only ones requested for it (inference from the existing attribute; not measured in a network panel).
- With a fixed square box and `object-fit: cover`, the 800×533 and 800×600 images are cropped to the box.

### Lessons applied

- `context/foundation/lessons.md` "Keep saved-plan data backward compatible with its stored shape": the redesign must not change `PlanResult` or `PlanForm`; summary values are derived on the client, and exposing the form on the generation job would be an additive backend change (deferred).
- "Amend plan.md when implementation deviates": the plan should expect Deviation notes.

## Code References

- `frontend/src/components/PlanView.tsx:4-22,24-55` - image size constant, image component, the flat plan list
- `frontend/src/components/SavedPlanDetails.tsx:9-16` - the loose details block used by the saved page and the list
- `frontend/src/pages/SavedPlanPage.tsx:58,72-75,78-80` - saved page structure
- `frontend/src/pages/PlanGenerationPage.tsx:124,165-168,191,198` - Save control, heading, plan, Retry and follow-up link
- `frontend/src/index.css:284-292,314-322` - plan heading sizes and image CSS incl. `background: #fff`
- `frontend/src/ui-contract.spec.ts:24` - the allowlisted literal
- `frontend/src/lib/plan-generation.ts:14-37` - plan types
- `frontend/src/lib/saved-plans.ts:9-16` - saved plan = summary + plan
- `backend/src/plan-generation/plan-generation.controller.ts:39-43,209-216` - job view contents
- `backend/src/plan-generation/plan.validator.ts:8-17` - plan limits
- `frontend/src/components/PlanView.spec.tsx:65-126` - the 7 PlanView tests
- `frontend/src/dev/sample-plan.ts` and `frontend/src/dev/KitchenSinkPage.tsx` - uncommitted sample plan and plan case

## Architecture Insights

- `PlanView` is a pure renderer of a validated `PlanResult`, so it can absorb navigation state without touching the data contract; the page-level components own loading, saving and auth.
- The shell fixes the available width at `--content-width` (48rem) and keeps headings unique per page; the plan keeps its page `h1`, week `h2` and session `h3`, and any summary or switcher should not add headings that collide with `getByRole('heading', { level: 2, name: 'Week N' })`.
- The contract holds up: tokens in one file, components in one directory, the guard scans `index.css` outside the token blocks and a fixed file list, and the kitchen sink is the visual gate.

## Historical Context (from prior changes)

- `context/archive/2026-10-25-plan-review-with-images/plan.md:48` says images are fixed 800×800 squares to avoid layout shift. Verdict: partial; the rendered box is a fixed square (`PlanView.tsx:12-18`, `index.css:314-322`), but of the 32 source files 3 dimensions are observed (800×800, 800×600, 800×533), so the sources are not all squares.
- `…/plan-review-with-images/plan.md:230` says each image is up to about 100 KB. Verdict: supported (maximum observed 54 KB).
- `…/plan-review-with-images/plan.md:230` says lazy loading limits initial transfer and the same file repeats across weeks so the cache serves repeats. Verdict: consistent with the code (`loading="lazy"` at `PlanView.tsx:18`); not measured here.
- `context/archive/2026-10-27-save-and-view-plan/plan.md:92` says `getJob` returns only `status`, `stage`, `week`, `plan`, `error`. Verdict: supported (`plan-generation.controller.ts:39-43`).
- `…/save-and-view-plan/plan.md:223` says the Save control sits above `PlanView` so it stays visible on a long page. Verdict: supported (`PlanGenerationPage.tsx:167-168`); the reason weakens with a one-week view but the placement still works.

## Related Research

- `context/changes/home-ui-contract/research.md`, `context/changes/app-shell-layout/research.md` - earlier audits of tokens, components and the shell this change builds on

## Open Questions

- **Plan decision, summary on the generation page:** show derived stats only (weeks, sessions per week, exercise count), or widen the backend job view to include the form so goals and date can show on both pages (additive, deferred by default).
- **Plan decision, week switcher semantics:** hash links with `aria-current`, versus an ARIA tabs pattern with roving focus; and whether a switch uses `replace` to avoid one history entry per week.
- **Plan decision, thumbnail size:** 64 px (recognisable in the test) versus 56 px (marginal).
- **Plan decision, default week and invalid hashes:** week 1 by default; behaviour for `#week-9` or `#foo` is not defined by any current code.
- **Plan decision, Save placement:** keep the Save control above the plan, or move it into the summary card on the generation page.
- **Not seen with a real model output:** the layout is validated against `sample-plan.ts`, not a plan from the live pipeline, and the real generation flow (progress, Save, "Create another plan") was not exercised in a browser.
