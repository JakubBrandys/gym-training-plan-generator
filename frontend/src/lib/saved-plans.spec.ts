import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api'
import { saveGeneratedPlan, type SavedPlanSummary } from './saved-plans'

vi.mock('./api', () => ({ apiFetch: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)

const savedPlan: SavedPlanSummary = {
  id: 'plan-1',
  createdAt: '2026-10-27T10:00:00.000Z',
  form: {
    experience: 'beginner',
    currentFrequency: 2,
    desiredFrequency: 4,
    heightCm: 180,
    weightKg: 80,
    goals: 'Build strength',
  },
}

const respondWith = (status: number, body: unknown = {}) =>
  apiFetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

describe('saveGeneratedPlan', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('posts the job id as JSON to the saved-plans endpoint', async () => {
    respondWith(201, savedPlan)

    await saveGeneratedPlan('job-1')

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = apiFetchMock.mock.calls[0]
    expect(path).toBe('/saved-plans')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ jobId: 'job-1' })
  })

  it('maps 201 to ok with the saved plan', async () => {
    respondWith(201, savedPlan)

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'ok', plan: savedPlan })
  })

  it('maps 401 to unauthorized', async () => {
    respondWith(401)

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'unauthorized', status: 401 })
  })

  it('maps 403 to blocked', async () => {
    respondWith(403)

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'blocked', status: 403 })
  })

  it('maps 404 to not-found', async () => {
    respondWith(404)

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'not-found' })
  })

  it('maps 409 to not-completed', async () => {
    respondWith(409, { code: 'not_completed' })

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'not-completed' })
  })

  it.each([400, 500, 503])('maps %i to error', async (status) => {
    respondWith(status)

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'error' })
  })

  it('maps a thrown fetch to error', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('network down'))

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'error' })
  })

  it('maps an unreadable success body to error', async () => {
    apiFetchMock.mockResolvedValue(new Response('not json', { status: 201 }))

    expect(await saveGeneratedPlan('job-1')).toEqual({ kind: 'error' })
  })
})
