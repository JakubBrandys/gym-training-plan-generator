import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedPlanSummary } from '../lib/saved-plans'
import type { DeletePhase } from './DeletePlanControl'
import { SavedPlanListItem } from './SavedPlanListItem'

const plan: SavedPlanSummary = {
  id: 'plan/1',
  createdAt: '2026-10-27T10:00:00.000Z',
  form: {
    experience: 'beginner',
    currentFrequency: 2,
    desiredFrequency: 4,
    heightCm: 180,
    weightKg: 80,
    goals: 'Build strength',
  },
  title: null,
}

const setup = (
  overrides: Partial<SavedPlanSummary> = {},
  deletePhase: DeletePhase = 'idle',
  deleteDisabled = false,
) => {
  const handlers = { onDeleteStart: vi.fn(), onDeleteConfirm: vi.fn(), onDeleteCancel: vi.fn() }
  render(
    <MemoryRouter>
      <ul>
        <SavedPlanListItem
          plan={{ ...plan, ...overrides }}
          deletePhase={deletePhase}
          deleteDisabled={deleteDisabled}
          {...handlers}
        />
      </ul>
    </MemoryRouter>,
  )
  return handlers
}

describe('SavedPlanListItem', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a list item with a single link to the plan', () => {
    setup()

    const item = screen.getByRole('listitem')
    const links = within(item).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/plans/plan%2F1')
  })

  it('shows the details inside the link and the delete control outside it', () => {
    setup()

    const link = screen.getByRole('link')
    expect(within(link).getByText('Build strength')).toBeTruthy()
    expect(within(link).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: /^Delete / }).closest('.saved-plans-actions')).toBeTruthy()
  })

  it('shows the title in the link when set', () => {
    setup({ title: 'Spring cut' })

    expect(within(screen.getByRole('link')).getByText('Spring cut').className).toBe('saved-plans-title')
  })

  it('shows no title line when the plan has none', () => {
    setup({ title: null })

    expect(screen.getByRole('link').querySelector('.saved-plans-title')).toBeNull()
  })

  it('labels the delete control with the title', () => {
    const { onDeleteStart } = setup({ title: 'Spring cut' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Spring cut' }))

    expect(onDeleteStart).toHaveBeenCalledTimes(1)
  })

  it('labels the delete control with the date when there is no title', () => {
    setup()

    const date = new Date(plan.createdAt).toLocaleDateString()
    expect(screen.getByRole('button', { name: `Delete plan from ${date}` })).toBeTruthy()
  })

  it('passes the delete phase and handlers through', () => {
    const { onDeleteConfirm, onDeleteCancel } = setup({ title: 'Spring cut' }, 'confirming')

    expect(screen.getByText('Delete Spring cut?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deleting Spring cut' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deleting Spring cut' }))

    expect(onDeleteConfirm).toHaveBeenCalledTimes(1)
    expect(onDeleteCancel).toHaveBeenCalledTimes(1)
  })

  it('shows the pending state', () => {
    setup({ title: 'Spring cut' }, 'pending')

    expect((screen.getByRole('button', { name: 'Deleting… Spring cut' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables the idle delete button when deleteDisabled', () => {
    setup({ title: 'Spring cut' }, 'idle', true)

    expect((screen.getByRole('button', { name: 'Delete Spring cut' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
