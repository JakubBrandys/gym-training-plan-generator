import { describe, expect, it } from 'vitest'
import { buildSamplePlan } from '../dev/sample-plan'
import { isPlanResult } from './plan-generation'

const minimalExercise = {
  slug: 'plank',
  name: 'Plank',
  sets: 3,
  reps: '30 s',
  restSeconds: 60,
  note: null,
  imageKey: null,
}

const planWith = (exercise: unknown) => ({
  weeks: [{ week: 1, goal: 'Base', sessions: [{ title: 'Core', exercises: [exercise] }] }],
})

const withoutKey = (key: string) => {
  const { [key]: _removed, ...rest } = minimalExercise as Record<string, unknown>
  return rest
}

describe('isPlanResult', () => {
  it('accepts the dev sample plan', () => {
    expect(isPlanResult(buildSamplePlan())).toBe(true)
  })

  it('accepts a minimal plan with a null note and a null imageKey', () => {
    expect(isPlanResult(planWith(minimalExercise))).toBe(true)
  })

  it('accepts extra fields so the persisted shape can grow additively', () => {
    expect(
      isPlanResult({
        weeks: [
          {
            week: 1,
            goal: 'Base',
            tip: 'extra',
            sessions: [{ title: 'Core', extra: 1, exercises: [{ ...minimalExercise, tempo: '3-1-1' }] }],
          },
        ],
        generatedBy: 'model',
      }),
    ).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'plan'],
    ['an empty object', {}],
    ['empty weeks', { weeks: [] }],
    ['weeks that is an object', { weeks: {} }],
    ['a null week', { weeks: [null] }],
    ['a week without sessions', { weeks: [{ week: 1, goal: 'Base' }] }],
    ['a week with a string number', { weeks: [{ week: '1', goal: 'Base', sessions: [] }] }],
    ['a week without a goal', { weeks: [{ week: 1, sessions: [] }] }],
    ['a session without exercises', { weeks: [{ week: 1, goal: 'Base', sessions: [{ title: 'Core' }] }] }],
    ['a session without a title', { weeks: [{ week: 1, goal: 'Base', sessions: [{ exercises: [] }] }] }],
    ['an exercise with a numeric slug', planWith({ ...minimalExercise, slug: 7 })],
    ['an exercise with a string sets', planWith({ ...minimalExercise, sets: '3' })],
    ['an exercise with a missing note', planWith(withoutKey('note'))],
    ['an exercise with a missing imageKey', planWith(withoutKey('imageKey'))],
    ['a valid week followed by a null week', { weeks: [...planWith(minimalExercise).weeks, null] }],
  ])('rejects %s', (_label, value) => {
    expect(isPlanResult(value)).toBe(false)
  })
})
