---
project: "Gym Training Plan Generator"
version: 1
status: draft
created: 2026-09-17
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
---

## Vision & Problem Statement

An experienced lifter who trains at the gym 5 times per week currently plans their own training by self-programming from personal experience. There is no tool that builds a plan tailored to the intersection of their actual experience level, weekly frequency, body stats, and specific goals — they either keep self-programming, or would have to fall back on generic templates that ignore those specifics, or hire a coach.

The insight: a single generic template or app asks for too little about the individual to produce a truly personalized plan. The value here is a small set of AI models collaborating to draft and review a plan against the person's specifics — closer to how a coach would reason about a program — rather than a static one-size-fits-all output.

## User & Persona

The primary persona is the participant themself: a full-stack developer who trains at the gym 5 times per week and currently self-programs their training from experience. They reach for this product to get an 8-week training plan that is actually tailored to their stated experience, frequency, body stats, and goals, instead of continuing to self-program without a systematic tool. Built for themselves first, with an explicit intent to scale to other gym-goers later.

## Success Criteria

### Primary
- A logged-in user completes the full flow end-to-end: fills the plan-generation form, watches live progress as the AI pipeline runs, reviews the generated 8-week plan, saves it, and sees it under their account.

### Secondary
- The user can edit or regenerate part of the saved/generated plan (not only accept it as a fixed whole).

### Guardrails
- A saved plan is never lost or corrupted — it reliably persists and reloads correctly.
- If an AI model call fails or returns something unusable, the user is told — the app never silently presents a broken/garbage plan as if it succeeded.
- A blocked user truly loses access — no bypass path to sign in or use the app.

## User Stories

### US-01: User generates and saves a personalized training plan

- **Given** a logged-in user who fills out the plan-generation form (experience, frequency, height/weight, goals)
- **When** they submit the form
- **Then** they see live progress as the AI pipeline generates an 8-week plan, can review it, and save it to their account

#### Acceptance Criteria
- Plan exercises are drawn only from the curated exercise catalog (each with an image)
- The saved plan is retrievable from the account view after saving
- If any step of the AI pipeline fails or returns something unusable, the user sees an error rather than a silently broken plan

## Functional Requirements

### Authentication & Admin

- FR-001: User can sign up / log in. Priority: must-have
  > Socrates: Counter-argument considered: "overkill for a solo v1 — one hardcoded account instead." Resolution: kept; full signup supports the stated goal of scaling to other users later.
- FR-002: Admin can view a list of registered users. Priority: must-have
  > Socrates: Counter-argument considered: "no one to list yet with a single user." Resolution: kept; ready for when others join, low cost to build alongside FR-003.
- FR-003: Admin can block a user's access. Priority: must-have
  > Socrates: Counter-argument considered: "speculative before any abuse actually occurs; a global rate-limit/kill-switch might suffice." Resolution: kept; cheap to build alongside FR-002 and directly addresses the prompt-injection/abuse concern.

### Plan Generation

- FR-004: User can fill out a plan-generation form (experience level, current/desired weekly frequency, height/weight, goals). Priority: must-have
  > Socrates: Counter-argument considered: "too many fields could hurt completion; trim for v1." Resolution: kept full field set; personalization depth is the core value proposition.
- FR-005: User can submit the form to trigger AI plan generation. Priority: must-have
  > Socrates: Counter-argument considered: "could merge with FR-004 into one action." Resolution: kept as a distinct, explicit action for clarity and testability.
- FR-006: User sees live progress updates while the AI pipeline generates the plan. Priority: must-have
  > Socrates: Counter-argument considered: "streaming per-stage progress is extra plumbing; a simple spinner could satisfy the guardrail without it." Resolution: kept; participant specifically wants stage-by-stage visibility since generation takes a while.

### Plan Review & Management

- FR-007: User can review the generated 8-week plan before saving. Priority: must-have
  > Socrates: Counter-argument considered: "could auto-save immediately and let user edit after." Resolution: kept explicit review-before-save step.
- FR-008: User can edit or regenerate part of the plan. Priority: nice-to-have
  > Socrates: Counter-argument considered: "cut entirely from v1 — wouldn't weaken the MVP." Resolution: kept as nice-to-have, attempted if time allows.
- FR-009: User can save the plan to their account. Priority: must-have
  > Socrates: Counter-argument considered: "could auto-persist without an explicit save action." Resolution: kept explicit save, pairs with the review step (FR-007).
- FR-010: User can view their saved plan(s) under their account. Priority: must-have
  > Socrates: Counter-argument considered: "could merge with FR-009 by redirecting straight to the plan after saving." Resolution: kept a dedicated account view for returning to the plan across sessions.

### Exercise Catalog

- FR-011: Generated plan exercises display an accompanying image from the curated exercise catalog. Priority: must-have
  > Socrates: Counter-argument considered: "images are polish; could be a fast-follow rather than v1." Resolution: kept; this is what motivated the constrained-exercise-catalog decision reached before shaping.

## Non-Functional Requirements

- The user sees continuous, updating progress for the entire duration of plan generation — no dead air, and no fixed maximum wait time is imposed on the multi-stage AI pipeline.
- Form data (experience, frequency, body stats, goals) is treated as ordinary account data, with no additional retention or anonymization commitment beyond that baseline for v1.

## Business Logic

The app generates an 8-week training plan by weighing the user's experience level, weekly frequency, body stats, and goals, choosing only from a fixed set of vetted exercises, and refining the draft through a second AI pass before presenting it.

The rule consumes the user's form inputs: experience level, current and desired weekly training frequency, height/weight, and stated goals. Its output is a structured 8-week plan broken into weekly/daily sessions, built exclusively from a fixed, vetted exercise catalog rather than an open-ended set. The user encounters this rule after submitting the form: they watch the plan being drafted and then refined in a second pass, review the result, and can save it to their account.

## Access Control

Login required (email + password or OAuth — mechanism decided downstream). Two roles:

- **Admin** — the participant, initially the only admin. Can view the list of registered users and block a user's access (e.g. a user found abusing the AI pipeline, such as prompt injection attempts).
- **Member** — the standard role for any other user who joins later. Can manage their own profile and training plans only.

An unauthenticated user hitting a gated route is redirected to sign-in. A blocked member cannot sign in or use the app.

## Non-Goals

- **Fetching exercise videos/images from the internet** — replaced by a fixed, self-curated exercise catalog (~50-150 exercises) to avoid open-ended integration/licensing risk; may be revisited later.
- **Progress/adherence tracking** (marking workouts done, logging weights over time) — a possible future improvement, not part of v1.
- **Team/coach features** (a coach managing multiple clients' plans) — plans are single-user-scoped only; no multi-person coaching workflows in v1.

## Open Questions

No open questions were carried forward from shaping — the `/10x-shape` closing cross-check (`quality_check_status: accepted`) surfaced no gaps, and every schema-required section had matching content in the input.
