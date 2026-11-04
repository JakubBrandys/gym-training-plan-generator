import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { MAX_PLAN_TITLE_LENGTH } from '../lib/saved-plans'
import { Button } from './Button'

type RenamePlanFormProps = {
  initialTitle: string | null
  pending: boolean
  error: string | null
  onSave: (title: string | null) => void
  onCancel: () => void
}

export const RenamePlanForm = ({
  initialTitle,
  pending,
  error,
  onSave,
  onCancel,
}: RenamePlanFormProps) => {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const wasPending = useRef(pending)
  const [draft, setDraft] = useState(initialTitle ?? '')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus()
    wasPending.current = pending
  }, [pending])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draft.trim()
    onSave(trimmed === '' ? null : trimmed)
  }

  return (
    <form className="rename-form" onSubmit={handleSubmit}>
      <label htmlFor={inputId}>Plan title</label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={MAX_PLAN_TITLE_LENGTH}
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        type="submit"
        aria-label={pending ? 'Saving… plan title' : undefined}
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="secondary" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
