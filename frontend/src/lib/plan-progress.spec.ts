import { describe, expect, it } from 'vitest'
import {
  initialProgress,
  isTerminalEvent,
  parseProgressEvent,
  progressFromSnapshot,
  reduceProgress,
  type PlanProgressEvent,
  type ProgressState,
} from './plan-progress'

const at = '2026-01-01T00:00:00.000Z'

const drafting: ProgressState = {
  stage: 'drafting',
  week: 3,
  retrying: false,
  validating: false,
  stageStartedAt: at,
  terminal: false,
}

describe('reduceProgress', () => {
  it('sets the stage, resets the week and records the pass start', () => {
    const next = reduceProgress(drafting, { id: 5, at: '2026-01-01T00:01:00.000Z', type: 'stage', stage: 'reviewing' })

    expect(next).toEqual({
      stage: 'reviewing',
      week: 0,
      retrying: false,
      validating: false,
      stageStartedAt: '2026-01-01T00:01:00.000Z',
      terminal: false,
    })
  })

  it('records the week and keeps the pass start', () => {
    const next = reduceProgress(initialProgress, { id: 2, at, type: 'week', stage: 'drafting', week: 4 })

    expect(next.week).toBe(4)
    expect(next.stage).toBe('drafting')
    expect(next.stageStartedAt).toBeNull()
  })

  it('shows the validating notice and clears it when a week arrives', () => {
    const validating = reduceProgress(drafting, { id: 6, at, type: 'validating', stage: 'drafting' })
    expect(validating.validating).toBe(true)

    const resumed = reduceProgress(validating, { id: 7, at, type: 'week', stage: 'drafting', week: 1 })
    expect(resumed.validating).toBe(false)
  })

  it('shows the retry notice and clears week and validating', () => {
    const validating = { ...drafting, validating: true }
    const next = reduceProgress(validating, { id: 8, at, type: 'retrying', stage: 'drafting', attempt: 1 })

    expect(next.retrying).toBe(true)
    expect(next.validating).toBe(false)
    expect(next.week).toBe(0)
    expect(next.stageStartedAt).toBe(at)
  })

  it('clears the retry notice on the next stage event', () => {
    const retrying = reduceProgress(drafting, { id: 8, at, type: 'retrying', stage: 'drafting', attempt: 1 })
    const next = reduceProgress(retrying, { id: 9, at, type: 'stage', stage: 'drafting' })

    expect(next.retrying).toBe(false)
  })

  it('marks terminal events', () => {
    expect(reduceProgress(drafting, { id: 10, at, type: 'completed' }).terminal).toBe(true)
    expect(reduceProgress(drafting, { id: 10, at, type: 'failed', code: 'internal' }).terminal).toBe(true)
  })

  it('ignores unknown event types', () => {
    const unknown = { id: 11, at, type: 'telemetry' } as unknown as PlanProgressEvent

    expect(reduceProgress(drafting, unknown)).toBe(drafting)
  })
})

describe('progressFromSnapshot', () => {
  it('keeps the pass start while the stage is unchanged', () => {
    const next = progressFromSnapshot(drafting, { stage: 'drafting', week: 5 }, '2026-01-01T00:05:00.000Z')

    expect(next.stageStartedAt).toBe(at)
    expect(next.week).toBe(5)
  })

  it('restarts the pass clock when the stage changes', () => {
    const next = progressFromSnapshot(drafting, { stage: 'reviewing', week: null }, '2026-01-01T00:05:00.000Z')

    expect(next.stageStartedAt).toBe('2026-01-01T00:05:00.000Z')
    expect(next.week).toBe(0)
  })

  it('has no pass clock without a stage', () => {
    expect(progressFromSnapshot(initialProgress, { stage: null, week: null }, at).stageStartedAt).toBeNull()
  })
})

describe('parseProgressEvent', () => {
  it('parses a valid event', () => {
    expect(parseProgressEvent(JSON.stringify({ id: 1, at, type: 'stage', stage: 'drafting' }))).toEqual({
      id: 1,
      at,
      type: 'stage',
      stage: 'drafting',
    })
  })

  it('rejects malformed payloads', () => {
    expect(parseProgressEvent('not json')).toBeNull()
    expect(parseProgressEvent('null')).toBeNull()
    expect(parseProgressEvent('{}')).toBeNull()
    expect(parseProgressEvent(JSON.stringify({ id: '1', at, type: 'stage' }))).toBeNull()
  })
})

describe('isTerminalEvent', () => {
  it('is true only for completed and failed', () => {
    expect(isTerminalEvent({ type: 'completed' })).toBe(true)
    expect(isTerminalEvent({ type: 'failed' })).toBe(true)
    expect(isTerminalEvent({ type: 'week' })).toBe(false)
  })
})

describe('parseProgressEvent payload validation', () => {
  const parse = (fields: Record<string, unknown>) => parseProgressEvent(JSON.stringify({ id: 1, at, ...fields }))

  it('rejects a week event without a whole week inside the plan range', () => {
    expect(parse({ type: 'week', stage: 'drafting' })).toBeNull()
    expect(parse({ type: 'week', stage: 'drafting', week: '3' })).toBeNull()
    expect(parse({ type: 'week', stage: 'drafting', week: 0 })).toBeNull()
    expect(parse({ type: 'week', stage: 'drafting', week: 9 })).toBeNull()
    expect(parse({ type: 'week', stage: 'drafting', week: 2.5 })).toBeNull()
    expect(parse({ type: 'week', stage: 'drafting', week: 8 })).not.toBeNull()
  })

  it('rejects events whose stage is missing or unknown', () => {
    expect(parse({ type: 'stage' })).toBeNull()
    expect(parse({ type: 'stage', stage: 'finishing' })).toBeNull()
    expect(parse({ type: 'validating', stage: 3 })).toBeNull()
  })

  it('rejects a retrying event without a positive attempt and a failed event without a code', () => {
    expect(parse({ type: 'retrying', stage: 'drafting' })).toBeNull()
    expect(parse({ type: 'retrying', stage: 'drafting', attempt: 0 })).toBeNull()
    expect(parse({ type: 'retrying', stage: 'drafting', attempt: 2 })).not.toBeNull()
    expect(parse({ type: 'failed' })).toBeNull()
    expect(parse({ type: 'failed', code: 'internal' })).not.toBeNull()
  })

  it('still passes unknown event types through for the reducer to ignore', () => {
    expect(parse({ type: 'something-new' })).not.toBeNull()
    expect(parse({ type: 'completed' })).not.toBeNull()
  })
})
