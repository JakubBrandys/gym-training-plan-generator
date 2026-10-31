import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
            {
              slug: 'bench-press',
              name: 'Bench Press',
              sets: 3,
              reps: '8-10',
              restSeconds: 90,
              note: null,
              imageKey: 'exercises/bench-press.jpg',
            },
            {
              slug: 'overhead-press',
              name: 'Overhead Press',
              sets: 4,
              reps: '6',
              restSeconds: 120,
              note: 'Keep core tight',
              imageKey: null,
            },
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
          exercises: [
            {
              slug: 'barbell-row',
              name: 'Barbell Row',
              sets: 5,
              reps: '5',
              restSeconds: 150,
              note: null,
              imageKey: 'exercises/barbell-row.jpg',
            },
          ],
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

  it('renders an image with the expected src and alt for exercises that have an image key', () => {
    render(<PlanView plan={plan} />)

    const benchPress = screen.getByAltText('Bench Press, start and end position')
    const barbellRow = screen.getByAltText('Barbell Row, start and end position')

    expect(benchPress.getAttribute('src')).toBe('/exercises/bench-press.jpg')
    expect(barbellRow.getAttribute('src')).toBe('/exercises/barbell-row.jpg')
  })

  it('lazy-loads exercise images with fixed dimensions', () => {
    render(<PlanView plan={plan} />)

    const images = screen.getAllByRole('img')

    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('width')).toBe(image.getAttribute('height'))
      expect(Number(image.getAttribute('width'))).toBeGreaterThan(0)
    }
  })

  it('does not render an image for an exercise without an image key', () => {
    render(<PlanView plan={plan} />)

    expect(screen.queryByAltText('Overhead Press, start and end position')).toBeNull()
    expect(screen.getByText('Overhead Press')).toBeTruthy()
  })

  it('removes only the failed image and keeps the exercise text', () => {
    render(<PlanView plan={plan} />)

    fireEvent.error(screen.getByAltText('Bench Press, start and end position'))

    expect(screen.queryByAltText('Bench Press, start and end position')).toBeNull()
    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByText('3 × 8-10, rest 90 s')).toBeTruthy()
    expect(screen.getByAltText('Barbell Row, start and end position')).toBeTruthy()
  })
})
