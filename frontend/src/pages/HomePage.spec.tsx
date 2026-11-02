import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('shows the email next to the role', async () => {
    respondWithMe('MEMBER')
    renderPage()

    expect(await screen.findByText('someone@example.com')).toBeTruthy()
    expect(screen.getByText('MEMBER')).toBeTruthy()
  })

  it('links the main actions to their pages', async () => {
    respondWithMe('MEMBER')
    renderPage()

    expect(
      (await screen.findByRole('link', { name: 'Create a training plan' })).getAttribute('href'),
    ).toBe('/plans/new')
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('href')).toBe('/plans')
  })

  it('offers Retry after a failed load and shows the profile when it succeeds', async () => {
    respondWithMe('MEMBER')
    apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('MEMBER')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows a pending Sign out while signing out and calls signOut once', async () => {
    respondWithMe('MEMBER')
    signOut.mockReturnValue(new Promise<void>(() => {}))
    renderPage()
    await screen.findByText('MEMBER')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const pending = (await screen.findByRole('button', {
      name: 'Signing out…',
    })) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('restores Sign out when signing out settles', async () => {
    respondWithMe('MEMBER')
    signOut.mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('MEMBER')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const restored = (await screen.findByRole('button', { name: 'Sign out' })) as HTMLButtonElement
    expect(restored.disabled).toBe(false)
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
