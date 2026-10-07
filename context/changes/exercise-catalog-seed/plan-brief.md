# Seed a Minimal Curated Exercise Catalog with Images — Plan Brief

> Full plan: `context/changes/exercise-catalog-seed/plan.md`

## What & Why

Roadmap item F-01 (GitHub issue #1): give the project its first data model — an `Exercise` table seeded with ~30 curated exercises, each with one image — plus a small query service. S-02 needs a fixed exercise set to constrain the AI pipeline, and the PRD's "plan exercises come only from the catalog" rule cannot be verified without one; S-04 needs the images to display. It deliberately stops short of the full 50–150 catalog.

## Starting Point

Prisma 7 is wired to the hosted Supabase Postgres, but the schema has no models and there are no migrations. A push to `main` touching `backend/**` already runs `prisma migrate deploy` against the live DB; there is a single database (no dev/test one). The frontend is Cloudflare Workers static assets with only a favicon in `public/`.

## Desired End State

An `Exercise` table in Supabase holds 32 curated rows; 32 JPEGs live in `frontend/public/exercises/` and are served by the existing Worker; any module importing `ExercisesModule` can call `findAll()`. Re-running the seed is safe, and a spec guarantees every row has a real image.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Seed size | ~30 (32 proposed), 3–5 per major muscle group | A thin menu would distort S-02's plan-quality verdict; ~15 is too few for a 5-day split |
| Image source | One-time import from Free Exercise DB (Unlicense) | No authoring cost; license confirmed via the GitHub API; not runtime fetching |
| Selection method | Explicit hand-picked id list | The dataset's `category` is unreliable (Hip Thrust is tagged `powerlifting`) |
| Image hosting | Frontend static assets; DB stores a host-agnostic `imageKey` | Free, no new infra; R2 was weighed (`r2.dev` is dev-only, production needs a custom domain or Worker plus an account gate) and stays a later base-URL swap |
| Seeding | Idempotent script (`tsx`, `migrations.seed`), run deliberately | Catalog edits become re-runs; Prisma 7 never auto-seeds; deploys keep touching schema only; stale rows are warned about, never pruned |
| Attributes | slug, name, primaryMuscles, equipment, level, category, imageKey | What the generator needs to match experience level and balance muscle groups |
| Identity / images | `slug` is the primary key; one image per exercise (`0.jpg`) | Stable references for S-02 and S-05; PRD says "an accompanying image" |
| Migration authoring | `prisma migrate diff` + `migrate deploy`; forward-only, no rollback scripts | Needs no shadow DB on Supabase; to undo or remove anything later, add a new migration |
| Data API exposure | RLS enabled with no policies, appended to the migration | Supabase exposes `public` tables by default and the publishable key ships in the frontend, so the catalog would otherwise be world-writable |
| Verification DB | The existing Supabase DB; mocked-Prisma unit tests | Nothing live depends on it yet and the table is additive |
| Query surface | In-process service with `findAll()` only, no HTTP endpoint | S-02/S-04 add the lookups and the endpoint they actually need |

## Scope

**In scope:** `Exercise` model + enum + first migration (RLS enabled); curated `exercises.json` and 32 images; idempotent seed script and runbook; `ExercisesModule`/`ExercisesService` with unit tests; seed-data spec.

**Out of scope:** HTTP endpoint; full 50–150 catalog; secondary muscles/instructions; R2 or Supabase Storage; seeding in CI or at boot; pruning removed exercises; a dev/test DB or DB-backed tests; validating generated plans against the catalog (S-02); any frontend code.

## Architecture / Approach

Metadata lives in `backend/prisma/seed-data/exercises.json`, images in `frontend/public/exercises/<slug>.jpg`, linked by `imageKey = exercises/<slug>.jpg`. A `tsx` seed script upserts by slug in one transaction, after checking every image file exists. `ExercisesService` reads the table through the existing `PrismaService`. Migration and seed are the only production-touching steps and are isolated in phases 1 and 3.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model + migration | `Exercise` table in Supabase, regenerated client | Applying to the shared DB is a production change; forward-only, so undoing means a new migration |
| 2. Curated data + images | `exercises.json`, 32 JPEGs, provenance README, seed-data spec | Picking the final exercise list; image/name mismatches |
| 3. Seed script + runbook | Idempotent `npm run prisma:seed`, run twice against the DB | Seed is manual — easy to forget; a bad run writes to the shared DB |
| 4. Query service | `ExercisesModule`/`Service` + unit tests, wired into `AppModule` | DI wiring (non-global `PrismaModule`) |

**Prerequisites:** none from the roadmap (F-01 is unblocked); locally a working `backend/.env` (`DIRECT_URL`, `DATABASE_URL`), network access to GitHub for the one-time import, and the Supabase project un-paused.
**Estimated effort:** roughly 2 working sessions across 4 small phases (rough, not a commitment).

## Open Risks & Assumptions

- Dev and prod share one DB, so the migration and seed are production changes; both are additive and idempotent, and migrations are forward-only (no rollback scripts).
- The Free Exercise DB license (Unlicense) was confirmed from GitHub's license API; the exercise list is a proposal and can change in Phase 2 review.
- `tsx` is a new devDependency; `prisma/seed.ts` is typechecked by `tsc --noEmit` but not linted (lint scope is `src/` and `test/`).
- Seeding never runs automatically — if it is skipped, the table stays empty and S-02 has nothing to constrain against.
- With RLS on, the backend must connect as the table-owning (or `BYPASSRLS`) role; the plan assumes `DATABASE_URL` and `DIRECT_URL` use the same Supabase role, which the first consumer would reveal.

## Success Criteria (Summary)

- The `Exercise` table holds 32 curated rows, each pointing at a real JPEG that the deployed Worker serves.
- `findAll()` gives S-02 the full catalog to constrain the AI and to verify "only from the catalog" against.
- Re-running the seed changes nothing, and `npm test`, `npm run lint` and `npm run build` pass in `backend/`.
