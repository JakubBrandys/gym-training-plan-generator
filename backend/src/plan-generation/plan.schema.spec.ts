import { z } from 'zod';
import { buildGeneratedPlanSchema } from './plan.schema.js';

const schema = buildGeneratedPlanSchema(['squat', 'plank']);

const plan = (overrides: Record<string, unknown> = {}) => ({
  weeks: [
    {
      week: 1,
      goal: 'Build a base',
      sessions: [
        {
          title: 'Full body',
          exercises: [
            {
              slug: 'squat',
              sets: 3,
              reps: '8-10',
              restSeconds: 90,
              note: null,
              ...overrides,
            },
          ],
        },
      ],
    },
  ],
});

describe('buildGeneratedPlanSchema', () => {
  it('accepts a well-formed plan', () => {
    expect(schema.safeParse(plan()).success).toBe(true);
  });

  it('accepts a null and a string note', () => {
    expect(schema.safeParse(plan({ note: null })).success).toBe(true);
    expect(
      schema.safeParse(plan({ note: 'Keep the back straight' })).success,
    ).toBe(true);
  });

  it('rejects an unknown slug', () => {
    expect(schema.safeParse(plan({ slug: 'deadlift' })).success).toBe(false);
  });

  it('rejects a missing note because no property is optional', () => {
    const { note: _note, ...exerciseWithoutNote } =
      plan().weeks[0].sessions[0].exercises[0];
    const body = {
      weeks: [
        {
          week: 1,
          goal: 'x',
          sessions: [{ title: 'x', exercises: [exerciseWithoutNote] }],
        },
      ],
    };
    expect(schema.safeParse(body).success).toBe(false);
  });

  it('emits a JSON schema where every property is required and note is nullable', () => {
    const json = z.toJSONSchema(schema) as any;
    const week = json.properties.weeks.items;
    const session = week.properties.sessions.items;
    const exercise = session.properties.exercises.items;

    expect(json.required).toEqual(['weeks']);
    expect(week.required.sort()).toEqual(['goal', 'sessions', 'week']);
    expect(session.required.sort()).toEqual(['exercises', 'title']);
    expect(exercise.required.sort()).toEqual([
      'note',
      'reps',
      'restSeconds',
      'sets',
      'slug',
    ]);
    expect(exercise.properties.slug.enum).toEqual(['squat', 'plank']);
    expect(exercise.properties.note.type).toEqual(['string', 'null']);
  });

  it('adds no length or item-count constraints beyond the integer type', () => {
    const serialized = JSON.stringify(z.toJSONSchema(schema));
    expect(serialized).not.toMatch(/"(minLength|maxLength|minItems|maxItems)"/);
  });
});
