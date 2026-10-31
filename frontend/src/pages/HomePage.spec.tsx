import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../lib/api'
import { HomePage } from './HomePage'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const respondWithMe = (role: 'MEMBER' | 'ADMIN') =>
  apiFetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: 'user-1', email: 'someone@example.com', role }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage />
    </MemoryRouter>,
  )

describe('HomePage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    signOut.mockReset()
    useAuthMock.mockReturnValue({
      session: null,
      loading: false,
      signOutReason: null,
      signOut,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the registered users link to an admin', async () => {
    respondWithMe('ADMIN')
    renderPage()

    const link = await screen.findByRole('link', { name: 'Registered users' })
    expect(link.getAttribute('href')).toBe('/admin/users')
  })

  it('does not show the registered users link to a member', async () => {
    respondWithMe('MEMBER')
    renderPage()

    expect(await screen.findByText('MEMBER')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Registered users' })).toBeNull()
    expect(screen.getByRole('link', { name: 'My plans' })).toBeTruthy()
  })

  it('does not show the registered users link while the profile is loading', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Registered users' })).toBeNull()
  })

  it('does not show the registered users link when the profile cannot be loaded', async () => {
    apiFetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Registered users' })).toBeNull()
  })
})
