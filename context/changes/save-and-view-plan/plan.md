# Save and view plan Implementation Plan

## Overview

Let a signed-in user save a reviewed 8-week plan to their account and find it again later, intact. A new `SavedPlan` table stores the plan and the form it was generated from as `Json` snapshots. A new `saved-plans` backend module saves by `jobId` (the server reads the finished plan from the job store, so the client never supplies plan content), lists the caller's plans and returns one by id. The frontend adds a Save button on the review page, a "My plans" list and a saved-plan page that reuses `PlanView`. This delivers roadmap S-05 (FR-009, FR-010, US-01) and the guardrail "a saved plan is never lost or corrupted".

## Current State Analysis

- A finished plan exists only as `PlanJob.plan` in the in-memory `PlanJobStore`, kept for 1 hour after `finishedAt` and lost on restart (`backend/src/plan-generation/plan-job.store.ts:31`, `:80`). There is no list, delete or save endpoint.
- The form inputs are not kept: `PlanGenerationController.start` passes `form` to `pipeline.run(job.id, form)` and calls `store.create(user.id)` without it (`plan-generation.controller.ts:90-91`), and `PlanJob` has no `form` field (`plan-job.store.ts:17-29`).
- Ownership is enforced by `store.get(jobId, ownerId)`, which returns `undefined` for a foreign job, so callers answer 404 (`plan-job.store.ts:80-84`, `plan-generation.controller.ts:202-218`).
- `PlanJobStore` is a provider of `PlanGenerationModule` but is not exported (`plan-generation.module.ts:14-21`).
- The global `AuthGuard` guarantees a `Profile` row and rejects blocked users before any handler runs; `@CurrentUser()` yields `user.id` (the verified JWT subject).
- The schema has two models, no relations and no `Json` column. Each migration ends with a hand-written `ENABLE ROW LEVEL SECURITY` line (`backend/prisma/migrations/20261010125707_create_profile/migration.sql:15-17`). `deploy-backend.yml` runs `prisma migrate deploy` before `flyctl deploy`.
- Frontend: the `completed` branch of `PlanGenerationJob` renders `PlanView` (`frontend/src/pages/PlanGenerationPage.tsx`, `state.status === 'completed'`). Routes live inside the `RequireAuth` children in `frontend/src/router/router.tsx`. There is no nav, list, card or empty-state styling. API calls follow a discriminated-union lib pattern in `frontend/src/lib/plan-generation.ts`. `PlanView` is presentational and takes a `PlanResult`. Page-level tests have no precedent (no mocks of `useAuth`, `supabase` or the router).

## Desired End State

On the review page of a completed plan the user can press Save. The plan is persisted for their account and the app opens `/plans/:id`, which shows the plan loaded from the server. A "My plans" page (`/plans`, linked from Home) lists their saved plans newest first, each showing the date and the inputs it was generated from, and opens the saved plan. Saving the same generation twice yields the same saved plan. Another user can never read the plan. Verified by backend and frontend automated tests plus a manual end-to-end run with real data.

### Key Discoveries:

- Saving by `jobId` reuses `store.get(jobId, user.id)`, so ownership and "expired" both fall out as 404 with no new mechanism (`plan-job.store.ts:80-84`).
- The `Profile` row always exists before a handler runs, so a foreign key from `SavedPlan.ownerId` to `Profile.id` is safe (`auth.guard.ts:34-61`).
- Idempotency must not depend on the job still being in memory, so the existing-plan lookup runs before the job lookup.
- Existing error conventions: bare `NotFoundException` for missing or foreign resources, `HttpException({ code }, status)` for machine-readable failures (`plan-generation.controller.ts:85-88`).
- `/plans/new` is a static route and `/plans/:id` is dynamic; react-router ranks the static one higher, so both can sit side by side.
- Frontend code style has no semicolons and uses single quotes; backend uses Prettier (single quotes, trailing commas). Per saved project preferences: const arrow functions where sensible and no code comments.

## What We're NOT Doing

- Delete, rename, edit or regenerate of a saved plan (FR-008 stays parked).
- Pagination or search of the list.
- Auto-saving or persisting drafts at generation time; saving stays an explicit action.
- Accepting plan content from the client, or normalised week/session/exercise tables.
- Changing job retention, the in-memory store design, or the daily generation limit (it still counts job starts, not saves).
- Exposing the form in `PlanJobView` (the job's `form` is internal).
- Any change to catalog data, prompts or the generation pipeline logic.

## Implementation Approach

Build bottom-up so each phase ends in a verifiable state: persistence foundation (schema, migration, job carries the form), then the API, then the frontend save action, then the account views. The migration is isolated in phase 1 so it deploys on its own (it runs automatically on push to `main`). The backend contract is fixed before any UI depends on it.

Backend contract (decided):

- `POST /saved-plans` body `{ jobId: uuid }` returns 201 with the summary `{ id, createdAt, form }`; a repeat save returns the same summary. 404 when the job is missing, foreign or expired and no saved plan exists for it. 409 `{ code: 'not_completed' }` when the job is running or failed. 400 on an invalid body.
- `GET /saved-plans` returns summaries `{ id, createdAt, form }` for the caller, `createdAt` descending with `id` descending as tiebreak.
- `GET /saved-plans/:id` returns `{ id, createdAt, form, plan }`; 404 for a missing, foreign or malformed id.

## Critical Implementation Details

- **State sequencing in save:** look up an existing `SavedPlan` for `(ownerId, jobId)` first and return it; only then read the job. After a lost response the retry must succeed even when the job has since been purged. Creation can still race with a concurrent save: treat Prisma `P2002` on the unique key as "already saved" and re-read the existing row.

## Phase 1: Persistence foundation

### Overview

Add the `SavedPlan` table and make the in-memory job carry the form it was started with, so a later save can persist both.

### Changes Required:

#### 1. Prisma schema

**File**: `backend/prisma/schema.prisma`

**Intent**: Add the model that holds one saved plan per owner and source job, with the plan and the form kept as exact snapshots.

**Contract**: `model SavedPlan { id String @id @default(uuid()) @db.Uuid; ownerId String @db.Uuid; owner Profile @relation(fields: [ownerId], references: [id], onDelete: Cascade); sourceJobId String @db.Uuid; form Json; plan Json; createdAt DateTime @default(now()); @@unique([ownerId, sourceJobId]); @@index([ownerId, createdAt]) }`. `Profile` gains `savedPlans SavedPlan[]`.

#### 2. Migration

**File**: `backend/prisma/migrations/<timestamp>_create_saved_plan/migration.sql`

**Intent**: Create the table through the normal Prisma flow and follow the repo rule that every table enables row-level security. Forward-only: undoing it later is a new migration.

**Contract**: Generate with `npm run prisma:migrate:dev -- --name create_saved_plan`, then append the hand-written `-- EnableRowLevelSecurity` block with `ALTER TABLE "SavedPlan" ENABLE ROW LEVEL SECURITY;` in the same style as the two existing migrations. No policies or grants.

#### 3. Job store carries the form

**File**: `backend/src/plan-generation/plan-job.store.ts`

**Intent**: Keep the validated form on the job so the save step can persist it.

**Contract**: `PlanJob` gains `form: PlanForm`; `create(ownerId: string, form: PlanForm): PlanJob` stores it on the new job. `PlanJobView` and every response shape stay unchanged.

#### 4. Controller passes the form

**File**: `backend/src/plan-generation/plan-generation.controller.ts`

**Intent**: Hand the validated form to the store when the job is created.

**Contract**: `start` calls `this.store.create(user.id, form)`; `getJob` still returns only `status`, `stage`, `week`, `plan`, `error`.

#### 5. Specs

**Files**: `backend/src/plan-generation/plan-job.store.spec.ts`, `plan-generation.controller.spec.ts`, `backend/test/plan-generation.e2e-spec.ts`

**Intent**: Update every `store.create(...)` call for the new signature with a shared valid form fixture, and add assertions that the job keeps its form and that `GET /plan-generations/:jobId` does not expose it.

**Contract**: Use one `PlanForm` fixture per spec file. New assertions: `store.get(...)` returns a job whose `form` equals the one passed to `create`; the `getJob` result has no `form` key.

### Success Criteria:

#### Automated Verification:

- Prisma schema validates and the client regenerates: `cd backend && npm run prisma:generate`
- Backend builds: `cd backend && npm run build`
- Backend lint passes: `cd backend && npm run lint`
- Backend unit tests pass, including the updated store and controller specs: `cd backend && npm test`
- Backend e2e tests pass: `cd backend && npm run test:e2e`

#### Manual Verification:

- The migration applies to the dev database with `cd backend && npm run prisma:migrate:dev`; the SQL creates `"SavedPlan"` with the unique `(ownerId, sourceJobId)` index, the cascading foreign key to `"Profile"`, and ends with the RLS statement
- Starting a generation still shows progress and a finished plan (needs the live AI models)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Saved-plans API

### Overview

Add the `saved-plans` module with save, list and get endpoints, enforcing ownership, idempotency and ordering.

### Changes Required:

#### 1. Expose the job store

**File**: `backend/src/plan-generation/plan-generation.module.ts`

**Intent**: Let the new module read finished jobs from the same `PlanJobStore` singleton.

**Contract**: Add `exports: [PlanJobStore]` to the module.

#### 2. Service

**File**: `backend/src/saved-plans/saved-plans.service.ts`

**Intent**: Own persistence rules. Save is idempotent per `(ownerId, jobId)`; reads are always scoped to the owner.

**Contract**: Injectable with `PrismaService` and `PlanJobStore`. `save(ownerId, jobId): Promise<SavedPlanSummary>` — (1) find existing by `ownerId_sourceJobId` and return it; (2) `store.get(jobId, ownerId)`, none → `NotFoundException`; (3) status not `completed` or `plan` null → `HttpException({ code: 'not_completed' }, 409)`; (4) create with `form` and `plan` from the job; (5) on `Prisma.PrismaClientKnownRequestError` code `P2002` re-read and return the existing row. `list(ownerId)` selects `id`, `createdAt`, `form` ordered `createdAt desc, id desc`. `get(ownerId, id)` uses `findFirst({ where: { id, ownerId } })`, none → `NotFoundException`. Types: `SavedPlanSummary { id; createdAt; form: PlanForm }`, `SavedPlanView extends SavedPlanSummary { plan: PlanResult }`; Json columns are cast to these types on read and to `Prisma.InputJsonValue` on write.

#### 3. Controller

**File**: `backend/src/saved-plans/saved-plans.controller.ts`

**Intent**: Expose the three routes behind the global auth guard, keyed only on `user.id`.

**Contract**: `@Controller('saved-plans')`. `POST` with `@Body(new ZodValidationPipe(saveBodySchema))` where `saveBodySchema = z.object({ jobId: z.uuid() })`, default 201. `GET` returns the list. `GET :id` with `@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }))`. All use `@CurrentUser() user: RequestUser`; never email (see lessons).

#### 4. Module wiring

**Files**: `backend/src/saved-plans/saved-plans.module.ts`, `backend/src/app.module.ts`

**Intent**: Register the feature following the existing module triplet convention.

**Contract**: `SavedPlansModule` imports `PrismaModule` and `PlanGenerationModule`, declares the controller and the service. `AppModule` imports `SavedPlansModule`.

#### 5. Specs

**Files**: `backend/src/saved-plans/saved-plans.service.spec.ts`, `saved-plans.controller.spec.ts`, `backend/test/saved-plans.e2e-spec.ts`

**Intent**: Cover the guardrails at unit and HTTP level. Unit specs mock `PrismaService` and use a real `PlanJobStore`, as in `profiles.service.spec.ts`. The e2e spec follows `plan-generation.e2e-spec.ts` (header-driven guard, supertest) with an in-memory fake `PrismaService` implementing the methods the service uses.

**Contract**: Required cases — saves a completed job and stores form and plan unchanged; second save returns the existing row without reading the job (works after the job is purged); `P2002` race returns the existing row; foreign, missing and expired job → 404; running and failed job → 409 `not_completed`; invalid body → 400; list is scoped to the owner, newest first, with the `id` tiebreak for equal `createdAt`; get returns 404 for another owner's id, an unknown id and a malformed id.

### Success Criteria:

#### Automated Verification:

- Backend builds: `cd backend && npm run build`
- Backend lint passes: `cd backend && npm run lint`
- Unit specs pass: `cd backend && npm test`
- E2E specs pass, including cross-user isolation: `cd backend && npm run test:e2e`

#### Manual Verification:

- With a real token against the dev database: save returns 201, a repeat returns the same `id`, the list shows it, and `GET /saved-plans/:id` returns a `plan` deep-equal to the job's `plan`
- A second account gets 404 for the first account's saved plan id and has an empty list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Save on the review page

### Overview

Add the frontend API call and a Save button on the completed review page, plus the first page-level test setup.

### Changes Required:

#### 1. API lib

**File**: `frontend/src/lib/saved-plans.ts`

**Intent**: Wrap `POST /saved-plans` in the same discriminated-union style as `plan-generation.ts`, reusing `AuthFailureResult`.

**Contract**: Types `SavedPlanSummary { id: string; createdAt: string; form: PlanForm }`. `saveGeneratedPlan(jobId: string): Promise<SaveGeneratedPlanResult>` where the result is `{ kind: 'ok'; plan: SavedPlanSummary } | AuthFailureResult | { kind: 'not-found' } | { kind: 'not-completed' } | { kind: 'error' }`. 401 → `unauthorized`, 403 → `blocked`, 404 → `not-found`, 409 → `not-completed`, other non-OK or a thrown error → `error`. It never throws.

#### 2. Save action

**File**: `frontend/src/pages/PlanGenerationPage.tsx`

**Intent**: Let the user save from the `completed` state and move to the saved copy.

**Contract**: In the `completed` branch render a Save button next to `PlanView`. Local state for `saving` and a save error message. The button is disabled while saving so a double click sends one request. On `ok` call `navigate('/plans/' + encodeURIComponent(plan.id))`. On `unauthorized`/`blocked` call `handleAuthFailure(result.status, signOut)`. On `not-found` show "This plan has expired and can no longer be saved. Generate a new one." (the job is gone after an hour); on `not-completed` and `error` show a generic save error (`role="alert"`). Failed saves leave the plan on screen so the user can retry.

#### 3. Specs

**Files**: `frontend/src/lib/saved-plans.spec.ts`, `frontend/src/pages/PlanGenerationPage.spec.tsx`

**Intent**: Cover the mapping and the save interaction. The page spec renders `PlanGenerationPage` inside `MemoryRouter` with `Routes`, mocking `../lib/plan-generation-watch` (emit a `completed` state with a fixture plan), `../lib/saved-plans` and `../auth/useAuth`. The lib spec mocks `./api`.

**Contract**: Lib cases: each status code maps to its result kind and a thrown fetch maps to `error`. Page cases: Save is visible only when completed; click calls `saveGeneratedPlan` with the route's `jobId` and navigates to `/plans/<id>`; button disabled while pending; `not-found` shows the expiry message and keeps the plan; `error` shows the generic message; `unauthorized`/`blocked` call the sign-out path. If importing the page transitively reaches `src/lib/supabase.ts` (which calls `createClient` at import), add `vi.mock('../lib/supabase')` in the spec.

### Success Criteria:

#### Automated Verification:

- Frontend builds: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend tests pass: `cd frontend && npm test`

#### Manual Verification:

- Pressing Save on a generated plan succeeds (201 from `/saved-plans` and a new database row); until phase 4 the browser follows the catch-all redirect to `/`
- Double-clicking Save creates exactly one saved plan
- With the plan on screen and the server restarted, Save shows the expiry message and keeps the plan visible

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: My plans and the saved-plan page

### Overview

Add the account views so a saved plan can be found and reopened in a later session.

### Changes Required:

#### 1. API lib additions

**File**: `frontend/src/lib/saved-plans.ts`

**Intent**: Add the two read calls in the same union style.

**Contract**: `SavedPlan extends SavedPlanSummary { plan: PlanResult }`. `listSavedPlans(): Promise<{ kind: 'ok'; plans: SavedPlanSummary[] } | AuthFailureResult | { kind: 'error' }>` and `fetchSavedPlan(id: string): Promise<{ kind: 'ok'; plan: SavedPlan } | AuthFailureResult | { kind: 'not-found' } | { kind: 'error' }>`. The list keeps the server's order; no client-side sorting.

#### 2. My plans page

**File**: `frontend/src/pages/SavedPlansPage.tsx`

**Intent**: List the user's saved plans with enough context to tell them apart.

**Contract**: Named export `SavedPlansPage`. States: loading (`<p className="status">`), error (`role="alert"`), empty ("You have no saved plans yet." with a link to `/plans/new`), list. Each item is a `Link` to `/plans/:id` showing the saved date, experience level, current → desired weekly frequency and the goals text. Auth failures go through `handleAuthFailure`. Includes a "Back to home" link.

#### 3. Saved-plan page

**File**: `frontend/src/pages/SavedPlanPage.tsx`

**Intent**: Show one saved plan exactly as saved, reusing the review component.

**Contract**: Named export `SavedPlanPage`; reads `:id` with `useParams`; loading, `not-found` ("This saved plan could not be found."), generic error, and success states. Success shows the saved date, the form summary and `<PlanView plan={plan.plan} />`, with links to My plans and Home. `key={id}` remount pattern as in `PlanGenerationPage`.

#### 4. Routes and navigation

**Files**: `frontend/src/router/router.tsx`, `frontend/src/pages/HomePage.tsx`

**Intent**: Make the pages reachable only when signed in, and link to them.

**Contract**: Add `{ path: '/plans', element: <SavedPlansPage /> }` and `{ path: '/plans/:id', element: <SavedPlanPage /> }` to the `RequireAuth` children. Add a `Link` to `/plans` labelled "My plans" next to the "Create a training plan" link on Home.

#### 5. Styles

**File**: `frontend/src/index.css`

**Intent**: Style the list with the existing tokens; the 28rem column is kept.

**Contract**: `saved-plans`-prefixed classes (kebab-case, as the `plan-` classes), using `--border`, `--text-muted` and the existing dark-mode variables; items are stacked blocks with a visible `:focus-visible` state inherited from the global link style.

#### 6. Specs

**Files**: `frontend/src/pages/SavedPlansPage.spec.tsx`, `frontend/src/pages/SavedPlanPage.spec.tsx`, additions to `frontend/src/lib/saved-plans.spec.ts`

**Intent**: Cover the states and the rendered content with the mocking pattern from phase 3.

**Contract**: List page — renders items in the order returned with date, experience, frequency and goals; empty state; error state; each item links to `/plans/<id>`. Saved-plan page — renders the plan through `PlanView` (week heading and an exercise name from the fixture), the form summary, the not-found message and the error message. Lib cases — `listSavedPlans` and `fetchSavedPlan` status mapping.

### Success Criteria:

#### Automated Verification:

- Frontend builds: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`
- Frontend tests pass: `cd frontend && npm test`

#### Manual Verification:

- Full flow with real data: generate, Save, land on `/plans/:id` showing the whole plan with images, and reload to see the same plan
- After signing out and back in, Home → "My plans" lists the plan newest first and opens it
- A fresh account sees the empty state; an invalid or another user's plan id shows the not-found message
- The list and plan pages are usable at phone width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Backend service: idempotent save, replay after job expiry, `P2002` race, 404 and 409 paths, owner-scoped list and get, list ordering with the `id` tiebreak.
- Backend controller: body validation (400) and malformed id (404).
- Job store: the form is kept on the job.
- Frontend lib: status-code to result-kind mapping for save, list and fetch.
- Frontend pages: Save interaction and states, list states, saved-plan states.

### Integration Tests:

- `backend/test/saved-plans.e2e-spec.ts`: save, repeat save, list, get, cross-user isolation over HTTP with a fake Prisma.
- Existing plan-generation e2e keeps passing with the new `store.create` signature.

### Manual Testing Steps:

1. Generate a plan, Save, and confirm the redirect to `/plans/:id` and an identical plan after reload.
2. Sign out and in, open My plans, and reopen the plan.
3. Double-click Save and confirm a single list entry.
4. As a second account, request the first account's plan id and confirm 404; confirm an empty list.
5. After a backend restart, Save with a plan still on screen and confirm the expiry message.

## Performance Considerations

A saved plan is a few hundred exercise rows in one `Json` value, read by id only. The list endpoint returns summaries without the plan, and `@@index([ownerId, createdAt])` backs the list query. No pagination is needed at the PRD's scale.

## Migration Notes

One forward-only migration (`create_saved_plan`). Merging to `main` applies it automatically through `deploy-backend.yml` (`prisma migrate deploy`) before the Fly deploy, so phase 1 should be merged and deployed before phase 2 code relies on the table. No data backfill. Undoing the table later means a new migration.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-05)
- Requirements: `context/foundation/prd.md` (FR-009, FR-010, US-01, guardrail "a saved plan is never lost or corrupted")
- Prior slice with the same module and test patterns: `context/archive/2026-10-25-plan-review-with-images/plan.md`
- Job store and ownership: `backend/src/plan-generation/plan-job.store.ts:80`
- Migration style: `backend/prisma/migrations/20261010125707_create_profile/migration.sql`
- Frontend API pattern: `frontend/src/lib/plan-generation.ts`
- Lessons: `context/foundation/lessons.md` (authorize on `Profile.id` only; amend plan.md on approved deviations)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Persistence foundation

#### Automated

- [x] 1.1 Prisma schema validates and the client regenerates: `cd backend && npm run prisma:generate` — 8d56889
- [x] 1.2 Backend builds: `cd backend && npm run build` — 8d56889
- [x] 1.3 Backend lint passes: `cd backend && npm run lint` — 8d56889
- [x] 1.4 Backend unit tests pass, including the updated store and controller specs: `cd backend && npm test` — 8d56889
- [x] 1.5 Backend e2e tests pass: `cd backend && npm run test:e2e` — 8d56889

#### Manual

- [ ] 1.6 The migration applies to the dev database with `cd backend && npm run prisma:migrate:dev`; the SQL creates `"SavedPlan"` with the unique `(ownerId, sourceJobId)` index, the cascading foreign key to `"Profile"`, and ends with the RLS statement
- [ ] 1.7 Starting a generation still shows progress and a finished plan (needs the live AI models)

### Phase 2: Saved-plans API

#### Automated

- [x] 2.1 Backend builds: `cd backend && npm run build`
- [x] 2.2 Backend lint passes: `cd backend && npm run lint`
- [x] 2.3 Unit specs pass: `cd backend && npm test`
- [x] 2.4 E2E specs pass, including cross-user isolation: `cd backend && npm run test:e2e`

#### Manual

- [ ] 2.5 With a real token against the dev database: save returns 201, a repeat returns the same `id`, the list shows it, and `GET /saved-plans/:id` returns a `plan` deep-equal to the job's `plan`
- [ ] 2.6 A second account gets 404 for the first account's saved plan id and has an empty list

### Phase 3: Save on the review page

#### Automated

- [ ] 3.1 Frontend builds: `cd frontend && npm run build`
- [ ] 3.2 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 3.3 Frontend tests pass: `cd frontend && npm test`

#### Manual

- [ ] 3.4 Pressing Save on a generated plan succeeds (201 from `/saved-plans` and a new database row); until phase 4 the browser follows the catch-all redirect to `/`
- [ ] 3.5 Double-clicking Save creates exactly one saved plan
- [ ] 3.6 With the plan on screen and the server restarted, Save shows the expiry message and keeps the plan visible

### Phase 4: My plans and the saved-plan page

#### Automated

- [ ] 4.1 Frontend builds: `cd frontend && npm run build`
- [ ] 4.2 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 4.3 Frontend tests pass: `cd frontend && npm test`

#### Manual

- [ ] 4.4 Full flow with real data: generate, Save, land on `/plans/:id` showing the whole plan with images, and reload to see the same plan
- [ ] 4.5 After signing out and back in, Home → "My plans" lists the plan newest first and opens it
- [ ] 4.6 A fresh account sees the empty state; an invalid or another user's plan id shows the not-found message
- [ ] 4.7 The list and plan pages are usable at phone width
