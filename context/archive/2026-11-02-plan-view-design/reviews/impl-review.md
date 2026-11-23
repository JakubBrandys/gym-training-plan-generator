<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Plan View Design Implementation Plan

- **Plan**: context/changes/plan-view-design/plan.md
- **Scope**: Full plan (all five phases implemented; automated rows complete, manual rows still open)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria evidence (run during this review): phase 1-5 automated commands all pass: 22 + 21 + 32 + 50 targeted tests, full suite 27 files / 329 tests, `npm run build`, `npm run lint` (exit 0), no `kitchen-sink` in `dist`, `grep -c 'background: #fff' src/index.css` prints 0, the CLI block hash is identical at f300fa7 and b4c3df7. The 15 manual rows (1.4, 1.5, 2.4, 3.4-3.9, 4.3-4.6, 5.4, 5.5) are unticked, which is acknowledged as pending, not drift.

## Findings

### F1 — Week links: accessible name does not contain the visible text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/WeekSwitcher.tsx:16-18
- **Detail**: Each link shows `W3` but has `aria-label="Week 3"`. WCAG 2.5.3 (Label in Name) needs the visible label inside the accessible name; "W3" is not a substring of "Week 3", so a voice-control user saying "click W3" gets no match. The plan prescribed this label; `WeekSwitcher.spec.tsx` and `PlanView.spec.tsx` assert it, so the spec locks the mismatch in.
- **Fix**: Change the label to `W3, week 3` (visible text first), and update the two specs' queries.
- **Decision**: FIXED — aria-label now `W{n}, week {n}`; WeekSwitcher and PlanView spec queries updated

### F2 — Week change drops keyboard focus and announces nothing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/WeekPager.tsx:12-27, frontend/src/components/PlanView.tsx:78-91
- **Detail**: Verified in code. On the transition into week 1 or the last week the clicked pager link is replaced by `<span />`, so the focused element unmounts and focus falls to `<body>`. Clicking "Next week" at the bottom also leaves the scroll position at the bottom of the new week, and nothing announces the new week (no focus move, no live region). The plan's "no scroll restoration" decision covers scroll, not focus.
- **Fix A ⭐ Recommended**: On a week change (not on first mount) focus the week `h2` (`tabIndex={-1}`), which also scrolls it into view and gives screen readers the new heading.
  - Strength: One small effect in `PlanViewContent`; fixes focus loss, scroll and announcement together, and the heading is already the contract (`h2` named `Week N`).
  - Tradeoff: Needs an effect that skips the initial render, otherwise opening `#week-3` steals focus on load; plus a spec for it.
  - Confidence: MED — standard pattern for in-page navigation; the skip-first-render detail needs a test.
  - Blind spot: Not checked how it feels with the sticky header covering the heading (may need `scroll-margin-top`).
- **Fix B**: Only scroll the `h2` into view and leave focus alone.
  - Strength: No focus management, no tab stop on a heading.
  - Tradeoff: Keyboard users still lose focus when the pager link disappears; no announcement.
  - Confidence: MED — fixes only the scroll half.
  - Blind spot: Screen-reader behaviour not tested.
- **Decision**: FIXED via Fix A — week h2 (tabIndex -1) takes focus on week change, not on first mount; scroll-margin-top 5rem; 3 specs

### F3 — "Retry" on the generation page is still a raw `<button>`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/pages/PlanGenerationPage.tsx:192
- **Detail**: Save plan now uses `Button`, Retry in the same file still relies on the legacy global `button` rule. This is explicitly out of scope in the plan ("No change to the generation page's Retry button"), so it is not drift; it stays a recorded deferral and keeps the global `button` rule alive.
- **Fix**: Leave deferred (already listed in plan and research); when done, use `<Button onClick={handleRetry}>` and remove the global `button` rule.
- **Decision**: SKIPPED — Retry stays a raw button, deferred by the plan

### F4 — Week selection is by `week.week`, navigation is by position

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/PlanView.tsx:78 and 82-88
- **Detail**: `PlanViewContent` finds the section with `candidate.week === week` and falls back to `weeks[0]`, while hash, switcher and pager use positions 1..`weeks.length`. The backend validator enforces exactly 8 weeks with `week.week === index + 1` (`plan.validator.ts:115-127`), so this only differs on a corrupted or legacy stored row (the lessons register treats `PlanResult` as a persisted contract). Then `#week-3` would silently show week 1 while the switcher marks W3 current. Empty `weeks` does not crash.
- **Fix A ⭐ Recommended**: Leave as is; record the backend invariant and the lessons rule as the reason.
  - Strength: No code change for a state the validator already forbids.
  - Tradeoff: A malformed saved row shows wrong content without an error.
  - Confidence: HIGH — validator lines verified by the reviewing agent.
  - Blind spot: Older saved rows from before the validator were not inspected.
- **Fix B**: Select by position (`plan.weeks[week - 1]`) and render `id` from the position.
  - Strength: Hash, switcher, pager and content can never disagree.
  - Tradeoff: Ignores `week.week`, so the heading would show the stored number or the position depending on the choice; small spec update.
  - Confidence: MED — behaviour change on data that should not exist.
  - Blind spot: Whether any consumer links to `#week-N` by stored number.
- **Decision**: ACCEPTED (Fix A) — leave selection by week.week; the backend validator guarantees week.week === index + 1

### F5 — Switcher: current week can be off-screen at 375 px; small touch targets

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/index.css (`.week-switcher`, `.week-pager a`)
- **Detail**: Inferred from layout, not yet measured: at 343 px of content eight links (about 48 px each plus gaps) scroll sideways, so opening `#week-7` or `#week-8` leaves the filled link out of view. Link height is about 34 px (passes WCAG 2.5.8's 24 px, not the 44 px recommendation); pager links are plain text at about 24 px. Relates to manual row 3.8.
- **Fix**: Scroll the `aria-current` link into view in an effect, and add vertical padding to the pager links; confirm in manual row 3.8 first.
- **Decision**: FIXED — switcher scrolls its strip to centre the current week (verified at 375 px with #week-8), switcher link 42 px high, pager links padded; unit spec added

### F6 — Edge-length fixtures fall short of the limits; CLAUDE.md omits `PlanSummary`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/dev/sample-plan.ts:137-150, CLAUDE.md (### UI contract)
- **Detail**: Phase 4 says the edge plan is built to the validation limits (goal and notes 200, reps 20). Actual: goal 184, notes 198, reps 19 (title 80, 8 sets, 600 s, 10 exercises, 7 sessions are exact); the Phase 4 Deviation reports the lengths but not the shortfall. Phase 5 says the components list adds `PlanSummary` (and the other plan components); the CLAUDE.md block names Card and Chip and describes the plan view, but never names `PlanSummary` or its path.
- **Fix**: Extend the three strings to exactly 200/200/20 characters and add `PlanSummary` to the components bullet; re-run the sink screenshot for the edge case.
- **Decision**: FIXED — edge goal, notes and reps are now exactly 200/200/20 characters; CLAUDE.md names PlanSummary, WeekSwitcher and WeekPager; edge screenshots refreshed

### F7 — Test gaps around week switching

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/PlanView.spec.tsx, WeekPager.spec.tsx
- **Detail**: Not covered: a failed image in week 1 not leaking into week 2 and back; an encoded hash such as `#week-2%20`; the pager links using `replace` (only the switcher is asserted); a session with zero exercises; a plan whose `week` numbers differ from the index. The rest of the suite had no vacuous assertions.
- **Fix**: Add the failed-image-across-weeks and pager-`replace` tests; add the rest only if F4 Fix B is chosen.
- **Decision**: FIXED — specs added: failed image not carried across weeks, pager replace, encoded hashes (#week-2%20, #week-%D9%A2)

### F8 — Saving from the generation page resets the week

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: frontend/src/pages/PlanGenerationPage.tsx (SavePlanControl navigation)
- **Detail**: After Save the app navigates to `/plans/<id>` without a hash, so a user who was reading week 5 lands on week 1. Unchanged behaviour and not part of the plan; noted only because the week now lives in the URL.
- **Fix**: Carry the current hash into the navigation, or leave as is.
- **Decision**: SKIPPED — Save keeps navigating to /plans/<id> without a hash
