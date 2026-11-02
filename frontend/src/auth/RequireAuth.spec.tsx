import { cleanup, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from './auth-context'
import { RequireAuth } from './RequireAuth'
import { useAuth } from './useAuth'

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }))

const useAuthMock = vi.mocked(useAuth)

const signedIn = { user: { id: 'user-1' } } as unknown as Session

const SignInProbe = () => {
  const location = useLocation()
  const state = location.state as { from?: { pathname?: string } } | null

  return <p data-testid="sign-in">{`from:${state?.from?.pathname ?? 'none'}`}</p>
}

const mockAuth = (value: Partial<AuthContextValue>) =>
  useAuthMock.mockReturnValue({
    session: null,
    loading: false,
    signOutReason: null,
    signOut: vi.fn(),
    ...value,
  })

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/plans/:id" element={<p>Protected page</p>} />
        </Route>
        <Route path="/sign-in" element={<SignInProbe />} />
      </Routes>
    </MemoryRouter>,
  )

describe('RequireAuth', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows a loading status while the session resolves', () => {
    mockAuth({ loading: true })
    renderAt('/plans/abc')

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText('Protected page')).toBeNull()
  })

  it('renders the protected page for a signed-in user', () => {
    mockAuth({ session: signedIn })
    renderAt('/plans/abc')

    expect(screen.getByText('Protected page')).toBeTruthy()
  })

  it('remembers the page when the session is lost without a reason', () => {
    mockAuth({ session: null, signOutReason: null })
    renderAt('/plans/abc')

    expect(screen.getByTestId('sign-in').textContent).toBe('from:/plans/abc')
  })

  it('remembers the page when the account was blocked', () => {
    mockAuth({ session: null, signOutReason: 'blocked' })
    renderAt('/plans/abc')

    expect(screen.getByTestId('sign-in').textContent).toBe('from:/plans/abc')
  })

  it('forgets the page after the user signs out on purpose', () => {
    mockAuth({ session: null, signOutReason: 'user' })
    renderAt('/plans/abc')

    expect(screen.getByTestId('sign-in').textContent).toBe('from:none')
  })
})
