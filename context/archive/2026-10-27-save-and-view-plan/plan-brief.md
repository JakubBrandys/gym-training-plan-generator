# Save and view plan — Plan Brief

> Full plan: `context/changes/save-and-view-plan/plan.md`

## What & Why

Let a signed-in user save a reviewed 8-week plan and find it again under their account in a later session, intact. This delivers roadmap S-05 (FR-009, FR-010, US-01) and the guardrail that a saved plan is never lost or corrupted.

## Starting Point

A finished plan exists only in the in-memory job store, for 1 hour after it finishes, and is lost on restart. The form inputs are not kept with it. There is no save, list or read endpoint, and the frontend has no Save button, no plan list, no nav and no page-level tests. Auth, ownership checks (`store.get(jobId, ownerId)`), the module conventions and `PlanView` already exist.

## Desired End State

On a completed plan the user presses Save and lands on `/plans/:id`, which shows the plan loaded from the server. "My plans" (linked from Home) lists their plans newest first, with the date and the inputs each was generated from, and opens any of them. Saving the same generation twice gives one plan, and another user can never read it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Save source | `POST /saved-plans {jobId}`; the server reads the finished plan from the job store | The client never supplies plan content, and ownership and expiry reuse `store.get`. |
| Stored shape | One `SavedPlan` row with `plan` and `form` as `Json` snapshots | A single row reloads exactly as saved and cannot be half-written. |
| Duplicates | One plan per `(ownerId, sourceJobId)`; a repeat save returns the existing plan | Double clicks and retries after a lost response stay safe. |
| Idempotency order | Existing-plan lookup runs before the job lookup | A retry still succeeds after the job has been purged. |
| Form inputs | Saved with the plan; the job store carries the form | Plans stay distinguishable in the list and show what they were generated for. |
| List | All plans, newest first, `id` tiebreak, summaries only | Small payload and deterministic order at the PRD's scale. |
| After save | Navigate to `/plans/:id` | Reloading from the database proves the plan persisted. |
| Failures | 404 for missing, foreign or expired job; 409 `not_completed` for running or failed | Matches the repo's existing not-found and `{ code }` conventions. |
| Testing | Backend unit and e2e plus frontend lib and page specs | Covers the integrity and ownership guardrails and sets the page-test mocking pattern. |

## Scope

**In scope:**
- `SavedPlan` table and forward-only migration with RLS
- Job store carrying the form
- `saved-plans` module with save, list and get endpoints
- Save button, `/plans` list, `/plans/:id` page, Home link, styles
- Backend and frontend automated tests

**Out of scope:**
- Delete, rename, edit, regenerate (FR-008)
- Pagination or search
- Auto-saving drafts or accepting plan content from the client
- Normalised plan tables
- Changing job retention or the daily generation limit

## Architecture / Approach

A new `SavedPlansModule` imports `PrismaModule` and `PlanGenerationModule`, which now exports `PlanJobStore`. `SavedPlansService.save` returns an existing row for `(ownerId, jobId)` if there is one, otherwise reads the completed job for the caller and writes its `form` and `plan` into `SavedPlan`; a `P2002` race re-reads the row. The frontend adds a lib in the existing discriminated-union style, a Save action in the `completed` branch of the generation page, and two pages inside `RequireAuth`, reusing `PlanView` read-only.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Persistence foundation | `SavedPlan` model and migration with RLS; job store carries the form | The `store.create` signature change touches about 30 spec call sites, and the migration auto-deploys on merge to `main` |
| 2. Saved-plans API | Save, list and get endpoints with specs | Idempotency and race handling around the unique key |
| 3. Save on the review page | Frontend lib, Save button, redirect, first page-test setup | No page-test precedent; mocks for `useAuth`, router and `supabase` are new |
| 4. My plans and saved-plan page | `/plans` list, `/plans/:id`, Home link, styles, specs | The 28rem column is narrow for a list; the redirect target only exists from this phase |

**Prerequisites:** S-04 is done; dev database access for the migration; live AI models for the manual generation checks.
**Estimated effort:** About 3-4 sessions across 4 phases.

## Open Risks & Assumptions

- A saved plan can only be created while its job is still in memory (1 hour after it finishes, and not across a restart); after that the user must regenerate. The expiry message covers it.
- `Json` columns are cast to the TypeScript types on read with no runtime validation; this relies on the pipeline having validated the plan before it was saved.
- The migration runs automatically on push to `main` before the Fly deploy, so phase 1 should be deployed before phase 2 depends on the table.
- Between phases 3 and 4 the post-save redirect goes to a route that does not exist yet and falls to `/` via the catch-all.

## Success Criteria (Summary)

- A user can save a generated plan, be taken to its saved page, reload it, and find it under "My plans" after signing out and back in.
- Saving twice produces one plan, and another account gets 404 for it.
- Backend and frontend builds, lint and tests all pass.
