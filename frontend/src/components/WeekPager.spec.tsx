import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { WeekPager } from './WeekPager'

const renderPager = (current: number, weekCount = 8) =>
  render(
    <MemoryRouter initialEntries={['/plans/abc']}>
      <WeekPager weekCount={weekCount} current={current} />
    </MemoryRouter>,
  )

describe('WeekPager', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a labelled navigation', () => {
    renderPager(3)

    expect(screen.getByRole('navigation', { name: 'Week pager' })).toBeTruthy()
  })

  it('links to the previous and next week in the middle of the plan', () => {
    renderPager(3)

    expect(screen.getByRole('link', { name: 'Previous week (Week 2)' }).getAttribute('href')).toBe(
      '/plans/abc#week-2',
    )
    expect(screen.getByRole('link', { name: 'Next week (Week 4)' }).getAttribute('href')).toBe(
      '/plans/abc#week-4',
    )
  })

  it('has no previous link on the first week', () => {
    renderPager(1)

    expect(screen.queryByRole('link', { name: /Previous week/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Next week (Week 2)' })).toBeTruthy()
  })

  it('has no next link on the last week', () => {
    renderPager(8)

    expect(screen.queryByRole('link', { name: /Next week/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Previous week (Week 7)' })).toBeTruthy()
  })

  it('has no links in a one-week plan', () => {
    renderPager(1, 1)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('shows the week number as visible text', () => {
    renderPager(3)

    expect(screen.getByRole('link', { name: 'Previous week (Week 2)' }).textContent).toBe('‹ Week 2')
    expect(screen.getByRole('link', { name: 'Next week (Week 4)' }).textContent).toBe('Week 4 ›')
  })

  it('replaces the history entry when a week is chosen', () => {
    const router = createMemoryRouter(
      [{ path: '/plans/:id', element: <WeekPager weekCount={8} current={3} /> }],
      { initialEntries: ['/plans/abc'] },
    )
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'Next week (Week 4)' }))

    expect(router.state.location.hash).toBe('#week-4')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
