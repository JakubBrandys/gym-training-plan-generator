# Token values: plan-view-design

Source of truth in code: `frontend/src/index.css` (`:root` and the `prefers-color-scheme: dark` override). This file records where each new value came from so a later session does not invent it again. Other tokens are unchanged (`context/changes/home-ui-contract/tokens.md`, `context/changes/app-shell-layout/tokens.md`).

## New token

| Token | Light | Dark | Role | Source |
| --- | --- | --- | --- | --- |
| `--surface` | `#f6f4f9` | `#1f2029` | Background of raised containers (cards) and the image placeholder; sits next to `--bg` and `--border` | Plan Phase 1; replaces the `background: #fff` literal on `.plan-exercise-image` once Phase 3 lands; values chosen so muted text and the accent keep at least 4.5:1 on the surface |

## Contrast on `--surface` (WCAG relative luminance, computed 2026-11-02)

| Pair | Theme | Ratio | Meets 4.5:1 |
| --- | --- | --- | --- |
| `--text` over `--surface` | light | 13.22 | yes |
| `--text-muted` over `--surface` | light | 5.24 | yes |
| `--accent` over `--surface` | light | 6.53 | yes |
| `--text` over `--surface` | dark | 14.71 | yes |
| `--text-muted` over `--surface` | dark | 6.38 | yes |
| `--accent` over `--surface` | dark | 6.13 | yes |

Chips sit on a card with `--bg` as their own background and a `--border` outline; `--bg` against `--surface` is only 1.09 (light) and 1.10 (dark), so the border, not the fill, separates a chip from its card.

## Not tokenised (deferred)

Spacing and type-size scales remain literals in the rules.
