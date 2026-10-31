import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, RouterProvider, Route, Routes, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import {
  blockAdminUser,
  listAdminUsers,
  type AdminUser,
  type BlockAdminUserResult,
} from '../lib/admin-users'
import { formatSavedDate } from '../lib/saved-plan-format'
import { AdminUsersPage } from './AdminUsersPage'

vi.mock('../lib/admin-users', () => ({ listAdminUsers: vi.fn(), blockAdminUser: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/RequireAuth', async () => {
  const { Outlet: AuthOutlet } = await import('react-router')
  return { RequireAuth: AuthOutlet }
})

const listMock = vi.mocked(listAdminUsers)
const blockMock = vi.mocked(blockAdminUser)
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
    blockMock.mockReset()
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

  describe('block action', () => {
    const blockedNewest: AdminUser = { ...newest, blockedAt: '2026-10-30T10:00:00.000Z' }

    const renderList = async () => {
      listMock.mockResolvedValue({ kind: 'ok', users: [newest, blockedMember, oldestAdmin] })
      renderPage()
      await screen.findAllByRole('listitem')
    }

    const rowOf = (email: string) => within(screen.getByText(email).closest('li') as HTMLElement)

    const pressBlock = () =>
      fireEvent.click(screen.getByRole('button', { name: `Block for ${newest.email}` }))

    const pressConfirm = () =>
      fireEvent.click(screen.getByRole('button', { name: `Confirm blocking ${newest.email}` }))

    const settleBlockWith = async (result: BlockAdminUserResult) => {
      blockMock.mockResolvedValue(result)
      await renderList()
      pressBlock()
      pressConfirm()
    }

    it('renders no action on an admin row', async () => {
      await renderList()

      expect(rowOf(oldestAdmin.email).queryAllByRole('button')).toHaveLength(0)
    })

    it('renders Block on an active member and Re-apply block on a blocked member', async () => {
      await renderList()

      expect(rowOf(newest.email).getByRole('button', { name: `Block for ${newest.email}` })).toBeTruthy()
      expect(
        rowOf(blockedMember.email).getByRole('button', {
          name: `Re-apply block for ${blockedMember.email}`,
        }),
      ).toBeTruthy()
    })

    it('swaps the action for a prompt naming the email on Block', async () => {
      await renderList()

      pressBlock()

      const row = rowOf(newest.email)
      expect(row.getByText(`Block ${newest.email}?`)).toBeTruthy()
      expect(row.getByRole('button', { name: `Confirm blocking ${newest.email}` })).toBeTruthy()
      expect(row.getByRole('button', { name: `Cancel blocking ${newest.email}` })).toBeTruthy()
      expect(row.queryByRole('button', { name: `Block for ${newest.email}` })).toBeNull()
    })

    it('restores the row without calling anything on Cancel', async () => {
      await renderList()

      pressBlock()
      fireEvent.click(screen.getByRole('button', { name: `Cancel blocking ${newest.email}` }))

      expect(rowOf(newest.email).getByRole('button', { name: `Block for ${newest.email}` })).toBeTruthy()
      expect(screen.queryByText(`Block ${newest.email}?`)).toBeNull()
      expect(blockMock).not.toHaveBeenCalled()
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    it('blocks the user on Confirm and shows the returned user', async () => {
      blockMock.mockResolvedValue({ kind: 'ok', user: blockedNewest })
      await renderList()

      pressBlock()
      pressConfirm()

      await waitFor(() => expect(rowOf(newest.email).getByText('Status: Blocked')).toBeTruthy())
      expect(blockMock).toHaveBeenCalledTimes(1)
      expect(blockMock).toHaveBeenCalledWith(newest.id)
      expect(
        rowOf(newest.email).getByRole('button', { name: `Re-apply block for ${newest.email}` }),
      ).toBeTruthy()
      expect(screen.queryByText(`Block ${newest.email}?`)).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    it('disables the prompt buttons while the block is pending', async () => {
      blockMock.mockReturnValue(new Promise(() => {}))
      await renderList()

      pressBlock()
      pressConfirm()

      const row = rowOf(newest.email)
      expect(
        (row.getByRole('button', { name: `Blocking… ${newest.email}` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      expect(
        (row.getByRole('button', { name: `Cancel blocking ${newest.email}` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      expect(
        (
          rowOf(blockedMember.email).getByRole('button', {
            name: `Re-apply block for ${blockedMember.email}`,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
    })

    it('shows that admins cannot be blocked on conflict', async () => {
      await settleBlockWith({ kind: 'conflict' })

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Admins cannot be blocked.')
      expect(rowOf(newest.email).getByText('Status: Active')).toBeTruthy()
      expect(rowOf(newest.email).getByRole('button', { name: `Block for ${newest.email}` })).toBeTruthy()
    })

    it('shows that the user was not found and reloads the list on not-found', async () => {
      await settleBlockWith({ kind: 'not-found' })

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('User not found.')
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
    })

    it('explains the failed ban and reloads the list on ban-failed', async () => {
      blockMock.mockResolvedValue({ kind: 'ban-failed' })
      await renderList()
      listMock.mockResolvedValue({ kind: 'ok', users: [blockedNewest, blockedMember, oldestAdmin] })

      pressBlock()
      pressConfirm()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('blocked in the app')
      expect(alert.textContent).toContain('Supabase sign-in ban failed')
      expect(alert.textContent).toContain('Re-apply block')
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(rowOf(newest.email).getByText('Status: Blocked')).toBeTruthy())
      expect(screen.queryByText('Loading…')).toBeNull()
    })

    it('keeps the list when the reload after ban-failed fails', async () => {
      blockMock.mockResolvedValue({ kind: 'ban-failed' })
      await renderList()
      listMock.mockResolvedValue({ kind: 'error' })

      pressBlock()
      pressConfirm()

      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('shows the generic error on error', async () => {
      await settleBlockWith({ kind: 'error' })

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
    })

    it('reloads the list on error so a row blocked server-side shows as blocked', async () => {
      blockMock.mockResolvedValue({ kind: 'error' })
      await renderList()
      listMock.mockResolvedValue({ kind: 'ok', users: [blockedNewest, blockedMember, oldestAdmin] })

      pressBlock()
      pressConfirm()

      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(rowOf(newest.email).getByText('Status: Blocked')).toBeTruthy())
      expect(
        rowOf(newest.email).getByRole('button', { name: `Re-apply block for ${newest.email}` }),
      ).toBeTruthy()
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
    })

    it('clears the previous message when a new block starts', async () => {
      await settleBlockWith({ kind: 'conflict' })
      await screen.findByRole('alert')

      pressBlock()

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('signs the user out on unauthorized', async () => {
      await settleBlockWith({ kind: 'unauthorized', status: 401 })

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
      expect(signOut).toHaveBeenCalledWith()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('signs the user out as blocked on blocked', async () => {
      await settleBlockWith({ kind: 'blocked', status: 403 })

      await waitFor(() => expect(signOut).toHaveBeenCalledWith('blocked'))
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
