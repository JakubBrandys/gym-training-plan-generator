import { describe, expect, it } from 'vitest'
import { formatCount, formatRamp, planStats } from './plan-stats'
import type { PlanResult, PlanResultExercise } from './plan-generation'

const exercise = (slug: string): PlanResultExercise => ({
  slug,
  name: slug,
  sets: 3,
  reps: '8-10',
  restSeconds: 90,
  note: null,
  imageKey: null,
})

const week = (number: number, sessionSlugs: string[][]) => ({
  week: number,
  goal: `Goal ${number}`,
  sessions: sessionSlugs.map((slugs, index) => ({
    title: `Session ${index + 1}`,
    exercises: slugs.map(exercise),
  })),
})

const rampedPlan: PlanResult = {
  weeks: [
    week(1, [['squat', 'press'], ['row', 'curl'], ['deadlift', 'plank']]),
    week(2, [['squat', 'press'], ['row', 'curl'], ['deadlift', 'plank'], ['squat', 'dips']]),
  ],
}

describe('planStats', () => {
  it('counts weeks, sessions and the first and last week sessions', () => {
    expect(planStats(rampedPlan)).toMatchObject({
      weeks: 2,
      firstWeekSessions: 3,
      lastWeekSessions: 4,
      sessions: 7,
    })
  })

  it('counts a repeated exercise once', () => {
    const stats = planStats(rampedPlan)

    expect(stats.differentExercises).toBe(7)
  })

  it('counts one different exercise when the same exercise fills every row', () => {
    const plan: PlanResult = {
      weeks: [week(1, [['squat', 'squat'], ['squat']]), week(2, [['squat']])],
    }

    expect(planStats(plan).differentExercises).toBe(1)
  })

  it('returns zeros for a plan without weeks', () => {
    expect(planStats({ weeks: [] })).toEqual({
      weeks: 0,
      firstWeekSessions: 0,
      lastWeekSessions: 0,
      sessions: 0,
      differentExercises: 0,
    })
  })
})

describe('formatCount', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(formatCount(1, 'week')).toBe('1 week')
    expect(formatCount(8, 'week')).toBe('8 weeks')
    expect(formatCount(0, 'week')).toBe('0 weeks')
    expect(formatCount(1, 'different exercise')).toBe('1 different exercise')
  })
})

describe('formatRamp', () => {
  it('shows the ramp when the first and last week differ', () => {
    expect(formatRamp(planStats(rampedPlan))).toBe('3→4 sessions a week')
  })

  it('shows a single number when the first and last week are equal', () => {
    const plan: PlanResult = {
      weeks: [week(1, [['squat'], ['row'], ['press'], ['curl']]), week(2, [['squat'], ['row'], ['press'], ['curl']])],
    }

    expect(formatRamp(planStats(plan))).toBe('4 sessions a week')
  })

  it('uses the singular for one session a week', () => {
    const plan: PlanResult = { weeks: [week(1, [['squat']])] }

    expect(formatRamp(planStats(plan))).toBe('1 session a week')
  })
})
