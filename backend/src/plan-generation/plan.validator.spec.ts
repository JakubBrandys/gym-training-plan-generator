import type { GeneratedPlan } from './plan.schema.js';
import { validateGeneratedPlan } from './plan.validator.js';

const CATALOG = [
  'squat',
  'bench-press',
  'deadlift',
  'overhead-press',
  'barbell-row',
  'pull-up',
  'lunge',
  'plank',
  'dip',
  'curl',
  'calf-raise',
  'hip-thrust',
];

type Week = GeneratedPlan['weeks'][number];
type Session = Week['sessions'][number];
type Exercise = Session['exercises'][number];

const exercise = (
  slug: string,
  overrides: Partial<Exercise> = {},
): Exercise => ({
  slug,
  sets: 3,
  reps: '8-10',
  restSeconds: 90,
  note: null,
  ...overrides,
});

const session = (overrides: Partial<Session> = {}): Session => ({
  title: 'Full body',
  exercises: [
    exercise('squat'),
    exercise('bench-press'),
    exercise('barbell-row'),
  ],
  ...overrides,
});

const planWithSessionCounts = (counts: number[]): GeneratedPlan => ({
  weeks: counts.map((count, index) => ({
    week: index + 1,
    goal: `Week ${index + 1} focus`,
    sessions: Array.from({ length: count }, () => session()),
  })),
});

const form = (currentFrequency: number, desiredFrequency: number) => ({
  currentFrequency,
  desiredFrequency,
});

const issuesOf = (plan: GeneratedPlan, frequencies = form(3, 3)): string[] => {
  const result = validateGeneratedPlan(plan, frequencies, CATALOG);
  return result.ok ? [] : result.issues;
};

const flatPlan = (): GeneratedPlan =>
  planWithSessionCounts([3, 3, 3, 3, 3, 3, 3, 3]);

describe('validateGeneratedPlan frequency rule', () => {
  it('accepts a ramp from 3 to 5', () => {
    const plan = planWithSessionCounts([3, 3, 4, 4, 4, 5, 5, 5]);
    expect(validateGeneratedPlan(plan, form(3, 5), CATALOG)).toEqual({
      ok: true,
    });
  });

  it('accepts a flat plan when current equals desired', () => {
    expect(validateGeneratedPlan(flatPlan(), form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it('rejects movement when current equals desired', () => {
    const plan = planWithSessionCounts([3, 3, 3, 4, 3, 3, 3, 3]);
    expect(issuesOf(plan, form(3, 3)).length).toBeGreaterThan(0);
  });

  it('accepts a taper from 5 to 3', () => {
    const plan = planWithSessionCounts([5, 5, 4, 4, 4, 3, 3, 3]);
    expect(validateGeneratedPlan(plan, form(5, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it('accepts the 1 to 7 boundary as 1,2,3,4,5,6,7,7', () => {
    const plan = planWithSessionCounts([1, 2, 3, 4, 5, 6, 7, 7]);
    expect(validateGeneratedPlan(plan, form(1, 7), CATALOG)).toEqual({
      ok: true,
    });
  });

  it('rejects week 1 that does not equal the current frequency', () => {
    const plan = planWithSessionCounts([4, 4, 4, 4, 5, 5, 5, 5]);
    const issues = issuesOf(plan, form(3, 5));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Week 1 must have exactly 3'),
      ]),
    );
  });

  it('rejects week 8 that does not equal the desired frequency', () => {
    const plan = planWithSessionCounts([3, 3, 4, 4, 4, 4, 4, 4]);
    const issues = issuesOf(plan, form(3, 5));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Week 8 must have exactly 5'),
      ]),
    );
  });

  it('rejects a jump of two days between weeks', () => {
    const plan = planWithSessionCounts([3, 3, 3, 5, 5, 5, 5, 5]);
    const issues = issuesOf(plan, form(3, 5));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('week 3 has 3 and week 4 has 5'),
      ]),
    );
  });

  it('rejects movement away from the desired frequency', () => {
    const plan = planWithSessionCounts([3, 4, 3, 4, 5, 5, 5, 5]);
    const issues = issuesOf(plan, form(3, 5));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('week 2 has 4 and week 3 has 3'),
      ]),
    );
  });

  it('rejects a taper that moves upward', () => {
    const plan = planWithSessionCounts([5, 4, 5, 4, 4, 3, 3, 3]);
    expect(issuesOf(plan, form(5, 3)).length).toBeGreaterThan(0);
  });
});

describe('validateGeneratedPlan week count and numbering', () => {
  it('rejects 7 weeks', () => {
    const plan = planWithSessionCounts([3, 3, 3, 3, 3, 3, 3]);
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exactly 8 weeks, found 7'),
      ]),
    );
  });

  it('rejects 9 weeks', () => {
    const plan = planWithSessionCounts([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exactly 8 weeks, found 9'),
      ]),
    );
  });

  it('rejects weeks that are not numbered 1-8 in order', () => {
    const plan = flatPlan();
    plan.weeks[2].week = 5;
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Week 3 must be numbered 3, found 5'),
      ]),
    );
  });
});

describe('validateGeneratedPlan exercise rules', () => {
  const withSession = (replacement: Session): GeneratedPlan => {
    const plan = flatPlan();
    plan.weeks[0].sessions[0] = replacement;
    return plan;
  };

  it('rejects an unknown slug', () => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat'),
          exercise('moon-walk'),
          exercise('plank'),
        ],
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('moon-walk) is not in the exercise catalog'),
      ]),
    );
  });

  it('rejects a repeated slug within one session', () => {
    const plan = withSession(
      session({
        exercises: [exercise('squat'), exercise('plank'), exercise('squat')],
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('repeats the exercise squat'),
      ]),
    );
  });

  it('allows the same slug in different sessions', () => {
    expect(validateGeneratedPlan(flatPlan(), form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it.each([2, 11])('rejects %i exercises in a session', (count) => {
    const plan = withSession(
      session({
        exercises: CATALOG.slice(0, count).map((slug) => exercise(slug)),
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([expect.stringContaining(`found ${count}`)]),
    );
  });

  it.each([3, 10])('accepts %i exercises in a session', (count) => {
    const plan = withSession(
      session({
        exercises: CATALOG.slice(0, count).map((slug) => exercise(slug)),
      }),
    );
    expect(validateGeneratedPlan(plan, form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it.each([0, 9])('rejects %i sets', (sets) => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { sets }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([expect.stringContaining(`found ${sets}`)]),
    );
  });

  it.each([1, 8])('accepts %i sets', (sets) => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { sets }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(validateGeneratedPlan(plan, form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it.each([14, 601])('rejects %i seconds of rest', (restSeconds) => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { restSeconds }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([expect.stringContaining(`found ${restSeconds}`)]),
    );
  });

  it.each([15, 600])('accepts %i seconds of rest', (restSeconds) => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { restSeconds }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(validateGeneratedPlan(plan, form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it.each(['', '   ', 'x'.repeat(21)])('rejects reps %j', (reps) => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { reps }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reps must be 1-20 characters'),
      ]),
    );
  });

  it('accepts reps of exactly 20 characters', () => {
    const plan = withSession(
      session({
        exercises: [
          exercise('squat', { reps: 'x'.repeat(20) }),
          exercise('plank'),
          exercise('lunge'),
        ],
      }),
    );
    expect(validateGeneratedPlan(plan, form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });
});

describe('validateGeneratedPlan text length limits', () => {
  it('accepts texts at their limits', () => {
    const plan = flatPlan();
    plan.weeks[0].goal = 'g'.repeat(200);
    plan.weeks[0].sessions[0].title = 't'.repeat(80);
    plan.weeks[0].sessions[0].exercises[0].note = 'n'.repeat(200);
    expect(validateGeneratedPlan(plan, form(3, 3), CATALOG)).toEqual({
      ok: true,
    });
  });

  it('rejects an over-long note', () => {
    const plan = flatPlan();
    plan.weeks[0].sessions[0].exercises[0].note = 'n'.repeat(201);
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('note must be at most 200'),
      ]),
    );
  });

  it('rejects an over-long title', () => {
    const plan = flatPlan();
    plan.weeks[0].sessions[0].title = 't'.repeat(81);
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('title must be at most 80'),
      ]),
    );
  });

  it('rejects an over-long week goal', () => {
    const plan = flatPlan();
    plan.weeks[0].goal = 'g'.repeat(201);
    expect(issuesOf(plan)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('goal must be at most 200'),
      ]),
    );
  });
});

describe('validateGeneratedPlan issue reporting', () => {
  it('collects every issue rather than stopping at the first', () => {
    const plan = flatPlan();
    plan.weeks[0].goal = 'g'.repeat(201);
    plan.weeks[1].sessions[0].title = 't'.repeat(81);
    expect(issuesOf(plan).length).toBe(2);
  });
});
