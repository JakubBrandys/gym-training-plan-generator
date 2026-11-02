import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../lib/api'
import { AppShell } from './AppShell'

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

const renderShell = (path = '/plans') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/plans" element={<main>Plans page</main>} />
          <Route path="/plans/new" element={<main>New plan page</main>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('AppShell', () => {
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

  it('renders the header, the page and the footer as siblings', async () => {
    respondWithMe('MEMBER')
    renderShell()

    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('main').textContent).toBe('Plans page')
    expect(screen.getByRole('contentinfo').textContent).toContain(
      'Gym Training Plan Generator · AI-generated plans, not medical advice',
    )
    expect(await screen.findByText('someone@example.com')).toBeTruthy()
  })

  it('shows the Users link only to an admin once the profile has loaded', async () => {
    respondWithMe('ADMIN')
    renderShell()

    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(await screen.findByRole('link', { name: 'Users' })).toBeTruthy()
  })

  it('marks the current section from the location', async () => {
    respondWithMe('MEMBER')
    renderShell('/plans/new')
    await screen.findByText('someone@example.com')

    expect(screen.getByRole('link', { name: 'Create plan' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('aria-current')).toBeNull()
  })

  it('shows a pending Sign out and calls signOut once', async () => {
    respondWithMe('MEMBER')
    signOut.mockReturnValue(new Promise<void>(() => {}))
    renderShell()
    await screen.findByText('someone@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const pending = (await screen.findByRole('button', { name: 'Signing out…' })) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out as the user so the next sign-in does not return to this page', async () => {
    respondWithMe('MEMBER')
    signOut.mockResolvedValue(undefined)
    renderShell('/plans/new')
    await screen.findByText('someone@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(signOut).toHaveBeenCalledWith('user')
  })

  it('restores Sign out when signing out settles', async () => {
    respondWithMe('MEMBER')
    signOut.mockResolvedValue(undefined)
    renderShell()
    await screen.findByText('someone@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const restored = (await screen.findByRole('button', { name: 'Sign out' })) as HTMLButtonElement
    expect(restored.disabled).toBe(false)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('keeps the page and Sign out when the profile request is rejected, without signing out', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('supabase is not configured'))
    renderShell()

    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('main').textContent).toBe('Plans page')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByText('someone@example.com')).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
  })
})
