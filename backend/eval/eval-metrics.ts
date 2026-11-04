import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { GeneratedPlan } from '../src/plan-generation/plan.schema.js';
import { validateGeneratedPlan } from '../src/plan-generation/plan.validator.js';
import type { EvalCatalogExercise, EvalLevel } from './eval-catalog.js';

export interface PlanLike {
  weeks: {
    sessions: { exercises: { slug: string; sets: number }[] }[];
  }[];
}

type CatalogLookup = readonly Pick<
  EvalCatalogExercise,
  'slug' | 'primaryMuscles' | 'level'
>[];

const LEVEL_RANK: Record<EvalLevel, number> = {
  BEGINNER: 0,
  INTERMEDIATE: 1,
  EXPERT: 2,
};

const TRAINEE_RANK: Record<PlanForm['experience'], number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

export const callValidity = (
  plan: GeneratedPlan,
  form: Pick<PlanForm, 'currentFrequency' | 'desiredFrequency'>,
  slugs: readonly string[],
): { ok: boolean; issueCount: number } => {
  const result = validateGeneratedPlan(plan, form, slugs);
  return { ok: result.ok, issueCount: result.ok ? 0 : result.issues.length };
};

const sameWeek = (
  week: PlanLike['weeks'][number],
  previous: PlanLike['weeks'][number],
): boolean =>
  week.sessions.length === previous.sessions.length &&
  week.sessions.every((session, sessionIndex) => {
    const other = previous.sessions[sessionIndex];
    return (
      session.exercises.length === other.exercises.length &&
      session.exercises.every(
        (exercise, exerciseIndex) =>
          exercise.slug === other.exercises[exerciseIndex].slug &&
          exercise.sets === other.exercises[exerciseIndex].sets,
      )
    );
  });

export const weekRepetitionRate = (plan: PlanLike): number | null => {
  if (plan.weeks.length < 2) {
    return null;
  }
  const repeats = plan.weeks
    .slice(1)
    .filter((week, index) => sameWeek(week, plan.weeks[index])).length;
  return repeats / (plan.weeks.length - 1);
};

export const meanDistinctMusclesPerWeek = (
  plan: PlanLike,
  catalog: CatalogLookup,
): number | null => {
  if (plan.weeks.length === 0) {
    return null;
  }
  const musclesBySlug = new Map(
    catalog.map((exercise) => [exercise.slug, exercise.primaryMuscles]),
  );
  const counts = plan.weeks.map((week) => {
    const muscles = new Set<string>();
    week.sessions.forEach((session) =>
      session.exercises.forEach((exercise) =>
        musclesBySlug
          .get(exercise.slug)
          ?.forEach((muscle) => muscles.add(muscle)),
      ),
    );
    return muscles.size;
  });
  return counts.reduce((sum, count) => sum + count, 0) / counts.length;
};

export const aboveLevelShare = (
  plan: PlanLike,
  catalog: CatalogLookup,
  experience: PlanForm['experience'],
): number | null => {
  const levelBySlug = new Map(
    catalog.map((exercise) => [exercise.slug, exercise.level]),
  );
  let known = 0;
  let above = 0;
  plan.weeks.forEach((week) =>
    week.sessions.forEach((session) =>
      session.exercises.forEach((exercise) => {
        const level = levelBySlug.get(exercise.slug);
        if (level === undefined) {
          return;
        }
        known += 1;
        if (LEVEL_RANK[level] > TRAINEE_RANK[experience]) {
          above += 1;
        }
      }),
    ),
  );
  return known === 0 ? null : above / known;
};
