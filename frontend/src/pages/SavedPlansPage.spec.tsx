import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import {
  deleteSavedPlan,
  listSavedPlans,
  type DeleteSavedPlanResult,
  type SavedPlanSummary,
} from '../lib/saved-plans'
import { SavedPlansPage } from './SavedPlansPage'

vi.mock('../lib/saved-plans', () => ({ listSavedPlans: vi.fn(), deleteSavedPlan: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const listMock = vi.mocked(listSavedPlans)
const deleteMock = vi.mocked(deleteSavedPlan)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const newer: SavedPlanSummary = {
  id: 'plan-2',
  createdAt: '2026-10-27T10:00:00.000Z',
  form: {
    experience: 'intermediate',
    currentFrequency: 3,
    desiredFrequency: 5,
    heightCm: 175,
    weightKg: 70,
    goals: 'Run a faster 5k',
  },
  title: null,
}

const older: SavedPlanSummary = {
  id: 'plan-1',
  createdAt: '2026-10-20T10:00:00.000Z',
  form: {
    experience: 'beginner',
    currentFrequency: 2,
    desiredFrequency: 4,
    heightCm: 180,
    weightKg: 80,
    goals: 'Build strength',
  },
  title: null,
}

const newerDate = new Date(newer.createdAt).toLocaleDateString()
const olderDate = new Date(older.createdAt).toLocaleDateString()

const deferredDelete = () => {
  let resolve: (result: DeleteSavedPlanResult) => void = () => {}
  const promise = new Promise<DeleteSavedPlanResult>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const deleteButton = (date: string) =>
  screen.getByRole('button', { name: `Delete plan from ${date}` }) as HTMLButtonElement

const startDeleting = (date: string) => fireEvent.click(deleteButton(date))

const confirmDeleting = (date: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${date}` }))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/plans']}>
      <Routes>
        <Route path="/plans" element={<SavedPlansPage />} />
        <Route path="/plans/new" element={<p>New plan page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('SavedPlansPage', () => {
  beforeEach(() => {
    listMock.mockReset()
    deleteMock.mockReset()
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

    expect(screen.getByText('Loading…').className).toBe('status')
  })

  it('renders the saved plans in the order returned with their details', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
    renderPage()

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)

    const first = within(items[0])
    expect(first.getByText(new Date(newer.createdAt).toLocaleDateString())).toBeTruthy()
    expect(first.getByText('Experience: Intermediate')).toBeTruthy()
    expect(first.getByText('Days per week: 3 → 5')).toBeTruthy()
    expect(first.getByText('Run a faster 5k')).toBeTruthy()

    const second = within(items[1])
    expect(second.getByText(new Date(older.createdAt).toLocaleDateString())).toBeTruthy()
    expect(second.getByText('Experience: Beginner')).toBeTruthy()
    expect(second.getByText('Days per week: 2 → 4')).toBeTruthy()
    expect(second.getByText('Build strength')).toBeTruthy()
  })

  it('links each item to its saved plan', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
    renderPage()

    const items = await screen.findAllByRole('listitem')

    expect(within(items[0]).getByRole('link').getAttribute('href')).toBe('/plans/plan-2')
    expect(within(items[1]).getByRole('link').getAttribute('href')).toBe('/plans/plan-1')
  })

  it('shows the empty state with a link to create a plan', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [] })
    renderPage()

    expect(await screen.findByText('You have no saved plans yet.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Create a training plan' }).getAttribute('href'),
    ).toBe('/plans/new')
  })

  it('shows the generic error message when the list cannot be loaded', async () => {
    listMock.mockResolvedValue({ kind: 'error' })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(screen.queryByRole('list')).toBeNull()
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
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the title in the item when the plan has one', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [{ ...newer, title: 'Spring cut' }, older] })
    renderPage()

    const items = await screen.findAllByRole('listitem')

    expect(within(items[0]).getByText('Spring cut').className).toBe('saved-plans-title')
    expect(within(items[1]).queryByText('Spring cut')).toBeNull()
  })

  it('treats a missing title as null', async () => {
    const { title: _title, ...withoutTitle } = newer
    listMock.mockResolvedValue({ kind: 'ok', plans: [withoutTitle as SavedPlanSummary] })
    const { container } = renderPage()

    await screen.findByRole('listitem')

    expect(container.querySelector('.saved-plans-title')).toBeNull()
    expect(deleteButton(newerDate)).toBeTruthy()
  })

  it('does not take focus when the list first renders', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
    renderPage()

    await screen.findAllByRole('listitem')

    expect(document.activeElement).toBe(document.body)
  })

  describe('delete', () => {
    it('asks for confirmation and restores the item and focus on Cancel', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      const cancel = screen.getByRole('button', { name: `Cancel deleting plan from ${newerDate}` })
      expect(screen.getByText(`Delete plan from ${newerDate}?`)).toBeTruthy()
      expect(document.activeElement).toBe(cancel)

      fireEvent.click(cancel)

      expect(document.activeElement).toBe(deleteButton(newerDate))
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(deleteMock).not.toHaveBeenCalled()
    })

    it('names the plan by its title', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [{ ...newer, title: 'Spring cut' }, older] })
      renderPage()
      await screen.findAllByRole('listitem')

      fireEvent.click(screen.getByRole('button', { name: 'Delete Spring cut' }))

      expect(screen.getByRole('button', { name: 'Confirm deleting Spring cut' })).toBeTruthy()
    })

    it('deletes the confirmed plan and removes only that item', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockResolvedValue({ kind: 'ok' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
      expect(deleteMock).toHaveBeenCalledTimes(1)
      expect(deleteMock).toHaveBeenCalledWith('plan-2')
      expect(within(screen.getByRole('listitem')).getByRole('link').getAttribute('href')).toBe(
        '/plans/plan-1',
      )
      expect(deleteButton(olderDate).disabled).toBe(false)
      expect(screen.queryByRole('alert')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'My plans' })))
    })

    it('shows the empty state and focuses the heading after deleting the last plan', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [older] })
      deleteMock.mockResolvedValue({ kind: 'ok' })
      renderPage()
      await screen.findByRole('listitem')

      startDeleting(olderDate)
      confirmDeleting(olderDate)

      expect(await screen.findByText('You have no saved plans yet.')).toBeTruthy()
      expect(screen.queryByRole('list')).toBeNull()
      const heading = screen.getByRole('heading', { level: 1, name: 'My plans' })
      expect(heading.getAttribute('tabindex')).toBe('-1')
      await waitFor(() => expect(document.activeElement).toBe(heading))
    })

    it('removes the item when the plan is already gone', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockResolvedValue({ kind: 'not-found' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
      expect(screen.queryByRole('alert')).toBeNull()
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    it('shows an alert, keeps the item and refreshes the list when deleting fails', async () => {
      listMock
        .mockResolvedValueOnce({ kind: 'ok', plans: [newer, older] })
        .mockResolvedValueOnce({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      expect(alert.className).toBe('error')
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      await waitFor(() => expect(document.activeElement).toBe(deleteButton(newerDate)))
    })

    it('drops an item the refresh no longer returns after a failed delete', async () => {
      listMock
        .mockResolvedValueOnce({ kind: 'ok', plans: [newer, older] })
        .mockResolvedValueOnce({ kind: 'ok', plans: [older] })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
      expect(screen.getByRole('alert').textContent).toBe('Something went wrong, try again')
    })

    it('leaves the list unchanged when the refresh fails too', async () => {
      listMock
        .mockResolvedValueOnce({ kind: 'ok', plans: [newer, older] })
        .mockResolvedValueOnce({ kind: 'error' })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('does not bring back a plan deleted after a failed delete when the stale refresh arrives', async () => {
      let resolveRefresh: (plans: SavedPlanSummary[]) => void = () => {}
      const refresh = new Promise<{ kind: 'ok'; plans: SavedPlanSummary[] }>((resolvePromise) => {
        resolveRefresh = (plans) => resolvePromise({ kind: 'ok', plans })
      })
      listMock
        .mockResolvedValueOnce({ kind: 'ok', plans: [newer, older] })
        .mockReturnValueOnce(refresh)
      deleteMock
        .mockResolvedValueOnce({ kind: 'error' })
        .mockResolvedValueOnce({ kind: 'ok' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))

      startDeleting(olderDate)
      confirmDeleting(olderDate)
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))

      await act(async () => {
        resolveRefresh([newer, older])
      })

      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.queryByText('Build strength')).toBeNull()
    })

    it('clears the failure notice when a new delete starts', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)
      await screen.findByRole('alert')
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
      startDeleting(olderDate)

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('disables the other items Delete buttons while one confirmation is open and restores them on Cancel', async () => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)

      expect(deleteButton(olderDate).disabled).toBe(true)
      expect(screen.getAllByRole('button', { name: /^Confirm deleting / })).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: `Cancel deleting plan from ${newerDate}` }))

      expect(deleteButton(olderDate).disabled).toBe(false)
      expect(deleteButton(newerDate).disabled).toBe(false)
    })

    it('disables the other items Delete buttons while one delete is pending', async () => {
      const pending = deferredDelete()
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockReturnValue(pending.promise)
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      const deleting = await screen.findByRole('button', { name: `Deleting… plan from ${newerDate}` })
      expect((deleting as HTMLButtonElement).disabled).toBe(true)
      expect(
        (
          screen.getByRole('button', {
            name: `Cancel deleting plan from ${newerDate}`,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
      expect(deleteButton(olderDate).disabled).toBe(true)

      await act(async () => {
        pending.resolve({ kind: 'ok' })
      })

      expect(deleteButton(olderDate).disabled).toBe(false)
    })

    it.each([
      [401, undefined],
      [403, 'blocked'],
    ])('signs the user out on a %i response', async (status, reason) => {
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockResolvedValue(
        status === 401 ? { kind: 'unauthorized', status: 401 } : { kind: 'blocked', status: 403 },
      )
      renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
      if (reason) expect(signOut).toHaveBeenCalledWith(reason)
      else expect(signOut).toHaveBeenCalledWith()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('ignores a response that arrives after the page unmounted', async () => {
      const pending = deferredDelete()
      listMock.mockResolvedValue({ kind: 'ok', plans: [newer, older] })
      deleteMock.mockReturnValue(pending.promise)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { unmount, container } = renderPage()
      await screen.findAllByRole('listitem')

      startDeleting(newerDate)
      confirmDeleting(newerDate)
      unmount()
      await act(async () => {
        pending.resolve({ kind: 'unauthorized', status: 401 })
      })

      expect(consoleError).not.toHaveBeenCalled()
      expect(container.textContent).toBe('')
      expect(signOut).not.toHaveBeenCalled()
      expect(listMock).toHaveBeenCalledTimes(1)
      consoleError.mockRestore()
    })
  })
})
