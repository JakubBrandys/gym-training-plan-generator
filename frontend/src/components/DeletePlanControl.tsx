import { useEffect, useRef } from 'react'
import { Button } from './Button'

export type DeletePhase = 'idle' | 'confirming' | 'pending'

type DeletePlanControlProps = {
  label: string
  phase: DeletePhase
  disabled?: boolean
  onStart: () => void
  onConfirm: () => void
  onCancel: () => void
}

export const DeletePlanControl = ({
  label,
  phase,
  disabled = false,
  onStart,
  onConfirm,
  onCancel,
}: DeletePlanControlProps) => {
  const deleteRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousPhase = useRef(phase)

  useEffect(() => {
    const previous = previousPhase.current
    previousPhase.current = phase

    if (previous === phase) return

    if (phase === 'confirming' && previous === 'idle') {
      cancelRef.current?.focus()
      return
    }

    if (phase === 'idle') deleteRef.current?.focus()
  }, [phase])

  if (phase === 'idle') {
    return (
      <Button
        ref={deleteRef}
        variant="danger"
        aria-label={`Delete ${label}`}
        disabled={disabled}
        onClick={onStart}
      >
        Delete
      </Button>
    )
  }

  const pending = phase === 'pending'

  return (
    <>
      <span>{`Delete ${label}?`}</span>
      <Button
        variant="danger"
        aria-label={pending ? `Deleting… ${label}` : `Confirm deleting ${label}`}
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? 'Deleting…' : 'Confirm'}
      </Button>
      <Button
        ref={cancelRef}
        variant="secondary"
        aria-label={`Cancel deleting ${label}`}
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </>
  )
}
