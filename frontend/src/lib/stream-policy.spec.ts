import { describe, expect, it } from 'vitest'
import {
  isNewEvent,
  isStableConnection,
  nextBackoffMs,
  nextFailureCount,
  shouldFallBackToPolling,
} from './stream-policy'

describe('nextBackoffMs', () => {
  it('doubles from one second', () => {
    expect([1, 2, 3].map(nextBackoffMs)).toEqual([1000, 2000, 4000])
  })
})

describe('shouldFallBackToPolling', () => {
  it('switches after three consecutive failures', () => {
    expect([0, 1, 2, 3, 4].map(shouldFallBackToPolling)).toEqual([false, false, false, true, true])
  })
})

describe('isNewEvent', () => {
  it('accepts only ids greater than the last seen one', () => {
    expect(isNewEvent(3, 4)).toBe(true)
    expect(isNewEvent(3, 3)).toBe(false)
    expect(isNewEvent(3, 2)).toBe(false)
  })
})

describe('nextFailureCount', () => {
  it('counts consecutive failures and restarts the count after progress was received', () => {
    expect(nextFailureCount(0, false)).toBe(1)
    expect(nextFailureCount(2, false)).toBe(3)
    expect(nextFailureCount(2, true)).toBe(1)
  })
})

describe('isStableConnection', () => {
  it('treats a connection that closed within a second as unstable', () => {
    expect(isStableConnection(0)).toBe(false)
    expect(isStableConnection(999)).toBe(false)
    expect(isStableConnection(1000)).toBe(true)
    expect(isStableConnection(240_000)).toBe(true)
  })
})
