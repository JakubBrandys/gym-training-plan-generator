# Plan View Design Implementation Plan

## Overview

Rebuild how a generated or saved training plan is shown. `PlanView` becomes a summary card, a week switcher that shows one week at a time (hash links `#week-N` with `aria-current`, switching replaces the history entry), session cards, and compact exercise rows with a 64 px thumbnail and sets × reps and rest as chips. It adds a `--surface` token and `Card`, `Chip`, `WeekSwitcher`, `WeekPager` and `PlanSummary` components, extends the existing plain-CSS-variables system, and adds no dependency.

## Current State Analysis

- `PlanView` renders every week, session and exercise as one flat list (`frontend/src/components/PlanView.tsx:24-55`). It is mounted in exactly 2 places: `SavedPlanPage.tsx:75` and `PlanGenerationPage.tsx:168`. In the kitchen-sink render of a realistic plan (8 weeks, 37 sessions, 222 exercises, `frontend/src/dev/sample-plan.ts`) it is 29,640 px tall at 1280 px and 47,832 px at 375 px; exercise rows are 114 px and 222 px; the week heading is 20 px and the session heading 16 px.
- Sets, reps and rest are one inline `<span>` after the name (`PlanView.tsx:39-43`). The image is a 112 px attribute, 7rem CSS square with `background: #fff` (`PlanView.tsx:4-22`, `frontend/src/index.css:314-322`), the one allowlisted literal (`frontend/src/ui-contract.spec.ts:24`).
- Data differs per page: the saved page has the stored form (`SavedPlan` = summary + plan, `frontend/src/lib/saved-plans.ts:9-16`) and renders `SavedPlanDetails` above the plan (`SavedPlanPage.tsx:72-75`); the generation page renders the plan only, because `getJob` returns just `status`, `stage`, `week`, `plan`, `error` (`backend/src/plan-generation/plan-generation.controller.ts:39-43,209-216`). Its Save control is a raw `<button>` above the plan (`PlanGenerationPage.tsx:124,167-168`).
- Limits the layout must survive: exactly 8 weeks, 3–10 exercises per session, up to 7 sessions per week, reps at most 20 characters, notes and week goals at most 200, session titles at most 80 (`backend/src/plan-generation/plan.validator.ts:8-17`, `plan-form.schema.ts:11-12`).
- Images: 32 JPEGs, 800 px wide, 14–54 KB, three source shapes; the A/B positions stay recognisable at 64 px, marginal at 56 px (`context/changes/plan-view-design/screenshots/thumbnail-size-test.png`).
- Router: react-router `^8.4.0`; the app uses `<ScrollRestoration>` nowhere, so a hash link does not move the scroll. `PlanView.spec.tsx` renders without a router today; the page specs already use `MemoryRouter`.

## Desired End State

A saved or generated plan opens on a summary card ("8 weeks · 4→5 sessions a week", "37 sessions · 29 different exercises", plus the saved plan's details on the saved page), a week switcher (W1–W8), and one week of session cards with compact rows; a pager at the bottom moves to the previous or next week. The URL hash selects the week (`#week-3`), switching replaces the history entry, and an invalid hash falls back to week 1. A typical week is a few screens instead of about 33. The kitchen sink shows the plan cases, and the guard spec scans the new files with no allowlisted literal.

Verification: the per-phase checks below, plus screenshots at 1280 px and 375 px in light and dark.

### Key Discoveries:

- The two page specs only query `Week 1` and use one-week fixtures; 5 of the 7 `PlanView.spec.tsx` tests (`:65-126`) assume all weeks at once or the single text node `3 × 8-10, rest 90 s` and are rewritten.
- `getByRole('heading', { level: 2, name: 'Week 1' })` is the contract the specs use: the week heading stays an `h2` with exactly that name and `PlanView` adds no other `h2`.
- Removing the `#fff` literal and the guard's allowlist entry must happen in the same phase, or the guard fails in between.
- Code style from the project: `const` arrow functions and no code comments in `frontend/` code.

## What We're NOT Doing

- No backend change: the job view does not expose the form, so the generation page's summary is derived stats only.
- No responsive image variants, no image lightbox, no all-weeks or print view, no workout tracking or per-week completion.
- No sticky week switcher and no skip link; the header's sticky behaviour is unchanged.
- No ARIA tabs pattern: the switcher is a set of links.
- No change to the generation page's Retry button or its "Create another plan" link, and no change to the "My plans" link on `SavedPlanPage` (still deferred).
- No spacing or type-scale tokens, no `GENERIC_PLAN_ERROR` rename, no new dependency.

## Implementation Approach

Pure logic and components first, the one phase that changes what users see second, the visual gate third, the guard last. Settled decisions: the summary shows derived stats on both pages, with the saved page adding its details through a slot; "exercise count" is shown as total sessions and different exercises (counted by slug); the ramp is `first→last sessions a week`, or a single number when equal; switcher pattern is hash links with `aria-current` and `replace`; thumbnail is 64 px; Save stays above the plan and becomes a `Button`. Derived by me from the research: week 1 is the default and an invalid hash falls back to it; a pager at the bottom complements the top switcher; neither is sticky; the image backdrop uses `--surface`; `PlanView` reads the hash and hands a `week` prop to a presentational `PlanViewContent` so the kitchen sink can render fixed weeks inside the existing router. All new code is `const` arrow functions with no comments; CSS lives in `index.css` and uses tokens only. Each visual phase re-runs the scan:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(' <new files>
```

## Critical Implementation Details

- **Router in `PlanView`:** `PlanView` calls `useLocation()`, so `PlanView.spec.tsx` must render inside `MemoryRouter`; the presentational `PlanViewContent` takes `week` as a prop and needs a router only for its links.
- **Heading names:** week headings are `h2` named exactly `Week N`; session headings are `h3`; the summary, switcher and pager add no headings.
- **Hash parsing:** only `#week-N` with N from 1 to the week count selects a week; anything else (`#week-0`, `#week-9`, `#week-03`, `#foo`, empty) shows week 1.
- **History:** week links use `replace` so Back leaves the plan instead of stepping through weeks.
- **Image contract kept:** `alt` is `"{name}, start and end position"`, `src` is `/{imageKey}`, `loading="lazy"`, `width` equals `height`, and a failed image is removed while the row keeps its text.

## Phase 1: Token and derived data

### Overview

Add the surface token and the two pure helpers the components will use. No visible change yet: nothing reads `--surface` until Phase 2.

### Changes Required:

#### 1. Surface token

**File**: `frontend/src/index.css`, `context/changes/plan-view-design/tokens.md`

**Intent**: Give cards a distinguishable background in both themes and deposit the values and contrast in the change folder.

**Contract**: `--surface: #f6f4f9` in the light `:root` block and `--surface: #1f2029` in the dark override. Contrast, computed with the WCAG formula: text `#2b2833` on surface 13.22 and muted `#6b6375` 5.24 and accent `#7a1fd1` 6.53 (light); text `#f3f4f6` 14.71, muted `#9ca3af` 6.38, accent `#c084fc` 6.13 (dark). `tokens.md` records token, values, role, source and these ratios.

#### 2. Plan statistics

**File**: `frontend/src/lib/plan-stats.ts`, `frontend/src/lib/plan-stats.spec.ts`

**Intent**: Derive the summary numbers from a `PlanResult` on both pages.

**Contract**: `planStats(plan): { weeks, firstWeekSessions, lastWeekSessions, sessions, differentExercises }` where `differentExercises` counts distinct `slug`; `formatRamp(stats): string` returns `"4→5 sessions a week"`, `"4 sessions a week"` when first and last are equal, and `"1 session a week"` for one. The spec (`unit` project) covers a ramped plan, an equal plan, repeated exercises counted once, and an empty plan (zeros).

#### 3. Week hash

**File**: `frontend/src/lib/week-hash.ts`, `frontend/src/lib/week-hash.spec.ts`

**Intent**: One place that maps the URL hash to a week and back.

**Contract**: `weekFromHash(hash: string, weekCount: number): number` returns N for `#week-N` with `1 <= N <= weekCount` (no leading zeros), otherwise 1; `weekHash(week: number): string` returns `#week-N`. The spec covers `#week-3`, `#week-8`, `#week-9`, `#week-0`, `#week-03`, `#foo`, the empty string and a one-week plan.

### Success Criteria:

#### Automated Verification:

- Stats and hash specs pass: `cd frontend && npx vitest run src/lib/plan-stats.spec.ts src/lib/week-hash.spec.ts`
- No colour literals in the new data files: `cd frontend && grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/lib/plan-stats.ts src/lib/week-hash.ts` prints nothing
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- `tokens.md` records `--surface` for both themes and every contrast ratio at least 4.5:1
- The app looks unchanged, because `--surface` is not used yet

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Plan components

### Overview

Add the presentational components with their CSS and specs. They are not mounted yet, so no page changes.

### Changes Required:

#### 1. Card and Chip

**File**: `frontend/src/components/Card.tsx`, `frontend/src/components/Chip.tsx`, `frontend/src/index.css`, specs

**Intent**: A surface container and a small pill, so views stop hand-writing bordered boxes.

**Contract**: `Card` renders a `div.card` and forwards other `div` attributes (`className`, `role`, `aria-label`); `Chip` renders `span.chip` with its children. CSS: `.card` uses `--surface`, a `--border` border, `--radius` and padding; `.chip` is a pill with `--bg` and a `--border` border, `--text` colour, so it separates from the card background by its border.

#### 2. WeekSwitcher and WeekPager

**File**: `frontend/src/components/WeekSwitcher.tsx`, `frontend/src/components/WeekPager.tsx`, `frontend/src/index.css`, specs

**Intent**: Move between weeks through hash links.

**Contract**: `WeekSwitcher({ weekCount, current })` renders `<nav aria-label="Weeks">` with one `Link` per week to `weekHash(n)` with `replace`, text `W{n}`, `aria-label="Week {n}"`, and `aria-current="page"` on the current one; on narrow screens the row scrolls sideways without overflowing the page. `WeekPager({ weekCount, current })` renders `<nav aria-label="Week pager">` with a previous link (`‹ Week {n-1}`, `aria-label="Previous week (Week {n-1})"`) unless on week 1 and a next link (`Week {n+1} ›`, `aria-label="Next week (Week {n+1})"`) unless on the last week, keeping the layout stable when one is absent. Specs run inside `MemoryRouter`.

#### 3. PlanSummary

**File**: `frontend/src/components/PlanSummary.tsx`, `frontend/src/index.css`, spec

**Intent**: One summary card for both pages.

**Contract**: `PlanSummary({ plan, children })` renders a `Card` with `role="group"` and `aria-label="Plan summary"` showing `"{weeks} weeks · {formatRamp}"` and `"{sessions} sessions · {differentExercises} different exercises"` from `planStats`, then `children` (the saved page's details) when given. It renders no heading.

### Success Criteria:

#### Automated Verification:

- Component specs pass: `cd frontend && npx vitest run src/components/Card.spec.tsx src/components/Chip.spec.tsx src/components/WeekSwitcher.spec.tsx src/components/WeekPager.spec.tsx src/components/PlanSummary.spec.tsx`
- Guard spec still passes, so the new CSS uses tokens only: `cd frontend && npx vitest run src/ui-contract.spec.ts`
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- Sign-in, Home and the plan pages look unchanged, because the new components are not mounted yet

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: PlanView rewrite and pages

### Overview

Rebuild `PlanView`, wire the two pages, tokenise the image backdrop and rewrite the specs. This is the phase where users see the new design.

### Changes Required:

#### 1. PlanViewContent and PlanView

**File**: `frontend/src/components/PlanView.tsx`, `frontend/src/index.css`

**Intent**: Show one week at a time inside session cards with compact rows.

**Contract**: `PlanViewContent({ plan, week, details })` renders, in order: `PlanSummary` (with `details` as children), `WeekSwitcher`, the selected week's `<section id="week-{n}">` with `h2` `Week {n}`, the week goal as `p.hint`, and `ul.plan-sessions` whose items are `Card`s with an `h3` `Session {i} · {title}` and a muted `{count} exercises`; then `WeekPager`. Each exercise row has a 64 px thumbnail (`width` and `height` 64, `loading="lazy"`, same `alt` and `src` contract, removed on error, absent for a null key), the name in bold, `Chip`s `{sets} × {reps}` and `rest {restSeconds} s`, and the note as `p.hint`. `PlanView({ plan, details })` reads `useLocation().hash`, computes `weekFromHash(hash, plan.weeks.length)` and renders `PlanViewContent`. CSS: `.plan-exercise-image` becomes 4rem with `background: var(--surface)` (the `#fff` literal is removed); the `.plan-view h2` and `h3` sizes give a clear step between week and session headings.

#### 2. Pages

**File**: `frontend/src/pages/SavedPlanPage.tsx`, `frontend/src/pages/PlanGenerationPage.tsx`

**Intent**: Give each page the right summary data and move Save to the shared button.

**Contract**: `SavedPlanPage` passes `details={<SavedPlanDetails createdAt={…} form={…} />}` to `PlanView` and drops the wrapping `<p>`; `PlanGenerationPage` passes no details; its `SavePlanControl` uses `Button` (primary) in place of the raw `<button>`, still above the plan, with the same label and disabled behaviour.

#### 3. Specs and guard allowlist

**File**: `frontend/src/components/PlanView.spec.tsx`, `frontend/src/ui-contract.spec.ts`

**Intent**: Pin the new behaviour and remove the allowlisted literal in the same phase it disappears.

**Contract**: `PlanView.spec.tsx` renders inside `MemoryRouter` with the two-week fixture and covers: week 1 only by default (no `Week 2` heading); `#week-2` shows week 2 only; `#week-9`, `#foo` and no hash show week 1; the switcher links and `aria-current`; the pager's absent previous on week 1 and absent next on the last week; exactly one level-2 heading; session headings and exercise counts; chips `3 × 8-10` and `rest 90 s`; image `alt`, `src`, lazy loading, equal fixed dimensions of 64, absence for a null key and removal of a failed image; the summary's derived stats; and the details slot present only when passed. `ui-contract.spec.ts` sets `ALLOWED_INDEX_CSS_LITERALS` to an empty list. The two page specs keep their `Week 1` and `Save plan` assertions unchanged.

**Deviation (2026-11-02)**: (1) `lib/plan-stats.ts` also exports `formatCount(count, noun)` (singular for 1, plural otherwise), used by `formatRamp`, `PlanSummary` and the session exercise count, so a one-week or one-session plan does not read "1 weeks"; it has its own spec cases. (2) `PlanGenerationPage.spec.tsx` gains one test asserting that Save plan has the shared button class (`btn`) and sits before the plan in document order, because no existing test would catch a return to the raw `<button>`. (3) `PlanSummary.spec.tsx` uses a fixture whose session count (7) differs from its different-exercise count (8); the first version had both at 7 and a deliberate break swapping them stayed green. (4) CSS also adds `.plan-summary > :not(.plan-summary-stats)` spacing for the saved page's details.

### Success Criteria:

#### Automated Verification:

- PlanView and page specs pass, including the Save plan assertions: `cd frontend && npx vitest run src/components/PlanView.spec.tsx src/pages/SavedPlanPage.spec.tsx src/pages/PlanGenerationPage.spec.tsx`
- The allowlisted literal is gone and the guard passes with an empty allowlist: `cd frontend && grep -c 'background: #fff' src/index.css` prints 0 and `npx vitest run src/ui-contract.spec.ts` passes
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- Signed in, a saved plan shows the summary card with its details, the week switcher and one week of session cards
- Switching weeks updates the content, the URL hash and `aria-current`, and Back leaves the plan instead of stepping through weeks
- `/plans/<id>#week-3` opens week 3 and survives a reload, and an invalid hash shows week 1
- A generated plan on the generation page shows the derived-stats summary without goals, with Save above the plan and working
- At 375 px the rows are compact, the switcher scrolls sideways and the page has no horizontal overflow
- In dark mode the cards, chips and thumbnails are legible

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: States and visual gate

### Overview

Show the plan view in every relevant state in the kitchen sink and screenshot it. This phase also adopts the uncommitted groundwork on the branch: `frontend/src/dev/sample-plan.ts`, the plan case in `KitchenSinkPage.tsx` and the `.kitchen-sink-case > h2` fix in `kitchen-sink.css`.

### Changes Required:

#### 1. Kitchen-sink plan cases

**File**: `frontend/src/dev/KitchenSinkPage.tsx`, `frontend/src/dev/sample-plan.ts`, `frontend/src/dev/kitchen-sink.css`

**Intent**: Render `PlanViewContent` with fixed weeks so every state is visible at once.

**Contract**: Cases: week 1 (4 sessions); the last week (deload, no next in the pager); the saved-page variant (summary with details) and the generation-page variant (summary without details); an edge plan built to the validation limits (a session title of 80 characters, a week goal and notes of 200, reps of 20 characters, 8 sets, 600 s rest, one session with 10 exercises, one week with 7 sessions); a plan whose rows have no images; and a row whose image failed to load. The old `PlanView` case is replaced. Empty is marked N/A with a reason (a plan always has 8 weeks). Hover and focus-visible are exercised on the real links with Playwright hover and Tab.

#### 2. Screenshots and measurements

**File**: `context/changes/plan-view-design/screenshots/`

**Intent**: Keep review evidence next to the change.

**Contract**: Four images from the Playwright MCP: 1280 px and 375 px wide, each in light and dark. Record the computed height of the rendered week, the first exercise row height at both widths, and the horizontal scroll width at 375 px.

**Deviation (2026-11-02)**: The screenshot set is larger than four images: saved-page week 1 (light and dark, both widths), generation-page week 8, the edge-length plan and the failing-image case (light, both widths), taken with the sticky header forced static so it does not float mid-page in a full-page capture. The sink's top case is a live `PlanView` that follows this page's URL hash, so the real hash and `replace` behaviour can be tried in the browser. Evidence recorded from the Playwright run (header static, sink frame): at 1280 px week 1 (4 sessions, 24 rows) is 2,430 px and the generation-page week 8 (5 sessions) is 3,023 px, versus 29,640 px for the old whole-plan view; exercise rows are 66–83 px (the taller ones carry a note); the thumbnail renders 66 px square (64 px plus the 1 px border); there is no horizontal page overflow at either width; each of the six switcher cases has exactly one `aria-current="page"`; hover turns links `--accent`, focus-visible shows a 2px accent outline, and the current week stays filled with a dark label in dark mode; no control lacks an accessible name and the switcher, pager and summary add no headings; the failing-image case drops the failed image (24 → 23 images) and keeps the row. At 375 px, inside the sink's nested padding, rows are 86–210 px; with the sink padding removed to match the real page (text column 216 px) rows are 66–131 px with a median of 107 px and week 1 is 3,035 px, so the "about 80 px" row target holds at desktop width only and phone rows are taller because names, chips and notes wrap. The edge-length plan (7 sessions, a 10-exercise session, an 80-character title, 184-character goal, 198-character notes, 8 sets, 600 s rest) wraps without overflow.

### Success Criteria:

#### Automated Verification:

- Production build contains no kitchen-sink code: `cd frontend && npm run build && grep -rli 'kitchen-sink' dist` prints nothing
- Full suite and lint pass: `cd frontend && npm test && npm run lint`

#### Manual Verification:

- `/dev/kitchen-sink` under `npm run dev` shows the plan cases (week 1, last week, with and without details, edge plan, no images, failed image) and marks empty N/A with a reason
- Hover and keyboard focus are visible on every week link and pager link, driven by tokens, in light and dark
- The four screenshots are saved; a typical week (4–5 sessions of 6 exercises) is at most about 3,000 px tall at 1280 px, exercise rows are at most about 80 px tall, and there is no horizontal overflow at 375 px
- Every control has an accessible name, and each case has exactly one `aria-current="page"` in the switcher

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Guard and rule

### Overview

Make the redesign survive the next session: extend the guard to the new files and token, and update the rule block.

### Changes Required:

#### 1. Guard spec

**File**: `frontend/src/ui-contract.spec.ts`

**Intent**: Scan the new plan files for colour literals and require the surface token.

**Contract**: Add to `GUARDED_FILES`: `./components/Card.tsx`, `./components/Chip.tsx`, `./components/WeekSwitcher.tsx`, `./components/WeekPager.tsx`, `./components/PlanSummary.tsx`, `./components/PlanView.tsx`, `./lib/plan-stats.ts`, `./lib/week-hash.ts`, `./dev/sample-plan.ts`. Add `--surface` to `REQUIRED_TOKENS`. The allowlist stays empty.

#### 2. UI rule block

**File**: `CLAUDE.md`

**Intent**: Tell the next agent how plans are rendered.

**Contract**: Update the `### UI contract` section above the CLI marker: the components list adds `Card`, `Chip`, `WeekSwitcher`, `WeekPager`, `PlanSummary` and `PlanView`; one line says plans render one week at a time, the week lives in the URL hash through `lib/week-hash.ts`, summary numbers come from `lib/plan-stats.ts`, and `PlanView` needs a router; the surface token is named; the kitchen-sink line covers the plan cases. Nothing inside the marker block changes.

### Success Criteria:

#### Automated Verification:

- Guard spec passes with the extended file list, the surface token and an empty allowlist: `cd frontend && npx vitest run src/ui-contract.spec.ts`
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`
- The CLI-managed block is unchanged by this phase: `sed -n '/BEGIN @przeprogramowani/,/END @przeprogramowani/p' CLAUDE.md | sha256sum` equals the hash taken before the edit

#### Manual Verification:

- Temporarily adding `color: #123456` to `PlanSummary.tsx` makes the guard spec fail, and it passes again after reverting
- The `CLAUDE.md` UI block mentions the plan components, the week hash, the stats helper and the router requirement, and sits outside the CLI marker block

---

## Testing Strategy

### Unit Tests:

- `plan-stats` and `week-hash`: ramps, equal frequency, repeated exercises, empty plan, valid and invalid hashes.
- `Card`, `Chip`, `WeekSwitcher`, `WeekPager`, `PlanSummary`: rendering, links, `aria-current`, absent previous and next, no headings.
- `PlanView`: week selection by hash, fallbacks, heading structure, chips, images, details slot.
- Page specs: unchanged `Week 1` and `Save plan` assertions still pass.
- `ui-contract.spec.ts`: extended file list, `--surface`, empty allowlist.

### Integration Tests:

- None added; the frontend has no browser test runner and none is installed for this change.

### Manual Testing Steps:

1. Run `cd frontend && npm run dev`, sign in, generate a plan and walk the generation page (summary, Save above the plan, switching weeks), then save it and open the saved plan with and without a hash.
2. Check week links, the pager, Back behaviour, a reload on `#week-3` and an invalid hash.
3. Open `/dev/kitchen-sink`, Tab through the switcher and pager, hover the links, and capture the four screenshots with the Playwright MCP.

## Performance Considerations

Only the selected week is rendered, so only its images are requested through the existing `loading="lazy"`; the source files stay 800 px (14–54 KB each), so a smaller thumbnail does not reduce bytes per image. Responsive variants are deferred.

## Migration Notes

- Work continues on branch `ui-redesign`, after `app-shell-layout` (`1167b12`).
- The uncommitted groundwork (`sample-plan.ts`, the sink plan case, the `.kitchen-sink-case > h2` fix) is adopted by Phase 4 and committed with it.
- `app-shell-layout` still has 13 open manual rows and `home-ui-contract` has open rows (3.4–3.8 describe the replaced Home); resolve them before archiving those changes.
- Local `main` is one commit ahead (`69fc23b`); that is unrelated to this change.
- Deferred items stay in `research.md`: responsive images, lightbox, all-weeks or print view, workout tracking, widening the backend job view, the generation page's Retry and follow-up link, the `SavedPlanPage` My plans link.

## References

- Related research: `context/changes/plan-view-design/research.md`
- Earlier changes this builds on: `context/changes/app-shell-layout/plan.md`, `context/changes/home-ui-contract/plan.md`
- Current renderer: `frontend/src/components/PlanView.tsx:24-55`, `frontend/src/index.css:284-292,314-322`
- Pages: `frontend/src/pages/SavedPlanPage.tsx:72-75`, `frontend/src/pages/PlanGenerationPage.tsx:124,165-168`
- Job view: `backend/src/plan-generation/plan-generation.controller.ts:39-43,209-216`
- Limits: `backend/src/plan-generation/plan.validator.ts:8-17`
- Guard: `frontend/src/ui-contract.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token and derived data

#### Automated

- [x] 1.1 Stats and hash specs pass
- [x] 1.2 No colour literals in the new data files
- [x] 1.3 Full suite, build and lint pass

#### Manual

- [ ] 1.4 `tokens.md` records `--surface` for both themes and every contrast ratio at least 4.5:1
- [ ] 1.5 The app looks unchanged, because `--surface` is not used yet

### Phase 2: Plan components

#### Automated

- [x] 2.1 Component specs pass
- [x] 2.2 Guard spec still passes, so the new CSS uses tokens only
- [x] 2.3 Full suite, build and lint pass

#### Manual

- [ ] 2.4 Sign-in, Home and the plan pages look unchanged, because the new components are not mounted yet

### Phase 3: PlanView rewrite and pages

#### Automated

- [x] 3.1 PlanView and page specs pass, including the Save plan assertions
- [x] 3.2 The allowlisted literal is gone and the guard passes with an empty allowlist
- [x] 3.3 Full suite, build and lint pass

#### Manual

- [ ] 3.4 Signed in, a saved plan shows the summary card with its details, the week switcher and one week of session cards
- [ ] 3.5 Switching weeks updates the content, the URL hash and `aria-current`, and Back leaves the plan instead of stepping through weeks
- [ ] 3.6 `/plans/<id>#week-3` opens week 3 and survives a reload, and an invalid hash shows week 1
- [ ] 3.7 A generated plan on the generation page shows the derived-stats summary without goals, with Save above the plan and working
- [ ] 3.8 At 375 px the rows are compact, the switcher scrolls sideways and the page has no horizontal overflow
- [ ] 3.9 In dark mode the cards, chips and thumbnails are legible

### Phase 4: States and visual gate

#### Automated

- [x] 4.1 Production build contains no kitchen-sink code
- [x] 4.2 Full suite and lint pass

#### Manual

- [ ] 4.3 `/dev/kitchen-sink` under `npm run dev` shows the plan cases (week 1, last week, with and without details, edge plan, no images, failed image) and marks empty N/A with a reason
- [ ] 4.4 Hover and keyboard focus are visible on every week link and pager link, driven by tokens, in light and dark
- [ ] 4.5 The four screenshots are saved; a typical week (4–5 sessions of 6 exercises) is at most about 3,000 px tall at 1280 px, exercise rows are at most about 80 px tall, and there is no horizontal overflow at 375 px
- [ ] 4.6 Every control has an accessible name, and each case has exactly one `aria-current="page"` in the switcher

### Phase 5: Guard and rule

#### Automated

- [x] 5.1 Guard spec passes with the extended file list, the surface token and an empty allowlist
- [x] 5.2 Full suite, build and lint pass
- [x] 5.3 The CLI-managed block is unchanged by this phase

#### Manual

- [ ] 5.4 Temporarily adding `color: #123456` to `PlanSummary.tsx` makes the guard spec fail, and it passes again after reverting
- [ ] 5.5 The `CLAUDE.md` UI block mentions the plan components, the week hash, the stats helper and the router requirement, and sits outside the CLI marker block
