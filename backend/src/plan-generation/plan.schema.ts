import { z } from 'zod';

export type SlugTuple = readonly [string, ...string[]];

export const buildGeneratedPlanSchema = (slugs: SlugTuple) =>
  z.object({
    weeks: z.array(
      z.object({
        week: z.int(),
        goal: z.string(),
        sessions: z.array(
          z.object({
            title: z.string(),
            exercises: z.array(
              z.object({
                slug: z.enum(slugs),
                sets: z.int(),
                reps: z.string(),
                restSeconds: z.int(),
                note: z.string().nullable(),
              }),
            ),
          }),
        ),
      }),
    ),
  });

export type GeneratedPlan = z.infer<
  ReturnType<typeof buildGeneratedPlanSchema>
>;

export interface PlanResultExercise {
  slug: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  note: string | null;
}

export interface PlanResultSession {
  title: string;
  exercises: PlanResultExercise[];
}

export interface PlanResultWeek {
  week: number;
  goal: string;
  sessions: PlanResultSession[];
}

export interface PlanResult {
  weeks: PlanResultWeek[];
}
