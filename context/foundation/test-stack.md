# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.65.1
- config: frontend/playwright.config.ts
- single-spec command: cd frontend && npx playwright test tests/e2e/seed.spec.ts
- full-suite command: cd frontend && npx playwright test
- base URL: http://localhost:4173
- port: 4173 (detected from the Vite preview default; override with E2E_PORT; the backend the app talks to runs on E2E_API_PORT, default 3100, because 3000 is usually taken by a local dev backend)
- web server command: npm run build && npm run preview -- --port $E2E_PORT --strictPort; reuseExistingServer outside CI
- auth setup project: setup (frontend/tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in frontend/.env
- storageState: frontend/playwright/.auth/user.json (gitignored)
- seed: frontend/tests/e2e/seed.spec.ts — protects risk #1: a generation job that no longer exists ends in a start-again state, not endless progress
- browser CLI: playwright-cli, command skill at .claude/skills/playwright-cli/
- updated: 2026-11-23
