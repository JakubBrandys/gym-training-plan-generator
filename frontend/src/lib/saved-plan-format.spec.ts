import { describe, expect, it } from 'vitest'
import { formatSavedDate, savedPlanLabel } from './saved-plan-format'

const createdAt = '2026-10-27T10:00:00.000Z'

describe('savedPlanLabel', () => {
  it('returns the title when one is set', () => {
    expect(savedPlanLabel({ title: 'Spring cut', createdAt })).toBe('Spring cut')
  })

  it.each([null, undefined, ''])('falls back to the saved date for the title %j', (title) => {
    expect(savedPlanLabel({ title, createdAt })).toBe(`plan from ${formatSavedDate(createdAt)}`)
  })

  it('accepts a summary without a title field', () => {
    expect(savedPlanLabel({ createdAt })).toBe(`plan from ${formatSavedDate(createdAt)}`)
  })
})
