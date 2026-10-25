import type { PlanForm } from './plan-form.schema.js';
import type { GeneratedPlan } from './plan.schema.js';

export type PlanValidationResult =
  { ok: true } | { ok: false; issues: string[] };

export const WEEK_COUNT = 8;
const MIN_EXERCISES_PER_SESSION = 3;
const MAX_EXERCISES_PER_SESSION = 10;
const MIN_SETS = 1;
const MAX_SETS = 8;
const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 600;
const MAX_REPS_LENGTH = 20;
const MAX_NOTE_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const MAX_GOAL_LENGTH = 200;

type FrequencyForm = Pick<PlanForm, 'currentFrequency' | 'desiredFrequency'>;

const validateFrequencyRule = (
  plan: GeneratedPlan,
  form: FrequencyForm,
): string[] => {
  const { currentFrequency, desiredFrequency } = form;
  const counts = plan.weeks.map((week) => week.sessions.length);
  const issues: string[] = [];

  if (counts[0] !== currentFrequency) {
    issues.push(
      `Week 1 must have exactly ${currentFrequency} sessions (the current frequency), found ${counts[0]}.`,
    );
  }
  if (counts[WEEK_COUNT - 1] !== desiredFrequency) {
    issues.push(
      `Week ${WEEK_COUNT} must have exactly ${desiredFrequency} sessions (the desired frequency), found ${counts[WEEK_COUNT - 1]}.`,
    );
  }

  const direction = Math.sign(desiredFrequency - currentFrequency);
  for (let index = 1; index < counts.length; index += 1) {
    const step = counts[index] - counts[index - 1];
    if (step !== 0 && step !== direction) {
      issues.push(
        `Sessions per week may only stay the same or move by one toward ${desiredFrequency}, but week ${index} has ${counts[index - 1]} and week ${index + 1} has ${counts[index]}.`,
      );
    }
  }
  return issues;
};

const validateSessionExercises = (
  exercises: GeneratedPlan['weeks'][number]['sessions'][number]['exercises'],
  label: string,
  catalog: ReadonlySet<string>,
): string[] => {
  const issues: string[] = [];
  if (
    exercises.length < MIN_EXERCISES_PER_SESSION ||
    exercises.length > MAX_EXERCISES_PER_SESSION
  ) {
    issues.push(
      `${label} must have ${MIN_EXERCISES_PER_SESSION}-${MAX_EXERCISES_PER_SESSION} exercises, found ${exercises.length}.`,
    );
  }

  const seen = new Set<string>();
  exercises.forEach((exercise, index) => {
    const exerciseLabel = `${label}, exercise ${index + 1} (${exercise.slug})`;
    if (!catalog.has(exercise.slug)) {
      issues.push(`${exerciseLabel} is not in the exercise catalog.`);
    }
    if (seen.has(exercise.slug)) {
      issues.push(`${label} repeats the exercise ${exercise.slug}.`);
    }
    seen.add(exercise.slug);
    if (exercise.sets < MIN_SETS || exercise.sets > MAX_SETS) {
      issues.push(
        `${exerciseLabel} must have ${MIN_SETS}-${MAX_SETS} sets, found ${exercise.sets}.`,
      );
    }
    if (
      exercise.restSeconds < MIN_REST_SECONDS ||
      exercise.restSeconds > MAX_REST_SECONDS
    ) {
      issues.push(
        `${exerciseLabel} must have ${MIN_REST_SECONDS}-${MAX_REST_SECONDS} seconds of rest, found ${exercise.restSeconds}.`,
      );
    }
    if (
      exercise.reps.trim().length === 0 ||
      exercise.reps.length > MAX_REPS_LENGTH
    ) {
      issues.push(
        `${exerciseLabel} reps must be 1-${MAX_REPS_LENGTH} characters.`,
      );
    }
    if (exercise.note !== null && exercise.note.length > MAX_NOTE_LENGTH) {
      issues.push(
        `${exerciseLabel} note must be at most ${MAX_NOTE_LENGTH} characters.`,
      );
    }
  });
  return issues;
};

export const validateGeneratedPlan = (
  plan: GeneratedPlan,
  form: FrequencyForm,
  catalogSlugs: readonly string[],
): PlanValidationResult => {
  const catalog = new Set(catalogSlugs);
  const issues: string[] = [];

  if (plan.weeks.length !== WEEK_COUNT) {
    issues.push(
      `The plan must have exactly ${WEEK_COUNT} weeks, found ${plan.weeks.length}.`,
    );
  } else {
    issues.push(...validateFrequencyRule(plan, form));
  }

  plan.weeks.forEach((week, weekIndex) => {
    const weekLabel = `Week ${weekIndex + 1}`;
    if (week.week !== weekIndex + 1) {
      issues.push(
        `${weekLabel} must be numbered ${weekIndex + 1}, found ${week.week}.`,
      );
    }
    if (week.goal.length > MAX_GOAL_LENGTH) {
      issues.push(
        `${weekLabel} goal must be at most ${MAX_GOAL_LENGTH} characters.`,
      );
    }
    week.sessions.forEach((session, sessionIndex) => {
      const sessionLabel = `${weekLabel}, session ${sessionIndex + 1}`;
      if (session.title.length > MAX_TITLE_LENGTH) {
        issues.push(
          `${sessionLabel} title must be at most ${MAX_TITLE_LENGTH} characters.`,
        );
      }
      issues.push(
        ...validateSessionExercises(session.exercises, sessionLabel, catalog),
      );
    });
  });

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};
