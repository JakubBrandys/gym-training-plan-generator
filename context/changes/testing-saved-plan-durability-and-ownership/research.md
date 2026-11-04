---
date: 2026-11-04T15:50:00+01:00
researcher: Claude Code (claude-sonnet-5-5)
git_commit: d82056fe9a7bca9d14d228d5ca73597640d60d9b
branch: main
repository: gym-training-plan-generator
topic: "Rollout Phase 2 of test-plan.md: does a saved plan reload intact (Risk #3) and can only its owner read or change it (Risk #4)?"
tags: [research, codebase, saved-plans, ownership, persistence, jsonb, plan-view, images, test-plan]
status: complete
last_updated: 2026-11-04
last_updated_by: Claude Code (claude-sonnet-5-5)
---

# Research: Saved-plan durability and ownership (test-plan Phase 2, Risks #3 and #4)

**Date**: 2026-11-04T15:50:00+01:00
**Researcher**: Claude Code (claude-sonnet-5-5)
**Git Commit**: d82056fe9a7bca9d14d228d5ca73597640d60d9b (working tree has uncommitted test-plan, CLAUDE.md and tooling files only; no application code was modified)
**Branch**: main
**Repository**: gym-training-plan-generator

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`. Verify or correct the response guidance for:

- **Risk #3**: a plan saved from a completed generation must reload identically, images included, in a later session; an older stored shape must still render; a failed save must be surfaced, not confirmed.
- **Risk #4**: user B must not read, stream, save, rename or delete user A's job or plan; the answer must match a nonexistent id, and A's data must survive B's attempt.

For each risk: ground the real path, check the "must challenge" assumptions, find the oracle in requirements rather than in code, find existing tests, and name the cheapest useful test layer.

## Summary

**Risk #4 (ownership) is enforced in code on every inspected path, and the tests cover the "other user gets 404" half well and the "A's data survived" half only partly.**

- On the inspected path (every controller in `backend/src` that takes a job id or saved-plan id: two controllers, eight routes), ownership is decided by comparing the verified token subject with the stored owner: `job?.ownerId === ownerId` in the job store (`plan-job.store.ts:86`) and `where: { id, ownerId }` in each saved-plan query (`saved-plans.service.ts:118-120`, `:128-130`, `:141-144`, `:148-151`) or the compound key `ownerId_sourceJobId` for save (`:158-165`). No handler takes an owner id from a header, body or param (worker-reported, `auth.guard.ts:55-59`).
- All three assumptions to challenge are false in this code: a scoped list does not stand in for a scoped get (each query carries its own `ownerId`), an unguessable id is not the control (ids are random UUIDs but access is the owner comparison), and owning the job does not imply owning the save (`save` re-checks with `store.get(jobId, ownerId)` at `saved-plans.service.ts:74`).
- Foreign id and well-formed unknown id follow the same code path on every route and throw a bare `NotFoundException`. One difference exists that is not an existence leak: a malformed (non-UUID) id on `/saved-plans/:id` gets a different 404 body from `ParseUUIDPipe`, while the same malformed id on `/plan-generations/:jobId` gets the plain body (worker-reported, from Nest sources, not run).
- Test gaps: no test compares a foreign-id response body with an unknown-id response body over HTTP; PATCH and DELETE assert that A's row survived but not that the whole row is unchanged; the case "A saved job J, then B posts J" and a foreign `Last-Event-ID` replay have no test; GET routes have no "owner can still read after B's attempt" check (matrix in Section 3).
- The e2e persistence fake filters on `ownerId` itself, so dropping `ownerId` from a service query makes the owner's own tests fail. It therefore gives real signal for ownership scoping even though it is not a database.

**Risk #3 (durability) has no test that exercises persistence, and several rules of the oracle are not decided by the sources.**

- No backend test talks to a real PostgreSQL. Every persistence test uses `vi.fn()` stubs or the in-memory `FakeSavedPlanTable` (`test/saved-plans.e2e-spec.ts:65-207`). The "round trip" tests compare one literal fixture with a `structuredClone` of itself (worker-reported, `:218-241`, `:284-303`, `:484-501`). Both backend fixtures use `imageKey: null` and `note: null` only (worker-reported).
- `save` answers 201 after selecting only `id, createdAt, form, title`; the stored `plan` is never read back (`saved-plans.service.ts:36-41`, `:83-92`). A 201 therefore proves the insert, not that the plan reads back identically.
- The columns are `JSONB NOT NULL` (migration `20261027193305_create_saved_plan`, worker-reported). Postgres jsonb rejects `\u0000` (domain knowledge, inferred, not run). NUL is rejected in the form `goals` and the rename title (`plan-form.schema.ts:20`, `saved-plans.controller.ts:34`, verified), but not in model-written plan text: `goal`, `title`, `reps` and `note` are plain `z.string()` (`plan.schema.ts:10-20`, verified) and the validator only checks lengths and counts. No exception filter exists (worker-reported grep), so a failing insert would end as a default 500, and the frontend shows the generic error on 5xx (Section 5).
- The frontend read path casts the response and checks only `typeof plan?.id === 'string'` (`saved-plans.ts:112-113`, verified). Render crashes are reachable from a stored body that lacks `form`, `plan`, `plan.weeks`, a week's `sessions` or a session's `exercises` (Section 5); there is no error boundary. The empty `weeks: []` and missing `note`/`imageKey` cases render without throwing.
- **Surprise for the plan**: the `isPlanResult` guard shipped in Phase 1 (`plan-generation.ts:109-113`) is stricter than the renderer. It rejects an exercise with a missing `note` or `imageKey`, and `PlanView` renders such an exercise fine (no note, no image: `PlanView.tsx:17`). Applying the guard unchanged to the saved-plan read path would turn "an older stored shape still renders" into an error.
- No older shape exists in git history: `imageKey` was added to the plan result in commit `15d1358` (2026-10-27 20:15), 22 minutes before the `SavedPlan` table was created in `8d56889` (20:37); the only later change to either schema file is a `goals` validation tightening (worker-reported `git log`). An "older stored shape" fixture must be invented, and the PRD names none.
- Images are not served by the backend. A stored plan holds a relative `imageKey` (`exercises/<slug>.jpg`); the page builds `src="/${imageKey}"` on the frontend origin (`PlanView.tsx:14-30`, verified), and the 32 files live in `frontend/public/exercises/` (worker-reported, checked with node against the seed data). "Images included" after a reload therefore depends on stored data plus deployed static files, not on the database.
- A failed save is surfaced on every result kind the worker traced, with the plan kept on screen and no optimistic state anywhere in save, rename or delete; the one untested branch is a rejected promise through the page's `catch`.

**Real-database testing needs infrastructure that does not exist.** No docker-compose, no Supabase local config, no test `DATABASE_URL`, no Postgres service in CI (the only workflows deploy), and `psql` is absent; `docker` is a Windows shim with no `/var/run/docker.sock` on this machine (worker-reported; daemon usability unknown).

**Consequence for the plan:** the cheapest high-signal work is (a) extending the existing two-user e2e into a full matrix that also checks the victim's data and compares foreign against unknown responses, and (b) a frontend test that feeds an independently written raw JSON body through the real `fetchSavedPlan` into `SavedPlanPage` and `PlanView`, including images and older-shape bodies. Whether to add a real-database round trip is a cost decision for the plan (Open Questions), not a given.

## Detailed Findings

### 1. Every id-taking endpoint and where ownership is enforced (Risk #4)

Verified directly: `saved-plans.controller.ts` (all), `saved-plans.service.ts` (all), `plan-job.store.ts:83-87`, `plan-generation.controller.ts:144`, `:202-210`. The rest is worker-reported (ownership worker, anchors spot-checked).

| Endpoint | Id source | Ownership enforced at |
|---|---|---|
| `GET /plan-generations/:jobId` | path, no pipe | `store.get(jobId, user.id)` then `NotFoundException` (`plan-generation.controller.ts:207-209`) |
| `GET /plan-generations/:jobId/events` | path, no pipe; `Last-Event-ID` parsed to a non-negative integer | `store.get` at `:144` (404 before headers), `subscriberCount` at `:150`, `subscribe` at `:167`, `get` at `:189` |
| `POST /saved-plans` | body `jobId`, `z.uuid()` (`saved-plans.controller.ts:23`) | `findBySourceJob(ownerId, jobId)` then `store.get(jobId, ownerId)` (`saved-plans.service.ts:69-77`) |
| `GET /saved-plans/:id` | path, `ParseUUIDPipe` with 404 (`:43-45`) | `findFirst({ where: { id, ownerId } })` (`:118-120`) |
| `PATCH /saved-plans/:id` | path + body `title` | `updateMany({ where: { id, ownerId } })`, `count === 0` gives 404, then an owner-scoped re-read (`:141-151`) |
| `DELETE /saved-plans/:id` | path | `deleteMany({ where: { id, ownerId } })`, `count === 0` gives 404 (`:128-133`) |
| `GET /saved-plans` | none | `findMany({ where: { ownerId } })` (`:109-111`) |
| `POST /plan-generations` | none (server mints the id) | owner stored at creation (`plan-job.store.ts:67`, worker-reported) |

- On the inspected path, `PlanJobStore.subscribe` and `subscriberCount` reach the owner check through `get`, so `Last-Event-ID` replay runs only after the owner comparison (worker-reported `plan-job.store.ts:129-152`). The store methods that take a job id without an owner (`setStage`, `append`, `complete`, `fail`, `finish`, `record`) have no non-test caller outside the pipeline, which uses the id returned by `create` (worker-reported grep).
- `purgeExpired()` runs on every `create`, `get` and `hasActive` for all owners and can fail another user's expired running job, delivering a `failed` event to that job's own subscribers (worker-reported `plan-job.store.ts:204-216`). It is time-driven and exposes no data.
- Auth: one global `AuthGuard` (`auth.module.ts:13`); `@Public()` appears only on the app and health controllers; blocked profiles get 403 before `request.user` is set (worker-reported). Blocked-user behaviour on these routes is Risk #6 and is out of scope here; no test covers it (Section 3).
- Ownership is backend-only. The tables have RLS enabled with no policies and the runtime role must own them or bypass RLS (migrations and README, worker-reported; `archive/2026-10-10-sign-up-and-login/plan.md`), so there is no second line of defence in the database.

### 2. Foreign id versus nonexistent id (Risk #4 oracle: "the answer matches a nonexistent id")

- On the inspected path, a foreign id and a well-formed unknown id reach the same `NotFoundException()` on every route above, with the body `{message:'Not Found', statusCode:404}` (worker-reported from Nest `HttpException.createBody`, not run). For the stream route the throw happens before `writeHead`, so the response is JSON, not an event stream (`plan-generation.controller.ts:144-146`).
- A malformed id on `/saved-plans/:id` gets `{message:'Validation failed (uuid is expected)', error:'Not Found', statusCode:404}` from `ParseUUIDPipe`; the status matches and the body differs. A malformed `jobId` in the `POST /saved-plans` body gets 400 from the zod pipe. `/plan-generations/:jobId` has no UUID pipe, so malformed, unknown and foreign all give the plain body (worker-reported).
- The PRD does not define the response for another user's plan; the 404-never-403 convention comes from the S-05 plan and the plan-delete-and-rename plan (the frontend signs the caller out as blocked on any 403) (`context/archive/2026-10-27-save-and-view-plan/plan.md:26,48`; `context/changes/plan-delete-and-rename/plan.md:34`, worker-reported).

### 3. Existing tests and the ownership matrix (Risk #4)

Worker-reported, anchors partly spot-checked (`saved-plans.e2e-spec.ts:353-363`, `:503-527`, `:590-596`, `:671-677` read directly).

- Two users in e2e are two values of an `x-test-user` header through a local `HeaderUserGuard`, duplicated in three spec files; ids are plain strings such as `'user-1'`, while the real `ownerId` column is `@db.Uuid` (`saved-plans.e2e-spec.ts:26-39`).
- `npm run test` (`vitest.config.ts`, `include: ['**/*.spec.ts']`) does not collect `*.e2e-spec.ts`; only `npm run test:e2e` runs them (`vitest.config.e2e.ts:9`, verified). No CI workflow runs either.
- Matrix (covered / partly / not covered):

| Endpoint | Other user gets 404 | Same response as a nonexistent id | Victim's data unchanged after the attempt |
|---|---|---|---|
| `GET /plan-generations/:jobId` | covered (e2e `plan-generation.e2e-spec.ts:199-211`) | partly (controller-level body compare, `plan-generation.controller.spec.ts:285-294`, with the unknown id `'no-such-job'`) | not covered |
| `GET /plan-generations/:jobId/events` | covered (e2e `:368-378`) | partly (status and no `event:` text; bodies not compared) | not covered; no foreign `Last-Event-ID` test |
| `POST /saved-plans`, B posts A's unsaved job | covered (`:353-359`, no row created) | partly (separate tests, status only) | partly (A's job still savable afterwards is not asserted) |
| `POST /saved-plans`, A saved J then B posts J | not covered | not covered | not covered |
| `GET /saved-plans/:id` | covered (`:503-512`, status only) | partly | not covered |
| `PATCH /saved-plans/:id` | covered (`:590-596`) | partly | partly (`rows[0].title` still `null`; not the whole row) |
| `DELETE /saved-plans/:id` | covered (`:671-677`) | partly | partly (`rows` has length 1; the row is not compared) |
| `GET /saved-plans` (list) | scoping covered (`:410-427`, `:467-476`) | not applicable | not applicable |

- Service unit tests for `get`, `delete` and `rename` mock a null or zero result regardless of owner, so they prove the mapping of a miss to 404; the `toHaveBeenCalledWith` assertions on the `where` clauses are what pin the owner scoping (worker-reported, `saved-plans.service.spec.ts:330-376`).
- No test covers a blocked user, or a user without a `Profile` row, on these routes (worker-reported; Risk #6).

### 4. Persistence layer and what the fakes cannot show (Risk #3)

- Storage: `SavedPlan.form` and `.plan` are `Json` in the Prisma schema (verified, `schema.prisma:46-47`) and `JSONB NOT NULL` in the migration (verified, `migration.sql:6-7`); `title` is a later nullable column with no default, so rows saved before it read back as `null` (worker-reported migration `20261104090000_add_saved_plan_title`).
- Every write site: `create` (`saved-plans.service.ts:83`), `updateMany({ data: { title } })` (`:141-144`), `deleteMany` (`:128`). Nothing writes `form` or `plan` after creation, so `title` is the only mutable field (worker-reported grep; the three call sites verified in the file).
- The plan is stored by reference from the in-memory job without cloning or validation (`PlanJobStore.complete`, worker-reported `plan-job.store.ts:154-158`). `toPlanResult` always emits `note: string | null` and `imageKey: string | null` (nulls, never `undefined`), with the `imageKey` copied from the catalog at generation time (worker-reported `plan-pipeline.service.ts:188-212`). A stored plan is a snapshot: the catalog is not consulted on read.
- Fakes: `FakeSavedPlanTable` stores rows in an array, copies with `structuredClone`, implements the compound unique check and builds a P2002 error by hand without `meta`; the service spec uses canned `mockResolvedValue` returns (worker-reported). `structuredClone` keeps `undefined`, `Date` and key order that jsonb would drop or normalise (inferred).
- Behaviours no current test can reproduce: jsonb normalisation (key order, duplicate keys), the real P2002 mapping through the pg adapter, the foreign key and `ON DELETE CASCADE` to `Profile`, the client-side `@default(uuid())` for `id`, collation and ordering, and the `@db.Uuid` rejection of non-UUID ids (worker-reported; items marked inferred are domain knowledge, not run).
- Real-database feasibility, as observed: `prisma.config.ts` needs `DIRECT_URL`, the runtime adapter needs `DATABASE_URL` (Supabase poolers per the README), the generated client is gitignored and must be generated, and a `Profile` row must exist first because of the foreign key. There is no testcontainers dependency, no compose file, no `supabase/` directory and no Postgres service in CI (worker-reported).
- NUL path: model-written plan text has no NUL guard (verified `plan.schema.ts:10-20`; `grep` shows the only NUL refines in `plan-form.schema.ts:20` and `saved-plans.controller.ts:34`). The archived review recorded the form-goals NUL case as "from known Postgres behaviour; not reproduced against the database" (`archive/2026-10-27-save-and-view-plan/reviews/impl-review.md`, finding F2, worker-reported). The same would apply to plan text; the model emitting `\u0000` is unlikely, and this is an inferred risk, not an observed failure.
- `save` rethrows a non-P2002 error after a `Logger.warn` with the job id and error name only; with no exception filter the caller gets Nest's default 500 (worker-reported, default body inferred). The job stays in the in-memory store, so a retry meets the same data.

### 5. Frontend read path and render (Risk #3)

Verified directly: `PlanView.tsx:14-30`, `plan-stats.ts:12-22`, `saved-plans.ts:99-117`, `SavedPlanDetails.tsx:14,16`. The rest is worker-reported.

- Route: `/plans/:id` renders `SavedPlanPage`, which calls `fetchSavedPlan` and renders `PlanView` with `plan` and a `details` slot (`router.tsx:43`, `SavedPlanPage.tsx:58-85`, `:215-224`).
- Status handling on this path: 401 or 403 signs the user out, 404 shows "This saved plan could not be found.", any other failure, timeout (15 s) or missing `id` shows "Something went wrong, try again"; there is no retry button on this page.
- Unvalidated body (`as SavedPlan | null`, only `id` checked). Behaviour by missing field, from code reading, nothing executed:
  - Throws: missing `form` (`SavedPlanDetails.tsx:14` reads `form.experience`), missing `plan` or `plan.weeks` (`PlanView.tsx:115`), a week without `sessions` or a session without `exercises` (`plan-stats.ts:17-18` runs in `PlanSummary` before the week section).
  - Renders without throwing: missing `title` (handled with `?? null`), missing `note`, missing `imageKey` (no image), `weeks: []` (zero counts, no week section), unknown `experience` (shows "Experience: undefined"), invalid `createdAt` ("Invalid Date"), a week without its `week` number (falls back to the first week).
- No error boundary and no router `errorElement` exist in `frontend/src` (worker-reported grep). That a render throw would show react-router's default error screen is inferred from library behaviour.
- Images: rendered from the stored `imageKey` as `/${imageKey}` with `alt` "`<name>`, start and end position", `loading="lazy"`; `null` or a load error removes the image and keeps the text (`PlanView.tsx:14-30`, verified). The failed state is per image instance. Missing static files likely return the SPA fallback page with status 200 so the `error` event still fires (inferred from `wrangler.jsonc`, not tested).
- Failed save (`SavePlanControl`, `PlanGenerationPage.tsx:83-130`): `ok` navigates to the saved plan (the only success path); 404 shows the expiry message; 409, 5xx, network error, timeout and a 2xx without `id` show the generic message; the plan stays on screen and the button is re-enabled for retry; the backend is idempotent per `(ownerId, sourceJobId)`. Rename and delete update local state only after the server answers, on both the detail page and the list. No optimistic update was found in this area (worker-reported).
- Guard mismatch: `isPlanResult` (`plan-generation.ts:109-113`, used only at `plan-generation-watch.ts:46`) accepts empty `sessions` and `exercises` but rejects an exercise whose `note` or `imageKey` is missing, which `PlanView` tolerates.

### 6. Existing frontend tests for this area (Risk #3)

Worker-reported; `SavedPlanPage.spec.tsx:73` (`imageKey: null`) and `saved-plans.spec.ts:204` (`weeks: []`) verified.

- `SavedPlanPage.spec.tsx` mocks `fetchSavedPlan` and the router auth wrapper; its fixture has `imageKey: null` and one week; its only older-shape test is a missing `title` (`:340-348`). It has no malformed-`form` or malformed-`plan` case and no image case.
- `saved-plans.spec.ts` mocks `apiFetch` and builds real `Response` objects, so it is the seam where a raw JSON body can enter `fetchSavedPlan`; it covers status mapping, unreadable body and `{}` or `null` bodies but not a 200 body with an `id` and a malformed `plan` or `form`.
- `PlanView.spec.tsx` has a hand-written two-week plan with one image and one `null` image and asserts `src`, `alt`, lazy loading, removal on error and no carry-over between weeks. It has no missing-field or extra-field case.
- No spec renders `buildSamplePlan()` output through a component; the helper is used by `plan-generation.spec.ts` and the dev kitchen sink only. No spec feeds the real `fetchSavedPlan` parsing into `SavedPlanPage` and `PlanView`.
- Save control: covered at page and lib level, including 404, 409, error with the plan kept, retry and 401/403; not covered: a rejected `saveGeneratedPlan` promise through the page's `catch` (`PlanGenerationPage.tsx:111-112`).
- Cheap build facts: `*.spec.tsx` runs under jsdom; specs call `cleanup()` themselves; render helpers are local to each spec; `SavedPlanPage` needs `useAuth`, a router and `fetchSavedPlan`; `./api` imports `./supabase`, which `SavedPlanPage.spec` mocks. The dev kitchen sink shows saved-page `PlanView` variants (title, no title, edge length, no images, failing image) but not `SavedPlanPage` states or any older or malformed stored shape. No spec depends on jsdom actually loading images.

### 7. Requirements that define the oracle

Quotes are from `context/foundation/prd.md` (worker-reported with line anchors; not re-read in full by the parent).

- Guardrail 1 (`:37`): "A saved plan is never lost or corrupted — it reliably persists and reloads correctly."
- US-01 acceptance criteria (`:50-52`): exercises drawn only from the catalog "(each with an image)"; "The saved plan is retrievable from the account view after saving"; a pipeline failure shows an error, not a silently broken plan.
- FR-009 (`:80`) save to account; FR-010 (`:82-83`) view saved plans, "a dedicated account view for returning to the plan across sessions" (the only "later session" wording in the PRD); FR-011 (`:87`) exercises display an image.
- Access Control (`:106`): a Member "Can manage their own profile and training plans only"; non-goals (`:114`): plans are single-user-scoped only.
- Rename and delete are not in the PRD; "manage ... plans" is the only hook, and the plan-delete-and-rename research confirms no FR, US or roadmap slice (worker-reported).
- Roadmap S-05 outcome (`roadmap.md:145`): "save a reviewed plan ... and find it again under their account in a later session, intact".
- What the sources leave open (needed by a test): the response status for another user's plan (the PRD is silent; convention is 404); a precise definition of "reloads identically" (fixture deep-equal after a stored-then-read round trip, versus the PRD rules of 8 weeks, catalog-only exercises with images); any concrete older shape; whether a malformed stored plan should show an error or a blank; what happens to stored plans if a catalog row or image file is later removed (the seed README says deleting a catalog row leaves a stale row and image deletion is manual).

## Verdict on the response guidance

| Test-plan statement | Verdict |
|---|---|
| #4 B cannot read, stream, save, rename or delete A's job or plan | Holds on the inspected path for all eight routes. Tests prove the 404 for B on each; they do not all prove A's data survived. |
| #4 "the answer matches a nonexistent id" | Holds for a well-formed unknown id. For a malformed id on `/saved-plans/:id` the status matches and the body differs; the plan must define "nonexistent id" as a well-formed unknown UUID. |
| #4 challenge: a scoped list implies a scoped get | False in this code; each query carries its own `ownerId`. The test should still assert it per endpoint. |
| #4 challenge: an unguessable id is a control | Not relied on; access is the owner comparison. A foreign id that exists is the test input. |
| #4 challenge: owning the job implies owning the save | False; `save` re-checks the job owner and keys the existing-row lookup on the caller. The case "A saved J, then B posts J" has no test. |
| #4 layer: integration, two-user matrix | Confirmed as the cheapest layer, using the existing e2e with `FakeSavedPlanTable`, which filters on `ownerId` and so has signal for scoping. |
| #3 reloads identically, images included | Not proven by any test. The images half depends on stored `imageKey` plus deployed static files; the "identical" half is untested against jsonb and is only compared with a `structuredClone` in the e2e. |
| #3 challenge: "save returned success" means intact | True here: the 201 comes from a summary-only select and never reads `plan` back. |
| #3 challenge: a round trip built with the same builder proves anything | True here: backend fixtures are one shared literal compared with a clone of itself. |
| #3 older stored shape still renders | No older shape exists in git history. A missing `title` is the only tested case. The renderer tolerates a missing `note` and `imageKey` and throws on a missing `form`, `plan`, `weeks`, `sessions` or `exercises`. |
| #3 a failed save is surfaced, not confirmed | Holds on every traced result kind; one untested branch (rejected promise through the page catch). |
| #3 layer: integration round trip plus frontend stored-shape render; e2e only if nothing cheaper | The frontend half is cheap and unbuilt. A real-database round trip needs infrastructure that does not exist; a fake round trip gives no signal on jsonb. A browser e2e is not needed for the render half. |

## Code References

- `backend/src/saved-plans/saved-plans.controller.ts:43-88` - routes, `ParseUUIDPipe` with 404, all handlers pass `user.id`
- `backend/src/saved-plans/saved-plans.service.ts:68-106` - save: existing-row lookup, job lookup, create, P2002 race handling
- `backend/src/saved-plans/saved-plans.service.ts:36-41`, `:83-92` - summary-only select; plan is not read back after create
- `backend/src/saved-plans/saved-plans.service.ts:117-156` - owner-scoped get, delete, rename
- `backend/src/plan-generation/plan-job.store.ts:83-87` - `get` keyed on owner
- `backend/src/plan-generation/plan-generation.controller.ts:144-146`, `:207-209` - owner-scoped 404 on stream and snapshot
- `backend/src/plan-generation/plan.schema.ts:10-20` - plan text fields are plain strings; no NUL guard
- `backend/src/plan-generation/plan-form.schema.ts:20`, `backend/src/saved-plans/saved-plans.controller.ts:34` - the only NUL refines
- `backend/prisma/schema.prisma:41-53` - `SavedPlan` model; `migrations/20261027193305_create_saved_plan/migration.sql:6-7` - jsonb columns
- `backend/test/saved-plans.e2e-spec.ts:65-207` - `FakeSavedPlanTable`; `:353-363`, `:503-527`, `:590-605`, `:671-686` - ownership tests
- `backend/test/plan-generation.e2e-spec.ts:199-211`, `:368-385` - foreign job and stream tests
- `backend/vitest.config.ts:11`, `backend/vitest.config.e2e.ts:9` - which config collects which specs
- `frontend/src/lib/saved-plans.ts:99-117` - `fetchSavedPlan`, id-only check
- `frontend/src/lib/plan-generation.ts:109-113` - `isPlanResult` (watch layer only)
- `frontend/src/components/PlanView.tsx:14-30` - `ExerciseImage`
- `frontend/src/lib/plan-stats.ts:12-22` - unguarded `week.sessions` and `session.exercises` access
- `frontend/src/components/SavedPlanDetails.tsx:14,16` - unguarded `form.experience`, `form.goals`
- `frontend/src/pages/SavedPlanPage.tsx:58-85`, `:215-224` - read path and render
- `frontend/src/pages/PlanGenerationPage.tsx:83-130` - Save control and result mapping
- `frontend/src/pages/SavedPlanPage.spec.tsx:73`, `frontend/src/lib/saved-plans.spec.ts:204`, `frontend/src/components/PlanView.spec.tsx` - existing fixtures

## Architecture Insights

- Ownership has one rule, applied twice: the in-memory job store compares `ownerId`, and every Prisma query for saved plans includes `ownerId` in its `where`. There is no database-level enforcement (RLS on, no policies, backend role bypasses).
- A saved plan is a snapshot of the generation result as JSON, plus a separate nullable `title` column added so the JSON stays untouched (per `lessons.md`). The persisted shape has no version and no read validation; the lesson accepts that and relies on additive-only change.
- Images are a static-asset concern of the frontend deployment; the database stores only a relative key.
- The renderer is more tolerant than the Phase 1 guard on optional fields and less tolerant on structural arrays; the two were written for different jobs (generation-time acceptance versus render).
- The e2e persistence fake is faithful enough for ownership scoping and not for serialization or constraint behaviour; its value depends on which rule a test targets.

## Historical Context (from prior changes)

Worker-reported unless marked.

- `context/archive/2026-10-27-save-and-view-plan/plan.md` - save by job id, one row per `(ownerId, sourceJobId)`, owner-scoped 404 for foreign, missing and malformed ids, idempotent save before the job lookup; manual rows 2.5, 2.6, 4.4, 4.5, 4.6 ticked (deep-equal after save, second account gets 404 and an empty list, plan with images after reload, sign out and back in).
- `context/archive/2026-10-27-save-and-view-plan/reviews/impl-review.md` - F4 accepted as a rule (unchecked cast, no version, no code change; "No runtime guard on read was designed or costed"); F2 fixed (NUL in `goals`, not reproduced against a database).
- `context/changes/plan-delete-and-rename/` - merged in PR #18 yet its `change.md` still reads `status: implementing` and 15 Progress rows are unticked, including 1.8 (PATCH and DELETE against the running API, another user's plan answers 404) and 1.9 (CORS preflight for PATCH and DELETE); verified directly for the status and rows 1.8 and 1.9. Ownership of PATCH and DELETE has therefore been tested only against the fake.
- `context/changes/plan-view-design/reviews/impl-review.md` - F4: a malformed or legacy stored row "shows wrong content without an error", accepted; "Older saved rows from before the validator were not inspected."
- `context/changes/testing-generation-outcome-integrity/plan.md:39` - the guard on the saved-plan read path was deferred to this phase (verified in this session's earlier read).
- `context/archive/2026-10-14-first-plan-generation/plan.md:307` - two Fly machines split the in-memory jobs and produced a 404 for a running job; kept at one machine.
- The quoted user question behind Risk #4 ("can another user open plans that were not saved?") is recorded only in `test-plan.md`; no change or archive file contains it, and its likely meaning is unsaved generation jobs, protected by the owner-scoped job store (worker-reported).
- No post-release bug-fix commit for saved plans or images exists in `git log` for those paths; all "fix(...)" commits there are implementation-review fixes (worker-reported).

## Related Research

- `context/changes/testing-generation-outcome-integrity/research.md` - Phase 1 research; its Sections 5 to 9 cover the job store, the frontend watch layer and the test infrastructure that this phase reuses.

## Open Questions

For `/10x-plan` to settle with the user; none blocks the research.

1. **Real database or not for Risk #3.** A real-Postgres round trip would be the only test of jsonb behaviour, the foreign key and cascade, the real P2002 and the `@db.Uuid` constraint. It needs a database that tests can reach (no compose file, no CI service, Docker usability unknown on this machine, a Supabase-hosted database as the only existing target). Options: build a local harness, accept a hermetic-only phase and record the gap, or run a one-off manual round trip against the hosted database. This is a cost decision.
2. **The shape guard on the saved-plan read path.** Should `fetchSavedPlan` validate, and with which guard? Reusing `isPlanResult` unchanged would reject plans the renderer handles. Options include a looser read guard (structural arrays only), a guard that rejects only what throws, no guard plus tests of the current behaviour, or an error boundary. Phase 1 explicitly deferred this here; it is a safeguard, not a test.
3. **Which "older stored shape" fixture is legitimate.** None exists in history. Candidates: an exercise without `imageKey` or `note`, a row without `title`, a plan with extra unknown fields, an unknown `experience` value. The PRD and `lessons.md` do not name one.
4. **What counts as "a nonexistent id" for Risk #4.** The malformed-id body difference on `/saved-plans/:id` is a format check that reveals nothing about existence. Pin the oracle to well-formed unknown UUIDs and accept the difference, or change the controller (a production change that this testing change has not been asked for).
5. **NUL in model-written plan text.** An inferred save failure (default 500, retry hits the same data). Whether to pin it with a hermetic test, guard it in the validator, or leave it out depends on how likely the model is to emit it; this was not measured.
6. **Closing the manual gap in plan-delete-and-rename.** Rows 1.8 and 1.9 (ownership against the running API with two accounts, CORS preflight) are unticked on a merged change. A two-account manual smoke here would also verify Risk #4 on a real database; whether to do it here or leave that change's status untouched is the user's call.
7. **Blocked users on these routes** belong to Risk #6 (Phase 3) and are excluded here.
8. **A shared two-user test helper.** `HeaderUserGuard` is defined three times; Phase 1 decided against shared helpers outside the existing spec. Decide again for the ownership matrix, which spans two spec files.

## Corrections to the test plan (for the backport check)

Findings that change §2, §3 or §4 of `context/foundation/test-plan.md`; none adds a code anchor.

1. **Risk #3 response guidance, layer**: "integration round trip" should read "frontend render of an independently written raw stored body through the real fetch, plus a backend ownership and persistence test against the existing fake; a real-database round trip is a separate cost decision". A round trip through the fake compares a literal with a clone of itself and has no signal on jsonb.
2. **Risk #4 response guidance, wording**: replace "the answer matches a nonexistent id" with "the answer matches a well-formed unknown id (a malformed id gets the same status with a different body)".
3. **Risk #4 source column**: the quoted user question is not recorded in any change or archive file; keep it as user-stated evidence or replace it with a recorded citation.
4. **§4 Stack, "persistence in e2e specs uses in-test fakes; whether that is enough is Phase 2 research"**: answered. The fake is enough for ownership scoping and not enough for serialization, constraints or cascade. `npm run test` does not run e2e specs and no CI step runs either (this feeds §3 Phase 5).
5. **§4 Browser e2e "none yet ... not planned unless Phase 2 research shows no cheaper layer covers risk #3"**: a cheaper layer covers the render half; the research found no case for a browser e2e.
6. **§3 Phase 2 test types**: "frontend stored-shape render" should name the seam (raw JSON through the real `fetchSavedPlan` into `SavedPlanPage` and `PlanView`); "integration round trip" should be marked as depending on Open Question 1.
7. **Cross-reference**: Risk #6 owns blocked-user behaviour on these routes; Risk #1 section already owns restart and job-loss behaviour.

## Verification note

Re-read directly in the main session: `saved-plans.controller.ts` (all), `saved-plans.service.ts` (all), `schema.prisma` (all), `plan-job.store.ts:83-87`, `plan-generation.controller.ts` route greps and `:202-210`, `saved-plans.e2e-spec.ts:353-363`, `:503-527`, `:590-596`, `:671-677`, `vitest.config.ts` and `vitest.config.e2e.ts` includes, `plan.schema.ts:1-31`, NUL greps in non-spec `src`, the migration's `JSONB` lines, `PlanView.tsx:14-30`, `plan-stats.ts:12-22`, `saved-plans.ts:95-134`, `SavedPlanDetails.tsx:14,16`, `plan-delete-and-rename/change.md` and its rows 1.8 and 1.9. One worker line anchor was wrong and was replaced: `SavedPlanDetails.tsx` dereferences `form.experience` at line 14, not 106. Items marked "worker-reported" were not re-read and keep the worker's anchors. The jsonb behaviours, the 500 body, the react-router default error screen and the SPA-fallback status for a missing image are inferred from library or platform behaviour and were not run. Nothing was executed.
