import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api'
import type { PlanJobView, PlanResult } from './plan-generation'
import { watchPlanGeneration, type WatchState } from './plan-generation-watch'

vi.mock('./api', () => ({ apiFetch: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)

const encoder = new TextEncoder()

const MINUTE_MS = 60 * 1000

type Step = (init?: RequestInit) => Response

const status =
  (code: number): Step =>
  () =>
    new Response(null, { status: code })

const refused: Step = () => {
  throw new TypeError('Failed to fetch')
}

const eventFrame = (id: number, body: Record<string, unknown>): string =>
  `id: ${id}\ndata: ${JSON.stringify({ id, at: '2026-11-04T10:00:00.000Z', ...body })}\n\n`

const reconnectFrame = 'event: reconnect\ndata: {}\n\n'

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
              imageKey: 'goblet-squat',
            },
          ],
        },
      ],
    },
  ],
}

const completedSnapshot = snapshot({ status: 'completed', stage: null, week: null, plan: validPlan })

const malformedPlans: [string, unknown][] = [
  ['an empty object', {}],
  ['empty weeks', { weeks: [] }],
  [
    'a session without exercises',
    { weeks: [{ week: 1, goal: 'Build a movement base', sessions: [{ title: 'Full body' }] }] },
  ],
]

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

const streamCalls = () => apiFetchMock.mock.calls.filter(([path]) => path.endsWith('/events'))

const startWatch = () => {
  const controller = new AbortController()
  const states: WatchState[] = []
  const onAuthFailure = vi.fn()
  let settled = false

  void watchPlanGeneration('job-1', controller.signal, {
    onState: (state) => states.push(state),
    onAuthFailure,
  }).then(() => {
    settled = true
  })

  return {
    controller,
    states,
    onAuthFailure,
    isSettled: () => settled,
    statuses: () => states.map((state) => state.status),
    lastState: () => states.at(-1),
  }
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('watchPlanGeneration outcomes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiFetchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('a job that is gone', () => {
    it('reports not-found when the stream answers 404', async () => {
      serve({ stream: [status(404)] })

      const watch = startWatch()
      await advance(0)

      expect(watch.statuses()).toEqual(['running', 'not-found'])
      expect(watch.isSettled()).toBe(true)
    })

    it('reports not-found when the stream is cut and the reconnect answers 404', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'stage', stage: 'drafting' })], { closes: true }), status(404)],
      })

      const watch = startWatch()
      await advance(5000)

      expect(watch.lastState()).toEqual({ status: 'not-found' })
      expect(watch.isSettled()).toBe(true)
    })

    it('resumes the reconnect from the last event it received', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'stage', stage: 'drafting' })], { closes: true }), status(404)],
      })

      startWatch()
      await advance(5000)

      const [first, second] = streamCalls()
      expect(new Headers(first[1]?.headers).get('Last-Event-ID')).toBeNull()
      expect(new Headers(second[1]?.headers).get('Last-Event-ID')).toBe('1')
    })

    it('reports not-found when a reconnect frame is followed by a 404', async () => {
      serve({ stream: [stream([reconnectFrame], { closes: true }), status(404)] })

      const watch = startWatch()
      await advance(5000)

      expect(watch.lastState()).toEqual({ status: 'not-found' })
      expect(watch.isSettled()).toBe(true)
    })

    it('reports not-found when the job vanishes between the completed event and the snapshot', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'completed' })], { closes: true })],
        snapshot: [status(404)],
      })

      const watch = startWatch()
      await advance(0)

      expect(watch.lastState()).toEqual({ status: 'not-found' })
      expect(watch.isSettled()).toBe(true)
    })

    it('reports not-found when polling finds the job gone', async () => {
      serve({ stream: [status(502)], snapshot: [snapshot(), status(404)] })

      const watch = startWatch()
      await advance(30_000)

      expect(watch.lastState()).toEqual({ status: 'not-found' })
      expect(watch.isSettled()).toBe(true)
    })
  })

  describe('a terminal failed event', () => {
    it.each(['provider_unavailable', 'invalid_output', 'internal'] as const)(
      'reports failed with the %s code',
      async (code) => {
        serve({ stream: [stream([eventFrame(1, { type: 'failed', code })], { closes: true })] })

        const watch = startWatch()
        await advance(0)

        expect(watch.lastState()).toEqual({ status: 'failed', code })
        expect(watch.isSettled()).toBe(true)
      },
    )

    it('reports an unrecognised failure code as internal', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'failed', code: 'quota_exceeded' })], { closes: true })],
      })

      const watch = startWatch()
      await advance(0)

      expect(watch.lastState()).toEqual({ status: 'failed', code: 'internal' })
    })
  })

  describe('a terminal completed event', () => {
    const completedStream = stream([eventFrame(1, { type: 'completed' })], { closes: true })

    it('reports completed with the plan from the snapshot', async () => {
      serve({ stream: [completedStream], snapshot: [completedSnapshot] })

      const watch = startWatch()
      await advance(0)

      expect(watch.lastState()).toEqual({ status: 'completed', plan: validPlan })
      expect(watch.isSettled()).toBe(true)
    })

    it.each([
      ['a 500', status(500)],
      ['a snapshot that still says running', snapshot()],
      ['a rejected request', refused],
    ])('reports error when the snapshot is %s', async (_label, step) => {
      serve({ stream: [completedStream], snapshot: [step] })

      const watch = startWatch()
      await advance(0)

      expect(watch.lastState()).toEqual({ status: 'error' })
      expect(watch.isSettled()).toBe(true)
    })

    it.each(malformedPlans)('reports error when the snapshot carries %s as its plan', async (_label, plan) => {
      serve({ stream: [completedStream], snapshot: [completedSnapshotWith(plan)] })

      const watch = startWatch()
      await advance(0)

      expect(watch.lastState()).toEqual({ status: 'error' })
      expect(watch.statuses()).not.toContain('completed')
      expect(watch.isSettled()).toBe(true)
    })
  })

  describe('a server that fails', () => {
    it.each([
      ['answers 502 to every request', status(502)],
      ['refuses every connection', refused],
    ])('ends in error within a minute when it %s', async (_label, step) => {
      serve({ stream: [step], snapshot: [step] })

      const watch = startWatch()
      await advance(MINUTE_MS)

      expect(watch.lastState()).toEqual({ status: 'error' })
      expect(watch.isSettled()).toBe(true)
    })

    it('keeps showing progress and never reports a terminal state before it gives up', async () => {
      serve({ stream: [status(502)], snapshot: [status(502)] })

      const watch = startWatch()
      await advance(MINUTE_MS)

      expect(watch.statuses()).toEqual(['running', 'error'])
    })

    it('reports the failed job that polling finds after the stream gives up', async () => {
      serve({
        stream: [status(502)],
        snapshot: [snapshot({ status: 'failed', stage: null, week: null, error: { code: 'invalid_output' } })],
      })

      const watch = startWatch()
      await advance(30_000)

      expect(watch.lastState()).toEqual({ status: 'failed', code: 'invalid_output' })
      expect(watch.isSettled()).toBe(true)
    })

    it('reports the completed plan that polling finds after the stream gives up', async () => {
      serve({ stream: [status(502)], snapshot: [snapshot(), completedSnapshot] })

      const watch = startWatch()
      await advance(30_000)

      expect(watch.lastState()).toEqual({ status: 'completed', plan: validPlan })
      expect(watch.isSettled()).toBe(true)
    })

    it.each(malformedPlans)('reports error when polling finds %s as the completed plan', async (_label, plan) => {
      serve({ stream: [status(502)], snapshot: [snapshot(), completedSnapshotWith(plan)] })

      const watch = startWatch()
      await advance(30_000)

      expect(watch.lastState()).toEqual({ status: 'error' })
      expect(watch.statuses()).not.toContain('completed')
      expect(watch.isSettled()).toBe(true)
    })
  })

  describe('a job that never finishes', () => {
    const silentStream = stream([], { closes: false })

    it('keeps watching a silent job for most of the time cap', async () => {
      serve({ stream: [silentStream], snapshot: [snapshot()] })

      const watch = startWatch()
      await advance(11 * MINUTE_MS)

      expect(watch.isSettled()).toBe(false)
      expect(watch.lastState()?.status).toBe('running')
    })

    it('gives up with timed-out once the 12 minute cap has passed', async () => {
      serve({ stream: [silentStream], snapshot: [snapshot()] })

      const watch = startWatch()
      await advance(12 * MINUTE_MS + 30_000)

      expect(watch.lastState()).toEqual({ status: 'timed-out' })
      expect(watch.isSettled()).toBe(true)
    })
  })

  describe('an authorisation failure', () => {
    it('hands a 401 on the stream to the auth handler and reports no terminal state', async () => {
      serve({ stream: [status(401)] })

      const watch = startWatch()
      await advance(0)

      expect(watch.onAuthFailure).toHaveBeenCalledWith(401)
      expect(watch.statuses()).toEqual(['running'])
      expect(watch.isSettled()).toBe(true)
    })

    it('hands a 403 on a snapshot poll to the auth handler and reports no terminal state', async () => {
      serve({ stream: [status(502)], snapshot: [status(403)] })

      const watch = startWatch()
      await advance(30_000)

      expect(watch.onAuthFailure).toHaveBeenCalledWith(403)
      expect(watch.statuses()).toEqual(['running'])
      expect(watch.isSettled()).toBe(true)
    })
  })

  describe('an aborted watch', () => {
    it('stops emitting states and sending requests once aborted mid-stream', async () => {
      serve({
        stream: [stream([eventFrame(1, { type: 'stage', stage: 'drafting' })], { closes: false })],
        snapshot: [snapshot()],
      })

      const watch = startWatch()
      await advance(0)
      const statesBeforeAbort = [...watch.states]
      const requestsBeforeAbort = apiFetchMock.mock.calls.length

      watch.controller.abort()
      await advance(MINUTE_MS)

      expect(statesBeforeAbort.length).toBeGreaterThan(1)
      expect(watch.states).toEqual(statesBeforeAbort)
      expect(apiFetchMock.mock.calls.length).toBe(requestsBeforeAbort)
      expect(watch.isSettled()).toBe(true)
    })

    it('stops retrying once aborted during the back-off after a failed request', async () => {
      serve({ stream: [status(502)], snapshot: [snapshot()] })

      const watch = startWatch()
      await advance(0)
      const requestsBeforeAbort = apiFetchMock.mock.calls.length

      watch.controller.abort()
      await advance(MINUTE_MS)

      expect(watch.statuses()).toEqual(['running'])
      expect(apiFetchMock.mock.calls.length).toBe(requestsBeforeAbort)
      expect(watch.isSettled()).toBe(true)
    })
  })
})
