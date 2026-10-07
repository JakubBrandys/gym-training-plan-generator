---
project: Gym Training Plan Generator
version: 1
status: draft
created: 2026-10-03
updated: 2026-10-07
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: end-to-end-plan-generation
milestone_seq: 1
milestone_status: open
---

# Roadmap: Gym Training Plan Generator

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> Sequencing bias: `speed` (build only the PRD's must-have requirements first and park the rest), with `learn` as the tie-breaker — when two slices are otherwise equal, the one touching less familiar tech goes first.

## Milestone

**M-1: End-to-end plan generation** — Status: open

- **Intent:** A signed-in user can complete the full flow — fill the form, watch the AI pipeline run, review the 8-week plan, save it and find it again under their account — and an admin can see and block users. Outcome-scoped, no dates.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-007, FR-009 – FR-011, US-01. FR-008 (edit or regenerate part of the plan, nice-to-have) is parked.

## Vision recap

An experienced lifter who trains five times a week currently self-programs, and no tool builds a plan tailored to their real experience, frequency, body stats and goals. The product has several AI models collaborate — draft, then review — closer to how a coach reasons than a static template does. The primary user is the builder themself, with intent to open it to other gym-goers later.

## North star

**S-02: User can submit the plan form and receive an AI-generated 8-week plan built only from the curated exercise catalog** — it exercises the riskiest assumption (the assumption most likely to be wrong and most costly if it is: that a multi-model draft-and-refine pipeline produces a believable, personalized plan), and it touches the least familiar tech, which is what `speed` + `learn` asks to hit first.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the product works — placed as early as its prerequisites allow, because everything else only matters if this works. `S-03` (live progress) follows immediately and completes the flow the PRD describes.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                  | Prerequisites | PRD refs                      | Status   |
| ---- | ------------------------ | ------------------------------------------------------------------------------------- | ------------- | ----------------------------- | -------- |
| F-01 | exercise-catalog-seed    | (foundation) a minimal curated exercise catalog with images exists and can be queried | —             | FR-011, US-01                 | done     |
| S-01 | sign-up-and-login        | sign up, log in, and be redirected to sign-in when hitting a gated route              | —             | FR-001, US-01                 | ready    |
| S-02 | first-plan-generation    | submit the plan form and receive an AI-generated 8-week plan from the catalog         | S-01, F-01    | FR-004, FR-005, US-01         | proposed |
| S-03 | live-generation-progress | see stage-by-stage live progress while the AI pipeline runs                           | S-02          | FR-006, US-01                 | proposed |
| S-04 | plan-review-with-images  | review the full 8-week plan with exercise images before deciding to save              | S-02, F-01    | FR-007, FR-011, US-01         | proposed |
| S-05 | save-and-view-plan       | save a reviewed plan and find it under their account later                            | S-04          | FR-009, FR-010, US-01         | proposed |
| S-06 | admin-user-list          | (as admin) view the list of registered users                                          | S-01          | FR-002                        | proposed |
| S-07 | admin-block-user         | (as admin) block a user so they truly lose access                                     | S-06          | FR-003                        | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme           | Chain                                          | Note                                                                                                                  |
| ------ | --------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A      | Generation loop | `F-01` → `S-02` → `S-03` → `S-04` → `S-05`    | The `speed` + `learn` critical path; joins Stream B at `S-01`. `S-03` and `S-04` are parallel after `S-02`.            |
| B      | Access control  | `S-01` → `S-06` → `S-07`                       | Sign-in gates Stream A; the admin chain runs in parallel with it once `S-01` lands.                                   |

## Baseline

What's already in place in the codebase as of `2026-10-03` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — React + Vite scaffold, still the default template (`frontend/src/App.tsx`); no routing, no auth client, no API client.
- **Backend / API:** partial — NestJS with `GET /` and `GET /health` (`backend/src/health/health.controller.ts`); no streaming gateway.
- **Data:** partial — ORM wired to the hosted Postgres (`backend/src/prisma/`); schema has no models, no migrations, no catalog data.
- **Auth:** absent — provider chosen per `tech-stack.md` (Supabase Auth), but no token verification, guards or roles in code.
- **Deploy / infra:** present — backend live on Fly.io, frontend live on Cloudflare Workers; deploy workflows and config in place (user-confirmed: first deploy has run).
- **Observability:** absent — framework default logger only.
- **AI pipeline:** absent — no LLM dependency or code.

## Foundations

### F-01: Minimal exercise catalog

- **Outcome:** (foundation) a small curated set of exercises, each with an image, exists in the data store and can be queried by the plan generator; it is not the full catalog.
- **Change ID:** exercise-catalog-seed
- **PRD refs:** FR-011, US-01 (acceptance criterion: plan exercises come only from the catalog)
- **Unlocks:** `S-02` (the pipeline needs a fixed exercise set to constrain output, and "only from the catalog" cannot be verified without one) and `S-04` (images to display).
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Where do the exercise images come from (self-made, licensed, generated)? — Owner: user. Block: no (the seed can start with a few exercises and grow).
- **Risk:** Sequenced first because the north star cannot be verified against a fixed exercise set without it; kept to a minimal seed so it does not become a full catalog-curation project ahead of the slice that consumes it.
- **Status:** done

## Slices

### S-01: Sign up and log in

- **Outcome:** user can sign up, log in, and is redirected to sign-in when hitting a gated route; the backend rejects unauthenticated requests to gated endpoints.
- **Change ID:** sign-up-and-login
- **PRD refs:** FR-001, US-01
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth is absent in the baseline and gates everything user-facing, so it goes first; the admin/member role split is deferred to `S-06`, the first slice that needs it.
- **Status:** ready

### S-02: First plan generation (north star)

- **Outcome:** user can submit the plan form (experience, current/desired frequency, height/weight, goals) and receive an AI-generated 8-week plan, drafted then refined in a second pass, using only catalog exercises; if any pipeline step fails or returns something unusable, the user sees an error.
- **Change ID:** first-plan-generation
- **PRD refs:** FR-004, FR-005, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Which AI provider and models run the draft and review passes? — Owner: user. Block: no (decidable during `/10x-plan`, but it must be settled before implementation).
- **Risk:** Carries the riskiest assumption — plan quality from the two-pass pipeline — so it is placed as early as its prerequisites allow.
- **Status:** proposed

### S-03: Live generation progress

- **Outcome:** user can see continuous, stage-by-stage progress updates for the whole time the AI pipeline runs, with no dead air and no fixed maximum wait.
- **Change ID:** live-generation-progress
- **PRD refs:** FR-006, US-01
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The streaming transport is the other unfamiliar piece; it is split from `S-02` so a pipeline problem and a streaming problem can be diagnosed separately, and the live-connection hosting was already chosen with this in mind.
- **Status:** proposed

### S-04: Review the plan with images

- **Outcome:** user can review the complete 8-week plan, with an image for each exercise, before deciding whether to save it.
- **Change ID:** plan-review-with-images
- **PRD refs:** FR-007, FR-011, US-01
- **Prerequisites:** S-02, F-01
- **Parallel with:** S-03, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on the catalog images from `F-01` being usable in the UI; independent of live progress, so it can proceed in parallel with `S-03`.
- **Status:** proposed

### S-05: Save and view the plan

- **Outcome:** user can save a reviewed plan to their account and find it again under their account in a later session, intact.
- **Change ID:** save-and-view-plan
- **PRD refs:** FR-009, FR-010, US-01
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Carries the "a saved plan is never lost or corrupted" guardrail; it is the first slice that needs a persisted plan shape, so that shape is introduced here rather than ahead of time.
- **Status:** proposed

### S-06: Admin user list

- **Outcome:** user (as admin) can view the list of registered users; a member cannot reach it.
- **Change ID:** admin-user-list
- **PRD refs:** FR-002
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - How is the admin role assigned to the first admin (the participant)? — Owner: user. Block: no.
- **Risk:** First slice needing the admin/member distinction; independent of the generation loop, so it can fill gaps while that stream waits.
- **Status:** proposed

### S-07: Admin block user

- **Outcome:** user (as admin) can block a user, and a blocked user can no longer sign in or use the app, with no bypass path.
- **Change ID:** admin-block-user
- **PRD refs:** FR-003
- **Prerequisites:** S-06
- **Parallel with:** S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The guardrail "a blocked user truly loses access" means enforcement must hold for already-issued sessions, not just new sign-ins; that is the one thing to plan carefully.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                   | Ready for `/10x-plan` | Notes                                  |
| ---------- | ------------------------ | ------------------------------------------------------- | --------------------- | -------------------------------------- |
| F-01       | exercise-catalog-seed    | Seed a minimal curated exercise catalog with images     | yes                   | Run `/10x-plan exercise-catalog-seed`  |
| S-01       | sign-up-and-login        | Sign up, log in and gate routes                         | yes                   | Run `/10x-plan sign-up-and-login`      |
| S-02       | first-plan-generation    | Generate an 8-week plan from the form via AI pipeline   | no                    | Needs S-01, F-01; settle AI provider   |
| S-03       | live-generation-progress | Show live stage-by-stage generation progress            | no                    | Needs S-02                             |
| S-04       | plan-review-with-images  | Review the generated plan with exercise images          | no                    | Needs S-02, F-01                       |
| S-05       | save-and-view-plan       | Save a plan and view it under the account               | no                    | Needs S-04                             |
| S-06       | admin-user-list          | Admin: list registered users                            | no                    | Needs S-01                             |
| S-07       | admin-block-user         | Admin: block a user and enforce it                      | no                    | Needs S-06                             |

## Open Roadmap Questions

1. **Which AI provider and models run the draft and review passes?** — Owner: user. Block: S-02.
2. **Where do the exercise images come from (self-made, licensed, generated), and how large must the catalog be before this milestone closes (minimal seed vs the PRD's ~50–150)?** — Owner: user. Block: F-01 scope, S-04.
3. **How is the first admin designated?** — Owner: user. Block: S-06.

(The PRD carried no open questions forward.)

## Parked

- **FR-008: edit or regenerate part of the plan** — Why parked: PRD marks it nice-to-have ("attempted if time allows"); with `speed` as the sequencing goal and `time` as the top blocker, it is revisited only after every must-have slice is done.
- **Fetching exercise videos/images from the internet** — Why parked: PRD §Non-Goals; replaced by the self-curated catalog.
- **Progress / adherence tracking** — Why parked: PRD §Non-Goals; possible future improvement.
- **Team / coach features** — Why parked: PRD §Non-Goals; plans are single-user-scoped in v1.

## Milestone History

(Append-only. Empty on the first milestone.)

## Done

(Empty on first generation. `/10x-archive` appends entries here.)

- **F-01: (foundation) a small curated set of exercises, each with an image, exists in the data store and can be queried by the plan generator; it is not the full catalog.** — Archived 2026-10-07 → `context/archive/2026-10-04-exercise-catalog-seed/`. Lesson: —.
