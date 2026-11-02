import { describe, expect, it } from 'vitest'
import { weekFromHash, weekHash } from './week-hash'

describe('weekFromHash', () => {
  it.each([
    ['#week-1', 8, 1],
    ['#week-3', 8, 3],
    ['#week-8', 8, 8],
  ])('selects the week for %s in an %i-week plan', (hash, weekCount, expected) => {
    expect(weekFromHash(hash, weekCount)).toBe(expected)
  })

  it.each([
    ['#week-9', 8],
    ['#week-0', 8],
    ['#week-03', 8],
    ['#week-', 8],
    ['#week-3x', 8],
    ['#foo', 8],
    ['week-3', 8],
    ['', 8],
  ])('falls back to week 1 for %j', (hash, weekCount) => {
    expect(weekFromHash(hash, weekCount)).toBe(1)
  })

  it('falls back to week 1 when the week is beyond a one-week plan', () => {
    expect(weekFromHash('#week-2', 1)).toBe(1)
    expect(weekFromHash('#week-1', 1)).toBe(1)
  })
})

describe('weekHash', () => {
  it('builds the hash for a week', () => {
    expect(weekHash(3)).toBe('#week-3')
  })

  it('round-trips through weekFromHash', () => {
    for (const week of [1, 4, 8]) {
      expect(weekFromHash(weekHash(week), 8)).toBe(week)
    }
  })
})
