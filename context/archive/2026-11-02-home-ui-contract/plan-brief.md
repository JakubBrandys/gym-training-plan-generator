# Home View UI Contract — Plan Brief

> Full plan: `context/changes/home-ui-contract/plan.md`
> Research: `context/changes/home-ui-contract/research.md`

## What & Why

Give the signed-in Home view (`/`) a real design-system contract inside the existing plain-CSS-variables system, fixing the audit charges from the research. The visible defect is a white button label on the dark-theme accent at 2.64:1 contrast; the structural ones are no shared button component, bare links for the main actions, and unfinished states.

## Starting Point

Tokens exist for colour only (`frontend/src/index.css:1-26`) and no `.tsx` file reads them. There are no primitive components, so Home is raw `<button>`, `<a>`, `<dl>` and `<p>` with Sign out as its only filled button, a bare "Loading…", no retry on error and no hover style anywhere. Tests are Vitest only; there are no hooks, no CI lint and no CSS lint rule.

## Desired End State

Home shows "Create a training plan" as the primary button, "My plans" and Sign out as secondary, the admin link for admins, and the email and role as a muted line. Controls have token-driven hover, focus-visible and disabled styling, loading does not shift the layout, a failed load offers Retry, and Sign out shows a pending state. A dev-only `/dev/kitchen-sink` shows the states, and `npm test` fails when a colour literal creeps into the Home files or components.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Contract variant | Extend the existing plain-CSS-variables system, no new dependency | An existing system beats a better one brought in | Research |
| Home's role | Action-first hub, no new data or API | Fixes C3 and C5 and keeps `HomePage.spec.tsx` valid | Plan |
| Layout scope (C4) | Home only; Back links, `28rem` cap and other pages untouched | Honors one view per change; avoids editing 3 specs | Plan |
| Token scale (C2) | On-accent, accent-hover and `--radius` only | Fixes C1 and the 7 repeated radii without rewriting every rule | Plan |
| Components | `Button` and `ButtonLink` with primary/secondary variants; Card deferred | Only what Home uses | Plan |
| Visual gate | Dev-only `/dev/kitchen-sink`, screenshotted with the Playwright MCP | No new dependency; excluded from production | Plan |
| Guard | Vitest literal scan plus a `CLAUDE.md` rule block | A failing test beats a forgotten rule | Plan |
| `GENERIC_PLAN_ERROR` | Not a defect; rename left out | Text is generic, only the name is plan-flavoured | Research |

## Scope

**In scope:** `--on-accent`, `--accent-hover`, `--radius` tokens; `Button` and `ButtonLink`; `HomeView` and `HomePage` rebuild with retry and pending states; dev-only kitchen sink and screenshots; the Vitest guard; the `CLAUDE.md` UI block; `tokens.md`.

**Out of scope:** shared layout or nav and the `28rem` cap (C4); spacing and type scales; the duplicated Card; the `#fff` at `index.css:173`; the `GENERIC_PLAN_ERROR` rename; Tailwind, shadcn, Storybook or a Playwright dependency; CI or hook changes.

## Architecture / Approach

Fix the contract before the pixels: tokens, then components that read them, then the one view, then the state gallery, then the guard. The global `button` rule stays and takes the new tokens, so other pages change only in label colour. `HomeView` is a presentational component so the kitchen sink can render every state with fixed props; `HomePage` keeps the data loading and auth handling.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Token values | `--on-accent`, `--accent-hover`, `--radius`, `tokens.md` | Hover or on-accent pairs below 4.5:1 |
| 2. Button components | `Button` and `ButtonLink` with variants and specs | Other pages' global `button` look shifting |
| 3. Action-first Home | `HomeView`, retry, sign-out pending, updated specs | Breaking the four existing Home spec assertions |
| 4. States and visual gate | Dev-only kitchen sink, four screenshots | Sink code leaking into the production build |
| 5. Guard and rule | `ui-contract.spec.ts`, `CLAUDE.md` UI block | Editing inside the CLI-managed marker block |

**Prerequisites:** commit the uncommitted 10x-cli lesson sync first so the `CLAUDE.md` edit is a clean diff; a signed-in session for the Home manual checks; Playwright MCP for screenshots.
**Estimated effort:** about 2–3 sessions across 5 small phases.

## Open Risks & Assumptions

- Authenticated Home has not been seen in a browser yet; layout findings come from code, so Phase 3 manual checks may surface visual tweaks.
- The guard only runs when someone runs `npm test`; nothing in CI does today.
- `CLAUDE.md:28` still says the frontend has no test framework, which is stale; it is left alone here.

## Success Criteria (Summary)

- Button labels meet 4.5:1 in light and dark, and Home's primary action reads as primary.
- Loading, error, pending and disabled states are visible in the kitchen sink and screenshotted at desktop and 375 px in both themes.
- Adding a colour literal to the Home files or components fails `npm test`, and `CLAUDE.md` points the next agent at the tokens and components.
