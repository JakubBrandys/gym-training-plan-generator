import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanResult } from '../lib/plan-generation'
import { PlanView } from './PlanView'

const plan: PlanResult = {
  weeks: [
    {
      week: 1,
      goal: 'Build a base',
      sessions: [
        {
          title: 'Push day',
          exercises: [
            { slug: 'bench-press', name: 'Bench Press', sets: 3, reps: '8-10', restSeconds: 90, note: null },
            { slug: 'overhead-press', name: 'Overhead Press', sets: 4, reps: '6', restSeconds: 120, note: 'Keep core tight' },
          ],
        },
      ],
    },
    {
      week: 2,
      goal: 'Add volume',
      sessions: [
        {
          title: 'Pull day',
          exercises: [{ slug: 'barbell-row', name: 'Barbell Row', sets: 5, reps: '5', restSeconds: 150, note: null }],
        },
      ],
    },
  ],
}

describe('PlanView', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a heading for every week', () => {
    render(<PlanView plan={plan} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Week 2' })).toBeTruthy()
  })

  it('renders exercise names', () => {
    render(<PlanView plan={plan} />)

    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByText('Overhead Press')).toBeTruthy()
    expect(screen.getByText('Barbell Row')).toBeTruthy()
  })

  it('renders sets, reps and rest for each exercise', () => {
    render(<PlanView plan={plan} />)

    expect(screen.getByText('3 × 8-10, rest 90 s')).toBeTruthy()
    expect(screen.getByText('4 × 6, rest 120 s')).toBeTruthy()
    expect(screen.getByText('5 × 5, rest 150 s')).toBeTruthy()
  })
})
