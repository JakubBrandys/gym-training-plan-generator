import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PlanView } from '../components/PlanView'
import { SavedPlanDetails } from '../components/SavedPlanDetails'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { fetchSavedPlan, type SavedPlan } from '../lib/saved-plans'

const NOT_FOUND_ERROR = 'This saved plan could not be found.'

type SavedPlanState =
  | { status: 'loading' }
  | { status: 'ready'; plan: SavedPlan }
  | { status: 'not-found' }
  | { status: 'error' }

type SavedPlanDetailProps = {
  id: string | undefined
}

const SavedPlanDetail = ({ id }: SavedPlanDetailProps) => {
  const { signOut } = useAuth()
  const [loadedState, setState] = useState<SavedPlanState>({ status: 'loading' })
  const state: SavedPlanState = id ? loadedState : { status: 'not-found' }

  useEffect(() => {
    if (!id) return

    let cancelled = false

    const loadPlan = async () => {
      const result = await fetchSavedPlan(id)
      if (cancelled) return

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      if (result.kind === 'ok') {
        setState({ status: 'ready', plan: result.plan })
        return
      }

      setState({ status: result.kind })
    }

    void loadPlan()

    return () => {
      cancelled = true
    }
  }, [id, signOut])

  return (
    <main className="saved-plan">
      <h1>Saved plan</h1>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'not-found' && (
        <p className="error" role="alert">
          {NOT_FOUND_ERROR}
        </p>
      )}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {GENERIC_PLAN_ERROR}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <p>
            <SavedPlanDetails createdAt={state.plan.createdAt} form={state.plan.form} />
          </p>
          <PlanView plan={state.plan.plan} />
        </>
      )}
      <p>
        <Link to="/plans">My plans</Link>
      </p>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}

export const SavedPlanPage = () => {
  const { id } = useParams()
  return <SavedPlanDetail key={id} id={id} />
}
