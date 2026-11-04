import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PLAN_TITLE_LENGTH } from '../lib/saved-plans'
import { RenamePlanForm } from './RenamePlanForm'

type Overrides = Partial<{
  initialTitle: string | null
  pending: boolean
  error: string | null
}>

const setup = (overrides: Overrides = {}) => {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  const props = { initialTitle: null, pending: false, error: null, ...overrides }
  const view = render(<RenamePlanForm {...props} onSave={onSave} onCancel={onCancel} />)
  const rerender = (next: Overrides) =>
    view.rerender(<RenamePlanForm {...props} {...next} onSave={onSave} onCancel={onCancel} />)
  return { ...view, onSave, onCancel, rerender }
}

const input = () => screen.getByLabelText('Plan title') as HTMLInputElement

describe('RenamePlanForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a labelled text input limited to the maximum title length', () => {
    setup()

    expect(input().type).toBe('text')
    expect(input().maxLength).toBe(MAX_PLAN_TITLE_LENGTH)
  })

  it('prefills the input with the initial title', () => {
    setup({ initialTitle: 'Spring cut' })

    expect(input().value).toBe('Spring cut')
  })

  it('starts empty without an initial title', () => {
    setup({ initialTitle: null })

    expect(input().value).toBe('')
  })

  it('focuses the input on mount', () => {
    setup()

    expect(document.activeElement).toBe(input())
  })

  it('saves the trimmed value', () => {
    const { onSave } = setup()

    fireEvent.change(input(), { target: { value: '  Spring cut  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('Spring cut')
  })

  it('saves null for an empty value', () => {
    const { onSave } = setup({ initialTitle: 'Spring cut' })

    fireEvent.change(input(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('saves null for a whitespace-only value', () => {
    const { onSave } = setup()

    fireEvent.change(input(), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('saves on form submit', () => {
    const { onSave } = setup({ initialTitle: 'Spring cut' })

    fireEvent.submit(input().closest('form') as HTMLFormElement)

    expect(onSave).toHaveBeenCalledWith('Spring cut')
  })

  it('calls onCancel without saving', () => {
    const { onSave, onCancel } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('disables the input and both buttons while pending and labels Save as Saving…', () => {
    const { onSave, onCancel } = setup({ initialTitle: 'Spring cut', pending: true })

    const saving = screen.getByRole('button', { name: /Saving…/ }) as HTMLButtonElement
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(saving.textContent).toBe('Saving…')
    expect(saving.disabled).toBe(true)
    expect(cancel.disabled).toBe(true)
    expect(input().disabled).toBe(true)

    fireEvent.click(cancel)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows no alert without an error', () => {
    setup()

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a non-null error as an alert', () => {
    setup({ error: 'Something went wrong, try again' })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Something went wrong, try again')
    expect(alert.className).toBe('error')
  })

  it('keeps the draft and returns focus to the input after a pending save fails', () => {
    const { rerender } = setup()
    fireEvent.change(input(), { target: { value: 'Spring cut' } })

    rerender({ pending: true })
    rerender({ pending: false, error: 'Something went wrong, try again' })

    expect(input().value).toBe('Spring cut')
    expect(document.activeElement).toBe(input())
  })
})
