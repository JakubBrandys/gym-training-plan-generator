---
change_id: home-ui-contract
title: Home view UI contract (tokens and shared components)
status: implementing
created: 2026-11-02
updated: 2026-11-02
archived_at: null
---

## Notes

UI change driven by `/10x-ui`. One view plus global tokens; not a whole-app restyle.

- **View:** `HomePage` at route `/` (`frontend/src/pages/HomePage.tsx`), the authenticated landing page.
- **Token source:** `frontend/src/index.css` (`:root` plus the `prefers-color-scheme: dark` override).
- **Contract variant:** plain CSS variables, extending the existing system. No Tailwind or shadcn, no second palette, no new dependency.
- **Components:** none exist yet as primitives; shared components go in `frontend/src/components/`, imported by path.
- **Pre-audit (2026-11-02):** `HomePage.tsx` has 0 hardcoded-value hits; `index.css` has 2 literal `#fff` (lines ~91, ~173); radius `4px` repeated across ~8 rules; no radius/spacing/on-accent tokens; no UI rules in the repo-owned part of `CLAUDE.md`.
- **Visual gate:** kitchen-sink page screenshotted at desktop and one mobile width (no screenshot-test tool in `frontend/`).
- **Open:** authenticated `/` not yet seen in a browser; needs a signed-in session or test credentials.
