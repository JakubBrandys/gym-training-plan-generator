import type { GeneratedPlan } from '../src/plan-generation/plan.schema.js';
import {
  aboveLevelShare,
  callValidity,
  meanDistinctMusclesPerWeek,
  weekRepetitionRate,
  type PlanLike,
} from './eval-metrics.js';

const catalog = [
  {
    slug: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    level: 'BEGINNER' as const,
  },
  { slug: 'bench', primaryMuscles: ['chest'], level: 'BEGINNER' as const },
  {
    slug: 'deadlift',
    primaryMuscles: ['hamstrings'],
    level: 'INTERMEDIATE' as const,
  },
  {
    slug: 'leg-raise',
    primaryMuscles: ['abdominals'],
    level: 'EXPERT' as const,
  },
];

const week = (...slugs: string[]): PlanLike['weeks'][number] => ({
  sessions: [{ exercises: slugs.map((slug) => ({ slug, sets: 3 })) }],
});

describe('weekRepetitionRate', () => {
  it('is null for fewer than two weeks', () => {
    expect(weekRepetitionRate({ weeks: [] })).toBeNull();
    expect(weekRepetitionRate({ weeks: [week('squat')] })).toBeNull();
  });

  it('counts weeks equal to the previous week in slugs, order and sets', () => {
    const plan = {
      weeks: [
        week('squat', 'bench'),
        week('squat', 'bench'),
        week('bench', 'squat'),
        week('bench', 'squat'),
      ],
    };
    expect(weekRepetitionRate(plan)).toBeCloseTo(2 / 3);
  });

  it('flags the plank case: same slugs and sets, only reps and notes differ', () => {
    const plankWeek = (reps: string, note: string) => ({
      sessions: [
        {
          exercises: [
            { slug: 'squat', sets: 3, reps: '8-10', note: null },
            { slug: 'plank', sets: 2, reps, note },
          ],
        },
      ],
    });
    const plan = {
      weeks: [
        plankWeek('30 sec', 'hold'),
        plankWeek('40 sec', 'brace'),
        plankWeek('50 sec', 'breathe'),
      ],
    };
    expect(weekRepetitionRate(plan)).toBe(1);
  });

  it('does not flag a week with different sets', () => {
    const changed = week('squat');
    changed.sessions[0].exercises[0].sets = 4;
    expect(weekRepetitionRate({ weeks: [week('squat'), changed] })).toBe(0);
  });

  it('does not flag a week with a different session count', () => {
    const twoSessions = {
      sessions: [week('squat').sessions[0], week('squat').sessions[0]],
    };
    expect(weekRepetitionRate({ weeks: [week('squat'), twoSessions] })).toBe(0);
  });
});

describe('meanDistinctMusclesPerWeek', () => {
  it('is null for an empty plan', () => {
    expect(meanDistinctMusclesPerWeek({ weeks: [] }, catalog)).toBeNull();
  });

  it('averages the distinct primary muscles of each week', () => {
    const plan = {
      weeks: [week('squat', 'bench'), week('bench')],
    };
    expect(meanDistinctMusclesPerWeek(plan, catalog)).toBe((3 + 1) / 2);
  });

  it('skips slugs missing from the catalog without throwing', () => {
    expect(
      meanDistinctMusclesPerWeek({ weeks: [week('ghost', 'bench')] }, catalog),
    ).toBe(1);
  });
});

describe('aboveLevelShare', () => {
  const plan = { weeks: [week('squat', 'deadlift', 'leg-raise', 'ghost')] };

  it('counts exercises above a beginner, ignoring unknown slugs', () => {
    expect(aboveLevelShare(plan, catalog, 'beginner')).toBeCloseTo(2 / 3);
  });

  it('allows the trainee own level and below', () => {
    expect(aboveLevelShare(plan, catalog, 'intermediate')).toBeCloseTo(1 / 3);
  });

  it('is zero for an expert by construction', () => {
    expect(aboveLevelShare(plan, catalog, 'expert')).toBe(0);
  });

  it('is null when no slug is in the catalog', () => {
    expect(
      aboveLevelShare({ weeks: [week('ghost')] }, catalog, 'beginner'),
    ).toBeNull();
  });
});

describe('callValidity', () => {
  const form = { currentFrequency: 1, desiredFrequency: 1 };
  const slugs = ['squat', 'bench', 'deadlift'];
  const validWeek = (number: number) => ({
    week: number,
    goal: 'goal',
    sessions: [
      {
        title: 'Session',
        exercises: slugs.map((slug) => ({
          slug,
          sets: 3,
          reps: '8-10',
          restSeconds: 90,
          note: null,
        })),
      },
    ],
  });

  it('accepts a plan the production validator accepts', () => {
    const plan: GeneratedPlan = {
      weeks: Array.from({ length: 8 }, (_unused, index) =>
        validWeek(index + 1),
      ),
    };
    expect(callValidity(plan, form, slugs)).toEqual({
      ok: true,
      issueCount: 0,
    });
  });

  it('rejects a seven-week plan and counts its issues', () => {
    const plan: GeneratedPlan = {
      weeks: Array.from({ length: 7 }, (_unused, index) =>
        validWeek(index + 1),
      ),
    };
    const result = callValidity(plan, form, slugs);
    expect(result.ok).toBe(false);
    expect(result.issueCount).toBeGreaterThan(0);
  });
});
