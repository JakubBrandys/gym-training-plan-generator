# Exercise catalog seed data

`exercises.json` is the curated exercise catalog that the seed script upserts into the `Exercise` table. The matching images live in the frontend's static assets, in `frontend/public/exercises/`, and are served by the Cloudflare Workers static-assets deployment.

## Source and licence

The exercise **metadata** (names, muscles, equipment, level, category) comes from [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db), which is released under the [Unlicense](https://unlicense.org/) (public domain).

The **images are not from that dataset.** Its README documents no provenance or licence for its photos (they show an identifiable person and branded gear), so they are not used. The images in `frontend/public/exercises/` are original, AI-generated, faceless illustrations supplied by the project owner, each showing the start (A) and end (B) position of the exercise.

## How the data was imported

This was a one-time import. Nothing is fetched at runtime and the import commands are not committed as a script.

- Imported on 2026-10-04 from dataset commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (`main`, committed 2026-09-27).
- Downloaded the dataset file `dist/exercises.json` with `curl` from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`.
- Selected exercises by an explicit list of dataset `id` values, not by `category` or any other filter. The list is the set of records in `exercises.json`.
- Mapped each selected dataset record to the shape below with a throwaway script, so fields were copied rather than retyped.
- Images were generated separately (see above), downscaled to 800 px wide and saved as JPEG (quality 80) at `frontend/public/exercises/<slug>.jpg`.

## Record shape

`exercises.json` is a JSON array, pretty-printed with 2-space indent and a trailing newline. Each record is:

| Field | Value |
| --- | --- |
| `slug` | Derived from the dataset `id`: lowercased, `_` replaced by `-`, repeated `-` collapsed. For example `Barbell_Bench_Press_-_Medium_Grip` becomes `barbell-bench-press-medium-grip`. |
| `name` | Copied from the dataset unchanged. |
| `primaryMuscles` | Copied from the dataset unchanged (array of strings). |
| `equipment` | Copied from the dataset unchanged. |
| `level` | Copied from the dataset unchanged: `beginner`, `intermediate` or `expert`. |
| `category` | Copied from the dataset unchanged. |
| `imageKey` | `exercises/<slug>.jpg`. |

## Images

One image per exercise, a JPEG at `frontend/public/exercises/<slug>.jpg` (about 800 px wide, aim for under 100 KB).

## Adding an exercise

1. Find the exercise in the dataset and note its `id`.
2. Append a record to `exercises.json`, deriving the `slug` with the rule above and copying the other fields from the dataset unchanged. Set `imageKey` to `exercises/<slug>.jpg`.
3. Add the exercise's image as `frontend/public/exercises/<slug>.jpg` (JPEG, same style as the existing ones).
4. Run the seed-data spec from `backend/`: `npx vitest run test/exercise-seed-data.spec.ts`. It checks that every record is well-formed, that its image exists and is a JPEG, and that no image lacks a record.
5. Run the seed.
