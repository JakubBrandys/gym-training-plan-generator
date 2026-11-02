# Home View UI Contract Implementation Plan

## Overview

Give the signed-in Home view (`/`) a real design-system contract inside the existing plain-CSS-variables system. Add an on-accent colour token (fixing the dark-mode button contrast), an accent-hover token and a radius token; add `Button` and `ButtonLink` components; rebuild Home as an action-first hub with finished states; gate it with a dev-only kitchen-sink page; and leave a guard (a Vitest literal scan plus a `CLAUDE.md` rule) so the next agent keeps using the tokens and components. No new dependency.

## Current State Analysis

- Tokens: seven colour tokens plus a dark override live in `frontend/src/index.css:1-26`. Only `index.css` uses `var(--…)`; no `.tsx` file references a token. There is no radius, spacing or type token.
- Components: `frontend/src/components/` holds `PlanView.tsx` and `SavedPlanDetails.tsx` only. Buttons, links and inputs are styled by global element selectors (`index.css:84-102`).
- Defect: `button { color: #fff }` sits over `--accent` (`index.css:90-91`); in dark mode `--accent` is `#c084fc` (`index.css:22`), a computed 2.64:1 label contrast (7.13:1 in light).
- Home (`frontend/src/pages/HomePage.tsx:59-89`) is a profile `<dl>` (email, role), three bare `<p><Link>` rows, and "Sign out" as the only filled button. Loading is a bare paragraph, the error alert has no retry, and Sign out has no pending state.
- No hover/active rule exists in `index.css`; focus uses one global `:focus-visible` outline in the accent colour (`index.css:104-107`).
- Tooling: Vitest has a `unit` project (`src/**/*.spec.ts`, node) and a `components` project (`src/**/*.spec.tsx`, jsdom) (`frontend/vite.config.ts`). There are no git hooks, no CI lint/test step (`.github/workflows` has deploy workflows only), and oxlint has no CSS rule (`frontend/.oxlintrc.json`).

## Desired End State

Opening `/` signed in shows a clear primary action ("Create a training plan"), a secondary "My plans", the admin link for admins, the email and role as a muted line, and a quiet Sign out. Every control has hover, focus-visible and disabled styling driven by tokens; the loading state does not shift the layout; a failed `/me` load offers Retry; Sign out shows a pending state. Button labels meet 4.5:1 contrast in both themes. A dev-only `/dev/kitchen-sink` page shows the states side by side and is absent from the production build. A failing `npm test` (not a forgotten rule) catches literal colours in the Home files and components, and `CLAUDE.md` tells the next agent where tokens and components live.

Verification: the per-phase checks below, plus screenshots at desktop and 375 px in light and dark.

### Key Discoveries:

- `HomePage.spec.tsx:46-76` pins the link names `Registered users` and `My plans`, `findByText('MEMBER')`, `getByText('Loading…')` and `role="alert"` on error; the Home rebuild must keep them valid.
- `findByText('MEMBER')` needs the role rendered in its own element, with no surrounding text in that element.
- Four specs assert the "Back to home" link on other pages (`SavedPlanPage.spec.tsx:170`, `AdminUsersPage.spec.tsx:144,156`, `SavedPlansPage.spec.tsx:129`); this change leaves those pages untouched.
- The `#fff` at `index.css:173` backs `.plan-exercise-image` and is outside Home; it stays and goes on the guard's one-entry allowlist.
- `signOut` awaits `supabase.auth.signOut()` (`frontend/src/auth/AuthProvider.tsx:29-31`), so a pending state can wrap the awaited call.
- Code style from the project: `const` arrow functions and no code comments in `frontend/` code.

## What We're NOT Doing

- No shared `AppLayout` or navigation, no removal of the "Back to home" links, no change to the `28rem` `#root` cap (charge C4, deferred; Home only).
- No spacing or type-size scale (C2 partly deferred; only `--radius` and the colour tokens are added).
- No `Card` component and no change to the duplicated card rules at `index.css:190-197` and `223-230` (deferred).
- No change to the `#fff` at `index.css:173`.
- No rename of `GENERIC_PLAN_ERROR` (naming nit).
- No Tailwind, shadcn, Storybook, Playwright dependency or manual dark-mode toggle; no CI or hook changes.
- No change to other pages' markup; they keep the global `button` rule.

## Implementation Approach

Fix the contract before the pixels: tokens first (Phase 1), then the two components that read them (Phase 2), then the one view that uses them (Phase 3), then show every state and screenshot it (Phase 4), then lock it in (Phase 5). The global `button` rule stays and gets the new tokens, so pages outside Home change only in the label colour; `Button` adds explicit variants on top. Visual checks use the Playwright MCP against the dev server; each visual phase re-runs the hardcoded-value scan. Write all new code as `const` arrow functions with no comments.

Hardcoded-value scan used throughout (candidate list, not a verdict):

```bash
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(' <files>
```

## Critical Implementation Details

- **Spec compatibility:** the role must be rendered in its own element (for example a `<span>`) so `findByText('MEMBER')` keeps matching, and the loading text must stay exactly `Loading…`.
- **Dev-only route:** the kitchen-sink route object must be created only when `import.meta.env.DEV` is true and load its page through a dynamic import, so the production build contains no trace of it (checked in Phase 4).

## Phase 1: Token values

### Overview

Add the missing colour and radius tokens, replace the literals they cover, and deposit the values in the change folder so the next session does not invent them again.

### Changes Required:

#### 1. Token block

**File**: `frontend/src/index.css`

**Intent**: Define `--on-accent` and `--accent-hover` per theme beside `--accent`, and a single `--radius`, then use them in the rules that currently hardcode the label colour and the `4px` radius.

**Contract**: New tokens in `:root` and in the dark override: `--on-accent` (light `#fff`, dark `#16171d`), `--accent-hover` (light `#5f14a6`, dark `#d8b4fe`), `--radius: 4px` (theme-independent). `button` uses `var(--on-accent)` for its colour and `var(--accent-hover)` on hover. The 7 `border-radius: 4px` rules (`index.css:60,76,89,119,172,194,229`) use `var(--radius)`. The `#fff` at line 173 is left as is. Contrast of `--on-accent` over `--accent` and over `--accent-hover` must be at least 4.5:1 in both themes; adjust the hover values if a pair falls short.

#### 2. Deposited values

**File**: `context/changes/home-ui-contract/tokens.md`

**Intent**: Record the new token values, where each came from, and the four computed contrast ratios, so the values live in the repo and not only in this plan.

**Contract**: A table of token, light value, dark value, source (this plan, contrast computation) and the four WCAG ratios (on-accent over accent and over accent-hover, light and dark).

### Success Criteria:

#### Automated Verification:

- Literal scan of `index.css` outside the token blocks finds only the `background: #fff` in `.plan-exercise-image`: `cd frontend && grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/index.css`
- No `border-radius: 4px` literal remains: `cd frontend && grep -c 'border-radius: 4px' src/index.css` prints 0
- Existing suite passes: `cd frontend && npm test`
- Build and lint pass: `cd frontend && npm run build && npm run lint`

#### Manual Verification:

- `tokens.md` lists the new tokens and all four contrast ratios, each at least 4.5:1
- Sign-in, My plans and Registered users look unchanged in light and dark apart from the button label colour

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Button components

### Overview

Add the two importable components Home needs, built on the Phase 1 tokens, with named variants and states.

### Changes Required:

#### 1. Button

**File**: `frontend/src/components/Button.tsx`, `frontend/src/index.css`

**Intent**: A `<button>` wrapper with `primary` and `secondary` variants, so views choose a variant instead of writing one-off styles.

**Contract**: `Button` props: native button props plus `variant?: 'primary' | 'secondary'` (default `primary`). It renders a `.btn` class plus `.btn-secondary` for the secondary variant. CSS adds the secondary look (transparent background, `var(--border)` border, `var(--text)` colour; hover and focus change border and text to `var(--accent)`), a token-driven primary hover, and the disabled look. The existing global `button` rule is kept so other pages are unaffected.

#### 2. ButtonLink

**File**: `frontend/src/components/ButtonLink.tsx`

**Intent**: A router `Link` styled as a button, for navigation actions, with the same variants.

**Contract**: Props: react-router `Link` props plus the same `variant`; renders an `<a>` with the same `.btn` classes. Link semantics are preserved (role `link`, `href`).

#### 3. Component specs

**File**: `frontend/src/components/Button.spec.tsx`, `frontend/src/components/ButtonLink.spec.tsx`

**Intent**: Pin the variant class, the disabled behaviour and the link semantics.

**Contract**: Specs run in the `components` Vitest project; `ButtonLink` is rendered inside `MemoryRouter`.

**Deviation (2026-11-02)**: The variant-to-class logic lives in a small shared helper, `frontend/src/components/button-class.ts` (`buttonClassName`, `ButtonVariant`), used by both `Button` and `ButtonLink`, instead of being written twice. Why: it keeps the two components from drifting and avoids exporting a non-component from a component file (`react/only-export-components`). `Button` also defaults `type` to `button`.

### Success Criteria:

#### Automated Verification:

- Component specs pass: `cd frontend && npx vitest run src/components/Button.spec.tsx src/components/ButtonLink.spec.tsx`
- No colour literals in the new components: `cd frontend && grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/Button.tsx src/components/ButtonLink.tsx` prints nothing
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

---

## Phase 3: Action-first Home

### Overview

Rebuild Home from the tokens and the new components, with finished states, while keeping every existing spec assertion valid.

### Changes Required:

#### 1. HomeView

**File**: `frontend/src/pages/HomeView.tsx`

**Intent**: A presentational view for Home so the kitchen sink in Phase 4 can render every state with fixed props.

**Contract**: Props: `state: MeState` (loading, ready with `me`, or error), `signingOut: boolean`, `onSignOut: () => void`, `onRetry: () => void`. Layout: `h1`; one muted `.status` line that reads `Loading…` while loading and shows the email and the role (role in its own element) when ready, so loading and ready occupy the same line and the layout does not shift; on error an `role="alert"` message plus a secondary Retry `Button`; a primary `ButtonLink` "Create a training plan" to `/plans/new`; a secondary `ButtonLink` "My plans" to `/plans`; for an ADMIN a secondary `ButtonLink` "Registered users" to `/admin/users`; a secondary `Button` "Sign out" that shows `Signing out…` and is disabled while `signingOut`.

#### 2. HomePage

**File**: `frontend/src/pages/HomePage.tsx`

**Intent**: Keep the data loading and auth handling, delegate rendering to `HomeView`, and add retry and sign-out pending behaviour.

**Contract**: The `/me` effect becomes re-runnable (retry resets state to loading and re-requests); `signingOut` is set before awaiting `signOut()` and cleared in a `finally`. Auth-failure handling and the cancelled-request guard are unchanged.

#### 3. Specs

**File**: `frontend/src/pages/HomePage.spec.tsx`

**Intent**: Keep the four existing tests unchanged and add tests for the new behaviour.

**Contract**: New tests: Retry re-requests `/me` and shows the profile on success; Sign out shows `Signing out…`, disables the button and calls `signOut` once; the primary and secondary actions are links with the expected `href`s.

### Success Criteria:

#### Automated Verification:

- Home specs pass, including the four existing tests: `cd frontend && npx vitest run src/pages/HomePage.spec.tsx`
- No colour literals in the Home files: `cd frontend && grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/pages/HomePage.tsx src/pages/HomeView.tsx` prints nothing
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`

#### Manual Verification:

- Signed in, `/` shows "Create a training plan" as the filled primary button, "My plans" and "Sign out" as secondary, and "Registered users" only for an ADMIN
- With network throttling, going from loading to ready causes no vertical layout shift
- A forced `/me` failure shows the alert and Retry, and Retry recovers when the API is back
- Sign out shows `Signing out…` disabled, then lands on `/sign-in`
- In dark mode all Home button labels are readable

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: States and visual gate

### Overview

Show every state of Home in one place and screenshot it, so the gate does not depend on a happy path.

### Changes Required:

#### 1. Kitchen-sink page

**File**: `frontend/src/dev/KitchenSinkPage.tsx`

**Intent**: Render `HomeView` in each state with fixed props, plus the `Button` variants in default and disabled, side by side.

**Contract**: States shown: loading, ready as MEMBER, ready as ADMIN, error, signing out (pending and disabled). Hover and focus-visible are exercised on the real controls (Playwright hover and Tab). Empty is marked N/A on the page with the reason: Home has no list.

**Deviation (2026-11-02)**: The sink's own styles (`.kitchen-sink-*`) live in `frontend/src/dev/kitchen-sink.css`, imported by `KitchenSinkPage.tsx`, not in `index.css`. Why: the first build put the sink class names into the production stylesheet, which failed criterion 4.1; a stylesheet imported only by the lazy page stays out of production.

#### 2. Dev-only route

**File**: `frontend/src/router/router.tsx`

**Intent**: Expose the page at `/dev/kitchen-sink` only in development, outside `RequireAuth` so it can be screenshotted without a session.

**Contract**: The route object is added only when `import.meta.env.DEV` is true and loads the page with a dynamic import, so the production build has no kitchen-sink code.

#### 3. Screenshots

**File**: `context/changes/home-ui-contract/screenshots/`

**Intent**: Keep the review evidence next to the change.

**Contract**: Four images from the Playwright MCP: 1280 px wide and 375 px wide, each in light and dark (colour scheme emulation).

### Success Criteria:

#### Automated Verification:

- Production build contains no kitchen-sink code: `cd frontend && npm run build && grep -rli 'kitchen-sink' dist` prints nothing
- Full suite and lint pass: `cd frontend && npm test && npm run lint`

#### Manual Verification:

- `/dev/kitchen-sink` under `npm run dev` shows default, loading, error, pending and disabled states, and marks empty N/A with a reason
- Hover and keyboard focus are visible on every control, driven by tokens, in light and dark
- The four screenshots are saved and show no overflow at 375 px and readable labels in dark mode
- Every control has an accessible name (checked in the Playwright snapshot)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Guard and rule

### Overview

Make the contract survive the next session: a failing test for literal colours and a rule telling agents where the tokens and components live.

### Changes Required:

#### 1. Literal-scan spec

**File**: `frontend/src/ui-contract.spec.ts`

**Intent**: Fail `npm test` when a colour literal appears in the Home files, the new components, or `index.css` outside the token blocks.

**Contract**: Runs in the `unit` Vitest project (node). Scans `HomePage.tsx`, `HomeView.tsx`, `Button.tsx`, `ButtonLink.tsx` for hex, `rgb(`, `hsl(` and `oklch(` literals, and scans `index.css` with the `:root` token blocks removed. One named allowlist entry covers `background: #fff` in `.plan-exercise-image`; the entry is removed when that literal is later tokenised.

**Deviation (2026-11-02)**: The scan also covers `button-class.ts`, `dev/KitchenSinkPage.tsx` and `dev/kitchen-sink.css`, asserts each file is non-empty, and checks that the token block defines `--accent`, `--accent-hover`, `--on-accent` and `--radius` (and that the dark block overrides the three accent tokens). It reads files with `node:fs` plus a `/// <reference types="node" />` directive in the spec. Why: `?raw` imports return an empty string for plain CSS under Vitest, which made the CSS checks pass vacuously, and `tsconfig.app.json` only includes `vite/client` types, so `node:fs` needs the directive to pass `tsc -b`.

#### 2. UI rule block

**File**: `CLAUDE.md`

**Intent**: Tell the next agent where tokens and components live and to use them.

**Contract**: A short `### UI contract` section placed in the repo-owned part, before the `<!-- BEGIN @przeprogramowani/10x-cli -->` marker. It names `frontend/src/index.css` (tokens in `:root`), `frontend/src/components/` (`Button`, `ButtonLink`), the rules "check the components directory before creating a component" and "no literal colours in views — use tokens", the kitchen sink at `/dev/kitchen-sink` (dev only), and the guard spec. Nothing inside the marker block changes.

### Success Criteria:

#### Automated Verification:

- Guard spec passes: `cd frontend && npx vitest run src/ui-contract.spec.ts`
- Full suite, build and lint pass: `cd frontend && npm test && npm run build && npm run lint`
- The CLI-managed block is unchanged by this phase: `sed -n '/BEGIN @przeprogramowani/,/END @przeprogramowani/p' CLAUDE.md | sha256sum` equals the hash taken before the edit

#### Manual Verification:

- Temporarily adding `color: #123456` to `HomeView.tsx` makes the guard spec fail, and it passes again after reverting
- The `CLAUDE.md` UI block reads correctly and sits outside the CLI marker block

---

## Testing Strategy

### Unit Tests:

- `Button` and `ButtonLink`: variant class, disabled behaviour, link `href` and role.
- `HomePage`: the four existing tests unchanged; Retry; Sign out pending; action links and hrefs.
- `ui-contract.spec.ts`: literal scan with a one-entry allowlist.

### Integration Tests:

- None added; the frontend has no browser test runner and none is installed for this change.

### Manual Testing Steps:

1. Run `cd frontend && npm run dev`, sign in, and walk `/` in light and dark, including a forced `/me` failure and Retry.
2. Open `/dev/kitchen-sink`, Tab through every control, hover each, and capture the four screenshots with the Playwright MCP.
3. Open sign-in, My plans and Registered users and confirm only the button label colour changed.

## Performance Considerations

None expected. The kitchen sink is excluded from the production bundle and checked in Phase 4.

## Migration Notes

- The 10x-cli lesson sync left uncommitted changes (`CLAUDE.md`, `.claude/skills/**`, the manifest) in the working tree; commit them separately before Phase 1 so this change's `CLAUDE.md` edit is a clean, small diff.
- Deferred items stay in `research.md` `## Charges` with reasons: spacing and type scale (C2 remainder), layout/nav and the `28rem` cap (C4), the duplicated Card, the `#fff` at `index.css:173`, the `GENERIC_PLAN_ERROR` rename.

## References

- Related research: `context/changes/home-ui-contract/research.md`
- Home view: `frontend/src/pages/HomePage.tsx:59-89`
- Token block: `frontend/src/index.css:1-26`
- Contrast defect: `frontend/src/index.css:90-91`
- Home spec constraints: `frontend/src/pages/HomePage.spec.tsx:46-76`
- Vitest projects: `frontend/vite.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token values

#### Automated

- [x] 1.1 Literal scan of `index.css` outside the token blocks finds only the `background: #fff` in `.plan-exercise-image` — 69fc23b
- [x] 1.2 No `border-radius: 4px` literal remains — 69fc23b
- [x] 1.3 Existing suite passes — 69fc23b
- [x] 1.4 Build and lint pass — 69fc23b

#### Manual

- [ ] 1.5 `tokens.md` lists the new tokens and all four contrast ratios, each at least 4.5:1
- [ ] 1.6 Sign-in, My plans and Registered users look unchanged in light and dark apart from the button label colour

### Phase 2: Button components

#### Automated

- [x] 2.1 Component specs pass — 69fc23b
- [x] 2.2 No colour literals in the new components — 69fc23b
- [x] 2.3 Full suite, build and lint pass — 69fc23b

### Phase 3: Action-first Home

#### Automated

- [x] 3.1 Home specs pass, including the four existing tests — 69fc23b
- [x] 3.2 No colour literals in the Home files — 69fc23b
- [x] 3.3 Full suite, build and lint pass — 69fc23b

#### Manual

- [ ] 3.4 Signed in, `/` shows "Create a training plan" as the filled primary button, "My plans" and "Sign out" as secondary, and "Registered users" only for an ADMIN
- [ ] 3.5 With network throttling, going from loading to ready causes no vertical layout shift
- [ ] 3.6 A forced `/me` failure shows the alert and Retry, and Retry recovers when the API is back
- [ ] 3.7 Sign out shows `Signing out…` disabled, then lands on `/sign-in`
- [ ] 3.8 In dark mode all Home button labels are readable

### Phase 4: States and visual gate

#### Automated

- [x] 4.1 Production build contains no kitchen-sink code — 69fc23b
- [x] 4.2 Full suite and lint pass — 69fc23b

#### Manual

- [ ] 4.3 `/dev/kitchen-sink` under `npm run dev` shows default, loading, error, pending and disabled states, and marks empty N/A with a reason
- [ ] 4.4 Hover and keyboard focus are visible on every control, driven by tokens, in light and dark
- [ ] 4.5 The four screenshots are saved and show no overflow at 375 px and readable labels in dark mode
- [ ] 4.6 Every control has an accessible name (checked in the Playwright snapshot)

### Phase 5: Guard and rule

#### Automated

- [x] 5.1 Guard spec passes — 69fc23b
- [x] 5.2 Full suite, build and lint pass — 69fc23b
- [x] 5.3 The CLI-managed block is unchanged by this phase — 69fc23b

#### Manual

- [ ] 5.4 Temporarily adding `color: #123456` to `HomeView.tsx` makes the guard spec fail, and it passes again after reverting
- [ ] 5.5 The `CLAUDE.md` UI block reads correctly and sits outside the CLI marker block
