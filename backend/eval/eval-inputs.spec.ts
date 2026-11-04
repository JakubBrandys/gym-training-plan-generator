import { planFormSchema } from '../src/plan-generation/plan-form.schema.js';
import {
  buildJobSpecs,
  EVAL_INPUTS,
  mismatchedFormFor,
  tierInputs,
} from './eval-inputs.js';

describe('eval inputs', () => {
  it('has eight inputs with unique ids', () => {
    expect(EVAL_INPUTS).toHaveLength(8);
    expect(new Set(EVAL_INPUTS.map((input) => input.id)).size).toBe(8);
  });

  it.each(EVAL_INPUTS.map((input) => [input.id, input.form] as const))(
    '%s is a form the app accepts',
    (_id, form) => {
      expect(planFormSchema.safeParse(form).success).toBe(true);
    },
  );

  it('gives every input different goals text', () => {
    expect(new Set(EVAL_INPUTS.map((input) => input.form.goals)).size).toBe(8);
  });

  it('keeps the three 2026-10-24 profiles first', () => {
    expect(
      EVAL_INPUTS.slice(0, 3).map((input) => [
        input.form.experience,
        input.form.currentFrequency,
        input.form.desiredFrequency,
      ]),
    ).toEqual([
      ['expert', 5, 5],
      ['beginner', 2, 4],
      ['intermediate', 3, 5],
    ]);
  });

  it('covers both ramp extremes and a flat plan', () => {
    const ramps = EVAL_INPUTS.map(
      (input) =>
        `${input.form.currentFrequency}-${input.form.desiredFrequency}`,
    );
    expect(ramps).toEqual(expect.arrayContaining(['1-7', '7-1', '3-3']));
  });

  it('smoke tier is the first three inputs once each', () => {
    expect(tierInputs('smoke').map((input) => input.id)).toEqual([
      'expert-5-5-strength',
      'beginner-2-4-general',
      'intermediate-3-5-hypertrophy',
    ]);
    expect(buildJobSpecs('smoke')).toHaveLength(3);
  });

  it('full tier is 24 jobs, three repeats per input', () => {
    const specs = buildJobSpecs('full');
    expect(specs).toHaveLength(24);
    expect(specs.filter((spec) => spec.inputId === 'expert-7-1-taper')).toEqual(
      [
        expect.objectContaining({ repeat: 1 }),
        expect.objectContaining({ repeat: 2 }),
        expect.objectContaining({ repeat: 3 }),
      ],
    );
  });

  it('mismatched form differs from the own form in experience and goals', () => {
    EVAL_INPUTS.forEach((input) => {
      const other = mismatchedFormFor(input.id);
      expect(other).not.toBeNull();
      expect(other?.goals).not.toBe(input.form.goals);
      expect(other?.experience).not.toBe(input.form.experience);
    });
  });

  it('has no mismatched form for an unknown input id', () => {
    expect(mismatchedFormFor('not-an-input')).toBeNull();
  });
});
