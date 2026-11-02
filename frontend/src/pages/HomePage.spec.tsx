import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage />
    </MemoryRouter>,
  )

describe('HomePage', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows a Welcome heading and one sentence about the plan', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeTruthy()
    expect(
      screen.getByText(
        'Generate an AI-assisted 8-week training plan from your experience, schedule and goals.',
      ),
    ).toBeTruthy()
  })

  it('offers the primary action to create a training plan', () => {
    renderPage()

    const link = screen.getByRole('link', { name: 'Create a training plan' })
    expect(link.getAttribute('href')).toBe('/plans/new')
    expect(link.className).toBe('btn')
  })

  it('no longer carries the header controls', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'My plans' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Registered users' })).toBeNull()
  })
})
