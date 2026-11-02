import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanResult, PlanResultExercise } from '../lib/plan-generation'
import { PlanSummary } from './PlanSummary'

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

const plan: PlanResult = {
  weeks: [
    week(1, [['squat', 'press'], ['row', 'curl'], ['deadlift', 'plank']]),
    week(2, [['squat', 'press'], ['row', 'curl'], ['deadlift', 'plank'], ['squat', 'dips', 'lunge']]),
  ],
}

describe('PlanSummary', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the derived weeks, ramp, sessions and different exercises', () => {
    render(<PlanSummary plan={plan} />)

    expect(screen.getByText('2 weeks · 3→4 sessions a week')).toBeTruthy()
    expect(screen.getByText('7 sessions · 8 different exercises')).toBeTruthy()
  })

  it('uses the singular for a one-week plan with one session', () => {
    render(<PlanSummary plan={{ weeks: [week(1, [['squat']])] }} />)

    expect(screen.getByText('1 week · 1 session a week')).toBeTruthy()
    expect(screen.getByText('1 session · 1 different exercise')).toBeTruthy()
  })

  it('is a labelled group', () => {
    render(<PlanSummary plan={plan} />)

    expect(screen.getByRole('group', { name: 'Plan summary' })).toBeTruthy()
  })

  it('renders its children after the statistics', () => {
    render(
      <PlanSummary plan={plan}>
        <p>Saved details</p>
      </PlanSummary>,
    )

    const group = screen.getByRole('group', { name: 'Plan summary' })
    expect(group.lastElementChild?.textContent).toBe('Saved details')
  })

  it('renders only the statistics when no children are given', () => {
    render(<PlanSummary plan={plan} />)

    expect(screen.getByRole('group', { name: 'Plan summary' }).children).toHaveLength(2)
  })

  it('adds no heading', () => {
    render(<PlanSummary plan={plan} />)

    expect(screen.queryByRole('heading')).toBeNull()
  })
})
