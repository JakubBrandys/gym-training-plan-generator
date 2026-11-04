import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { SavedPlanListItem } from '../components/SavedPlanListItem'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { deleteSavedPlan, listSavedPlans, type SavedPlanSummary } from '../lib/saved-plans'

type SavedPlansState =
  | { status: 'loading' }
  | { status: 'ready'; plans: SavedPlanSummary[] }
  | { status: 'error' }

type DeletingState = { id: string; phase: 'confirming' | 'pending' } | null

export const SavedPlansPage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<SavedPlansState>({ status: 'loading' })
  const [deleting, setDeleting] = useState<DeletingState>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [headingFocusRequest, setHeadingFocusRequest] = useState(0)
  const mountedRef = useRef(true)
  const deleteAttemptRef = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (headingFocusRequest > 0) headingRef.current?.focus()
  }, [headingFocusRequest])

  useEffect(() => {
    let cancelled = false

    const loadPlans = async () => {
      const result = await listSavedPlans()
      if (cancelled) return

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      setState(result.kind === 'ok' ? { status: 'ready', plans: result.plans } : { status: 'error' })
    }

    void loadPlans()

    return () => {
      cancelled = true
    }
  }, [signOut])

  const refreshPlans = async (attempt: number) => {
    const result = await listSavedPlans()
    if (!mountedRef.current || attempt !== deleteAttemptRef.current) return

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handleAuthFailure(result.status, signOut)
      return
    }

    if (result.kind === 'ok') setState({ status: 'ready', plans: result.plans })
  }

  const startDelete = (id: string) => {
    setNotice(null)
    setDeleting({ id, phase: 'confirming' })
  }

  const cancelDelete = () => {
    setDeleting(null)
  }

  const confirmDelete = async (id: string) => {
    deleteAttemptRef.current += 1
    const attempt = deleteAttemptRef.current

    setNotice(null)
    setDeleting({ id, phase: 'pending' })

    const result = await deleteSavedPlan(id)
    if (!mountedRef.current) return

    setDeleting(null)

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handleAuthFailure(result.status, signOut)
      return
    }

    if (result.kind === 'ok' || result.kind === 'not-found') {
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', plans: current.plans.filter((plan) => plan.id !== id) }
          : current,
      )
      setHeadingFocusRequest((request) => request + 1)
      return
    }

    setNotice(GENERIC_PLAN_ERROR)
    await refreshPlans(attempt)
  }

  const anotherActive = (id: string) => deleting !== null && deleting.id !== id

  return (
    <main className="saved-plans">
      <h1 ref={headingRef} tabIndex={-1}>
        My plans
      </h1>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {GENERIC_PLAN_ERROR}
        </p>
      )}
      {state.status === 'ready' && notice !== null && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      {state.status === 'ready' && state.plans.length === 0 && (
        <p>
          You have no saved plans yet. <Link to="/plans/new">Create a training plan</Link>
        </p>
      )}
      {state.status === 'ready' && state.plans.length > 0 && (
        <ul className="saved-plans-list">
          {state.plans.map((plan) => (
            <SavedPlanListItem
              key={plan.id}
              plan={plan}
              deletePhase={deleting?.id === plan.id ? deleting.phase : 'idle'}
              deleteDisabled={anotherActive(plan.id)}
              onDeleteStart={() => startDelete(plan.id)}
              onDeleteConfirm={() => void confirmDelete(plan.id)}
              onDeleteCancel={cancelDelete}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
