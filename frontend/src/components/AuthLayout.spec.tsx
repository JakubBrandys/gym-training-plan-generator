import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthLayout } from './AuthLayout'

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route
            path="/sign-in"
            element={
              <main>
                <h1>Sign in</h1>
              </main>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('AuthLayout', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the page with the app name above it', () => {
    renderLayout()

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('Gym Training Plan Generator')).toBeTruthy()
  })

  it('has no navigation, banner or footer', () => {
    renderLayout()

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })

  it('does not add a heading of its own', () => {
    renderLayout()

    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
