import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Paths are resolved from this file, not from the working directory, so the
// spec behaves the same whether it runs from `backend/` or from the repo root.
const seedDataPath = fileURLToPath(
  new URL('../prisma/seed-data/exercises.json', import.meta.url),
);
const imagesDir = fileURLToPath(
  new URL('../../frontend/public/exercises/', import.meta.url),
);

const LEVELS = ['beginner', 'intermediate', 'expert'];
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const JPEG_MAGIC = Buffer.from([0xff, 0xd8]);

interface SeedExercise {
  slug: string;
  name: string;
  primaryMuscles: string[];
  equipment: string;
  level: string;
  category: string;
  imageKey: string;
}

// No `resolveJsonModule` in tsconfig, so the JSON is read with fs, not imported.
const exercises = JSON.parse(
  readFileSync(seedDataPath, 'utf8'),
) as SeedExercise[];

describe('exercise seed data', () => {
  it('contains at least 30 records', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(30);
  });

  it('has unique slugs', () => {
    const slugs = exercises.map((exercise) => exercise.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(exercises)('$slug', (exercise) => {
    it('has a well-formed slug', () => {
      expect(exercise.slug).toMatch(SLUG_PATTERN);
    });

    it('has the required text fields', () => {
      expect(exercise.name.trim()).not.toBe('');
      expect(exercise.equipment.trim()).not.toBe('');
      expect(exercise.category.trim()).not.toBe('');
    });

    it('has at least one primary muscle', () => {
      expect(exercise.primaryMuscles.length).toBeGreaterThanOrEqual(1);
    });

    it('has a valid level', () => {
      expect(LEVELS).toContain(exercise.level);
    });

    it('has an imageKey derived from the slug', () => {
      expect(exercise.imageKey).toBe(`exercises/${exercise.slug}.jpg`);
    });

    it('has a non-empty JPEG image in the frontend static assets', () => {
      const imagePath = fileURLToPath(
        new URL(`../../frontend/public/${exercise.imageKey}`, import.meta.url),
      );

      expect(existsSync(imagePath)).toBe(true);
      expect(statSync(imagePath).size).toBeGreaterThan(0);
      expect(readFileSync(imagePath).subarray(0, 2)).toEqual(JPEG_MAGIC);
    });
  });

  it('has no orphan images without a record', () => {
    const imageKeys = new Set(exercises.map((exercise) => exercise.imageKey));
    const orphans = readdirSync(imagesDir)
      .filter((file) => file.endsWith('.jpg'))
      .filter((file) => !imageKeys.has(`exercises/${file}`));

    expect(orphans).toEqual([]);
  });
});
