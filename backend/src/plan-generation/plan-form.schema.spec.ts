import { planFormSchema } from './plan-form.schema.js';

const validForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 5,
  heightCm: 180,
  weightKg: 80.5,
  goals: 'Build strength',
};

const accepts = (overrides: Record<string, unknown>): boolean =>
  planFormSchema.safeParse({ ...validForm, ...overrides }).success;

describe('planFormSchema', () => {
  it('accepts a valid form', () => {
    expect(planFormSchema.parse(validForm)).toEqual(validForm);
  });

  it.each(['beginner', 'intermediate', 'expert'])(
    'accepts experience %s',
    (experience) => {
      expect(accepts({ experience })).toBe(true);
    },
  );

  it('rejects an unknown experience', () => {
    expect(accepts({ experience: 'pro' })).toBe(false);
  });

  it.each(['currentFrequency', 'desiredFrequency'])(
    'enforces integers 1-7 for %s',
    (field) => {
      expect(accepts({ [field]: 1 })).toBe(true);
      expect(accepts({ [field]: 7 })).toBe(true);
      expect(accepts({ [field]: 0 })).toBe(false);
      expect(accepts({ [field]: 8 })).toBe(false);
      expect(accepts({ [field]: 2.5 })).toBe(false);
      expect(accepts({ [field]: '3' })).toBe(false);
    },
  );

  it('enforces integer heightCm 100-250', () => {
    expect(accepts({ heightCm: 100 })).toBe(true);
    expect(accepts({ heightCm: 250 })).toBe(true);
    expect(accepts({ heightCm: 99 })).toBe(false);
    expect(accepts({ heightCm: 251 })).toBe(false);
    expect(accepts({ heightCm: 180.5 })).toBe(false);
  });

  it('enforces weightKg 30-300 and allows decimals', () => {
    expect(accepts({ weightKg: 30 })).toBe(true);
    expect(accepts({ weightKg: 300 })).toBe(true);
    expect(accepts({ weightKg: 29.9 })).toBe(false);
    expect(accepts({ weightKg: 300.1 })).toBe(false);
  });

  it('trims goals and rejects empty or whitespace-only goals', () => {
    expect(
      planFormSchema.parse({ ...validForm, goals: '  lift  ' }).goals,
    ).toBe('lift');
    expect(accepts({ goals: '' })).toBe(false);
    expect(accepts({ goals: '    ' })).toBe(false);
  });

  it('accepts goals of exactly 500 characters and rejects 501', () => {
    expect(accepts({ goals: 'a'.repeat(500) })).toBe(true);
    expect(accepts({ goals: 'a'.repeat(501) })).toBe(false);
    expect(accepts({ goals: `  ${'a'.repeat(500)}  ` })).toBe(true);
  });

  it('rejects missing fields', () => {
    const { goals: _goals, ...withoutGoals } = validForm;
    expect(planFormSchema.safeParse(withoutGoals).success).toBe(false);
  });
});
