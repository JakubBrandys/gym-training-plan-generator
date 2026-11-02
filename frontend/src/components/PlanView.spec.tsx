import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanResult } from '../lib/plan-generation'
import { PlanView, PlanViewContent } from './PlanView'

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

const renderAt = (hash: string, details?: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[`/plans/abc${hash}`]}>
      <PlanView plan={plan} details={details} />
    </MemoryRouter>,
  )

describe('PlanView', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows only week 1 when there is no hash', () => {
    renderAt('')

    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Week 2' })).toBeNull()
    expect(screen.getByText('Build a base')).toBeTruthy()
    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByText('Overhead Press')).toBeTruthy()
    expect(screen.queryByText('Barbell Row')).toBeNull()
  })

  it('shows only week 2 for the #week-2 hash', () => {
    renderAt('#week-2')

    expect(screen.getByRole('heading', { level: 2, name: 'Week 2' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Week 1' })).toBeNull()
    expect(screen.getByText('Add volume')).toBeTruthy()
    expect(screen.getByText('Barbell Row')).toBeTruthy()
    expect(screen.queryByText('Bench Press')).toBeNull()
  })

  it.each(['#week-9', '#week-0', '#foo', '#week-02'])('shows week 1 for the invalid hash %s', (hash) => {
    renderAt(hash)

    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Week 2' })).toBeNull()
  })

  it('renders exactly one level-2 heading', () => {
    renderAt('')

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
  })

  it('gives the week section an id that matches its hash', () => {
    renderAt('#week-2')

    expect(document.getElementById('week-2')).toBeTruthy()
    expect(document.getElementById('week-1')).toBeNull()
  })

  it('renders each session as a numbered heading with its exercise count', () => {
    renderAt('')

    expect(screen.getByRole('heading', { level: 3, name: 'Session 1 · Push day' })).toBeTruthy()
    expect(screen.getByText('2 exercises')).toBeTruthy()
  })

  it('uses the singular for a session with one exercise', () => {
    renderAt('#week-2')

    expect(screen.getByRole('heading', { level: 3, name: 'Session 1 · Pull day' })).toBeTruthy()
    expect(screen.getByText('1 exercise')).toBeTruthy()
  })

  it('renders sets, reps and rest as separate chips', () => {
    renderAt('')

    expect(screen.getByText('3 × 8-10').className).toBe('chip')
    expect(screen.getByText('rest 90 s').className).toBe('chip')
    expect(screen.getByText('4 × 6').className).toBe('chip')
    expect(screen.getByText('rest 120 s').className).toBe('chip')
  })

  it('renders the note of an exercise that has one', () => {
    renderAt('')

    expect(screen.getByText('Keep core tight')).toBeTruthy()
  })

  it('renders the week switcher with the current week marked', () => {
    renderAt('#week-2')

    expect(screen.getByRole('link', { name: 'Week 2' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Week 1' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'Week 1' }).getAttribute('href')).toBe('/plans/abc#week-1')
  })

  it('shows only a next link in the pager on the first week', () => {
    renderAt('')

    expect(screen.queryByRole('link', { name: /Previous week/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Next week (Week 2)' })).toBeTruthy()
  })

  it('shows only a previous link in the pager on the last week', () => {
    renderAt('#week-2')

    expect(screen.queryByRole('link', { name: /Next week/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Previous week (Week 1)' })).toBeTruthy()
  })

  it('switches weeks when a week link is clicked', () => {
    renderAt('')

    fireEvent.click(screen.getByRole('link', { name: 'Week 2' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Week 2' })).toBeTruthy()
    expect(screen.getByText('Barbell Row')).toBeTruthy()
  })

  it('renders an image with the expected src and alt for exercises that have an image key', () => {
    renderAt('')

    const benchPress = screen.getByAltText('Bench Press, start and end position')

    expect(benchPress.getAttribute('src')).toBe('/exercises/bench-press.jpg')
  })

  it('renders only the images of the selected week', () => {
    renderAt('#week-2')

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByAltText('Barbell Row, start and end position').getAttribute('src')).toBe(
      '/exercises/barbell-row.jpg',
    )
  })

  it('lazy-loads exercise images with fixed square dimensions of 64', () => {
    renderAt('')

    const images = screen.getAllByRole('img')

    expect(images).toHaveLength(1)
    for (const image of images) {
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('width')).toBe('64')
      expect(image.getAttribute('height')).toBe('64')
    }
  })

  it('does not render an image for an exercise without an image key', () => {
    renderAt('')

    expect(screen.queryByAltText('Overhead Press, start and end position')).toBeNull()
    expect(screen.getByText('Overhead Press')).toBeTruthy()
  })

  it('removes only the failed image and keeps the exercise text and chips', () => {
    renderAt('')

    fireEvent.error(screen.getByAltText('Bench Press, start and end position'))

    expect(screen.queryByAltText('Bench Press, start and end position')).toBeNull()
    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByText('3 × 8-10')).toBeTruthy()
    expect(screen.getByText('rest 90 s')).toBeTruthy()
  })

  it('shows the derived plan summary', () => {
    renderAt('')

    expect(screen.getByRole('group', { name: 'Plan summary' })).toBeTruthy()
    expect(screen.getByText('2 weeks · 1 session a week')).toBeTruthy()
    expect(screen.getByText('2 sessions · 3 different exercises')).toBeTruthy()
  })

  it('renders the details inside the summary when they are given', () => {
    renderAt('', <p>Saved details</p>)

    const summary = screen.getByRole('group', { name: 'Plan summary' })
    expect(summary.textContent).toContain('Saved details')
  })

  it('renders no details when none are given', () => {
    renderAt('')

    expect(screen.queryByText('Saved details')).toBeNull()
  })
})

describe('PlanViewContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the week it is given, whatever the location hash says', () => {
    render(
      <MemoryRouter initialEntries={['/plans/abc#week-1']}>
        <PlanViewContent plan={plan} week={2} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Week 2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Week 2' }).getAttribute('aria-current')).toBe('page')
  })

  it('falls back to the first week when the week does not exist', () => {
    render(
      <MemoryRouter initialEntries={['/plans/abc']}>
        <PlanViewContent plan={plan} week={5} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
  })
})
