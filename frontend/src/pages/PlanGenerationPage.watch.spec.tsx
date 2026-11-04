import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../lib/api'
import type { PlanJobView, PlanResult } from '../lib/plan-generation'
import { PlanGenerationPage } from './PlanGenerationPage'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)
const useAuthMock = vi.mocked(useAuth)

const encoder = new TextEncoder()

const MINUTE_MS = 60 * 1000

type Step = (init?: RequestInit) => Response

const status =
  (code: number): Step =>
  () =>
    new Response(null, { status: code })

const eventFrame = (id: number, body: Record<string, unknown>): string =>
  `id: ${id}\ndata: ${JSON.stringify({ id, at: '2026-11-04T10:00:00.000Z', ...body })}\n\n`

const stream =
  (chunks: string[], { closes }: { closes: boolean }): Step =>
  (init) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
          if (closes) {
            controller.close()
            return
          }
          const fail = () => controller.error(new DOMException('aborted', 'AbortError'))
          if (init?.signal?.aborted) fail()
          else init?.signal?.addEventListener('abort', fail)
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )

const jobView = (overrides: Partial<PlanJobView> = {}): PlanJobView => ({
  status: 'running',
  stage: 'drafting',
  week: 2,
  plan: null,
  error: null,
  ...overrides,
})

const snapshot =
  (overrides: Partial<PlanJobView> = {}): Step =>
  () =>
    new Response(JSON.stringify(jobView(overrides)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

const validPlan: PlanResult = {
  weeks: [
    {
      week: 1,
      goal: 'Build a movement base',
      sessions: [
        {
          title: 'Full body',
          exercises: [
            {
              slug: 'goblet-squat',
              name: 'Goblet squat',
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

const malformedPlan = {
  weeks: [{ week: 1, goal: 'Build a movement base', sessions: [{ title: 'Full body' }] }],
}

const completedSnapshotWith = (plan: unknown): Step =>
  snapshot({ status: 'completed', stage: null, week: null, plan: plan as PlanJobView['plan'] })

const nextStep = (steps: Step[]): Step => {
  if (steps.length === 0) {
    return () => {
      throw new Error('unexpected request')
    }
  }
  return steps.length > 1 ? (steps.shift() ?? steps[0]) : steps[0]
}

const serve = ({ stream: streamSteps = [], snapshot: snapshotSteps = [] }: { stream?: Step[]; snapshot?: Step[] }) => {
  const streamQueue = [...streamSteps]
  const snapshotQueue = [...snapshotSteps]
  apiFetchMock.mockImplementation(async (path, init) =>
    nextStep(path.endsWith('/events') ? streamQueue : snapshotQueue)(init),
  )
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/plans/generate/job-1']}>
      <Routes>
        <Route path="/plans/generate/:jobId" element={<PlanGenerationPage />} />
      </Routes>
    </MemoryRouter>,
  )

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const NOT_FOUND_MESSAGE = 'This plan could not be found or has expired.'
const GENERIC_MESSAGE = 'Something went wrong, try again'

const startAgainLink = () => screen.queryByRole('link', { name: 'Start again' })
const retryButton = () => screen.queryByRole('button', { name: 'Retry' })
const saveButton = () => screen.queryByRole('button', { name: 'Save plan' })

describe('PlanGenerationPage with the real watch layer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiFetchMock.mockReset()
    useAuthMock.mockReturnValue({
      session: null,
      loading: false,
      signOutReason: null,
      signOut: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  describe('after a server restart', () => {
    it('tells the user the plan could not be found and offers to start again when the stream is cut and the reconnect finds nothing', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'stage', stage: 'drafting' })], { closes: true }), status(404)],
      })

      renderPage()
      await advance(5000)

      expect(screen.getByRole('alert').textContent).toBe(NOT_FOUND_MESSAGE)
      expect(startAgainLink()?.getAttribute('href')).toBe('/plans/new')
      expect(retryButton()).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  describe('during an outage', () => {
    it('ends in the generic error with Retry and no Start again, and Retry then reaches the not-found message', async () => {
      serve({ stream: [status(502)], snapshot: [status(502)] })

      renderPage()
      expect(screen.getByRole('status').textContent).toBe('Starting…')
      await advance(MINUTE_MS)

      expect(screen.getByRole('alert').textContent).toBe(GENERIC_MESSAGE)
      expect(retryButton()).not.toBeNull()
      expect(startAgainLink()).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()

      serve({ stream: [status(404)] })
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await advance(0)

      expect(screen.getByRole('alert').textContent).toBe(NOT_FOUND_MESSAGE)
      expect(startAgainLink()?.getAttribute('href')).toBe('/plans/new')
      expect(retryButton()).toBeNull()
    })
  })

  describe('when generation completes', () => {
    const completedStream = stream([eventFrame(1, { type: 'completed' })], { closes: true })

    it('shows the plan with the Save button for a valid plan', async () => {
      serve({ stream: [completedStream], snapshot: [completedSnapshotWith(validPlan)] })

      renderPage()
      await advance(0)

      expect(saveButton()).not.toBeNull()
      expect(screen.getByRole('heading', { level: 2, name: 'Week 1' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Create another plan' }).getAttribute('href')).toBe('/plans/new')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('shows the generic error and no Save button for a malformed plan', async () => {
      serve({ stream: [completedStream], snapshot: [completedSnapshotWith(malformedPlan)] })

      renderPage()
      await advance(0)

      expect(screen.getByRole('alert').textContent).toBe(GENERIC_MESSAGE)
      expect(saveButton()).toBeNull()
      expect(screen.queryByRole('heading', { level: 2, name: 'Week 1' })).toBeNull()
      expect(retryButton()).not.toBeNull()
    })
  })
})
