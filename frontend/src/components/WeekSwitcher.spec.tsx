import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { WeekSwitcher } from './WeekSwitcher'

const renderSwitcher = (current: number, weekCount = 8) =>
  render(
    <MemoryRouter initialEntries={['/plans/abc']}>
      <WeekSwitcher weekCount={weekCount} current={current} />
    </MemoryRouter>,
  )

describe('WeekSwitcher', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a labelled navigation with one link per week', () => {
    renderSwitcher(1)

    const nav = screen.getByRole('navigation', { name: 'Weeks' })
    expect(nav.querySelectorAll('a')).toHaveLength(8)
    expect(screen.getByText('W1')).toBeTruthy()
    expect(screen.getByText('W8')).toBeTruthy()
  })

  it('links every week to its hash and gives each link an accessible name', () => {
    renderSwitcher(1)

    expect(screen.getByRole('link', { name: 'Week 3' }).getAttribute('href')).toBe('/plans/abc#week-3')
    expect(screen.getByRole('link', { name: 'Week 8' }).getAttribute('href')).toBe('/plans/abc#week-8')
  })

  it('marks only the current week as the current page', () => {
    const { container } = renderSwitcher(4)

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Week 4' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Week 3' }).getAttribute('aria-current')).toBeNull()
  })

  it('renders as many links as the plan has weeks', () => {
    renderSwitcher(1, 3)

    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('replaces the history entry when a week is chosen', () => {
    const router = createMemoryRouter(
      [{ path: '/plans/:id', element: <WeekSwitcher weekCount={8} current={1} /> }],
      { initialEntries: ['/plans/abc'] },
    )
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'Week 3' }))

    expect(router.state.location.hash).toBe('#week-3')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
