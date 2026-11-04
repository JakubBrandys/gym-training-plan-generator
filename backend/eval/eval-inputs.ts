import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { EvalJobSpec, EvalTier } from './eval-types.js';

export interface EvalInput {
  id: string;
  form: PlanForm;
}

export const EVAL_INPUTS: readonly EvalInput[] = [
  {
    id: 'expert-5-5-strength',
    form: {
      experience: 'expert',
      currentFrequency: 5,
      desiredFrequency: 5,
      heightCm: 182,
      weightKg: 92,
      goals:
        'Raise my squat, bench press and deadlift one-rep maxes with heavy, low-rep strength work.',
    },
  },
  {
    id: 'beginner-2-4-general',
    form: {
      experience: 'beginner',
      currentFrequency: 2,
      desiredFrequency: 4,
      heightCm: 170,
      weightKg: 68,
      goals:
        'Get fitter and build a base of general strength, I have never trained consistently before.',
    },
  },
  {
    id: 'intermediate-3-5-hypertrophy',
    form: {
      experience: 'intermediate',
      currentFrequency: 3,
      desiredFrequency: 5,
      heightCm: 178,
      weightKg: 80,
      goals: 'Build muscle size in my chest, back and shoulders.',
    },
  },
  {
    id: 'expert-7-1-taper',
    form: {
      experience: 'expert',
      currentFrequency: 7,
      desiredFrequency: 1,
      heightCm: 188,
      weightKg: 97,
      goals:
        'My job leaves time for one session a week, keep as much of my strength as possible.',
    },
  },
  {
    id: 'intermediate-3-3-fatloss',
    form: {
      experience: 'intermediate',
      currentFrequency: 3,
      desiredFrequency: 3,
      heightCm: 165,
      weightKg: 74,
      goals: 'Lose body fat while keeping the muscle I have.',
    },
  },
  {
    id: 'beginner-3-3-back-sensitive',
    form: {
      experience: 'beginner',
      currentFrequency: 3,
      desiredFrequency: 3,
      heightCm: 172,
      weightKg: 85,
      goals:
        'Build leg strength, but my lower back is sensitive so avoid heavy spinal loading.',
    },
  },
  {
    id: 'intermediate-1-7-return',
    form: {
      experience: 'intermediate',
      currentFrequency: 1,
      desiredFrequency: 7,
      heightCm: 175,
      weightKg: 77,
      goals:
        'Return to training after a long break and turn the gym into a daily habit.',
    },
  },
  {
    id: 'beginner-4-4-posture',
    form: {
      experience: 'beginner',
      currentFrequency: 4,
      desiredFrequency: 4,
      heightCm: 180,
      weightKg: 79,
      goals:
        'Fix my posture and shoulder health after years of desk work, while staying lean.',
    },
  },
];

export const SMOKE_INPUT_COUNT = 3;

export const TIER_REPEATS: Record<EvalTier, number> = {
  smoke: 1,
  full: 3,
};

export const tierInputs = (tier: EvalTier): readonly EvalInput[] =>
  tier === 'smoke' ? EVAL_INPUTS.slice(0, SMOKE_INPUT_COUNT) : EVAL_INPUTS;

export const buildJobSpecs = (tier: EvalTier): EvalJobSpec[] =>
  tierInputs(tier).flatMap((input) =>
    Array.from({ length: TIER_REPEATS[tier] }, (_unused, index) => ({
      inputId: input.id,
      repeat: index + 1,
      form: input.form,
    })),
  );

export const mismatchedFormFor = (inputId: string): PlanForm | null => {
  const index = EVAL_INPUTS.findIndex((input) => input.id === inputId);
  if (index === -1) {
    return null;
  }
  return EVAL_INPUTS[(index + 1) % EVAL_INPUTS.length].form;
};
