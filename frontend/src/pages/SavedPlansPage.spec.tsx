import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { listSavedPlans, type SavedPlanSummary } from '../lib/saved-plans'
import { SavedPlansPage } from './SavedPlansPage'

vi.mock('../lib/saved-plans', () => ({ listSavedPlans: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const listMock = vi.mocked(listSavedPlans)
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
}

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

  it('links back to home', async () => {
    listMock.mockResolvedValue({ kind: 'ok', plans: [] })
    renderPage()

    await screen.findByText('You have no saved plans yet.')
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
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
})
