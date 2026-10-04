# Seed a Minimal Curated Exercise Catalog with Images — Implementation Plan

## Overview

Roadmap item F-01 (foundation, Stream A, milestone M-1; GitHub issue #1). Introduce the project's first data model — an `Exercise` table — seed it with ~30 curated exercises, each with exactly one image, and expose an in-process query service the AI plan generator (S-02) and the review UI (S-04) will consume. This is the fixed exercise set that makes "plan exercises come only from the catalog" (PRD US-01 acceptance criterion) verifiable.

The catalog is a one-time curated import from the public-domain Free Exercise DB (Unlicense), committed into the repo: images as static assets in the frontend, metadata as seed data in the backend. Nothing is fetched from the internet at runtime.

## Current State Analysis

- The database layer is wired but empty: Prisma 7 with the `@prisma/adapter-pg` driver adapter, a non-global `PrismaModule`, and a schema with a generator and datasource only — no models, no `prisma/migrations/` directory.
- Every push to `main` touching `backend/**` runs `prisma migrate deploy` against the live Supabase database before deploying. There is a single Supabase project (no dev/test database), so anything applied locally and anything applied by CI hit the same database.
- The backend has two spec patterns (a Nest `Test.createTestingModule` unit spec and an e2e config) but no DB-backed tests and no test database.
- The frontend is a Vite SPA deployed as Cloudflare Workers static assets; `frontend/public/` holds only a favicon and an icon sprite.
- There is no exercise data, no image, and no code that reads a catalog.

## Desired End State

After this plan: the `Exercise` table exists in Supabase and holds ~33 curated rows; 33 JPEG images are committed under `frontend/public/exercises/` and will be served by the Cloudflare Worker; `ExercisesService` (`findAll`) can be injected by any module that imports `ExercisesModule`; re-running the seed is safe; and a spec guarantees every catalog row has a real image file.

Verify: `npm test` (seed-data + service specs), `npm run lint`, `npm run build` pass in `backend/`; `select count(*) from "Exercise"` returns 33; the app boots with `ExercisesModule` wired; after the frontend deploys, `/exercises/<slug>.jpg` returns an image.

### Key Discoveries:

- `backend/prisma/schema.prisma:1-9` — generator (`prisma-client`, output `../src/generated/prisma`, ESM) and datasource only; no models. `backend/prisma.config.ts:6-8,13` — migrations path `prisma/migrations`; datasource URL is `env('DIRECT_URL')`, read eagerly at config load (see `backend/Dockerfile:13-18`), so every Prisma CLI command needs `DIRECT_URL` set.
- `.github/workflows/deploy-backend.yml:5-8,27-30` — push to `main` on `backend/**` runs `npm run prisma:migrate:deploy`. A migration therefore reaches the live DB on merge unless already applied; applying it locally first makes CI a no-op.
- `context/foundation/infrastructure.md:92` — risk register: "pair every schema migration with a written manual rollback script before deploying it." `infrastructure.md:21` — one Supabase project backs the app.
- `backend/Dockerfile:29` + `backend/tsconfig.build.json:6-7` — the runtime image carries only `dist/`, built from `src/`. A seed script under `prisma/`, the seed data, and `tsx` (a devDependency) never ship; seeding is a deliberate dev-machine step, never boot-time.
- Prisma 7 no longer seeds automatically after `migrate dev`/`reset`, no longer generates the client after migrations, and takes the seed command from `prisma.config.ts` (`migrations.seed`), not `package.json`. `prisma migrate diff` uses `--to-schema` (the old `--to-schema-datamodel` flag was removed) — checked against the Prisma 7 docs on 2026-10-04.
- `backend/src/prisma/prisma.service.ts:10-14` — runtime client uses `PrismaPg` with `DATABASE_URL` (transaction pooler). `backend/src/prisma/prisma.module.ts:4-8` — `PrismaModule` is not `@Global`, so `ExercisesModule` must import it.
- `backend/vitest.config.ts:10-12` runs `**/*.spec.ts`; `backend/vitest.config.e2e.ts:9` runs only `*.e2e-spec.ts`, so new `*.spec.ts` files do not leak into e2e. `backend/package.json:17` lints `src/` and `test/` only (type-aware, `no-floating-promises: error` in `backend/.oxlintrc.json:5`), so `prisma/seed.ts` is typechecked by `tsc --noEmit` but not linted. `backend/.gitignore:7` ignores `src/generated`, so `npm run prisma:generate` must run before tests/build in a fresh checkout.
- `frontend/wrangler.jsonc:6-9` — static assets served from `./dist` with SPA fallback; Vite copies `frontend/public/` into `dist/`. Workers static-asset requests and storage are free and unlimited.
- Free Exercise DB (verified 2026-10-04): 876 records; 873 have two images (`0.jpg` start position, `1.jpg` end), 3 have none; 77 have `equipment: null`; license is the Unlicense (`LICENSE.md`, via the GitHub license API); sample images are 40–60 KB. The `category` field is not a safe selector — "Barbell Hip Thrust" is tagged `powerlifting`, not `strength` — so selection must be an explicit id list, not a filter.
- Baseline at 2026-10-04: `cd backend && npm test` and `npm run lint` pass; `npx tsc --noEmit` already exits 1 on one unrelated error, `test/app.e2e-spec.ts(4,21)` TS2307 (`Cannot find module 'supertest/types'`). The tsconfig has no `include`, so `tsc` does cover `prisma/*.ts` and a new seed script. A throwaway probe run during plan review confirmed that a Nest service with a constructor-injected `PrismaService` and a mocked `useValue` provider resolves and runs under this Vitest config (the generated client imports cleanly), so Phase 4's test pattern works.
- Supabase exposes `public`-schema tables through the Data API, with RLS off by default for tables created by SQL or migrations, and `anon`/`authenticated` then hold full privileges; the publishable key ships in the frontend bundle by design (`context/foundation/infrastructure.md:80`). Verified against Supabase's RLS and Prisma guides on 2026-10-04. Whether the Data API is enabled on this project is not visible in the repo, so the plan closes the table regardless.
- Product constraints: `context/foundation/prd.md:50` (plan exercises only from the catalog, each with an image), `prd.md:87` (FR-011), `prd.md:112` (self-curated catalog, no fetching images from the internet), `context/foundation/roadmap.md:78-90` (F-01 outcome and risk: minimal seed, not a catalog-curation project).

## What We're NOT Doing

- No HTTP endpoint for the catalog — it arrives with S-04, when the UI needs images.
- No full 50–150 catalog. ~30 exercises close F-01; growing toward the PRD's eventual target is later work done by re-running the seed.
- No secondary muscles, force/mechanic, or instruction text on exercises — only the core selection attributes. Add via a later migration if S-02 needs them.
- No image hosting beyond Cloudflare Workers static assets (no R2, no Supabase Storage). The DB stores a host-agnostic `imageKey`, so moving later is a base-URL change.
- No runtime fetching from the internet; the dataset is read once during the import.
- No seeding in CI, in the deploy workflow, or at app boot. Seeding is a deliberate `npm run prisma:seed`.
- No pruning or hard-deleting of exercises removed from the seed file — saved plans (S-05) will reference slugs, so removals need their own decision later. The seed only warns about stale rows (Phase 3) and the data README documents the manual cleanup.
- No separate dev/test database, and no DB-backed tests; the service is tested with a mocked `PrismaService`.
- No validation that a generated plan only uses catalog exercises — that belongs to S-02 (`findAll()` gives it the full set to check against).
- No frontend code changes — only static files under `frontend/public/exercises/`.
- No RLS policies and no Data API access to the catalog: RLS is enabled with none, so the table is reachable only through the backend. If a frontend ever needs direct reads, that is a deliberate policy decision for that slice.
- No rollback scripts: migrations are forward-only, and removing or undoing anything later is a new migration (user decision, 2026-10-04). This supersedes the `infrastructure.md:92` risk-register mitigation for this change.

## Implementation Approach

Four phases, each ending in something verifiable, with the two production-touching steps (migration, seed) isolated:

1. Schema + first migration, authored with `prisma migrate diff` (no shadow database needed against Supabase); migrations are forward-only, with no rollback script.
2. Curated data + images: an explicit list of 33 dataset ids imported once into `exercises.json` and `frontend/public/exercises/`, guarded by a spec.
3. Idempotent seed script (`tsx`, `migrations.seed`) — upserts by `slug` in one transaction, fails fast on a missing image, run twice to prove idempotency.
4. `ExercisesModule`/`ExercisesService` with mocked-Prisma unit tests, wired into `AppModule`.

Identity is `slug` (primary key, kebab-case of the dataset id). Each exercise has exactly one image: the dataset's first image, stored as `imageKey = exercises/<slug>.jpg`.

## Critical Implementation Details

- **State sequencing** — Apply the migration locally (`prisma migrate deploy`) before merging, so the CI migrate step on `main` is a no-op. The same database serves dev and prod, so the migration is effectively a production change the moment it is applied.
- **Generate explicitly** — Prisma 7 does not regenerate the client after a migration; run `npm run prisma:generate` after the schema change, or the service and specs will not typecheck.

## Phase 1: Data model and first migration

### Overview

Add the `Exercise` model and `ExerciseLevel` enum, generate the first migration, apply it, and regenerate the client.

### Changes Required:

#### 1. Prisma schema

**File**: `backend/prisma/schema.prisma`

**Intent**: Add the catalog model. `slug` is the natural primary key so S-02 can pass slugs to the model and S-05 can store stable references. `imageKey` is required, so an exercise without an image cannot exist at the schema level.

**Contract**: `enum ExerciseLevel { BEGINNER INTERMEDIATE EXPERT }` and `model Exercise` with fields `slug String @id`, `name String`, `primaryMuscles String[]`, `equipment String`, `level ExerciseLevel`, `category String`, `imageKey String`. Table name `Exercise`. No timestamps, no relations.

#### 2. First migration

**File**: `backend/prisma/migrations/<UTC yyyymmddhhmmss>_create_exercise/migration.sql` and `backend/prisma/migrations/migration_lock.toml`

**Intent**: Create the migration from the schema without a shadow database, which Supabase may not permit, so the first migration cannot fail on that.

**Contract**: SQL produced by `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (run from `backend/`, with `DIRECT_URL` set for config load), written to `migration.sql`; `migration_lock.toml` contains `provider = "postgresql"`. The migration creates the `ExerciseLevel` enum type and the `Exercise` table, and ends with `ALTER TABLE "Exercise" ENABLE ROW LEVEL SECURITY;` and no policies. Supabase exposes `public`-schema tables through the Data API with RLS off by default, and the publishable key ships in the frontend bundle, so without this line anyone could read and write the catalog. Prisma cannot express RLS, so the line is appended by hand to the generated SQL (and must be repeated for every future table). The backend is unaffected provided its connection role owns the table or has `BYPASSRLS`; the plan assumes the runtime `DATABASE_URL` uses the same Supabase role as `DIRECT_URL` (the migration role, which owns the table), and the first consumer (S-02) would surface it immediately if not.

#### 3. Apply and regenerate

**Intent**: Apply the migration to the (single) database and regenerate the typed client.

**Contract**: from `backend/`, `npm run prisma:migrate:deploy` then `npm run prisma:generate`. A second `prisma:migrate:deploy` reports nothing pending. Before the first apply, check that `public` has no tables (criterion 1.8): a P3005 error means stop and baseline per the Prisma docs, not force.

### Success Criteria:

#### Automated Verification:

- Schema validates: `cd backend && npx prisma validate`
- Migration folder and lock file exist and the SQL creates both objects and enables RLS: `grep -l 'CREATE TABLE "Exercise"' backend/prisma/migrations/*_create_exercise/migration.sql`, then `grep -q 'CREATE TYPE "ExerciseLevel"'` and `grep -q 'ENABLE ROW LEVEL SECURITY'` on the same file, plus `backend/prisma/migrations/migration_lock.toml` present
- Migration applies, then reports nothing pending on re-run: `cd backend && npm run prisma:migrate:deploy` twice
- Client regenerates and the project builds: `cd backend && npm run prisma:generate && npm run build`

#### Manual Verification:

- In the Supabase table editor, `Exercise` exists with 0 rows and `_prisma_migrations` lists `<ts>_create_exercise` as finished
- In the Supabase SQL editor, `select relrowsecurity from pg_class where relname = 'Exercise'` returns `true`
- Before applying the migration, the Supabase table editor shows no tables in `public`; if `migrate deploy` still fails with P3005, stop and baseline per the Prisma docs instead of forcing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Curated catalog data and images

### Overview

Import ~33 exercises once from the Free Exercise DB: write the seed data file, copy one image per exercise into the frontend's static assets, document provenance, and guard it all with a spec.

### Changes Required:

#### 1. Seed data

**File**: `backend/prisma/seed-data/exercises.json`

**Intent**: The curated catalog as data, in the repo, in the shape the seed script upserts. Produced by a one-time import (download the dataset's `dist/exercises.json`, select by the explicit id list below, map fields) — the import commands are not committed as a script; the README records how it was done.

**Contract**: a JSON array of `{ slug, name, primaryMuscles: string[], equipment, level: "beginner" | "intermediate" | "expert", category, imageKey }`. `slug` = dataset `id` lowercased, `_` replaced by `-`, repeated `-` collapsed (e.g. `Barbell_Bench_Press_-_Medium_Grip` → `barbell-bench-press-medium-grip`). `name`, `primaryMuscles`, `equipment`, `level`, `category` are copied from the dataset unchanged. `imageKey` = `exercises/<slug>.jpg`.

Starting selection (dataset ids; swap freely during review — every one has two images and a set equipment value):

| Group | Dataset ids |
| --- | --- |
| Quadriceps (4) | `Barbell_Squat`, `Leg_Press`, `Dumbbell_Lunges`, `Leg_Extensions` |
| Hamstrings (3) | `Romanian_Deadlift`, `Lying_Leg_Curls`, `Seated_Leg_Curl` |
| Glutes (2) | `Barbell_Hip_Thrust`, `Single_Leg_Glute_Bridge` |
| Calves (2) | `Standing_Calf_Raises`, `Seated_Calf_Raise` |
| Chest (4) | `Barbell_Bench_Press_-_Medium_Grip`, `Incline_Dumbbell_Press`, `Dumbbell_Flyes`, `Pushups` |
| Back (5) | `Pullups`, `Wide-Grip_Lat_Pulldown`, `Bent_Over_Barbell_Row`, `Seated_Cable_Rows`, `Barbell_Deadlift` |
| Shoulders (4) | `Standing_Military_Press`, `Dumbbell_Shoulder_Press`, `Side_Lateral_Raise`, `Face_Pull` |
| Biceps (3) | `Barbell_Curl`, `Dumbbell_Bicep_Curl`, `Hammer_Curls` |
| Triceps (3) | `Triceps_Pushdown`, `Dips_-_Triceps_Version`, `Seated_Triceps_Press` |
| Abdominals (3) | `Crunches`, `Plank`, `Hanging_Leg_Raise` |

#### 2. Images

**File**: `frontend/public/exercises/<slug>.jpg` (33 files)

**Intent**: One image per exercise, served by the existing Cloudflare Workers static-assets deployment.

**Contract**: each file is the dataset's `exercises/<id>/0.jpg` (start position), copied unchanged to `<slug>.jpg`. Total size on the order of 1.5–2 MB.

#### 3. Provenance and runbook stub

**File**: `backend/prisma/seed-data/README.md`

**Intent**: Record where the data came from and how to extend it, so the licensing story and the "how do I add an exercise" steps are not lost.

**Contract**: states the source (`yuhonas/free-exercise-db`, Unlicense), that selection is by explicit id list (not by `category`), the slug rule, the one-image rule (`0.jpg`), and how to add an exercise (append a record, add the jpg, run the spec, run the seed). Phase 3 appends the seed run command.

#### 4. Seed-data spec

**File**: `backend/test/exercise-seed-data.spec.ts`

**Intent**: Make "each exercise has an image" an executable guarantee, and keep data and images in sync across the two independent packages.

**Contract**: reads `exercises.json` (`../prisma/seed-data/`) and the images (`../../frontend/public/`) relative to the spec file via `import.meta.url` (not the working directory), using `fs` — the tsconfig has no `resolveJsonModule`, so the JSON is not imported. Asserts: at least 30 records; unique slugs matching `^[a-z0-9]+(-[a-z0-9]+)*$`; non-empty `name`, `equipment`, `category`, and at least one `primaryMuscles`; `level` is one of the three enum values; `imageKey === "exercises/" + slug + ".jpg"`; the file exists, is non-empty, and starts with the JPEG magic bytes `FF D8`; and no `.jpg` in `frontend/public/exercises/` lacks a record.

### Success Criteria:

#### Automated Verification:

- Seed-data spec passes: `cd backend && npx vitest run test/exercise-seed-data.spec.ts`
- Full unit suite passes: `cd backend && npm test`
- Linting passes: `cd backend && npm run lint`
- Frontend still builds with the images in `public/`: `cd frontend && npm run build`

#### Manual Verification:

- Skim the rows in `exercises.json` (name, muscles, equipment, level) — the final list matches intent; swap or add exercises now, not after seeding
- Open a handful of images across muscle groups: each depicts its named exercise; `cd frontend && npm run dev` serves `http://localhost:5173/exercises/barbell-squat.jpg` as an image

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Seed script and runbook

### Overview

Add an idempotent seed that loads `exercises.json` into the `Exercise` table, wire it into the Prisma CLI, run it against the database twice, and document the runbook.

### Changes Required:

#### 1. Seed script

**File**: `backend/prisma/seed.ts`

**Intent**: Load the catalog into the database safely and repeatably. Fail before touching the DB if any record's image is missing, apply all upserts atomically so a failure never leaves a half-seeded catalog, and report the resulting catalog size.

**Contract**: loads env (`dotenv/config`), builds a `PrismaClient` with `PrismaPg` on `DIRECT_URL` (mirroring `backend/src/prisma/prisma.service.ts:10-14`, which uses `DATABASE_URL`), imports the client from `../src/generated/prisma/client.js`. Steps: read (with `fs`, not `import` — there is no `resolveJsonModule`) and shape-check `exercises.json`; verify each `imageKey` file exists under `../../frontend/public/` (resolved from `backend/prisma/seed.ts` via `import.meta.url`); map lowercase `level` to the `ExerciseLevel` enum; run one `$transaction` of `exercise.upsert({ where: { slug }, create, update })`; read back every slug in the table, log `Seeded <N> exercises; catalog total <M>`, and log a `WARN` naming any table slug that is not in `exercises.json` (a stale row consumers would still be served) with a pointer to the README cleanup — the run still exits 0; always `$disconnect`; non-zero exit on any error. It never deletes rows.

#### 2. CLI wiring and tooling

**File**: `backend/prisma.config.ts`, `backend/package.json` and `backend/package-lock.json`

**Intent**: Make the seed runnable the Prisma 7 way and keep it out of production artifacts.

**Contract**: `prisma.config.ts` gains `migrations.seed: 'tsx prisma/seed.ts'` alongside the existing `path`; `package.json` gains devDependency `tsx` and script `"prisma:seed": "prisma db seed"`. Commit the updated `package-lock.json` too — CI and the Docker builder both run `npm ci`, which fails on an out-of-sync lockfile. Because `tsx` is a devDependency and the Docker runtime stage runs `npm ci --omit=dev`, nothing here ships to Fly.

#### 3. Runbook

**File**: `backend/prisma/seed-data/README.md` (append) and `backend/README.md` (one short section)

**Intent**: Make the manual seed step impossible to forget.

**Contract**: the data README gains "Running the seed" (`cd backend && npm run prisma:seed`; Prisma 7 never seeds automatically; safe to re-run; run it after changing `exercises.json`; removing an exercise from the file does not delete it from the DB — the seed warns about such stale rows, and the README gives the manual `delete from "Exercise" where slug = '<slug>'` to clear them, after which the image file can be deleted). `backend/README.md` gains a short "Exercise catalog" section linking to the data README.

### Success Criteria:

#### Automated Verification:

- Seed script has no type errors (baseline already has one unrelated error, `test/app.e2e-spec.ts` TS2307): `cd backend && npx tsc --noEmit 2>&1 | grep -c '^prisma/'` prints 0
- First seed run exits 0 and logs 33 seeded / catalog total 33: `cd backend && npm run prisma:seed`
- Second run is idempotent — exits 0, catalog total still 33, no stale-row WARN: `cd backend && npm run prisma:seed`
- Lint and build still pass (seed is outside both): `cd backend && npm run lint && npm run build`

#### Manual Verification:

- In Supabase, `select count(*) from "Exercise"` returns 33 and a few rows show the expected `level`, `primaryMuscles`, and `imageKey`
- The READMEs read correctly end to end: run command, add-an-exercise steps, licensing/provenance
- With the table seeded, the publishable key cannot read it: a GET on `<supabase-url>/rest/v1/Exercise?limit=1` with the key in the `apikey` header returns `[]` (or an error if the Data API is off) although the table holds 33 rows
- Stale-row warning and cleanup work: insert a throwaway `Exercise` row with slug `zz-stale-test` in the Supabase SQL editor, run `npm run prisma:seed` and see a WARN naming it (exit 0), then remove it with the README's cleanup `DELETE`
- Missing-image guard works: temporarily rename one `frontend/public/exercises/*.jpg`, run `npm run prisma:seed`, expect a non-zero exit naming the missing key and no change to the table, then restore the file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Catalog query service

### Overview

Expose the catalog to the rest of the backend through a small injectable service and wire it into the app.

### Changes Required:

#### 1. Service

**File**: `backend/src/exercises/exercises.service.ts`

**Intent**: The query surface S-02 (constrain the AI, validate its output) and S-04 (look up images) will use — read-only, deterministic, and small.

**Contract**: `@Injectable() class ExercisesService` taking `PrismaService`; `findAll(): Promise<Exercise[]>` — every row ordered by `slug` ascending. Nothing else is exposed yet: S-02 and S-04 add the lookup they need (for example by slug) once their shape is known. `Exercise` is the generated model type from the generated client.

#### 2. Module and wiring

**File**: `backend/src/exercises/exercises.module.ts` and `backend/src/app.module.ts`

**Intent**: Make the service injectable and prove the DI graph resolves at boot.

**Contract**: `ExercisesModule` imports `PrismaModule` (not global — `prisma.module.ts:4-8`), provides and exports `ExercisesService`; `AppModule` (`app.module.ts:9`) adds `ExercisesModule` to its `imports`.

#### 3. Service unit tests

**File**: `backend/src/exercises/exercises.service.spec.ts`

**Intent**: Pin the contract without a database, following the pattern in `backend/src/app.controller.spec.ts:1-22`.

**Contract**: `Test.createTestingModule` with `PrismaService` replaced by `{ exercise: { findMany: vi.fn() } }`. Case: `findAll` calls `findMany` ordered by `slug` ascending and returns what the mock returns.

### Success Criteria:

#### Automated Verification:

- Service spec passes: `cd backend && npx vitest run src/exercises/exercises.service.spec.ts`
- Full unit suite passes: `cd backend && npm test`
- Linting passes, including `no-floating-promises`: `cd backend && npm run lint`
- Build passes: `cd backend && npm run build`

#### Manual Verification:

- `cd backend && npm run start:dev` boots without dependency-injection errors (confirms `ExercisesModule` wiring) and `GET /health` returns 200
- After the push deploys the frontend, `curl -sI https://<worker-url>/exercises/barbell-squat.jpg` returns 200 with `content-type: image/jpeg`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `exercise-seed-data.spec.ts`: record count, slug uniqueness/format, required fields, level enum, `imageKey` format, image file existence/non-empty/JPEG magic bytes, no orphan images
- `exercises.service.spec.ts`: `findAll` ordering and pass-through, with a mocked `PrismaService`

### Integration Tests:

- None by decision: there is no test database and the single Supabase DB is shared with production. DB behavior is covered by the Phase 1 migration check and the Phase 3 seed runs (twice) plus a row-count check.

### Manual Testing Steps:

1. After Phase 3, in the Supabase table editor confirm 33 rows with sensible `level`, `primaryMuscles`, `imageKey`.
2. After the frontend deploys (merge to `main`): `curl -sI https://<worker-url>/exercises/barbell-squat.jpg` returns `200` with `content-type: image/jpeg`.
3. Spot-check three or four more image URLs from different muscle groups in a browser.

## Performance Considerations

None material. `findAll` returns ~33 rows (≤ ~150 at the PRD's eventual size), intended to be fed whole to the AI prompt, so there is no pagination. Images add roughly 1.5–2 MB to the repo and are served free from Cloudflare's edge.

## Migration Notes

- One shared Supabase DB: the migration is additive (one enum, one table) and is applied locally before merge, so the `deploy-backend.yml` migrate step finds nothing to do.
- Merging triggers both deploy workflows: backend (migrate no-op, then deploy; `ExercisesModule` is inert until a consumer exists) and frontend (ships the images). The seed is never run by CI — run `npm run prisma:seed` yourself after the table exists.
- The Supabase free tier pauses after ~1 week idle (`infrastructure.md` risk register); un-pause the project before Phases 1 and 3.
- Forward-only: there are no rollback scripts. To undo or remove anything, add a new migration. Rows are safe to re-seed.

## References

- Roadmap: `context/foundation/roadmap.md:78-90` (F-01); GitHub issue #1
- PRD: `context/foundation/prd.md:50` (acceptance criterion), `:87` (FR-011), `:112` (non-goal)
- Infra: `context/foundation/infrastructure.md:21,92`; deploy workflow `.github/workflows/deploy-backend.yml:27-30`
- Existing patterns: `backend/src/prisma/prisma.service.ts:10-14`, `backend/src/app.controller.spec.ts:1-22`
- Source dataset: https://github.com/yuhonas/free-exercise-db (Unlicense)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model and first migration

#### Automated

- [x] 1.1 Schema validates: `cd backend && npx prisma validate`
- [x] 1.2 Migration folder and lock file exist and the SQL creates both objects and enables RLS: `grep -l 'CREATE TABLE "Exercise"' backend/prisma/migrations/*_create_exercise/migration.sql`, then `grep -q 'CREATE TYPE "ExerciseLevel"'` and `grep -q 'ENABLE ROW LEVEL SECURITY'` on the same file, plus `backend/prisma/migrations/migration_lock.toml` present
- [x] 1.4 Migration applies, then reports nothing pending on re-run: `cd backend && npm run prisma:migrate:deploy` twice
- [x] 1.5 Client regenerates and the project builds: `cd backend && npm run prisma:generate && npm run build`

#### Manual

- [x] 1.6 In the Supabase table editor, `Exercise` exists with 0 rows and `_prisma_migrations` lists `<ts>_create_exercise` as finished
- [x] 1.7 In the Supabase SQL editor, `select relrowsecurity from pg_class where relname = 'Exercise'` returns `true`
- [x] 1.8 Before applying the migration, the Supabase table editor shows no tables in `public`; if `migrate deploy` still fails with P3005, stop and baseline per the Prisma docs instead of forcing

### Phase 2: Curated catalog data and images

#### Automated

- [ ] 2.1 Seed-data spec passes: `cd backend && npx vitest run test/exercise-seed-data.spec.ts`
- [ ] 2.2 Full unit suite passes: `cd backend && npm test`
- [ ] 2.3 Linting passes: `cd backend && npm run lint`
- [ ] 2.4 Frontend still builds with the images in `public/`: `cd frontend && npm run build`

#### Manual

- [ ] 2.5 Skim the rows in `exercises.json` (name, muscles, equipment, level) — the final list matches intent; swap or add exercises now, not after seeding
- [ ] 2.6 Open a handful of images across muscle groups: each depicts its named exercise; `cd frontend && npm run dev` serves `http://localhost:5173/exercises/barbell-squat.jpg` as an image

### Phase 3: Seed script and runbook

#### Automated

- [ ] 3.1 Seed script has no type errors (baseline already has one unrelated error, `test/app.e2e-spec.ts` TS2307): `cd backend && npx tsc --noEmit 2>&1 | grep -c '^prisma/'` prints 0
- [ ] 3.2 First seed run exits 0 and logs 33 seeded / catalog total 33: `cd backend && npm run prisma:seed`
- [ ] 3.3 Second run is idempotent — exits 0, catalog total still 33, no stale-row WARN: `cd backend && npm run prisma:seed`
- [ ] 3.5 Lint and build still pass (seed is outside both): `cd backend && npm run lint && npm run build`

#### Manual

- [ ] 3.6 In Supabase, `select count(*) from "Exercise"` returns 33 and a few rows show the expected `level`, `primaryMuscles`, and `imageKey`
- [ ] 3.7 The READMEs read correctly end to end: run command, add-an-exercise steps, licensing/provenance
- [ ] 3.8 With the table seeded, the publishable key cannot read it: a GET on `<supabase-url>/rest/v1/Exercise?limit=1` with the key in the `apikey` header returns `[]` (or an error if the Data API is off) although the table holds 33 rows
- [ ] 3.9 Stale-row warning and cleanup work: insert a throwaway `Exercise` row with slug `zz-stale-test` in the Supabase SQL editor, run `npm run prisma:seed` and see a WARN naming it (exit 0), then remove it with the README's cleanup `DELETE`
- [ ] 3.10 Missing-image guard works: temporarily rename one `frontend/public/exercises/*.jpg`, run `npm run prisma:seed`, expect a non-zero exit naming the missing key and no change to the table, then restore the file

### Phase 4: Catalog query service

#### Automated

- [ ] 4.1 Service spec passes: `cd backend && npx vitest run src/exercises/exercises.service.spec.ts`
- [ ] 4.2 Full unit suite passes: `cd backend && npm test`
- [ ] 4.3 Linting passes, including `no-floating-promises`: `cd backend && npm run lint`
- [ ] 4.4 Build passes: `cd backend && npm run build`

#### Manual

- [ ] 4.5 `cd backend && npm run start:dev` boots without dependency-injection errors (confirms `ExercisesModule` wiring) and `GET /health` returns 200
- [ ] 4.6 After the push deploys the frontend, `curl -sI https://<worker-url>/exercises/barbell-squat.jpg` returns 200 with `content-type: image/jpeg`
