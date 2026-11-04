import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import type { PlanJobErrorCode, PlanResult } from '../lib/plan-generation'
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
  title: null,
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

const renderPageWithoutJobId = () =>
  render(
    <MemoryRouter initialEntries={['/plans/generate']}>
      <Routes>
        <Route path="/plans/generate" element={<PlanGenerationPage />} />
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

  it('renders Save plan as the shared primary button above the plan', async () => {
    renderPage()

    const save = await findSaveButton()

    expect(save.className).toBe('btn')
    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(
      save.compareDocumentPosition(screen.getByRole('heading', { level: 2, name: 'Week 1' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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

  it('shows the generic message, keeps the plan and re-enables Save when the save call rejects', async () => {
    saveMock.mockRejectedValue(new Error('network down'))
    renderPage()

    fireEvent.click(await findSaveButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create another plan' })).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Save plan' }) as HTMLButtonElement).disabled).toBe(false),
    )
  })

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

describe('PlanGenerationPage state rendering', () => {
  const neverSettles = () => new Promise<void>(() => {})

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
  })

  afterEach(() => {
    cleanup()
  })

  const startAgainLink = () => screen.getByRole('link', { name: 'Start again' })

  describe('running', () => {
    it('shows Starting before any stage is known', async () => {
      emitState({ status: 'running', progress: initialProgress })
      renderPage()

      const status = await screen.findByRole('status')
      expect(status.textContent).toBe('Starting…')
    })

    it('shows the week being drafted', async () => {
      emitState({ status: 'running', progress: { ...initialProgress, stage: 'drafting', week: 3 } })
      renderPage()

      const status = await screen.findByRole('status')
      expect(status.textContent).toBe('Drafting your plan, week 3 of 8…')
    })

    it('shows the retrying notice next to the progress', async () => {
      emitState({
        status: 'running',
        progress: { ...initialProgress, stage: 'drafting', week: 3, retrying: true },
      })
      renderPage()

      expect((await screen.findByRole('status')).textContent).toBe('Drafting your plan, week 3 of 8…')
      expect(screen.getByText('Trying again…')).toBeTruthy()
    })

    it('shows the validating notice next to the progress', async () => {
      emitState({
        status: 'running',
        progress: { ...initialProgress, stage: 'drafting', week: 3, validating: true },
      })
      renderPage()

      expect((await screen.findByRole('status')).textContent).toBe('Drafting your plan, week 3 of 8…')
      expect(screen.getByText('Checking the plan…')).toBeTruthy()
    })

    it('offers neither Start again nor Retry while running', async () => {
      emitState({ status: 'running', progress: initialProgress })
      renderPage()

      await screen.findByRole('status')
      expect(screen.queryByRole('link', { name: 'Start again' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })
  })

  describe('failed', () => {
    it.each<[PlanJobErrorCode, string]>([
      ['provider_unavailable', 'The plan service is unavailable right now. Try again later.'],
      ['invalid_output', 'We could not build a valid plan this time. Try again.'],
      ['internal', 'Something went wrong, try again'],
    ])('shows the %s message with a way to start again', async (code, message) => {
      emitState({ status: 'failed', code })
      renderPage()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe(message)
      expect(startAgainLink().getAttribute('href')).toBe('/plans/new')
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })
  })

  describe('not found', () => {
    it('shows the expiry message with a way to start again', async () => {
      emitState({ status: 'not-found' })
      renderPage()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('This plan could not be found or has expired.')
      expect(startAgainLink().getAttribute('href')).toBe('/plans/new')
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })

    it('shows the same message without asking the watch when the route has no job id', async () => {
      renderPageWithoutJobId()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('This plan could not be found or has expired.')
      expect(startAgainLink().getAttribute('href')).toBe('/plans/new')
      expect(watchMock).not.toHaveBeenCalled()
    })
  })

  describe('error and timed out', () => {
    it('shows the generic message and Retry, without Start again, on error', async () => {
      emitState({ status: 'error' })
      renderPage()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('Something went wrong, try again')
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Start again' })).toBeNull()
    })

    it('shows the slow-generation message and Retry on timed-out', async () => {
      emitState({ status: 'timed-out' })
      renderPage()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('This is taking longer than expected. Check back later.')
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Start again' })).toBeNull()
    })

    it.each<['error' | 'timed-out']>([['error'], ['timed-out']])(
      'watches again with a new abort signal and returns to running when Retry is pressed after %s',
      async (status) => {
        watchMock.mockImplementationOnce(async (_jobId, _signal, handlers) => {
          handlers.onState({ status })
        })
        watchMock.mockImplementationOnce(neverSettles)
        renderPage()

        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

        await waitFor(() => expect(watchMock).toHaveBeenCalledTimes(2))
        expect(watchMock.mock.calls[1][0]).toBe('job-1')
        expect(watchMock.mock.calls[1][1]).not.toBe(watchMock.mock.calls[0][1])
        expect(watchMock.mock.calls[0][1].aborted).toBe(true)
        expect(watchMock.mock.calls[1][1].aborted).toBe(false)
        expect((await screen.findByRole('status')).textContent).toBe('Starting…')
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
      },
    )
  })

  describe('completed', () => {
    it('offers to create another plan next to the plan', async () => {
      emitState({ status: 'completed', plan })
      renderPage()

      const link = await screen.findByRole('link', { name: 'Create another plan' })
      expect(link.getAttribute('href')).toBe('/plans/new')
      expect(screen.queryByRole('link', { name: 'Start again' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })
  })

  describe('unmounting', () => {
    it('aborts the signal given to the watch', async () => {
      watchMock.mockImplementation(neverSettles)
      const { unmount } = renderPage()

      await waitFor(() => expect(watchMock).toHaveBeenCalledTimes(1))
      const signal = watchMock.mock.calls[0][1]
      expect(signal.aborted).toBe(false)

      unmount()

      expect(signal.aborted).toBe(true)
    })
  })
})
