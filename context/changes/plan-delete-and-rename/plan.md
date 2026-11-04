# Delete a Saved Plan and Give It an Editable Title Implementation Plan

## Overview

Let the owner delete a saved plan (from the plan page and from the My plans list, with an inline confirmation) and give a saved plan an optional title (renamed inline on the plan page). Both actions are owner-only and answer 404 for anyone else. The title is a new nullable `SavedPlan.title` column, added with a forward-only migration, returned in the save, list and view responses and shown as the lead line of the saved-plan details.

## Current State Analysis

- The controller has exactly `POST /saved-plans`, `GET /saved-plans` and `GET /saved-plans/:id` (`backend/src/saved-plans/saved-plans.controller.ts:28,36,41`); the frontend lib has `saveGeneratedPlan`, `listSavedPlans` and `fetchSavedPlan` only (`frontend/src/lib/saved-plans.ts:40-101`). Nothing deletes or edits a saved plan.
- `SavedPlan` has `id`, `ownerId` (FK to `Profile`, cascade), `sourceJobId`, `form`, `plan`, `createdAt`, `@@unique([ownerId, sourceJobId])`, `@@index([ownerId, createdAt])` (`backend/prisma/schema.prisma:41-52`). Nothing else references it, so a row can be deleted freely.
- Every service read is scoped by `(id, ownerId)` and answers 404 on a miss (`saved-plans.service.ts:109-117`); a malformed id answers 404 through `ParseUUIDPipe` (`saved-plans.controller.ts:41-51`). Summaries come from one `SUMMARY_SELECT` (`saved-plans.service.ts:34`).
- All three existing migrations create tables; there is no additive migration yet. Migrations run automatically on a push to `main` that touches `backend/**` (`.github/workflows/deploy-backend.yml:3-28`).
- `PlanForm` and `PlanResult` are persisted contracts that may change additively only (`context/foundation/lessons.md:19-24`), so the title cannot live inside the JSON columns.
- The My plans list item is one bordered `Link` around `SavedPlanDetails` (`frontend/src/pages/SavedPlansPage.tsx:54-63`, `index.css:450-457`), so a delete control has to sit beside the link. The saved plan page has a fixed `<h1>Saved plan</h1>`, `PlanView` with a `details` prop, and one `My plans` link (`SavedPlanPage.tsx:56-79`); its spec asserts both.
- The only confirmation precedent is the inline Confirm/Cancel flow of `AdminUsersPage` (raw `<button>`s, per-control `aria-label`s that contain the visible text, a `role="alert"` notice). There is no dialog, text-input component or destructive button variant; `Button` has `primary` and `secondary` only (`frontend/src/components/button-class.ts:1`). The `--error` and `--error-bg` tokens exist.
- The kitchen sink does not render the saved-plan pages' states because those pages fetch; presentational pieces must be extracted to show them.

## Desired End State

- The plan page offers `Rename` and `Delete`. Rename swaps to a text input with Save and Cancel (empty input clears the title). Delete swaps to a prompt naming the plan with Confirm and Cancel; confirming deletes the plan and lands on `/plans` with the history entry replaced.
- Each My plans item has its own Delete control beside the link with the same inline confirmation; a deleted plan disappears in place, and the empty state appears after the last one.
- A title, when set, is the bold first line of the saved-plan details in both the list item and the plan summary card; plans without a title look exactly as today. The plan page `h1` stays `Saved plan`.
- `PATCH /saved-plans/:id` and `DELETE /saved-plans/:id` exist, are owner-scoped (404 for other owners, unknown ids and malformed ids), and are covered by unit, controller and e2e tests.
- Every new state is in the dev-only kitchen sink, and the UI contract in `CLAUDE.md` names the new pieces.

Verification: all gates in each phase pass; the manual rows are checked by the user after all phases.

### Key Discoveries:

- Owner-scoped atomic writes follow `deleteMany`/`updateMany({ where: { id, ownerId } })` with a `count === 0 -> 404` check, then a re-read; this mirrors the admin block write (`admin-users.service.ts:74-88`).
- `title` is a separate column; the frontend and backend summary type gains `title: string | null` additively.
- Never answer 403 for an ownership failure: the frontend signs the caller out as blocked on any 403 (`context/archive/2026-10-31-admin-block-user/plan.md:48`).
- Zod validation answers 400 with `{ message: 'Validation failed', issues }` through `ZodValidationPipe`, applied per parameter; Postgres text rejects `\u0000`, so the title validator rejects it like `goals` does (`plan-form.schema.ts:15-22`).
- The admin Block flow is the template for the delete control: state machine, `aria-label`s that contain the visible text, results ignored after unmount, list refreshed in place on error (`AdminUsersPage.tsx:19-203`).

## What We're NOT Doing

- Exercise-level editing or regenerating part of a plan (PRD FR-008 stays parked).
- Soft delete, undo, bulk delete, or restoring a deleted plan. Delete is a hard delete.
- Preventing the late re-save case: a Save click on the generation page within about an hour of the job finishing can recreate a deleted plan with a new id and no title; after that window Save answers 404. This is accepted and recorded here; job retention is not changed.
- Renaming from the My plans list, the plan page `h1` showing the title, a title on the generation page, sorting or searching the list by title, unique titles.
- Audit logging of deletes or renames, per-user plan limits, pagination.
- Changing the generation page's raw `Retry` button or the global `button` rule (deferred in earlier changes).
- Replacing the raw `<button>`s in `AdminUsersPage` with the shared `Button`.
- Any change to `PlanForm`, `PlanResult`, the job store or its retention.

## Implementation Approach

Backend first, so the frontend can be exercised against a real API: one additive migration, two thin endpoints and the extended summary. The frontend then lands in three steps: a foundation phase with the client calls and the presentational pieces (so every state can be shown in the kitchen sink before any page uses them), then one phase per page. The delete control and the rename form are presentational components with controlled state, so the pages own the requests and the kitchen sink can render each state with static props.

Decisions settled during planning and not reopened:

- Hard delete. `DELETE /saved-plans/:id` answers 204 with no body; a second delete answers 404; the frontend treats `not-found` on delete as "already gone".
- `PATCH /saved-plans/:id` takes `{ title: string | null }` (key required), trims the string, allows up to 80 characters (matching the session-title limit), rejects NUL, and stores an empty string as `null`. It answers 200 with the updated summary.
- The save response, the list items and the view all carry `title: string | null`.
- Title as the lead line of `SavedPlanDetails`; no title means no line. Rename on the plan page only. Delete on both pages, inline Confirm/Cancel, with a new `danger` Button variant built from `--error` and `--error-bg`.

Follow the repo conventions: `const` arrow functions, no code comments in `backend/` or `frontend/` code, forward-only migrations, tokens only in styles.

## Critical Implementation Details

- **User experience spec** — focus must be managed because the clicked control unmounts on every swap (the same loss that the plan-view-design review found for the week pager). Starting a delete moves focus to `Cancel` (the safe default); cancelling or a failed delete returns focus to the `Delete` button; opening Rename focuses the input; Save success or Cancel returns focus to the `Rename` button; a failed rename keeps focus in the input. After a successful in-place removal on the list, focus moves to the page `h1` (`tabIndex={-1}`) because the item and its controls are gone.
- **State sequencing** — a delete or rename response that arrives after the page unmounted or the route id changed must be ignored (the existing `cancelled` / `mountedRef` pattern). On the list page only one item may be in a confirming or pending state at a time, and the other items' buttons are disabled while one is pending, as in the admin flow.

## Phase 1: Backend — title column, rename and delete

### Overview

Add the nullable `title` column through a forward-only migration, expose it in every saved-plan response, and add owner-scoped `PATCH` and `DELETE` endpoints with full test coverage.

### Changes Required:

#### 1. Schema and migration

**File**: `backend/prisma/schema.prisma`, new `backend/prisma/migrations/<timestamp>_add_saved_plan_title/migration.sql`

**Intent**: Add the optional title to `SavedPlan` without touching the `form`/`plan` JSON (lessons: backward-compatible saved-plan data).

**Contract**: `title String?` on `SavedPlan`. The migration SQL is exactly `ALTER TABLE "SavedPlan" ADD COLUMN "title" TEXT;`; no second RLS statement (the table already has RLS enabled). Produce the SQL with `prisma migrate diff` like the S-05 migration to avoid a reset prompt on the shared hosted DB. Regenerate the client with `npm run prisma:generate` (it is git-ignored).

#### 2. Service

**File**: `backend/src/saved-plans/saved-plans.service.ts`

**Intent**: Return the title everywhere and add owner-scoped delete and rename that follow the existing 404 convention.

**Contract**: `SavedPlanSummary` gains `title: string | null`; `SUMMARY_SELECT`, `SummaryRow` and `toSummary` carry it, so `save`, `list` and `get` return it. New `delete(ownerId, id): Promise<void>` using `deleteMany({ where: { id, ownerId } })` and `NotFoundException` when `count === 0`. New `rename(ownerId, id, title: string | null): Promise<SavedPlanSummary>` using `updateMany({ where: { id, ownerId }, data: { title } })`, `NotFoundException` when `count === 0`, then a re-read with `SUMMARY_SELECT` (`NotFoundException` if the row vanished in between).

#### 3. Controller and body schema

**File**: `backend/src/saved-plans/saved-plans.controller.ts`

**Intent**: Expose the two endpoints with the same id handling and validation conventions as the existing routes.

**Contract**: `@Patch(':id')` with `ParseUUIDPipe({ errorHttpStatusCode: NOT_FOUND })` and `@Body(new ZodValidationPipe(renameBodySchema))`, returning the updated `SavedPlanSummary` (200). `@Delete(':id')` with the same id pipe and `@HttpCode(HttpStatus.NO_CONTENT)`. `export const MAX_PLAN_TITLE_LENGTH = 80` and `export const renameBodySchema`: `title` key required, `string | null`; a string is trimmed, at most 80 characters, must not contain `\u0000`, and an empty result becomes `null`. Both handlers pass `user.id` from `@CurrentUser()` into the service.

#### 4. Tests

**Files**: `backend/src/saved-plans/saved-plans.service.spec.ts`, `saved-plans.controller.spec.ts`, `backend/test/saved-plans.e2e-spec.ts`

**Intent**: Pin the new behaviour and update the assertions the extended summary breaks.

**Contract**: Service spec — add `deleteMany` and `updateMany` to the Prisma mock (and its reset list); update the exact-`select` assertions for `list`, `create` and `findUnique` to include `title`; new tests for delete (scoped by owner, 404 when count is 0), rename (scoped update, re-read, 404 when count is 0, 404 when the re-read finds nothing, clears to `null`). Controller spec — extend the mocks with `delete` and `update`, extend the "keys every call on user.id, never the email" loop, add body-validation cases for `renameBodySchema` (accepts a string, a 80-character string, `null`, a whitespace-only string stored as `null`, trims; rejects an 81-character string, a string with NUL, a non-string, a missing `title`). E2E — extend `FakeSavedPlanTable` and `SavedPlanRow` with `title`, `deleteMany` and `updateMany`; change the exact `toEqual({ id, createdAt, form })` assertions to include `title: null`; add PATCH and DELETE cases: owner success (200 with the summary / 204), other owner 404, unknown id 404, malformed id 404, second DELETE 404, invalid PATCH body 400, 401 without a user, PATCH then GET shows the title in the view and the list, DELETE then GET answers 404 and the list no longer contains it.

### Success Criteria:

#### Automated Verification:

- Prisma client generates with the title field: `cd backend && npm run prisma:generate`
- Migration SQL holds the single column add: `grep -c 'ADD COLUMN "title" TEXT' backend/prisma/migrations/*_add_saved_plan_title/migration.sql` prints 1
- Backend unit tests pass: `cd backend && npm test`
- Backend e2e tests pass: `cd backend && npm run test:e2e`
- Backend build passes: `cd backend && npm run build`
- Backend lint passes: `cd backend && npm run lint`

#### Manual Verification:

- With your go-ahead, the migration is applied to the hosted database (`cd backend && npm run prisma:migrate:deploy`) and existing saved plans still list, now with `title: null`
- Against the running API, PATCH sets and clears a title, DELETE answers 204 and then 404, and another user's plan answers 404 for both
- A preflight (`OPTIONS` with `Origin: http://localhost:5173` and `Access-Control-Request-Method: DELETE`, then `PATCH`) allows both methods

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Frontend foundation — client, title line, danger variant, delete and rename pieces

### Overview

Add the API client calls and the presentational pieces both pages will use, and show every new state in the kitchen sink. No page behaviour changes yet except that a title, when present, shows in the details.

### Changes Required:

#### 1. API client

**File**: `frontend/src/lib/saved-plans.ts` (and `saved-plans.spec.ts`)

**Intent**: Add the two write calls in the existing result-union style and carry the title on the types.

**Contract**: `SavedPlanSummary` gains `title: string | null`. `deleteSavedPlan(id)` sends `DELETE` to `/saved-plans/${encodeURIComponent(id)}` with a 15 s write timeout and returns `{ kind: 'ok' } | AuthFailureResult | { kind: 'not-found' } | { kind: 'error' }` (204 is ok; no body is read). `renameSavedPlan(id, title: string | null)` sends `PATCH` with a JSON `{ title }` body and the same timeout and returns `{ kind: 'ok'; plan: SavedPlanSummary } | AuthFailureResult | { kind: 'not-found' } | { kind: 'error' }`, with the usual `typeof plan?.id === 'string'` body guard. Status order: `authFailureOf`, 404, `!ok`. Export `MAX_PLAN_TITLE_LENGTH = 80`. Fixtures that build `SavedPlanSummary` in specs gain `title: null`.

#### 2. Title line and label helper

**Files**: `frontend/src/components/SavedPlanDetails.tsx`, `frontend/src/lib/saved-plan-format.ts`, `frontend/src/index.css`

**Intent**: Show the title as the lead line and give controls one way to name a plan.

**Contract**: `SavedPlanDetails` takes `title?: string | null`; when it is a non-empty string it renders it first in a span with a new `.saved-plans-title` class (bold, `overflow-wrap: anywhere`); otherwise the output is unchanged. `savedPlanLabel({ title, createdAt })` returns the title when set, else `plan from <formatSavedDate(createdAt)>`; it feeds the `aria-label`s below.

#### 3. Danger variant

**Files**: `frontend/src/components/button-class.ts`, `Button.tsx`, `frontend/src/index.css`

**Intent**: A destructive action must not look like any other button, using existing tokens only.

**Contract**: `ButtonVariant` becomes `'primary' | 'secondary' | 'danger'`; `.btn-danger` has a `--error` border and text on a transparent background and a `--error-bg` background on hover; no new token and no literal colour. `Button.spec.tsx` covers the new class.

#### 4. DeletePlanControl

**File**: `frontend/src/components/DeletePlanControl.tsx` (+ spec)

**Intent**: The inline delete confirmation, presentational and shared by both pages.

**Contract**: Props `{ label: string; phase: 'idle' | 'confirming' | 'pending'; disabled?: boolean; onStart(): void; onConfirm(): void; onCancel(): void }`. Idle renders a `Button variant="danger"` reading `Delete` with `aria-label` `Delete ${label}`. Confirming renders the text `Delete ${label}?` with `Confirm` (`aria-label` `Confirm deleting ${label}`) and `Cancel` (`aria-label` `Cancel deleting ${label}`). Pending renders `Deleting…` (`aria-label` `Deleting… ${label}`), both buttons disabled. Every visible text is contained in its accessible name. Focus follows the spec in Critical Implementation Details: `Cancel` receives focus when confirming begins, the `Delete` button when returning to idle. `disabled` disables the idle button (used while another list item is pending).

#### 5. RenamePlanForm

**File**: `frontend/src/components/RenamePlanForm.tsx` (+ spec)

**Intent**: The inline title editor, with its own draft state and controlled request state.

**Contract**: Props `{ initialTitle: string | null; pending: boolean; error: string | null; onSave(title: string | null): void; onCancel(): void }`. A `form` with a labelled `Plan title` text input (`maxLength` `MAX_PLAN_TITLE_LENGTH`, prefilled with `initialTitle`, focused on mount), a `Save` button and a `Cancel` button. Submitting calls `onSave` with the trimmed value, or `null` when empty. While `pending` the input and both buttons are disabled and Save reads `Saving…` (`aria-label` containing it). A non-null `error` renders `<p className="error" role="alert">`. A `.rename-form` class lays the input and buttons out in a wrapping row.

#### 6. SavedPlanListItem

**File**: `frontend/src/components/SavedPlanListItem.tsx` (+ spec)

**Intent**: The list item as a presentational unit, so the kitchen sink can show it and the list page can reuse it in Phase 4.

**Contract**: Props `{ plan: SavedPlanSummary; deletePhase: 'idle' | 'confirming' | 'pending'; deleteDisabled: boolean; onDeleteStart(): void; onDeleteConfirm(): void; onDeleteCancel(): void }`. Renders an `li` containing the existing `Link` to `/plans/${encodeURIComponent(plan.id)}` around `SavedPlanDetails` (now with the title), and below it a `.saved-plans-actions` row with `DeletePlanControl` labelled by `savedPlanLabel`. The `Link` stays the only link in the item.

#### 7. Kitchen sink, contract guard and rules

**Files**: `frontend/src/dev/KitchenSinkPage.tsx`, `frontend/src/dev/kitchen-sink.css` (only if a layout needs it), `frontend/src/ui-contract.spec.ts`, `CLAUDE.md`

**Intent**: Every new state is visible and guarded, and the next agent is told the pieces exist.

**Contract**: New kitchen-sink cases: danger button (default, hover note, disabled); `DeletePlanControl` idle, confirming, pending, and with a very long label; `RenamePlanForm` editing with and without an initial title, saving, error, and an 80-character title; `SavedPlanDetails` with a title, an 80-character title and no title; `SavedPlanListItem` without a title, with a title, confirming and pending; the saved page frame with a title. `GUARDED_FILES` gains `DeletePlanControl.tsx`, `RenamePlanForm.tsx`, `SavedPlanListItem.tsx` and `SavedPlanDetails.tsx`; the allowlist stays empty. The `CLAUDE.md` UI contract bullet naming shared components adds `DeletePlanControl`, `RenamePlanForm` and `SavedPlanListItem` and the `danger` variant, outside the 10x-cli marker block (the block's hash must not change).

**Deviation (2026-11-04, Phase 2 implemented)**: `Button` props are now typed `ComponentProps<'button'>` (instead of `ButtonHTMLAttributes`) so a React 19 `ref` is typed, which `DeletePlanControl` needs for focus; `button-class.ts` maps variants through a lookup table with unchanged class strings. `RenamePlanForm` refocuses its input when `pending` goes from true to false, because disabling the input drops focus (this implements "a failed rename keeps focus in the input"). `DeletePlanControl` keeps the `Delete <label>?` text visible in both the confirming and pending phases (as in `AdminUsersPage`). `kitchen-sink.css` needed no change, and `PlanGenerationPage.spec.tsx` also got `title: null` on its saved-plan fixture. Pages only pass `title` to `SavedPlanDetails` in this phase; the flows land in Phases 3 and 4.

### Success Criteria:

#### Automated Verification:

- Frontend unit and component tests pass: `cd frontend && npm test`
- Frontend build passes: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`
- The production build does not contain the kitchen sink: `cd frontend && ! grep -rl "kitchen-sink" dist`
- The 10x-cli block of CLAUDE.md is unchanged: `git diff -U0 -- CLAUDE.md | grep -c 'przeprogramowani'` prints 0

#### Manual Verification:

- The kitchen sink shows every new state listed above, in light and dark, at desktop width and at 375 px, with no overflow or clipped text
- The danger button hover, focus ring and disabled look are clear in both themes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Saved plan page — rename and delete

### Overview

Wire rename and delete into the saved plan page, show the title in the summary card, and redirect to `/plans` after a delete.

### Changes Required:

#### 1. Page behaviour

**File**: `frontend/src/pages/SavedPlanPage.tsx`

**Intent**: Give the owner Rename and Delete on the plan they are looking at.

**Contract**: Under the `h1` (which stays `Saved plan`) and above `PlanView`, a `.saved-plan-actions` row holds a `Rename` secondary `Button` (`aria-label` `Rename ${label}`) and the `DeletePlanControl`; opening Rename shows `RenamePlanForm` in place of the Rename button. `SavedPlanDetails` receives the plan's `title`. Rename: on `ok` the page state's plan takes the returned title and the form closes with focus back on `Rename`; `not-found` switches the page to its `not-found` state; `error` keeps the form open with the page's generic error as the form `error`; auth failures go through `handleAuthFailure`. Delete: `ok` and `not-found` both call `navigate('/plans', { replace: true })`; `error` returns the control to idle with a `role="alert"` notice (`GENERIC_PLAN_ERROR`); auth failures go through `handleAuthFailure`. Requests started for another `id` or after unmount are ignored. The `My plans` link stays the only link with that name.

#### 2. Tests

**File**: `frontend/src/pages/SavedPlanPage.spec.tsx`

**Intent**: Cover the new flows and keep the existing assertions intact.

**Contract**: Add `deleteSavedPlan` and `renameSavedPlan` to the `../lib/saved-plans` mock factory and a `/plans` placeholder route to the router fixtures. Tests: the title shows in the summary when set and the details are unchanged when it is `null`; Rename opens the form prefilled and focused; saving sends the trimmed title and updates the shown title; saving an empty value sends `null` and removes the title line; Cancel restores the Rename button and focus; a rename error keeps the form open with the message; rename `not-found` shows the not-found state; Delete → Cancel returns focus to Delete; Delete → Confirm calls `deleteSavedPlan` with the id and navigates to `/plans` (the list placeholder renders, the history entry is replaced); a delete `not-found` also navigates to `/plans`; a delete `error` shows the alert and returns to idle; both write calls route 401/403 to sign-out; a response that arrives after unmount changes nothing; buttons are disabled while pending.

**Deviation (2026-11-04, Phase 3 implemented)**: while the rename form is open the page disables Delete, and while a delete is confirming or pending the Rename button is disabled, so the two flows are never active together (the plan left this open). The delete failure notice renders between the actions row and `PlanView`. The page spec's `../lib/saved-plans` mock factory also exports `MAX_PLAN_TITLE_LENGTH` (read by `RenamePlanForm`), and a `renderWithRouter` helper on `createMemoryRouter` asserts `historyAction === 'REPLACE'` for the delete redirect. `index.css` gained `.saved-plan-actions` and a rule that makes an open rename form fill the row.

### Success Criteria:

#### Automated Verification:

- Saved plan page spec passes: `cd frontend && npx vitest run src/pages/SavedPlanPage.spec.tsx`
- Frontend unit and component tests pass: `cd frontend && npm test`
- Frontend build passes: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Against the real API, renaming sets, changes and clears the title (including a whitespace-only value and an 80-character value), and the title appears as the bold first line of the summary card
- Delete → Cancel keeps the plan; Delete → Confirm lands on My plans without that plan, and Back does not return to the deleted plan
- Keyboard only: focus moves as specified (Cancel when confirming, back to Delete or Rename afterwards, the input when renaming)
- Deleting the plan in a second tab first, then confirming in the first, lands on My plans without an error
- The page looks right at 375 px and at desktop width, in light and dark

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: My plans list — delete beside each item

### Overview

Use `SavedPlanListItem` in the list, delete in place with the same inline confirmation, and keep the list truthful on errors.

### Changes Required:

#### 1. Page behaviour

**File**: `frontend/src/pages/SavedPlansPage.tsx`

**Intent**: Let the owner delete any listed plan without opening it, with one active delete at a time.

**Contract**: Replace the inline `li`/`Link` markup with `SavedPlanListItem`. Page state gains `deleting: { id: string; phase: 'confirming' | 'pending' } | null` and a `notice: string | null`. Delete `ok` or `not-found` removes the item from the ready list in place (the empty state shows after the last one) and moves focus to the page `h1` (`tabIndex={-1}`); `error` sets a page-level `role="alert"` notice (`GENERIC_PLAN_ERROR`), returns the item to idle and refreshes the list in place when the refresh succeeds (the backend may have written before the response failed; a failed refresh leaves the list as it was); auth failures go through `handleAuthFailure`. Starting a new delete clears the notice. While one item is pending, every other item's Delete is disabled (`deleteDisabled`). Results after unmount are ignored.

#### 2. Tests

**File**: `frontend/src/pages/SavedPlansPage.spec.tsx`

**Intent**: Cover list deletion and keep the existing list assertions passing.

**Contract**: Add `deleteSavedPlan` to the `../lib/saved-plans` mock factory. Tests: each item still has exactly one link to its plan; the title shows in the item when set; Delete → Cancel restores the item and focus; Delete → Confirm calls `deleteSavedPlan` with that id and removes only that item; deleting the last plan shows the empty state and focuses the `h1`; delete `not-found` removes the item; delete `error` shows the alert, keeps the item and refetches the list (a refetch that fails leaves the list unchanged); other items' Delete buttons are disabled while one is pending; 401/403 route to sign-out; a response after unmount changes nothing.

**Deviation (2026-11-04, Phase 4 implemented)**: on the list page every other item's Delete is disabled while any item is confirming or pending (the plan said pending only), which also removes a focus conflict that arose when a confirmation switched between items. After a failed delete the in-place refresh is dropped when the user has started another delete in the meantime, so a stale list cannot bring a deleted plan back; an auth failure during that refresh goes through `handleAuthFailure`. The page spec's `../lib/saved-plans` mock factory adds only `deleteSavedPlan`. Focus assertions in the page specs that follow an async step use `waitFor`, because a passive focus effect can run after the element appears; without it the Phase 3 and 4 specs failed about once in three runs under load.

### Success Criteria:

#### Automated Verification:

- List page spec passes: `cd frontend && npx vitest run src/pages/SavedPlansPage.spec.tsx`
- Frontend unit and component tests pass: `cd frontend && npm test`
- Frontend build passes: `cd frontend && npm run build`
- Frontend lint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Deleting from the list removes the item, and deleting the last one shows the empty state
- A plan with a title shows it as the bold first line of its list item; a plan without one looks as before
- With the backend stopped, confirming a delete shows the error and keeps the item; after the backend is back, the same delete works
- While one item is pending, the other items' Delete buttons are disabled
- The list looks right at 375 px and at desktop width, in light and dark, with a very long title wrapping inside the item

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Backend: `renameBodySchema` boundaries (trim, 80 vs 81, NUL, `null`, missing key, empty to `null`); service delete and rename owner scoping and 404s; controller keys every call on `user.id`.
- Frontend lib: path, method, headers and body, status-to-kind mapping, thrown fetch, unreadable body, timeout signal.
- Components: `DeletePlanControl` phases, names and focus; `RenamePlanForm` trimming, empty to `null`, pending, error; `SavedPlanListItem` single link; `savedPlanLabel`; `Button` danger class.

### Integration Tests:

- Backend e2e through supertest with the fake table: PATCH and DELETE owner paths, ownership 404s, malformed id 404, repeat DELETE 404, 400 and 401 cases, and the title appearing in view and list after PATCH.
- Page specs mock `../lib/saved-plans` and `useAuth` and render in a memory router with a `/plans` route.

### Manual Testing Steps:

1. Rename a plan to a normal title, to an 80-character title, to whitespace only (clears), and confirm the list and the plan page agree.
2. Delete from the plan page (Cancel, then Confirm) and from the list; confirm Back does not return to a deleted plan.
3. Delete a plan in one tab and then act on it in another (rename and delete) and confirm the not-found handling.
4. Do the above keyboard-only and at 375 px in light and dark.

## Performance Considerations

None beyond existing behaviour: `deleteMany` and `updateMany` hit the primary key plus `ownerId`, and the list still loads in one query without the plan body.

## Migration Notes

The migration is additive and nullable, so old rows read as `title: null` with no backfill and old code keeps working against the new column. It is forward-only (undoing means a new migration). `deploy-backend.yml` runs `prisma migrate deploy` before `flyctl deploy` when this lands on `main`; applying it to the hosted database earlier (Phase 1 manual row) is harmless because the deploy run finds it already applied. No data is rewritten and `PlanForm`/`PlanResult` are untouched.

## References

- Related research: `context/changes/plan-delete-and-rename/research.md`
- Ownership and read pattern: `backend/src/saved-plans/saved-plans.service.ts:109-117`
- Owner-scoped write precedent: `backend/src/admin-users/admin-users.service.ts:74-88`
- Inline confirmation precedent: `frontend/src/pages/AdminUsersPage.tsx:19-203`
- Client call template: `frontend/src/lib/saved-plans.ts:40-101`, `frontend/src/lib/admin-users.ts:63-84`
- Lessons: `context/foundation/lessons.md` (never authorize by email, amend plan on deviation, saved-plan data backward compatible)
- Earlier decision deferring delete and rename: `context/archive/2026-10-27-save-and-view-plan/plan.md:32`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — title column, rename and delete

#### Automated

- [x] 1.1 Prisma client generates with the title field: `cd backend && npm run prisma:generate` — 5066027
- [x] 1.2 Migration SQL holds the single column add: `grep -c 'ADD COLUMN "title" TEXT' backend/prisma/migrations/*_add_saved_plan_title/migration.sql` prints 1 — 5066027
- [x] 1.3 Backend unit tests pass: `cd backend && npm test` — 5066027
- [x] 1.4 Backend e2e tests pass: `cd backend && npm run test:e2e` — 5066027
- [x] 1.5 Backend build passes: `cd backend && npm run build` — 5066027
- [x] 1.6 Backend lint passes: `cd backend && npm run lint` — 5066027

#### Manual

- [ ] 1.7 With your go-ahead, the migration is applied to the hosted database (`cd backend && npm run prisma:migrate:deploy`) and existing saved plans still list, now with `title: null`
- [ ] 1.8 Against the running API, PATCH sets and clears a title, DELETE answers 204 and then 404, and another user's plan answers 404 for both
- [ ] 1.9 A preflight (`OPTIONS` with `Origin: http://localhost:5173` and `Access-Control-Request-Method: DELETE`, then `PATCH`) allows both methods

### Phase 2: Frontend foundation — client, title line, danger variant, delete and rename pieces

#### Automated

- [x] 2.1 Frontend unit and component tests pass: `cd frontend && npm test` — 5066027
- [x] 2.2 Frontend build passes: `cd frontend && npm run build` — 5066027
- [x] 2.3 Frontend lint passes: `cd frontend && npm run lint` — 5066027
- [x] 2.4 The production build does not contain the kitchen sink: `cd frontend && ! grep -rl "kitchen-sink" dist` — 5066027
- [x] 2.5 The 10x-cli block of CLAUDE.md is unchanged: `git diff -U0 -- CLAUDE.md | grep -c 'przeprogramowani'` prints 0 — 5066027

#### Manual

- [ ] 2.6 The kitchen sink shows every new state listed above, in light and dark, at desktop width and at 375 px, with no overflow or clipped text
- [ ] 2.7 The danger button hover, focus ring and disabled look are clear in both themes

### Phase 3: Saved plan page — rename and delete

#### Automated

- [x] 3.1 Saved plan page spec passes: `cd frontend && npx vitest run src/pages/SavedPlanPage.spec.tsx` — 5066027
- [x] 3.2 Frontend unit and component tests pass: `cd frontend && npm test` — 5066027
- [x] 3.3 Frontend build passes: `cd frontend && npm run build` — 5066027
- [x] 3.4 Frontend lint passes: `cd frontend && npm run lint` — 5066027

#### Manual

- [ ] 3.5 Against the real API, renaming sets, changes and clears the title (including a whitespace-only value and an 80-character value), and the title appears as the bold first line of the summary card
- [ ] 3.6 Delete → Cancel keeps the plan; Delete → Confirm lands on My plans without that plan, and Back does not return to the deleted plan
- [ ] 3.7 Keyboard only: focus moves as specified (Cancel when confirming, back to Delete or Rename afterwards, the input when renaming)
- [ ] 3.8 Deleting the plan in a second tab first, then confirming in the first, lands on My plans without an error
- [ ] 3.9 The page looks right at 375 px and at desktop width, in light and dark

### Phase 4: My plans list — delete beside each item

#### Automated

- [x] 4.1 List page spec passes: `cd frontend && npx vitest run src/pages/SavedPlansPage.spec.tsx` — 5066027
- [x] 4.2 Frontend unit and component tests pass: `cd frontend && npm test` — 5066027
- [x] 4.3 Frontend build passes: `cd frontend && npm run build` — 5066027
- [x] 4.4 Frontend lint passes: `cd frontend && npm run lint` — 5066027

#### Manual

- [ ] 4.5 Deleting from the list removes the item, and deleting the last one shows the empty state
- [ ] 4.6 A plan with a title shows it as the bold first line of its list item; a plan without one looks as before
- [ ] 4.7 With the backend stopped, confirming a delete shows the error and keeps the item; after the backend is back, the same delete works
- [ ] 4.8 While one item is pending, the other items' Delete buttons are disabled
- [ ] 4.9 The list looks right at 375 px and at desktop width, in light and dark, with a very long title wrapping inside the item
