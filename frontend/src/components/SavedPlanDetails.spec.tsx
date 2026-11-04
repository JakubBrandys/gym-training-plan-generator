import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanForm } from '../lib/plan-generation'
import { SavedPlanDetails } from './SavedPlanDetails'

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 4,
  heightCm: 180,
  weightKg: 80,
  goals: 'Build strength',
}

const createdAt = '2026-10-27T10:00:00.000Z'

describe('SavedPlanDetails', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the title first in a title span', () => {
    const { container } = render(<SavedPlanDetails createdAt={createdAt} form={form} title="Spring cut" />)

    const title = screen.getByText('Spring cut')
    expect(title.className).toBe('saved-plans-title')
    expect(container.querySelector('.saved-plans-details')?.firstElementChild).toBe(title)
  })

  it.each([null, undefined, ''])('renders no title line for %j', (title) => {
    const { container } = render(<SavedPlanDetails createdAt={createdAt} form={form} title={title} />)

    expect(container.querySelector('.saved-plans-title')).toBeNull()
    expect(container.querySelector('.saved-plans-details')?.firstElementChild?.className).toBe(
      'saved-plans-date',
    )
  })

  it('keeps the date, experience, frequency and goals', () => {
    render(<SavedPlanDetails createdAt={createdAt} form={form} title="Spring cut" />)

    expect(screen.getByText(new Date(createdAt).toLocaleDateString())).toBeTruthy()
    expect(screen.getByText('Experience: Beginner')).toBeTruthy()
    expect(screen.getByText('Days per week: 2 → 4')).toBeTruthy()
    expect(screen.getByText('Build strength')).toBeTruthy()
  })
})
