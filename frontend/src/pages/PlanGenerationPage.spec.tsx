import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import type { PlanResult } from '../lib/plan-generation'
import { watchPlanGeneration, type WatchState } from '../lib/plan-generation-watch'
import { initialProgress } from '../lib/plan-progress'
import { saveGeneratedPlan, type SaveGeneratedPlanResult } from '../lib/saved-plans'
import { PlanGenerationPage } from './PlanGenerationPage'

vi.mock('../lib/plan-generation-watch', () => ({ watchPlanGeneration: vi.fn() }))
vi.mock('../lib/saved-plans', () => ({ saveGeneratedPlan: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const watchMock = vi.mocked(watchPlanGeneration)
const saveMock = vi.mocked(saveGeneratedPlan)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const plan: PlanResult = {
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
}

const savedPlan = {
  id: 'plan 1',
  createdAt: '2026-10-27T10:00:00.000Z',
  form: {
    experience: 'beginner' as const,
    currentFrequency: 2,
    desiredFrequency: 4,
    heightCm: 180,
    weightKg: 80,
    goals: 'Build strength',
  },
}

const emitState = (state: WatchState) =>
  watchMock.mockImplementation(async (_jobId, _signal, handlers) => {
    handlers.onState(state)
  })

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/plans/generate/job-1']}>
      <Routes>
        <Route path="/plans/generate/:jobId" element={<PlanGenerationPage />} />
        <Route path="/plans/:id" element={<p>Saved plan page</p>} />
      </Routes>
    </MemoryRouter>,
  )

const findSaveButton = () => screen.findByRole('button', { name: /^Sav/ })

describe('PlanGenerationPage save action', () => {
  beforeEach(() => {
    watchMock.mockReset()
    saveMock.mockReset()
    signOut.mockReset()
    useAuthMock.mockReturnValue({
      session: null,
      loading: false,
      signOutReason: null,
      signOut,
    })
    emitState({ status: 'completed', plan })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the Save button only when the plan is completed', async () => {
    emitState({ status: 'failed', code: 'internal' })
    renderPage()

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull()
    cleanup()

    emitState({ status: 'running', progress: initialProgress })
    renderPage()

    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull()
    cleanup()

    emitState({ status: 'completed', plan })
    renderPage()

    expect(await screen.findByRole('button', { name: 'Save plan' })).toBeTruthy()
  })

  it('saves the route job and navigates to the saved plan', async () => {
    saveMock.mockResolvedValue({ kind: 'ok', plan: savedPlan })
    renderPage()

    fireEvent.click(await findSaveButton())

    expect(await screen.findByText('Saved plan page')).toBeTruthy()
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock).toHaveBeenCalledWith('job-1')
  })

  it('disables the button while the save is pending so a double click sends one request', async () => {
    let resolveSave: (result: SaveGeneratedPlanResult) => void = () => {}
    saveMock.mockReturnValue(
      new Promise<SaveGeneratedPlanResult>((resolve) => {
        resolveSave = resolve
      }),
    )
    renderPage()

    const button = (await findSaveButton()) as HTMLButtonElement
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(button.disabled).toBe(true))
    expect(saveMock).toHaveBeenCalledTimes(1)

    resolveSave({ kind: 'ok', plan: savedPlan })
    expect(await screen.findByText('Saved plan page')).toBeTruthy()
  })

  it('shows the expiry message and keeps the plan when the job is gone', async () => {
    saveMock.mockResolvedValue({ kind: 'not-found' })
    renderPage()

    fireEvent.click(await findSaveButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('This plan has expired and can no longer be saved. Generate a new one.')
    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save plan' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each<SaveGeneratedPlanResult>([{ kind: 'error' }, { kind: 'not-completed' }])(
    'shows the generic message and keeps the plan on $kind',
    async (result) => {
      saveMock.mockResolvedValue(result)
      renderPage()

      fireEvent.click(await findSaveButton())

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Save plan' })).toBeTruthy()
    },
  )

  it('allows a retry after a failed save', async () => {
    saveMock.mockResolvedValueOnce({ kind: 'error' })
    saveMock.mockResolvedValueOnce({ kind: 'ok', plan: savedPlan })
    renderPage()

    fireEvent.click(await findSaveButton())
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await screen.findByText('Saved plan page')).toBeTruthy()
    expect(saveMock).toHaveBeenCalledTimes(2)
  })

  it('signs the user out on unauthorized', async () => {
    saveMock.mockResolvedValue({ kind: 'unauthorized', status: 401 })
    renderPage()

    fireEvent.click(await findSaveButton())

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(signOut).toHaveBeenCalledWith()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('signs the user out as blocked on blocked', async () => {
    saveMock.mockResolvedValue({ kind: 'blocked', status: 403 })
    renderPage()

    fireEvent.click(await findSaveButton())

    await waitFor(() => expect(signOut).toHaveBeenCalledWith('blocked'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
