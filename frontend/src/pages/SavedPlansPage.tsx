import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { SavedPlanDetails } from '../components/SavedPlanDetails'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { listSavedPlans, type SavedPlanSummary } from '../lib/saved-plans'

type SavedPlansState =
  | { status: 'loading' }
  | { status: 'ready'; plans: SavedPlanSummary[] }
  | { status: 'error' }

export const SavedPlansPage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<SavedPlansState>({ status: 'loading' })

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

  return (
    <main className="saved-plans">
      <h1>My plans</h1>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {GENERIC_PLAN_ERROR}
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
            <li key={plan.id}>
              <Link to={`/plans/${encodeURIComponent(plan.id)}`}>
                <SavedPlanDetails createdAt={plan.createdAt} form={plan.form} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}
