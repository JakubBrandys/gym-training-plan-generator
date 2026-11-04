---
date: 2026-11-02T20:25:57+01:00
researcher: Jakub Brandys
git_commit: da9efae53f6b0994f43f55adfa2c14e5c21ea796
branch: plan-manage
repository: 10xdevs
topic: "Delete a saved plan and give it an optional editable title: what exists and what must be decided"
tags: [research, codebase, saved-plans, prisma, migration, delete, rename, ui-contract]
status: complete
last_updated: 2026-11-02
last_updated_by: Jakub Brandys
---

# Research: Delete a saved plan and give it an optional editable title

**Date**: 2026-11-02T20:25:57+01:00
**Researcher**: Jakub Brandys
**Git Commit**: da9efae53f6b0994f43f55adfa2c14e5c21ea796
**Branch**: plan-manage
**Repository**: 10xdevs

## Research Question

Saved plans can be saved, listed and viewed, but not deleted or renamed. What does the backend, the frontend and the project history already provide for adding (a) `DELETE /saved-plans/:id` (owner-only, 404 for others) with a confirmation on the list and plan pages, and (b) an optional editable title (nullable column, forward-only migration, `PATCH /saved-plans/:id`, shown in the list and plan view)? Exercise-level editing (PRD FR-008) is out of scope.

Evidence was gathered by three read-only workers (backend, frontend, prior decisions). Claims I re-checked myself are marked **verified**; the rest are the workers' reports with their anchors.

## Summary

- **Gap confirmed.** The controller has exactly three routes: `POST /saved-plans`, `GET /saved-plans`, `GET /saved-plans/:id` (`backend/src/saved-plans/saved-plans.controller.ts:28,36,41`, verified). There is no `PATCH` or `DELETE` anywhere in `backend/src` controllers (grep of `*.controller.ts`, verified). The frontend lib has only `saveGeneratedPlan`, `listSavedPlans` and `fetchSavedPlan` (`frontend/src/lib/saved-plans.ts:40-101`, reported).
- **Delete is structurally safe.** `SavedPlan` is only a child (`ownerId -> Profile`, `onDelete: Cascade`, `backend/prisma/schema.prisma:41-52`); no other table references it (reported, whole schema inspected).
- **Title fits as its own column.** `PlanForm` and `PlanResult` are persisted contracts that may change additively only (`context/foundation/lessons.md:19-24`); a separate nullable `title` column leaves both JSON shapes untouched. No additive (ALTER) migration exists yet: the 3 existing migrations all create tables (`backend/prisma/migrations/`, verified listing). The needed SQL is `ALTER TABLE "SavedPlan" ADD COLUMN "title" TEXT;`; the table already has RLS enabled (`20261027193305_create_saved_plan/migration.sql:22-24`, verified), so no second RLS statement.
- **Migrations run automatically on merge to `main`.** `.github/workflows/deploy-backend.yml:3-28` runs `npm run prisma:migrate:deploy` before `flyctl deploy` on pushes to `main` that touch `backend/**` (verified). The backend worker had inferred the opposite from absence; that inference is **contradicted**. A nullable column add is safe under the brief window where old code runs against the new column.
- **CORS is not a blocker.** `app.enableCors({ origin: [...] })` sets only `origin` (`backend/src/main.ts:6-11`, verified). No `methods` option is passed, so the library default applies; I did not run a preflight, but the `cors` package default method list includes `PATCH` and `DELETE` (inference from the library default, not tested). Worth one e2e/manual check in the plan.
- **Delete interacts with idempotent save.** Save looks up `(ownerId, sourceJobId)` first, then reads the in-memory job (`saved-plans.service.ts:60-98`, verified). After a hard delete the key is free, so re-saving the same job succeeds if the job is still in memory (1 hour after `finishedAt`, lost on restart; `plan-job.store.ts` constants as reported) and answers 404 afterwards. No existing decision covers this.
- **No UI building blocks for the new interactions.** There is no dialog, modal, `window.confirm`, text-input component or destructive button variant (repo grep by two workers). The only confirmation precedent is the inline Confirm/Cancel row in `AdminUsersPage.tsx` (S-07). `Button` has only `primary`/`secondary` (`frontend/src/components/button-class.ts:1`, verified).
- **Not traceable to a requirement.** No FR, user story or roadmap slice covers delete or rename; FR-008 is "edit or regenerate part of the plan" and is parked (`context/foundation/prd.md:78`, roadmap parks it). Delete and rename were explicitly deferred as out of scope in S-05 (`context/archive/2026-10-27-save-and-view-plan/plan.md:32`). The PRD says members can manage their own plans (`prd.md:106-108`) and has no retention commitment (`prd.md:93`), so nothing forbids a hard delete.

## Detailed Findings

### Backend: current API and service

- **Routes.** `@Controller('saved-plans')`; `save` is `@Post()` (default 201), `list` is `@Get()`, `get` is `@Get(':id')` with `ParseUUIDPipe({ errorHttpStatusCode: NOT_FOUND })`, so a malformed id answers 404 (`saved-plans.controller.ts:25-52`).
- **Types.** `SavedPlanSummary { id, createdAt, form }`, `SavedPlanView` adds `plan` (`saved-plans.service.ts:14-22`). `SUMMARY_SELECT = { id, createdAt, form }` is used by every summary read and by `create` (`saved-plans.service.ts:34`). Adding `title` to the summary means touching this select and `toSummary` (`:36-40`).
- **Ownership.** `get` uses `findFirst({ where: { id, ownerId } })` and throws a bare `NotFoundException` (`:109-117`); foreign, missing and malformed ids all answer 404. The owner id comes from `@CurrentUser()` via the global `AuthGuard` (`auth.module.ts` `APP_GUARD`; `auth.guard.ts:34-61`, reported), which also returns 403 for blocked accounts. Convention: ownership failures are 404, never 403, because the frontend signs the caller out as "blocked" on any 403 (`context/archive/2026-10-31-admin-block-user/plan.md:48`, reported).
- **Atomic write pattern.** The admin block write uses a conditional `updateMany` followed by a re-read (`admin-users.service.ts:74-88`, reported; deviation recorded in the archived block-user plan). For this change the equivalent is `deleteMany({ where: { id, ownerId } })` with `count === 0 -> 404`, and `updateMany` + re-read for rename. This is an inference from the precedent, not a documented rule.
- **Validation.** `ZodValidationPipe(schema)` answers 400 with `{ message: 'Validation failed', issues: [{ path, message }] }` (`plan-generation/zod-validation.pipe.ts:16-35`, reported); it is applied per parameter, not globally. `saveBodySchema` is `z.object({ jobId: z.uuid() })` and is not strict (extra keys stripped). Existing length limits: `goals` `trim().min(1).max(500)` with a NUL refine (`plan-form.schema.ts:15-22`), session title max 80, week goal and notes max 200 (`plan.validator.ts:9-17`). A NUL character broke JSONB in the S-05 review (F2), and Postgres text also rejects `\u0000` (inference from the same database behaviour; not tested for a `TEXT` column), so a title validator should reject it.
- **Status-code conventions.** 404 not-found/not-owner, 409 state conflict, 502 upstream failure, never 403 for caller-visible business errors (archived block-user plan, reported). No precedent for `DELETE` or `PATCH`; block uses `@Post(':id/block') @HttpCode(200)` returning the updated summary.
- **Logging.** Non-P2002 failures log only the job id and error name (`saved-plans.service.ts:86-91`, verified).

### Backend: Prisma and migrations

- Layout `prisma/migrations/<timestamp>_<name>/migration.sql` plus `migration_lock.toml`; the 3 migrations are `20261004181902_create_exercise`, `20261010125707_create_profile`, `20261027193305_create_saved_plan` (verified listing).
- Forward-only: no rollback scripts (memory note and `20261027193305_create_saved_plan` plan). Undo of the title column would be a new migration.
- The S-05 migration SQL was produced with `prisma migrate diff` plus `prisma:migrate:deploy` to avoid a reset prompt on the shared hosted DB (archived S-05 plan deviation, `plan.md:102`, reported). The same method applies here.
- The generated client is not committed (`/src/generated` is git-ignored, reported); after the schema change run `npm run prisma:generate` (`Dockerfile:19` does it at build, reported).
- `SavedPlan` keeps `@@unique([ownerId, sourceJobId])` and `@@index([ownerId, createdAt])` (`schema.prisma:50-51`). There is no `updatedAt`; a rename does not need one unless the plan wants it.

### Backend: test structure to extend

- All tests mock Prisma; no real database (reported).
- `saved-plans.controller.spec.ts` builds the controller with `{ save, list, get }` mocks; its "keys every call on user.id, never the email" test loops over `[save, list, get]` and must be extended.
- `saved-plans.service.spec.ts` replaces `PrismaService` with `{ savedPlan: { findUnique, create, findMany, findFirst } }`; the exact-`select` assertions for `list`, `create` and `findUnique` will break when `title` is added to `SUMMARY_SELECT`.
- `test/saved-plans.e2e-spec.ts` uses a `FakeSavedPlanTable` implementing only `findUnique`, `create`, `findMany`, `findFirst`; several assertions use exact `toEqual({ id, createdAt, form })` and need `title: null`. New fake methods are needed for delete and update.

### Frontend: lib layer

- `apiFetch` attaches the bearer token (`frontend/src/lib/api.ts:3-14`, reported). Callers do not attach tokens.
- `saved-plans.ts` follows one pattern: discriminated `kind` unions including `AuthFailureResult`, `not-found`, `error`; `AbortSignal.timeout` (save 30 s, reads 15 s); `encodeURIComponent(id)`; status order `authFailureOf` -> 404 -> 409 -> `!ok`; body shape guard on the ok path; everything in try/catch (reported).
- `blockAdminUser` is the mutation template (`frontend/src/lib/admin-users.ts:63-84`, reported): 15 s write timeout, status mapping, `isAdminUser` body guard.
- `authFailureOf` is defined once, at `frontend/src/lib/plan-generation.ts:71` (verified; the worker's suspected duplicate was a read artefact). `handleAuthFailure(status, signOut)` handles 401 and 403 (`auth-failure.ts:3-18`, reported).
- `error-messages.ts` exports only `GENERIC_PLAN_ERROR`; pages keep specific messages as local consts.

### Frontend: pages and where the new controls go

- **List.** `SavedPlansPage` renders `<h1>My plans</h1>` and, per plan, one `Link` block containing `SavedPlanDetails` inside an `li` (`SavedPlansPage.tsx:42,54-63`, h1 verified). `.saved-plans-list a` is a bordered `display: block` link (`index.css:450-457`, verified in this session's CSS read). A delete control cannot nest inside that link (invalid interactive nesting), so it must sit beside it, as `AdminUsersPage` does with `.admin-users-actions`.
- **Plan page.** `SavedPlanPage` renders `<h1>Saved plan</h1>` (`SavedPlanPage.tsx:58`, verified), loads with a `cancelled` flag keyed by `id`, passes `details={<SavedPlanDetails .../>}` to `PlanView`, and ends with `<Link to="/plans">My plans</Link>` (reported). A page spec asserts the h1 name `Saved plan` (`SavedPlanPage.spec.tsx:150`) and expects exactly one link named `My plans` (`:164`), so a title in the h1 and any new link name must not break those.
- **Title placement.** `SavedPlanDetails` (`SavedPlanDetails.tsx:10-17`) shows date, experience, days per week and goals, with no heading; it is shared by both pages, so it is the natural place for a title line, with the plan page h1 as the second option. `saved-plan-format.ts` holds only experience labels and `formatSavedDate`; there is no title derivation today. "Title" already exists as a concept inside `PlanResult` (session titles), a naming-collision risk in tests and copy.
- **Redirect after delete.** `/plans` via `navigate('/plans', { replace: true })` so Back does not return to the deleted plan; `nav-active.ts` already treats `/plans` and `/plans/*` as the My plans item (reported).
- **Mutation and confirmation precedent.** `AdminUsersPage` has an inline flow: state `{ userId, phase: 'confirming' | 'pending' } | null`, a page-level `<p className="error" role="alert">`, per-row `aria-label`s that include the identifying value (`Block for <email>`, `Confirm blocking <email>`, `Cancel blocking <email>`, `Blocking… <email>` so the accessible name contains the visible text), other rows disabled while one is pending, results ignored after unmount, list refreshed in place on not-found or error (reported, `AdminUsersPage.tsx:19-203`). It uses raw `<button>`, not the shared `Button`, which sits against `CLAUDE.md:39`.
- **Components.** `Button` and `ButtonLink` have `primary` and `secondary` only. There is no danger variant, no input/field component, no dialog (reported). `--error` and `--error-bg` tokens exist and are used by `.error`/`.banner` (`index.css:9-10,265-271`, verified); a destructive button style would need new CSS from those tokens with no literals.
- **Forms.** Existing forms use raw `form`/`label`/`input` styled globally (`index.css:50-84`, verified); there is no shared field component.

### Frontend: kitchen sink, UI contract, tests

- The kitchen sink (`frontend/src/dev/KitchenSinkPage.tsx`) is a flat list of `Case` sections; plan cases render `PlanViewContent`, and the saved page case is a hand-built frame. It does **not** render `SavedPlansPage` or `AdminUsersPage` states because those pages fetch. Showing delete-confirm, deleting, delete-error and rename states means extracting presentational pieces that take static props (reported; inference on the cleanest route).
- `CLAUDE.md` requires every state (loading, ready, error, pending, disabled, empty for lists) in the kitchen sink and screenshots at desktop and 375 px in light and dark after a visual change.
- `ui-contract.spec.ts` guards a fixed `GUARDED_FILES` list (no colour literals) and the empty `ALLOWED_INDEX_CSS_LITERALS`; pages other than `HomePage` and `SavedPlanDetails` are not on the list, so any new component file must be added by hand (reported).
- Tests: Vitest 4 + `@testing-library/react`; `@testing-library/user-event` is not installed, so interactions use `fireEvent`. Page specs mock `../lib/saved-plans` with a `vi.mock` factory (new exports `deleteSavedPlan` and the rename function must be added to the factories in both page specs) and `useAuth`, and render in `MemoryRouter` or `createMemoryRouter`. `CLAUDE.md:30` still says the frontend has no test framework; that line is stale (not part of this change).

### Prior decisions

- **S-05 deferral.** "Delete, rename, edit or regenerate of a saved plan (FR-008 stays parked)" (`context/archive/2026-10-27-save-and-view-plan/plan.md:32`; `plan-brief.md:41`) — supported as a deferral; delete and rename were never analysed on their own. No list pagination or search either (`plan.md:33`).
- **Retention.** PRD: form data is ordinary account data with no extra retention or anonymization commitment (`prd.md:93`). No per-user plan limit exists. Account deletion is out of scope (S-01 plan `:42`); a `Profile` delete cascades its plans.
- **Guardrail.** "A saved plan is never lost or corrupted" (`prd.md:37`) is about system loss, not owner-initiated deletion; it raises the stakes of an accidental delete, hence an explicit confirmation (inference).
- **Soft vs hard delete.** No decision exists anywhere in `context/` (workers' greps over `archive/`, `changes/`, `foundation/`). There is no `deletedAt` or `updatedAt` on `SavedPlan`; the only state-flag precedent is `Profile.blockedAt` (block, not delete).
- **Audit logging of writes.** The block-user plan lists it as out of scope with no decision (`2026-10-31-admin-block-user/plan.md:35`, reported).
- **Roadmap.** All slices S-01..S-07 and F-01 are done; M-1 is still marked open; this change has no roadmap item (`roadmap.md:43-52`, reported). Contract on `change.md` already says FR-008 stays out of scope.
- **Lessons binding on this change.** Never authorize by email, key on `Profile.id` (`lessons.md:5-10`); amend `plan.md` with a Deviation note when implementation departs (`:12-17`); keep saved-plan data backward compatible (`:19-24`).

## Code References

- `backend/src/saved-plans/saved-plans.controller.ts:25-52` — the only three routes; `ParseUUIDPipe` 404 on `:id`.
- `backend/src/saved-plans/saved-plans.service.ts:14-45` — summary/view types, `SUMMARY_SELECT`, `toSummary`, `toView`.
- `backend/src/saved-plans/saved-plans.service.ts:60-98` — `save`: existing-row lookup first, then job read, then create with P2002 re-read.
- `backend/src/saved-plans/saved-plans.service.ts:109-117` — owner-scoped `findFirst`, 404 on miss.
- `backend/prisma/schema.prisma:41-52` — `SavedPlan` model, cascade, unique and index.
- `backend/prisma/migrations/20261027193305_create_saved_plan/migration.sql:22-24` — hand-written RLS statement.
- `backend/src/main.ts:6-11` — CORS configured with `origin` only.
- `.github/workflows/deploy-backend.yml:3-28` — `prisma migrate deploy` before `flyctl deploy` on `main`.
- `backend/src/plan-generation/plan-form.schema.ts:15-22` — goals length and NUL guard (reported).
- `backend/src/admin-users/admin-users.service.ts:74-88` — conditional write plus re-read (reported).
- `frontend/src/lib/saved-plans.ts:40-101` — fetch helper pattern to copy (reported).
- `frontend/src/lib/plan-generation.ts:71` — `authFailureOf` (verified).
- `frontend/src/pages/SavedPlansPage.tsx:42,54-63` — list markup (h1 verified, item reported).
- `frontend/src/pages/SavedPlanPage.tsx:58` — fixed `Saved plan` h1 (verified).
- `frontend/src/pages/AdminUsersPage.tsx:19-203` — inline confirm precedent (reported).
- `frontend/src/components/button-class.ts:1` — `primary | secondary` only (verified).
- `frontend/src/components/SavedPlanDetails.tsx:10-17` — shared details block (reported).
- `frontend/src/ui-contract.spec.ts:6-30` — guarded file list (reported).
- `context/foundation/prd.md:37,78,93,106-108` — guardrail, FR-008, retention, member permissions.

## Architecture Insights

- Saved-plan access is always keyed on `(id, ownerId)` and answers 404 for everything else; DELETE and PATCH should reuse that shape (`deleteMany`/`updateMany` with `ownerId` in the where, `count` check) rather than add a pre-read.
- Additive changes to saved plans go in new columns, not in the `form`/`plan` JSON, because the JSON is read with unchecked casts and carries no version (`lessons.md:19-24`). The frontend should treat a missing `title` as `null`, since list and view bodies are only shape-checked loosely (list: `Array.isArray`; view: id is a string).
- Frontend mutation flows follow a lib function returning a `kind` union, then a page-level state machine with an inline confirm, a `role="alert"` message and per-control accessible names that contain the visible text.
- The UI contract expects shared components and token-only styling; a first text-input control and a first destructive button would be new shared pieces (or must be justified as local markup).

## Historical Context (from prior changes)

- `context/archive/2026-10-27-save-and-view-plan/plan.md:32,33,68,102,145,153` — out-of-scope list, schema, migration method, idempotent save, ownership 404, zod body convention.
- `context/archive/2026-10-27-save-and-view-plan/reviews/impl-review.md` — F1 timeouts on fetches, F2 NUL guard, F3 stale-id and `key={id}`, F4 backward-compat rule.
- `context/archive/2026-10-31-admin-block-user/plan.md:35,48,104,139,185-219` — write-endpoint status codes, atomic write, inline confirm flow, accessible names.
- `context/archive/2026-10-31-admin-user-list/research.md:31,75` — 403 means blocked on the frontend; ownership failures answer 404.
- `context/changes/plan-view-design/plan.md:35,323` — a "My plans" link on `SavedPlanPage` was deferred there; it exists today as a text link (reported).

## Related Research

- `context/changes/plan-view-design/research.md` — how the plan view and `details` prop are structured.
- `context/archive/2026-10-31-admin-block-user/research.md` — first inline-confirm survey (reported: no dialog or `window.confirm` in the frontend at that time).

## Open Questions

Decisions the plan must make (nothing in history decides them):

1. **Hard vs soft delete, and re-save of a still-live job.** Hard delete is simplest and consistent with no retention requirement, but a double-click or late retry of Save on the generation page within the job window (1 hour) recreates the plan with a new id and a null title. Options: accept it, or make the frontend stop offering Save for a plan it knows was deleted. Soft delete would keep the unique key but adds a column and filters on every read.
2. **DELETE contract.** 204 vs 200, and second-delete behaviour (404 follows the "missing = 404" convention). No prior `DELETE`/`PATCH` endpoint exists.
3. **PATCH contract.** Body shape (`{ title: string | null }`), trim, maximum length (80 matches the session-title limit; none is decided), empty-after-trim means "no title" (store `null`), NUL rejection, strictness of the body schema, and the response (updated summary vs 204).
4. **Where the title shows.** List item, `SavedPlanDetails`, and/or the plan page h1 (`Saved plan` is asserted by a spec). What the list shows when there is no title (the date lead as today). Whether the title also needs to appear in the generation page after Save (it does not today).
5. **Rename UI.** Inline edit on the plan page (and on the list?) with a first text-input pattern, its save, cancel, saving and error states, and whether it uses a new shared component.
6. **Delete UI.** Inline Confirm/Cancel (the only precedent) on both pages, the list item layout that keeps the delete control outside the link, a destructive visual treatment (none exists), post-delete navigation (`/plans`, `replace`), and handling of a delete that answers 404 (already gone: refresh).
7. **Kitchen sink and guard.** Which presentational pieces to extract so every new state is shown, and adding new component files to `GUARDED_FILES`.
8. **Verification gaps.** CORS preflight for `PATCH`/`DELETE` was not run; whether the migration applies cleanly was not tested; no backend or frontend test suite was run during research.
