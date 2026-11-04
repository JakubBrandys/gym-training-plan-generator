import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import {
  deleteSavedPlan,
  fetchSavedPlan,
  renameSavedPlan,
  type DeleteSavedPlanResult,
  type FetchSavedPlanResult,
  type RenameSavedPlanResult,
  type SavedPlan,
} from '../lib/saved-plans'
import { SavedPlanPage } from './SavedPlanPage'

vi.mock('../lib/saved-plans', () => ({
  deleteSavedPlan: vi.fn(),
  fetchSavedPlan: vi.fn(),
  renameSavedPlan: vi.fn(),
  listSavedPlans: vi.fn(),
  saveGeneratedPlan: vi.fn(),
  MAX_PLAN_TITLE_LENGTH: 80,
}))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/RequireAuth', async () => {
  const { Outlet: AuthOutlet } = await import('react-router')
  return { RequireAuth: AuthOutlet }
})

const fetchMock = vi.mocked(fetchSavedPlan)
const renameMock = vi.mocked(renameSavedPlan)
const deleteMock = vi.mocked(deleteSavedPlan)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const savedPlan: SavedPlan = {
  id: 'plan-1',
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
  plan: {
    weeks: [
      {
        week: 1,
        goal: 'Build a base',
        sessions: [
          {
            title: 'Push day',
            exercises: [
              {
                slug: 'bench-press',
                name: 'Bench Press',
                sets: 3,
                reps: '8-10',
                restSeconds: 90,
                note: null,
                imageKey: null,
              },
            ],
          },
        ],
      },
    ],
  },
}

const planWithGoals = (id: string, goals: string): SavedPlan => ({
  ...savedPlan,
  id,
  form: { ...savedPlan.form, goals },
})

const titledPlan: SavedPlan = { ...savedPlan, title: 'Spring cut' }

const deferredOf = <T,>() => {
  let resolve: (result: T) => void = () => {}
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const deferred = () => deferredOf<FetchSavedPlanResult>()
const deferredRename = () => deferredOf<RenameSavedPlanResult>()
const deferredDelete = () => deferredOf<DeleteSavedPlanResult>()

const savedDate = new Date(savedPlan.createdAt).toLocaleDateString()

const renamedSummary = (title: string | null) => ({
  id: savedPlan.id,
  createdAt: savedPlan.createdAt,
  form: savedPlan.form,
  title,
})

const renderWithRouter = () => {
  const router = createMemoryRouter(
    [
      { path: '/plans', element: <p>My plans list</p> },
      { path: '/plans/:id', element: <SavedPlanPage /> },
    ],
    { initialEntries: ['/plans', '/plans/plan-1'], initialIndex: 1 },
  )
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

const openRename = (name = `Rename plan from ${savedDate}`) =>
  fireEvent.click(screen.getByRole('button', { name }))

const titleInput = () => screen.getByLabelText('Plan title') as HTMLInputElement

const renderPage = (path = '/plans/plan-1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/plans" element={<p>My plans list</p>} />
        <Route path="/plans/new" element={<p>New plan page</p>} />
        <Route path="/plans/:id" element={<SavedPlanPage />} />
      </Routes>
    </MemoryRouter>,
  )

const renderWithLinkToB = () =>
  render(
    <MemoryRouter initialEntries={['/plans/a']}>
      <Routes>
        <Route
          element={
            <>
              <Link to="/plans/b">Go to b</Link>
              <Outlet />
            </>
          }
        >
          <Route path="/plans/:id" element={<SavedPlanPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('SavedPlanPage', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    renameMock.mockReset()
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

  it('shows a loading status while the plan is pending', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading…').className).toBe('status')
  })

  it('requests the plan from the route id', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage('/plans/plan-1')

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('plan-1')
  })

  it('renders the saved plan through the plan view', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Saved plan' })).toBeTruthy()
  })

  it('renders the saved date and the form summary', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(screen.getByText(new Date(savedPlan.createdAt).toLocaleDateString())).toBeTruthy()
    expect(screen.getByText('Experience: Intermediate')).toBeTruthy()
    expect(screen.getByText('Days per week: 3 → 5')).toBeTruthy()
    expect(screen.getByText('Run a faster 5k')).toBeTruthy()
  })

  it('links to My plans', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('href')).toBe('/plans')
  })

  it('shows the not-found message', async () => {
    fetchMock.mockResolvedValue({ kind: 'not-found' })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('This saved plan could not be found.')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('shows the generic error message', async () => {
    fetchMock.mockResolvedValue({ kind: 'error' })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('signs the user out on unauthorized', async () => {
    fetchMock.mockResolvedValue({ kind: 'unauthorized', status: 401 })
    renderPage()

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(signOut).toHaveBeenCalledWith()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('signs the user out as blocked on blocked', async () => {
    fetchMock.mockResolvedValue({ kind: 'blocked', status: 403 })
    renderPage()

    await waitFor(() => expect(signOut).toHaveBeenCalledWith('blocked'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the static new-plan route ahead of the saved-plan route', async () => {
    renderPage('/plans/new')

    expect(await screen.findByText('New plan page')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not keep showing the previous plan while the next id loads', async () => {
    const second = deferred()
    fetchMock
      .mockResolvedValueOnce({ kind: 'ok', plan: planWithGoals('a', 'Goal of plan A') })
      .mockReturnValueOnce(second.promise)

    renderWithLinkToB()

    expect(await screen.findByText('Goal of plan A')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'Go to b' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('Goal of plan A')).toBeNull()
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('ignores a stale response after the route id changes', async () => {
    const first = deferred()
    const second = deferred()
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    renderWithLinkToB()

    fireEvent.click(screen.getByRole('link', { name: 'Go to b' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'a')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'b')

    await act(async () => {
      second.resolve({ kind: 'ok', plan: planWithGoals('b', 'Goal of plan B') })
    })
    expect(await screen.findByText('Goal of plan B')).toBeTruthy()

    await act(async () => {
      first.resolve({ kind: 'ok', plan: planWithGoals('a', 'Goal of plan A') })
    })
    expect(screen.getByText('Goal of plan B')).toBeTruthy()
    expect(screen.queryByText('Goal of plan A')).toBeNull()
  })

  it('does not update state or log errors when unmounted before the plan resolves', async () => {
    const pending = deferred()
    fetchMock.mockReturnValue(pending.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount, container } = renderPage()
    unmount()

    await act(async () => {
      pending.resolve({ kind: 'ok', plan: savedPlan })
    })

    expect(consoleError).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
    expect(signOut).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('shows the title in the summary when the plan has one', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: titledPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(screen.getByText('Spring cut').className).toBe('saved-plans-title')
    expect(screen.getByText(savedDate)).toBeTruthy()
  })

  it('keeps the details unchanged when the title is null', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    const { container } = renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(container.querySelector('.saved-plans-title')).toBeNull()
    expect(screen.getByText(savedDate)).toBeTruthy()
    expect(screen.getByText('Experience: Intermediate')).toBeTruthy()
  })

  it('treats a missing title as null', async () => {
    const { title: _title, ...withoutTitle } = savedPlan
    fetchMock.mockResolvedValue({ kind: 'ok', plan: withoutTitle as SavedPlan })
    const { container } = renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(container.querySelector('.saved-plans-title')).toBeNull()
    expect(screen.getByRole('button', { name: `Rename plan from ${savedDate}` })).toBeTruthy()
  })

  it('offers Rename and Delete under the heading without a second My plans link', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    const rename = screen.getByRole('button', { name: `Rename plan from ${savedDate}` })
    expect(rename.className).toBe('btn btn-secondary')
    expect(screen.getByRole('button', { name: `Delete plan from ${savedDate}` })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'My plans' })).toHaveLength(1)
  })

  it('does not take focus when the page first renders', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(document.activeElement).toBe(document.body)
  })

  it('does not offer Rename or Delete while loading or when not found', async () => {
    fetchMock.mockResolvedValue({ kind: 'not-found' })
    renderPage()

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: /Rename/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })

  describe('rename', () => {
    it('opens the form prefilled with the title and focused', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: titledPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename('Rename Spring cut')

      expect(titleInput().value).toBe('Spring cut')
      expect(document.activeElement).toBe(titleInput())
      expect(screen.queryByRole('button', { name: 'Rename Spring cut' })).toBeNull()
    })

    it('opens an empty form for an untitled plan', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()

      expect(titleInput().value).toBe('')
    })

    it('saves the trimmed title, shows it and returns focus to Rename', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockResolvedValue({ kind: 'ok', plan: renamedSummary('Spring cut') })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.change(titleInput(), { target: { value: '  Spring cut  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const rename = await screen.findByRole('button', { name: 'Rename Spring cut' })
      expect(renameMock).toHaveBeenCalledTimes(1)
      expect(renameMock).toHaveBeenCalledWith('plan-1', 'Spring cut')
      expect(screen.getByText('Spring cut').className).toBe('saved-plans-title')
      expect(screen.queryByLabelText('Plan title')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(rename))
    })

    it('sends null for an empty value and removes the title line', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: titledPlan })
      renameMock.mockResolvedValue({ kind: 'ok', plan: renamedSummary(null) })
      const { container } = renderPage()
      await screen.findByText('Spring cut')

      openRename('Rename Spring cut')
      fireEvent.change(titleInput(), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await screen.findByRole('button', { name: `Rename plan from ${savedDate}` })
      expect(renameMock).toHaveBeenCalledWith('plan-1', null)
      expect(screen.queryByText('Spring cut')).toBeNull()
      expect(container.querySelector('.saved-plans-title')).toBeNull()
    })

    it('restores the Rename button and its focus on Cancel without saving', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      const rename = screen.getByRole('button', { name: `Rename plan from ${savedDate}` })
      await waitFor(() => expect(document.activeElement).toBe(rename))
      expect(screen.queryByLabelText('Plan title')).toBeNull()
      expect(renameMock).not.toHaveBeenCalled()
    })

    it('keeps the form open with the error and focus in the input when saving fails', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.change(titleInput(), { target: { value: 'Spring cut' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      expect(titleInput().value).toBe('Spring cut')
      await waitFor(() => expect(document.activeElement).toBe(titleInput()))
    })

    it('clears the error when the form is reopened', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await screen.findByRole('alert')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      openRename()

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('shows the not-found state when the plan no longer exists', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockResolvedValue({ kind: 'not-found' })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('This saved plan could not be found.')
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
      expect(screen.queryByLabelText('Plan title')).toBeNull()
    })

    it.each([
      [401, undefined],
      [403, 'blocked'],
    ])('signs the user out on a %i response', async (status, reason) => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockResolvedValue(
        status === 401 ? { kind: 'unauthorized', status: 401 } : { kind: 'blocked', status: 403 },
      )
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
      if (reason) expect(signOut).toHaveBeenCalledWith(reason)
      else expect(signOut).toHaveBeenCalledWith()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('disables the form and Delete while the save is pending', async () => {
      const pending = deferredRename()
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockReturnValue(pending.promise)
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const saving = await screen.findByRole('button', { name: /Saving…/ })
      expect((saving as HTMLButtonElement).disabled).toBe(true)
      expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
      expect(titleInput().disabled).toBe(true)
      expect(
        (screen.getByRole('button', { name: `Delete plan from ${savedDate}` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)

      await act(async () => {
        pending.resolve({ kind: 'ok', plan: renamedSummary('Spring cut') })
      })
    })

    it('disables Delete while the form is open and re-enables it after closing', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })
      const deleteButton = () =>
        screen.getByRole('button', { name: `Delete plan from ${savedDate}` }) as HTMLButtonElement

      openRename()
      expect(deleteButton().disabled).toBe(true)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(deleteButton().disabled).toBe(false)
    })

    it('ignores a response that arrives after the page unmounted', async () => {
      const pending = deferredRename()
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renameMock.mockReturnValue(pending.promise)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { unmount, container } = renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      unmount()
      await act(async () => {
        pending.resolve({ kind: 'unauthorized', status: 401 })
      })

      expect(consoleError).not.toHaveBeenCalled()
      expect(container.textContent).toBe('')
      expect(signOut).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('ignores a response for the previous plan after the route id changes', async () => {
      const pending = deferredRename()
      fetchMock
        .mockResolvedValueOnce({ kind: 'ok', plan: planWithGoals('a', 'Goal of plan A') })
        .mockResolvedValueOnce({ kind: 'ok', plan: planWithGoals('b', 'Goal of plan B') })
      renameMock.mockReturnValue(pending.promise)
      renderWithLinkToB()
      await screen.findByText('Goal of plan A')

      openRename()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('link', { name: 'Go to b' }))
      await screen.findByText('Goal of plan B')
      await act(async () => {
        pending.resolve({ kind: 'ok', plan: { ...renamedSummary('Late title'), id: 'a' } })
      })

      expect(screen.queryByText('Late title')).toBeNull()
      expect(screen.getByText('Goal of plan B')).toBeTruthy()
      expect(screen.queryByLabelText('Plan title')).toBeNull()
    })
  })

  describe('delete', () => {
    it('asks for confirmation and returns focus to Delete on Cancel', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      const cancel = screen.getByRole('button', { name: `Cancel deleting plan from ${savedDate}` })
      expect(screen.getByText(`Delete plan from ${savedDate}?`)).toBeTruthy()
      expect(document.activeElement).toBe(cancel)

      fireEvent.click(cancel)

      const deleteButton = screen.getByRole('button', { name: `Delete plan from ${savedDate}` })
      await waitFor(() => expect(document.activeElement).toBe(deleteButton))
      expect(deleteMock).not.toHaveBeenCalled()
    })

    it('names the plan by its title', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: titledPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Spring cut' }))

      expect(screen.getByRole('button', { name: 'Confirm deleting Spring cut' })).toBeTruthy()
    })

    it('deletes the plan on Confirm and replaces the entry with the plans list', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockResolvedValue({ kind: 'ok' })
      const { router } = renderWithRouter()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))

      expect(await screen.findByText('My plans list')).toBeTruthy()
      expect(deleteMock).toHaveBeenCalledTimes(1)
      expect(deleteMock).toHaveBeenCalledWith('plan-1')
      expect(router.state.location.pathname).toBe('/plans')
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('also goes to the plans list when the plan is already gone', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockResolvedValue({ kind: 'not-found' })
      const { router } = renderWithRouter()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))

      expect(await screen.findByText('My plans list')).toBeTruthy()
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('shows an alert and returns to idle when deleting fails', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      expect(alert.className).toBe('error')
      const deleteButton = screen.getByRole('button', { name: `Delete plan from ${savedDate}` })
      await waitFor(() => expect(document.activeElement).toBe(deleteButton))
      expect(screen.queryByText('My plans list')).toBeNull()
      expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    })

    it('clears the failure notice when a new delete starts', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockResolvedValue({ kind: 'error' })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))
      await screen.findByRole('alert')
      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it.each([
      [401, undefined],
      [403, 'blocked'],
    ])('signs the user out on a %i response', async (status, reason) => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockResolvedValue(
        status === 401 ? { kind: 'unauthorized', status: 401 } : { kind: 'blocked', status: 403 },
      )
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
      if (reason) expect(signOut).toHaveBeenCalledWith(reason)
      else expect(signOut).toHaveBeenCalledWith()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText('My plans list')).toBeNull()
    })

    it('disables Confirm, Cancel and Rename while the delete is pending', async () => {
      const pending = deferredDelete()
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockReturnValue(pending.promise)
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))

      const deleting = await screen.findByRole('button', { name: `Deleting… plan from ${savedDate}` })
      expect((deleting as HTMLButtonElement).disabled).toBe(true)
      expect(
        (
          screen.getByRole('button', {
            name: `Cancel deleting plan from ${savedDate}`,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
      expect(
        (screen.getByRole('button', { name: `Rename plan from ${savedDate}` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)

      await act(async () => {
        pending.resolve({ kind: 'error' })
      })
    })

    it('disables Rename while the confirmation is showing', async () => {
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))

      expect(
        (screen.getByRole('button', { name: `Rename plan from ${savedDate}` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
    })

    it('ignores a response that arrives after the page unmounted', async () => {
      const pending = deferredDelete()
      fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
      deleteMock.mockReturnValue(pending.promise)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { router, unmount } = renderWithRouter()
      await screen.findByRole('heading', { level: 2, name: 'Week 1' })

      fireEvent.click(screen.getByRole('button', { name: `Delete plan from ${savedDate}` }))
      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting plan from ${savedDate}` }))
      unmount()
      await act(async () => {
        pending.resolve({ kind: 'ok' })
      })

      expect(router.state.location.pathname).toBe('/plans/plan-1')
      expect(consoleError).not.toHaveBeenCalled()
      expect(signOut).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  it('resolves the new-plan and saved-plan paths to their own pages in the real router', async () => {
    const { router } = await import('../router/router')
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })

    const newPlanRouter = createMemoryRouter(router.routes, { initialEntries: ['/plans/new'] })
    render(<RouterProvider router={newPlanRouter} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'New training plan' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: 'Saved plan' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()

    const savedPlanRouter = createMemoryRouter(router.routes, {
      initialEntries: ['/plans/0b6f2c1e-6d0e-4a3c-9d6b-2f3a1c4e5d6f'],
    })
    render(<RouterProvider router={savedPlanRouter} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Saved plan' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('0b6f2c1e-6d0e-4a3c-9d6b-2f3a1c4e5d6f')
  })
})
