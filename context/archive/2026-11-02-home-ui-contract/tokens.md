# Token values: home-ui-contract

Source of truth in code: `frontend/src/index.css` (`:root` and the `prefers-color-scheme: dark` override). This file records where each new value came from so a later session does not invent it again.

## New tokens

| Token | Light | Dark | Role | Source |
| --- | --- | --- | --- | --- |
| `--on-accent` | `#fff` | `#16171d` | Text and icons on an accent-filled surface | Plan Phase 1; replaces the hardcoded `color: #fff` at `index.css:91`; dark value reuses the dark `--bg` so the label is dark on the light accent |
| `--accent-hover` | `#5f14a6` | `#d8b4fe` | Accent-filled surface while hovered | Plan Phase 1; light value is a darker step of `--accent`, dark value a lighter step |
| `--radius` | `4px` | `4px` | Corner radius for inputs, fieldsets, buttons, alerts, cards | Plan Phase 1; replaces 7 repeated `border-radius: 4px` literals |

## Existing tokens used as the base (unchanged)

| Token | Light | Dark |
| --- | --- | --- |
| `--accent` | `#7a1fd1` | `#c084fc` |
| `--bg` | `#fff` | `#16171d` |

## Contrast (WCAG relative luminance, computed 2026-11-02)

| Pair | Theme | Ratio | Meets 4.5:1 |
| --- | --- | --- | --- |
| `--on-accent` over `--accent` | light | 7.13 | yes |
| `--on-accent` over `--accent-hover` | light | 9.83 | yes |
| `--on-accent` over `--accent` | dark | 6.77 | yes |
| `--on-accent` over `--accent-hover` | dark | 10.12 | yes |

Before this change the dark-theme button label was `#fff` over `#c084fc`, a ratio of 2.64.

## Deferred

The `background: #fff` on `.plan-exercise-image` (`index.css`, `.plan-exercise-image` rule) is not tokenised: it is outside Home and may be a deliberate backdrop for exercise images.
