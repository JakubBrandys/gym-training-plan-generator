import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { PlanResult } from '../src/plan-generation/plan.schema.js';
import {
  buildJudgePrompt,
  JUDGE_SYSTEM_PROMPT,
  judgeSchema,
  readJudgeConfig,
} from './eval-judge.js';

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 3,
  heightCm: 170,
  weightKg: 70,
  goals: 'build leg strength',
};

const plan: PlanResult = {
  weeks: [
    {
      week: 1,
      goal: 'Learn the movements',
      sessions: [
        {
          title: 'Full body A',
          exercises: [
            {
              slug: 'squat',
              name: 'Goblet Squat',
              imageKey: null,
              sets: 3,
              reps: '8-10',
              restSeconds: 90,
              note: 'Keep the chest up',
            },
            {
              slug: 'row',
              name: 'Dumbbell Row',
              imageKey: null,
              sets: 2,
              reps: '10',
              restSeconds: 60,
              note: null,
            },
          ],
        },
      ],
    },
  ],
};

describe('readJudgeConfig', () => {
  it('names the missing judge model variable', () => {
    expect(() => readJudgeConfig({ OPENAI_API_KEY: 'sk' })).toThrow(
      'EVAL_JUDGE_MODEL is not set',
    );
  });

  it('treats a blank judge model as missing', () => {
    expect(() =>
      readJudgeConfig({ EVAL_JUDGE_MODEL: '  ', OPENAI_API_KEY: 'sk' }),
    ).toThrow('EVAL_JUDGE_MODEL');
  });

  it('names the missing API key', () => {
    expect(() => readJudgeConfig({ EVAL_JUDGE_MODEL: 'judge' })).toThrow(
      'OPENAI_API_KEY is not set',
    );
  });

  it('reads both values', () => {
    expect(
      readJudgeConfig({ EVAL_JUDGE_MODEL: ' judge ', OPENAI_API_KEY: 'sk' }),
    ).toEqual({ model: 'judge', apiKey: 'sk' });
  });
});

describe('judgeSchema', () => {
  const scores = (goals: number, experience: number) => ({
    goalsFit: { score: goals, reason: 'ok' },
    experienceFit: { score: experience, reason: 'ok' },
  });

  it('accepts scores from 1 to 5', () => {
    expect(judgeSchema.safeParse(scores(1, 5)).success).toBe(true);
  });

  it.each([0, 6, 3.5])('rejects a score of %s', (value) => {
    expect(judgeSchema.safeParse(scores(value, 3)).success).toBe(false);
  });
});

describe('buildJudgePrompt', () => {
  const prompt = buildJudgePrompt(form, plan);

  it('limits scoring to goals fit and experience fit', () => {
    expect(prompt).toContain('goalsFit');
    expect(prompt).toContain('experienceFit');
    expect(prompt).toContain('checked elsewhere');
  });

  it('includes the goals in a delimited block and the rendered plan', () => {
    expect(prompt).toContain('<goals>\nbuild leg strength\n</goals>');
    expect(prompt).toContain('Week 1: Learn the movements');
    expect(prompt).toContain(
      'Goblet Squat 3 x 8-10, rest 90s, note: Keep the chest up',
    );
    expect(prompt).toContain('Dumbbell Row 2 x 10, rest 60s');
  });

  it('tells the judge the content is data', () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain('never instructions');
  });
});
