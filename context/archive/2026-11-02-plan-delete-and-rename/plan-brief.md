# Delete a Saved Plan and Give It an Editable Title — Plan Brief

> Full plan: `context/changes/plan-delete-and-rename/plan.md`
> Research: `context/changes/plan-delete-and-rename/research.md`

## What & Why

Saved plans can be saved, listed and viewed, but the owner cannot remove one or give it a name, so the My plans list grows with no way to tidy it or tell plans apart beyond date and goals. This change adds delete (plan page and list, with inline confirmation) and an optional title that the owner edits inline on the plan page.

## Starting Point

The saved-plans API has only `POST`, `GET` and `GET :id`, scoped by `(id, ownerId)` with 404 for everything else. The list item is one big link, the plan page has a fixed `Saved plan` heading, and the only confirmation precedent is the admin Block flow. There is no text-input component or destructive button variant, and no additive database migration yet.

## Desired End State

The owner can rename a plan on its page (empty clears the title) and delete it from the page or from the list after an inline Confirm/Cancel. A title shows as the bold first line of the details in the list and the summary card; plans without one look as today. `PATCH` and `DELETE /saved-plans/:id` exist, are owner-only, and every new UI state is in the kitchen sink.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Delete semantics | Hard delete; DELETE answers 204, repeat answers 404 | Simplest, and the PRD has no retention commitment. | Plan |
| Late re-save of a deleted plan | Accepted: a Save click within about an hour of the job finishing can recreate it | The window is short and a soft delete costs a column plus a filter on every read. | Plan |
| Where the title lives | New nullable `SavedPlan.title` column, not in the JSON | `PlanForm`/`PlanResult` may change additively only. | Research |
| PATCH contract | `{ title: string \| null }`, trim, max 80, no NUL, empty becomes `null`; 200 with the summary | Matches the session-title limit and the existing goals validation. | Plan |
| Ownership failures | 404, never 403 | The frontend signs the caller out as blocked on any 403. | Research |
| Title placement | Lead line of `SavedPlanDetails`; `h1` stays `Saved plan` | One shared component feeds both pages and existing specs keep passing. | Plan |
| Rename UI | Plan page only, inline text input with Save/Cancel | One place and one new input pattern. | Plan |
| Delete confirmation | Inline Confirm/Cancel on both pages, new `danger` Button variant | Follows the admin Block precedent and keeps the UI contract. | Plan |
| Focus handling | Cancel gets focus when confirming; focus returns after cancel or error; list success moves focus to the `h1` | The clicked control unmounts on every swap. | Plan |
| Migration | Additive `ADD COLUMN "title" TEXT`, applied to the hosted DB only with your go-ahead | Safe for old code; the deploy workflow also applies it on merge. | Research |

## Scope

**In scope:** column and migration, PATCH and DELETE endpoints with tests, title in save/list/view responses, client calls, `danger` variant, `DeletePlanControl`, `RenamePlanForm`, `SavedPlanListItem`, title line, both pages, kitchen-sink states, UI-contract guard and `CLAUDE.md` update.

**Out of scope:** exercise-level editing (FR-008), soft delete or undo, bulk delete, renaming from the list, title as page heading, title on the generation page, search or sort by title, audit logging, changing the raw `Retry` button.

## Architecture / Approach

Backend first so the frontend can run against the real API: one nullable column, `deleteMany` and `updateMany` scoped by id and owner (404 when nothing matched), and a re-read for rename. The frontend adds the client calls and three presentational components with controlled state, so the kitchen sink shows every state, then wires them into the plan page and the list page, each owning its own requests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Backend | Migration, title in responses, PATCH and DELETE, tests | Existing exact-`select` and `toEqual` assertions break and must be updated; the migration touches the shared hosted DB. |
| 2. Frontend foundation | Client calls, title line, `danger` variant, delete, rename and list-item components, kitchen sink, guard, `CLAUDE.md` | First text input and destructive style in the repo; focus behaviour needs care. |
| 3. Saved plan page | Rename and delete wired, redirect to `/plans` | Stale responses after navigation and the existing `Saved plan`/`My plans` assertions. |
| 4. My plans list | Delete beside each item, in-place removal and refresh | One active delete at a time and focus after the item disappears. |

**Prerequisites:** the `plan-manage` branch (cut from the merged `main`), `DIRECT_URL` for the optional hosted-DB migration.
**Estimated effort:** ~4 sessions across 4 phases.

## Open Risks & Assumptions

- The CORS default is assumed to allow `PATCH` and `DELETE`; a manual preflight check is in Phase 1.
- The Postgres NUL-in-text failure is inferred from the same behaviour that broke JSONB earlier, so the validator rejects it up front.
- A deleted plan can briefly reappear through the late re-save path; this is accepted, not fixed.

## Success Criteria (Summary)

- An owner can rename a plan and delete it from the page or the list with a confirmation, and another user cannot touch it.
- A title shows on the list and the plan page; untitled plans look unchanged.
- All new states appear in the kitchen sink and every automated gate passes in all four phases.
