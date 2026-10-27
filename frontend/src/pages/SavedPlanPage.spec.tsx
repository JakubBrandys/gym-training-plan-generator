import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { fetchSavedPlan, type SavedPlan } from '../lib/saved-plans'
import { SavedPlanPage } from './SavedPlanPage'

vi.mock('../lib/saved-plans', () => ({ fetchSavedPlan: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

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
})
