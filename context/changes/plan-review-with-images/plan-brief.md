# Plan review with images — Plan Brief

> Full plan: `context/changes/plan-review-with-images/plan.md`

## What & Why

Show each exercise's catalog image in the generated 8-week plan, so the user can review the whole plan visually before deciding whether to save it. This delivers roadmap S-04 (FR-007, FR-011, US-01); saving is S-05.

## Starting Point

`PlanView` already renders all 8 weeks after generation, with name, sets × reps, rest and note, but no images. All 32 catalog images exist in `frontend/public/exercises/` and each `Exercise` row has an `imageKey`, but the plan result carries only the slug and name. The frontend has Vitest in a `node` environment only, so components cannot be rendered in tests yet.

## Desired End State

On the review page every exercise shows its A/B start-and-end image beside its details, loaded lazily as the user scrolls. If an image cannot load, the exercise keeps all its text and no broken icon appears. `PlanView` has component specs covering the image behavior.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Image reference | Backend adds `imageKey` to each plan-result exercise | The catalog row stays the single source of truth for which file belongs to which exercise. |
| Image UI | Inline per exercise, lazy-loaded, fixed square size | Meets "an image for each exercise" with no extra interaction or modal. |
| Week layout | All weeks expanded, as today | Keeps the existing structure and lets the user scan the whole plan. |
| Testing | Add jsdom component project and Testing Library to the existing frontend Vitest | Gives real coverage for the new image behavior and is reusable for S-05. |
| Missing image | Drop the image slot, keep the text; `null` `imageKey` renders no image | The SPA fallback returns HTML for missing files, but the `error` event still fires, so `onError` is enough. |
| Prompts | `imageKey` is not added to the model prompts | The model has no use for it. |

## Scope

**In scope:**
- `imageKey` in the backend plan result and its specs
- Component test environment in the frontend
- Inline lazy-loaded images, fallback, CSS and component specs in `PlanView`

**Out of scope:**
- Saving, listing, editing or regenerating plans (S-05, FR-008)
- Thumbnail dialog, expand-on-demand images, week accordion
- Any change to catalog data or image files
- Fixing the stale frontend-testing line in CLAUDE.md

## Architecture / Approach

`toPlanResult` in `plan-pipeline.service.ts` copies `imageKey` from the already-loaded catalog rows into each exercise. The frontend mirrors the type and renders `/<imageKey>` from the same origin through a small per-exercise image component with its own error state. Vitest gets two projects, `unit` (node, `*.spec.ts`) and `components` (jsdom, `*.spec.tsx`), so existing specs are untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend image reference | `imageKey` on every exercise in the plan result | Other fixtures that build a `PlanResult` must be updated for the new field |
| 2. Component test environment | jsdom project, Testing Library and a baseline `PlanView` spec | jsdom changes could disturb existing specs, avoided by separate projects |
| 3. Images in the plan review | Inline lazy images, fallback, CSS, specs | Long page of images on mobile |

**Prerequisites:** S-02 and F-01 are done, with images already in `frontend/public/exercises/`.
**Estimated effort:** About 2 sessions across 3 small phases.

## Open Risks & Assumptions

- Assumes the deployed catalog rows match `exercises.json`, so each `imageKey` points to an existing file. The fallback covers any mismatch.
- A plan has a few hundred rows. Lazy loading and the browser cache are assumed enough, and manual checks confirm it.
- The manual checks need a real generated plan, which calls the AI models.

## Success Criteria (Summary)

- Every exercise in all 8 weeks of a generated plan shows its image next to its details.
- A missing or failed image never shows a broken icon and never hides the exercise's text.
- Backend and frontend tests, builds and lint all pass.
