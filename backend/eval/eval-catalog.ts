import { readFile } from 'node:fs/promises';

export type EvalLevel = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';

export interface EvalCatalogExercise {
  slug: string;
  name: string;
  primaryMuscles: string[];
  equipment: string;
  level: EvalLevel;
  category: string;
  imageKey: string;
}

const LEVEL_BY_SEED_VALUE: Record<string, EvalLevel> = {
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  expert: 'EXPERT',
};

const SEED_PATH = new URL(
  '../prisma/seed-data/exercises.json',
  import.meta.url,
);

interface SeedExercise extends Omit<EvalCatalogExercise, 'level'> {
  level: string;
}

export const parseSeedCatalog = (raw: string): EvalCatalogExercise[] =>
  (JSON.parse(raw) as SeedExercise[]).map((exercise) => {
    const level = LEVEL_BY_SEED_VALUE[exercise.level];
    if (!level) {
      throw new Error(
        `Unknown exercise level "${exercise.level}" for ${exercise.slug}.`,
      );
    }
    return { ...exercise, level };
  });

export const loadEvalCatalog = async (): Promise<EvalCatalogExercise[]> =>
  parseSeedCatalog(await readFile(SEED_PATH, 'utf8'));
