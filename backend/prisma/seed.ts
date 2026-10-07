import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Paths are resolved from this file, not the working directory.
const seedDataPath = fileURLToPath(
  new URL('./seed-data/exercises.json', import.meta.url),
);
const publicDir = fileURLToPath(
  new URL('../../frontend/public/', import.meta.url),
);

const LEVELS = {
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  expert: 'EXPERT',
} as const;

interface SeedExercise {
  slug: string;
  name: string;
  primaryMuscles: string[];
  equipment: string;
  level: keyof typeof LEVELS;
  category: string;
  imageKey: string;
}

function isSeedExercise(value: unknown): value is SeedExercise {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.slug === 'string' &&
    typeof e.name === 'string' &&
    Array.isArray(e.primaryMuscles) &&
    e.primaryMuscles.every((m) => typeof m === 'string') &&
    typeof e.equipment === 'string' &&
    typeof e.level === 'string' &&
    e.level in LEVELS &&
    typeof e.category === 'string' &&
    typeof e.imageKey === 'string'
  );
}

function loadExercises(): SeedExercise[] {
  const parsed: unknown = JSON.parse(readFileSync(seedDataPath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('exercises.json must be a JSON array');
  }
  parsed.forEach((record, index) => {
    if (!isSeedExercise(record)) {
      throw new Error(`exercises.json record #${index} has an invalid shape`);
    }
  });
  return parsed as SeedExercise[];
}

async function main(): Promise<void> {
  const exercises = loadExercises();

  // Fail before touching the DB if any image is missing.
  const missing = exercises.filter(
    (exercise) => !existsSync(`${publicDir}${exercise.imageKey}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing image file(s): ${missing.map((e) => e.imageKey).join(', ')}`,
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
  });

  try {
    await prisma.$transaction(
      exercises.map((exercise) => {
        const data = {
          name: exercise.name,
          primaryMuscles: exercise.primaryMuscles,
          equipment: exercise.equipment,
          level: LEVELS[exercise.level],
          category: exercise.category,
          imageKey: exercise.imageKey,
        };
        return prisma.exercise.upsert({
          where: { slug: exercise.slug },
          create: { slug: exercise.slug, ...data },
          update: data,
        });
      }),
    );

    const rows = await prisma.exercise.findMany({ select: { slug: true } });
    console.log(
      `Seeded ${exercises.length} exercises; catalog total ${rows.length}`,
    );

    const known = new Set(exercises.map((exercise) => exercise.slug));
    for (const { slug } of rows) {
      if (!known.has(slug)) {
        console.warn(
          `WARN: "${slug}" is in the Exercise table but not in exercises.json. ` +
            'Consumers will still be served it; see prisma/seed-data/README.md to clean up.',
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
