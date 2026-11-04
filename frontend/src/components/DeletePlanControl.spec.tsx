import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeletePlanControl, type DeletePhase } from './DeletePlanControl'

const label = 'Spring cut'

const setup = (phase: DeletePhase, disabled = false) => {
  const handlers = { onStart: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() }
  const view = render(<DeletePlanControl label={label} phase={phase} disabled={disabled} {...handlers} />)
  const rerender = (nextPhase: DeletePhase) =>
    view.rerender(<DeletePlanControl label={label} phase={nextPhase} disabled={disabled} {...handlers} />)
  return { ...view, ...handlers, rerender }
}

describe('DeletePlanControl', () => {
  afterEach(() => {
    cleanup()
  })

  describe('idle', () => {
    it('renders a danger Delete button named after the plan', () => {
      setup('idle')

      const button = screen.getByRole('button', { name: `Delete ${label}` })
      expect(button.textContent).toBe('Delete')
      expect(button.className).toBe('btn btn-danger')
      expect(screen.queryByText(`Delete ${label}?`)).toBeNull()
    })

    it('calls onStart on click', () => {
      const { onStart } = setup('idle')

      fireEvent.click(screen.getByRole('button', { name: `Delete ${label}` }))

      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('disables the button when disabled', () => {
      const { onStart } = setup('idle', true)

      const button = screen.getByRole('button', { name: `Delete ${label}` }) as HTMLButtonElement
      fireEvent.click(button)

      expect(button.disabled).toBe(true)
      expect(onStart).not.toHaveBeenCalled()
    })

    it('does not take focus on first mount', () => {
      setup('idle')

      expect(document.activeElement).toBe(document.body)
    })
  })

  describe('confirming', () => {
    it('asks for confirmation with named Confirm and Cancel buttons', () => {
      setup('confirming')

      expect(screen.getByText(`Delete ${label}?`)).toBeTruthy()
      const confirm = screen.getByRole('button', { name: `Confirm deleting ${label}` })
      const cancel = screen.getByRole('button', { name: `Cancel deleting ${label}` })
      expect(confirm.textContent).toBe('Confirm')
      expect(cancel.textContent).toBe('Cancel')
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
      expect((cancel as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByRole('button', { name: `Delete ${label}` })).toBeNull()
    })

    it('calls onConfirm and onCancel', () => {
      const { onConfirm, onCancel } = setup('confirming')

      fireEvent.click(screen.getByRole('button', { name: `Confirm deleting ${label}` }))
      fireEvent.click(screen.getByRole('button', { name: `Cancel deleting ${label}` }))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('does not take focus on first mount', () => {
      setup('confirming')

      expect(document.activeElement).toBe(document.body)
    })
  })

  describe('pending', () => {
    it('shows Deleting… and disables both buttons', () => {
      const { onConfirm, onCancel } = setup('pending')

      const deleting = screen.getByRole('button', { name: `Deleting… ${label}` }) as HTMLButtonElement
      const cancel = screen.getByRole('button', { name: `Cancel deleting ${label}` }) as HTMLButtonElement
      expect(deleting.textContent).toBe('Deleting…')
      expect(deleting.disabled).toBe(true)
      expect(cancel.disabled).toBe(true)

      fireEvent.click(deleting)
      fireEvent.click(cancel)
      expect(onConfirm).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  describe('focus', () => {
    it('moves focus to Cancel when confirming begins', () => {
      const { rerender } = setup('idle')

      rerender('confirming')

      expect(document.activeElement).toBe(screen.getByRole('button', { name: `Cancel deleting ${label}` }))
    })

    it('returns focus to Delete when confirming is cancelled', () => {
      const { rerender } = setup('idle')
      rerender('confirming')

      rerender('idle')

      expect(document.activeElement).toBe(screen.getByRole('button', { name: `Delete ${label}` }))
    })

    it('returns focus to Delete when a pending delete falls back to idle', () => {
      const { rerender } = setup('idle')
      rerender('confirming')
      rerender('pending')

      rerender('idle')

      expect(document.activeElement).toBe(screen.getByRole('button', { name: `Delete ${label}` }))
    })
  })
})
