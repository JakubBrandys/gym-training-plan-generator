import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, RouterProvider, Route, Routes, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { listAdminUsers, type AdminUser } from '../lib/admin-users'
import { formatSavedDate } from '../lib/saved-plan-format'
import { AdminUsersPage } from './AdminUsersPage'

vi.mock('../lib/admin-users', () => ({ listAdminUsers: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/RequireAuth', async () => {
  const { Outlet: AuthOutlet } = await import('react-router')
  return { RequireAuth: AuthOutlet }
})

const listMock = vi.mocked(listAdminUsers)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const newest: AdminUser = {
  id: 'user-3',
  email: 'newest.member@example.com',
  role: 'MEMBER',
  blockedAt: null,
  createdAt: '2026-10-29T10:00:00.000Z',
}

const blockedMember: AdminUser = {
  id: 'user-2',
  email: 'blocked.member@example.com',
  role: 'MEMBER',
  blockedAt: '2026-10-28T10:00:00.000Z',
  createdAt: '2026-10-25T10:00:00.000Z',
}

const oldestAdmin: AdminUser = {
  id: 'user-1',
  email: 'first.admin@example.com',
  role: 'ADMIN',
  blockedAt: null,
  createdAt: '2026-10-15T10:00:00.000Z',
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('AdminUsersPage', () => {
  beforeEach(() => {
    listMock.mockReset()
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

  it('shows a loading status while the list is pending', () => {
    listMock.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Registered users' })).toBeTruthy()
    expect(screen.getByText('Loading…').className).toBe('status')
  })

  it('renders the users in the order returned with email, role, status and joined date', async () => {
    listMock.mockResolvedValue({ kind: 'ok', users: [newest, blockedMember, oldestAdmin] })
    renderPage()

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)

    const first = within(items[0])
    expect(first.getByText('newest.member@example.com')).toBeTruthy()
    expect(first.getByText('Role: Member')).toBeTruthy()
    expect(first.getByText('Status: Active')).toBeTruthy()
    expect(first.getByText(`Joined: ${formatSavedDate(newest.createdAt)}`)).toBeTruthy()

    const second = within(items[1])
    expect(second.getByText('blocked.member@example.com')).toBeTruthy()
    expect(second.getByText('Role: Member')).toBeTruthy()
    expect(second.getByText('Status: Blocked')).toBeTruthy()
    expect(second.getByText(`Joined: ${formatSavedDate(blockedMember.createdAt)}`)).toBeTruthy()

    const third = within(items[2])
    expect(third.getByText('first.admin@example.com')).toBeTruthy()
    expect(third.getByText('Role: Admin')).toBeTruthy()
    expect(third.getByText('Status: Active')).toBeTruthy()
    expect(third.getByText(`Joined: ${formatSavedDate(oldestAdmin.createdAt)}`)).toBeTruthy()
  })

  it('shows Blocked only for the user with a blockedAt date', async () => {
    listMock.mockResolvedValue({ kind: 'ok', users: [newest, blockedMember] })
    renderPage()

    await screen.findAllByRole('listitem')

    expect(screen.getAllByText('Status: Blocked')).toHaveLength(1)
    expect(screen.getAllByText('Status: Active')).toHaveLength(1)
  })

  it('shows the empty state without a list', async () => {
    listMock.mockResolvedValue({ kind: 'ok', users: [] })
    renderPage()

    expect(await screen.findByText('No registered users yet.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows the generic error message when the list cannot be loaded', async () => {
    listMock.mockResolvedValue({ kind: 'error' })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('links back to home', async () => {
    listMock.mockResolvedValue({ kind: 'ok', users: [] })
    renderPage()

    await screen.findByText('No registered users yet.')
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
  })

  it('shows a plain page-not-found state for a non-admin without signing out', async () => {
    listMock.mockResolvedValue({ kind: 'not-found' })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Page not found')
    expect(screen.queryByRole('heading', { name: 'Registered users' })).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs the user out on unauthorized', async () => {
    listMock.mockResolvedValue({ kind: 'unauthorized', status: 401 })
    renderPage()

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(signOut).toHaveBeenCalledWith()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('signs the user out as blocked on blocked', async () => {
    listMock.mockResolvedValue({ kind: 'blocked', status: 403 })
    renderPage()

    await waitFor(() => expect(signOut).toHaveBeenCalledWith('blocked'))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('resolves the admin users path to this page in the real router', async () => {
    const { router } = await import('../router/router')
    listMock.mockResolvedValue({ kind: 'ok', users: [oldestAdmin] })

    const adminRouter = createMemoryRouter(router.routes, { initialEntries: ['/admin/users'] })
    render(<RouterProvider router={adminRouter} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Registered users' })).toBeTruthy()
    expect(await screen.findByText('first.admin@example.com')).toBeTruthy()
    expect(listMock).toHaveBeenCalledTimes(1)
  })
})
