# Plan review with images Implementation Plan

## Overview

Show each exercise's catalog image in the generated 8-week plan, so the user can review the whole plan visually before deciding to save it (roadmap S-04; FR-007, FR-011, US-01). The change adds an image reference to the plan result on the backend, sets up component testing on the frontend, and renders a lazy-loaded inline image per exercise in `PlanView`. Saving is out of scope and belongs to S-05.

## Current State Analysis

- `frontend/src/components/PlanView.tsx` already renders all 8 weeks when a job completes: week goal, session titles, and per exercise the name, sets × reps, rest and note. It shows no images.
- `PlanResultExercise` carries `slug`, `name`, `sets`, `reps`, `restSeconds` and `note`, but no image reference (`backend/src/plan-generation/plan.schema.ts:33`, mirrored in `frontend/src/lib/plan-generation.ts:14`).
- `toPlanResult` (`backend/src/plan-generation/plan-pipeline.service.ts:188`) builds a slug → name map from the catalog and spreads it into each exercise. The catalog passed to it comes from `ExercisesService.findAll()`, so the full `Exercise` rows, including `imageKey`, are already in hand.
- `CatalogExercise` (`backend/src/plan-generation/plan.prompts.ts:5`) is a `Pick` that omits `imageKey`, because the prompts do not use it.
- All 32 catalog images exist as `frontend/public/exercises/<slug>.jpg`, 800×800 JPEGs showing the start (A) and end (B) position. `Exercise.imageKey` is `exercises/<slug>.jpg` (`backend/prisma/seed-data/exercises.json`). The Cloudflare Workers static-assets deployment serves them from the frontend origin.
- `frontend/wrangler.jsonc` sets `not_found_handling: single-page-application`, so a request for a missing image returns `index.html` with status 200.
- The frontend already has Vitest (`frontend/vite.config.ts`), but it runs in a `node` environment and only includes `src/**/*.spec.ts`. React components cannot be rendered in tests yet. The CLAUDE.md statement that the frontend has no test framework is stale.
- The plan is shown at `/plans/generate/:jobId` (`frontend/src/pages/PlanGenerationPage.tsx`), and the job store is in-memory (`plan-job.store.ts`), so a backend restart drops jobs and there is no persisted data to migrate.

## Desired End State

When plan generation completes, the review page shows every exercise of every week with its image next to its details. Images load lazily as the user scrolls. If an image cannot be loaded, the exercise still shows all its text and no broken image appears. The frontend can render components in tests, and `PlanView` has component specs for the image behavior.

Verify by generating a plan against the running stack and scrolling through all 8 weeks, then running the backend and frontend test suites.

### Key Discoveries:

- `plan-pipeline.service.ts:188` is the single place where the plan result is assembled, so it is the one backend change point for the contract.
- `plan-pipeline.service.spec.ts:31-36` already builds catalog fixtures with `imageKey`, and `plan-pipeline.service.spec.ts:224` asserts the result shape, so that spec needs updating.
- The SPA fallback in `frontend/wrangler.jsonc` means a missing image file returns HTML, not a 404. The `<img>` still fires its `error` event because the body is not a decodable image, so an `onError` fallback is sufficient.
- Lesson (`context/foundation/lessons.md`): amend this plan with a dated Deviation note if implementation diverges from a phase contract.
- Project style: no code comments, and const arrow functions rather than function declarations (see memory notes `no-code-comments`, `prefer-function-expressions`).

## What We're NOT Doing

- Saving, discarding or listing plans (S-05, FR-009, FR-010).
- Editing or regenerating part of the plan (FR-008, parked).
- A thumbnail + enlarge dialog, an expand-on-demand image, or a week accordion. All weeks stay expanded and images stay inline.
- Splitting the A/B image into two separate images, or generating new images.
- Changing the catalog, the seed data or the image files.
- Adding `imageKey` to the model prompts. The model should not see it.
- Updating the stale frontend-testing line in CLAUDE.md. That is repo guidance outside this change.

## Implementation Approach

Three phases, each independently verifiable. First extend the backend result contract so the image reference travels with each exercise. Then make component rendering testable on the frontend, using a baseline spec of the current `PlanView`. Last, render the images and add specs for the new behavior. The frontend renders `/<imageKey>` straight from the plan result, so the catalog row stays the single source of truth for which file belongs to which exercise.

## Critical Implementation Details

- **User experience spec** — A missing file does not 404 (SPA fallback), but the `<img>` `error` event still fires. On error, or when `imageKey` is `null`, the exercise row renders without the image slot and keeps all its text. Image dimensions are fixed, as 800×800 squares, to avoid layout shift while lazy images load.

## Phase 1: Backend — image reference in the plan result

### Overview

Add `imageKey` to each exercise in the plan result and populate it from the catalog.

### Changes Required:

#### 1. Plan result types

**File**: `backend/src/plan-generation/plan.schema.ts`

**Intent**: Let the plan result carry the image reference for each exercise, so the frontend does not have to derive file names from slugs.

**Contract**: `PlanResultExercise` gains `imageKey: string | null`. `GeneratedPlan` and the zod schema are unchanged, because the model does not produce this field. `null` is used only if the catalog lookup misses, which cannot happen in practice because slugs are enum-constrained by the same catalog.

#### 2. Result assembly

**File**: `backend/src/plan-generation/plan-pipeline.service.ts`

**Intent**: Populate `imageKey` in `toPlanResult` from the catalog rows already loaded for the job, alongside the name.

**Contract**: `toPlanResult` accepts catalog entries that include `imageKey` (the loaded `Exercise` rows already do). It resolves name and `imageKey` from one slug-keyed lookup. `CatalogExercise` and the prompt builders stay as they are, so the prompts do not gain `imageKey`.

#### 3. Spec updates

**File**: `backend/src/plan-generation/plan-pipeline.service.spec.ts`

**Intent**: Cover the new field, so a regression that drops or mis-maps the image reference fails a test.

**Contract**: The existing completed-job assertion (around line 224) includes each exercise's `imageKey` taken from the fixture catalog. Add a case where different slugs map to their own distinct `imageKey`. If `plan-generation.controller.spec.ts`, `plan-job.store.spec.ts` or `backend/test/plan-generation.e2e-spec.ts` build a `PlanResult` fixture, update those fixtures to satisfy the type.

### Success Criteria:

#### Automated Verification:

- Backend unit tests pass: `cd backend && npm run test`
- Backend e2e tests pass: `cd backend && npm run test:e2e`
- Backend type check and build pass: `cd backend && npm run build`
- Backend lint passes: `cd backend && npm run lint`

#### Manual Verification:

- `GET /plan-generations/:jobId` for a completed job returns `imageKey` such as `exercises/barbell-squat.jpg` on every exercise

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Frontend — component test environment

### Overview

Make React components renderable in Vitest, without disturbing the existing node-environment specs, and prove it with a baseline `PlanView` spec.

### Changes Required:

#### 1. Test projects

**File**: `frontend/vite.config.ts`

**Intent**: Keep the existing logic specs in the `node` environment and run component specs in `jsdom`, so existing specs that use `AbortSignal`, streams and other node-oriented APIs are not affected.

**Contract**: Vitest `test.projects` with two entries that extend the root config. A `unit` project (`environment: 'node'`, `src/**/*.spec.ts`, i.e. today's behavior) and a `components` project (`environment: 'jsdom'`, `src/**/*.spec.tsx`). `npm run test` (`vitest run`) runs both.

#### 2. Dev dependencies

**File**: `frontend/package.json` (and lockfile)

**Intent**: Provide the DOM environment and the rendering and query utilities.

**Contract**: Add `jsdom`, `@testing-library/react` and its required peer `@testing-library/dom` as dev dependencies. No `jest-dom` matchers; use plain Vitest assertions.

#### 3. Baseline component spec

**File**: `frontend/src/components/PlanView.spec.tsx`

**Intent**: Prove the component environment works against the real component, and pin today's text rendering before images are added.

**Contract**: A spec that renders `PlanView` with a small `PlanResult` fixture (the type gains `imageKey` in Phase 3, so the fixture for this phase omits it) and asserts week headings, exercise names and the sets × reps, rest text. Explicit `cleanup` after each test, since globals are not enabled.

### Success Criteria:

#### Automated Verification:

- All frontend specs pass, both projects: `cd frontend && npm run test`
- The existing node-environment specs still run in the `unit` project and pass unchanged
- Type check and build pass: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Frontend — images in the plan review

### Overview

Render each exercise's image inline in `PlanView`, lazy-loaded, with a graceful fallback, and cover the behavior with component specs.

### Changes Required:

#### 1. Frontend plan result type

**File**: `frontend/src/lib/plan-generation.ts`

**Intent**: Mirror the backend contract so `PlanView` can read the image reference with type safety.

**Contract**: `PlanResultExercise` gains `imageKey: string | null`, matching `backend/src/plan-generation/plan.schema.ts`.

#### 2. Exercise image rendering

**File**: `frontend/src/components/PlanView.tsx`

**Intent**: Show each exercise's image directly beside its details, so the review is visual without extra interaction, and keep the text intact when the image is unavailable.

**Contract**: Each exercise row renders an `<img>` with `src` set to `/${imageKey}` (root-relative, same origin as the app), `loading="lazy"`, fixed square `width` and `height` attributes, and `alt` of `<exercise name>, start and end position`. The image is not rendered when `imageKey` is `null`. A load failure (`onError`) removes the image slot for that exercise only, via small per-exercise state in a dedicated component such as `ExerciseImage`. The week, session and text structure from the current component stays as it is, with all weeks expanded.

#### 3. Styles

**File**: `frontend/src/index.css`

**Intent**: Lay out the exercise row with the image beside the text, readable at phone width, without making the page excessively tall.

**Contract**: Add rules under the existing `.plan-exercises` block, following the file's existing class naming (`plan-*`). A fixed image size that fits the 800×800 A/B illustration legibly, and the row stacks or wraps gracefully at narrow widths.

#### 4. Component specs

**File**: `frontend/src/components/PlanView.spec.tsx`

**Intent**: Lock in the image behavior added in this phase.

**Contract**: Extend the Phase 2 spec to cover: an image is rendered for each exercise with the expected `src` and `alt`; `loading` is `lazy`; no image element when `imageKey` is `null`; firing the image `error` event removes only that exercise's image while its text remains and other exercises keep theirs. The Phase 2 fixture gains `imageKey`.

### Success Criteria:

#### Automated Verification:

- All frontend specs pass: `cd frontend && npm run test`
- Type check and build pass: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Generate a plan on the running stack and confirm every exercise in all 8 weeks shows its A/B image next to its details
- In the browser network panel, confirm images below the fold load only as you scroll
- At a 375 px wide viewport the rows stay readable with no horizontal scrolling
- Block or rename one image file, reload the plan, and confirm that exercise shows its text with no broken-image icon while the others keep their images
- An image's accessible name reads as the exercise name followed by "start and end position"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Backend: `toPlanResult` maps each exercise's `imageKey` from the catalog, with distinct keys for distinct slugs.
- Frontend: `PlanView` renders images with correct `src`, `alt` and `loading`; omits the image for `null` `imageKey`; drops only the failed image on `error`.

### Integration Tests:

- The existing backend e2e suite continues to pass with the extended result shape.

### Manual Testing Steps:

1. Start the backend and frontend, sign in, and generate a plan.
2. Scroll through all 8 weeks and confirm each exercise shows its image.
3. Check lazy loading in the network panel and the 375 px layout.
4. Force one image to fail and confirm the fallback.

## Performance Considerations

A full plan can contain a few hundred exercise rows, each with an image of up to about 100 KB. Lazy loading limits the initial transfer to the images near the viewport, and the same file repeats across weeks, so the browser cache serves repeats. Fixed `width` and `height` prevent layout shift.

## Migration Notes

None. Plan jobs live in memory only, so no stored data carries the old shape, and the catalog and image files are unchanged. A job that completed before the backend deploys will not exist after the restart.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-04)
- Requirements: `context/foundation/prd.md` (FR-007, FR-011, US-01)
- Catalog seed and image notes: `backend/prisma/seed-data/README.md`
- Result assembly: `backend/src/plan-generation/plan-pipeline.service.ts:188`
- Current plan view: `frontend/src/components/PlanView.tsx`
- Archived predecessors: `context/archive/2026-10-04-exercise-catalog-seed/`, `context/archive/2026-10-24-live-generation-progress/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — image reference in the plan result

#### Automated

- [x] 1.1 Backend unit tests pass: `cd backend && npm run test` — 15d1358
- [x] 1.2 Backend e2e tests pass: `cd backend && npm run test:e2e` — 15d1358
- [x] 1.3 Backend type check and build pass: `cd backend && npm run build` — 15d1358
- [x] 1.4 Backend lint passes: `cd backend && npm run lint` — 15d1358

#### Manual

- [x] 1.5 `GET /plan-generations/:jobId` for a completed job returns `imageKey` such as `exercises/barbell-squat.jpg` on every exercise — 15d1358

### Phase 2: Frontend — component test environment

#### Automated

- [x] 2.1 All frontend specs pass, both projects: `cd frontend && npm run test`
- [x] 2.2 The existing node-environment specs still run in the `unit` project and pass unchanged
- [x] 2.3 Type check and build pass: `cd frontend && npm run build`
- [x] 2.4 Frontend lint passes: `cd frontend && npm run lint`

### Phase 3: Frontend — images in the plan review

#### Automated

- [x] 3.1 All frontend specs pass: `cd frontend && npm run test`
- [x] 3.2 Type check and build pass: `cd frontend && npm run build`
- [x] 3.3 Frontend lint passes: `cd frontend && npm run lint`

#### Manual

- [x] 3.4 Generate a plan on the running stack and confirm every exercise in all 8 weeks shows its A/B image next to its details
- [x] 3.5 In the browser network panel, confirm images below the fold load only as you scroll
- [x] 3.6 At a 375 px wide viewport the rows stay readable with no horizontal scrolling
- [x] 3.7 Block or rename one image file, reload the plan, and confirm that exercise shows its text with no broken-image icon while the others keep their images
- [x] 3.8 An image's accessible name reads as the exercise name followed by "start and end position"
