import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'
import { DeletePlanControl, type DeletePhase } from '../components/DeletePlanControl'
import { PlanView } from '../components/PlanView'
import { RenamePlanForm } from '../components/RenamePlanForm'
import { SavedPlanDetails } from '../components/SavedPlanDetails'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { savedPlanLabel } from '../lib/saved-plan-format'
import {
  deleteSavedPlan,
  fetchSavedPlan,
  renameSavedPlan,
  type SavedPlan,
} from '../lib/saved-plans'

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
  const navigate = useNavigate()
  const [loadedState, setState] = useState<SavedPlanState>({ status: 'loading' })
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamePending, setRenamePending] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deletePhase, setDeletePhase] = useState<DeletePhase>('idle')
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const wasRenameOpen = useRef(false)
  const state: SavedPlanState = id ? loadedState : { status: 'not-found' }

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (wasRenameOpen.current && !renameOpen) renameButtonRef.current?.focus()
    wasRenameOpen.current = renameOpen
  }, [renameOpen])

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

  const openRename = () => {
    setRenameError(null)
    setRenameOpen(true)
  }

  const cancelRename = () => {
    setRenameError(null)
    setRenameOpen(false)
  }

  const saveTitle = async (title: string | null) => {
    if (!id) return

    setRenameError(null)
    setRenamePending(true)

    const result = await renameSavedPlan(id, title)
    if (!mountedRef.current) return

    setRenamePending(false)

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handleAuthFailure(result.status, signOut)
      return
    }

    if (result.kind === 'ok') {
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', plan: { ...current.plan, title: result.plan.title ?? null } }
          : current,
      )
      setRenameOpen(false)
      return
    }

    if (result.kind === 'not-found') {
      setRenameOpen(false)
      setState({ status: 'not-found' })
      return
    }

    setRenameError(GENERIC_PLAN_ERROR)
  }

  const startDelete = () => {
    setDeleteNotice(null)
    setDeletePhase('confirming')
  }

  const cancelDelete = () => {
    setDeletePhase('idle')
  }

  const confirmDelete = async () => {
    if (!id) return

    setDeleteNotice(null)
    setDeletePhase('pending')

    const result = await deleteSavedPlan(id)
    if (!mountedRef.current) return

    if (result.kind === 'ok' || result.kind === 'not-found') {
      await navigate('/plans', { replace: true })
      return
    }

    setDeletePhase('idle')

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handleAuthFailure(result.status, signOut)
      return
    }

    setDeleteNotice(GENERIC_PLAN_ERROR)
  }

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
          <div className="saved-plan-actions">
            {renameOpen ? (
              <RenamePlanForm
                initialTitle={state.plan.title ?? null}
                pending={renamePending}
                error={renameError}
                onSave={(title) => void saveTitle(title)}
                onCancel={cancelRename}
              />
            ) : (
              <Button
                ref={renameButtonRef}
                variant="secondary"
                aria-label={`Rename ${savedPlanLabel(state.plan)}`}
                disabled={deletePhase !== 'idle'}
                onClick={openRename}
              >
                Rename
              </Button>
            )}
            <DeletePlanControl
              label={savedPlanLabel(state.plan)}
              phase={deletePhase}
              disabled={renameOpen}
              onStart={startDelete}
              onConfirm={() => void confirmDelete()}
              onCancel={cancelDelete}
            />
          </div>
          {deleteNotice !== null && (
            <p className="error" role="alert">
              {deleteNotice}
            </p>
          )}
          <PlanView
            plan={state.plan.plan}
            details={
              <SavedPlanDetails
                createdAt={state.plan.createdAt}
                form={state.plan.form}
                title={state.plan.title ?? null}
              />
            }
          />
        </>
      )}
      <p>
        <Link to="/plans">My plans</Link>
      </p>
    </main>
  )
}

export const SavedPlanPage = () => {
  const { id } = useParams()
  return <SavedPlanDetail key={id} id={id} />
}
