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
import { fetchSavedPlan, type FetchSavedPlanResult, type SavedPlan } from '../lib/saved-plans'
import { SavedPlanPage } from './SavedPlanPage'

vi.mock('../lib/saved-plans', () => ({
  fetchSavedPlan: vi.fn(),
  listSavedPlans: vi.fn(),
  saveGeneratedPlan: vi.fn(),
}))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/RequireAuth', async () => {
  const { Outlet: AuthOutlet } = await import('react-router')
  return { RequireAuth: AuthOutlet }
})

const fetchMock = vi.mocked(fetchSavedPlan)
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

const deferred = () => {
  let resolve: (result: FetchSavedPlanResult) => void = () => {}
  const promise = new Promise<FetchSavedPlanResult>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

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

  it('links to My plans and home', async () => {
    fetchMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    await screen.findByRole('heading', { level: 2, name: 'Week 1' })
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('href')).toBe('/plans')
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
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
