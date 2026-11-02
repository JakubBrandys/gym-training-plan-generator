# Token values: app-shell-layout

Source of truth in code: `frontend/src/index.css` (`:root`). This file records where each new value came from so a later session does not invent it again. Colour tokens are unchanged: the header and footer reuse `--bg`, `--border`, `--text`, `--text-muted` and `--accent` from `home-ui-contract` (`context/changes/home-ui-contract/tokens.md`).

## New tokens

| Token | Light | Dark | Role | Source |
| --- | --- | --- | --- | --- |
| `--content-width` | `48rem` | `48rem` | Maximum width of the header content, the page's `<main>` and the footer in the signed-in shell | Plan Phase 2; replaces the single global `max-width: 28rem` on `#root`; wide enough for plan content, narrow enough to keep line lengths readable |
| `--narrow-width` | `28rem` | `28rem` | Maximum width of the sign-in and sign-up layout (and the dev kitchen sink) | Plan Phase 2; keeps the previous `28rem` for forms, now named |

Both are theme-independent, so they are defined once in the light `:root` block and the dark override does not repeat them.

## Breakpoint (not a token)

The header becomes `position: sticky` from `min-width: 40rem` and is static below it (plan decision: a two-row header at 375 px would hold about an eighth of the viewport). CSS custom properties cannot be used inside media queries, so `40rem` is written in the `@media` rule in `index.css`.

## Contrast

No new colour pairs. Header text uses `--text` on `--bg`, the muted identity line and footer use `--text-muted` on `--bg` (5.73:1 light, 7.04:1 dark, from `home-ui-contract`), and the active link uses `--accent` on `--bg` (7.13:1 light, 6.77:1 dark).

## Deferred

Spacing and type-size tokens (charge C2 remainder) are still literals; the `background: #fff` on `.plan-exercise-image` is still not tokenised.
