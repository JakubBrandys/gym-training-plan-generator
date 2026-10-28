import { z } from 'zod';

export const EXPERIENCE_LEVELS = [
  'beginner',
  'intermediate',
  'expert',
] as const;

export const planFormSchema = z.object({
  experience: z.enum(EXPERIENCE_LEVELS),
  currentFrequency: z.int().min(1).max(7),
  desiredFrequency: z.int().min(1).max(7),
  heightCm: z.int().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  goals: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !value.includes('\u0000'), {
      message: 'goals must not contain NUL characters',
    }),
});

export type PlanForm = z.infer<typeof planFormSchema>;
