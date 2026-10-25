import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PlanView } from '../components/PlanView'
import { useAuth } from '../auth/useAuth'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import type { PlanJobErrorCode, PlanJobStage } from '../lib/plan-generation'
import { watchPlanGeneration, type WatchState } from '../lib/plan-generation-watch'
import { WEEK_COUNT, initialProgress, type ProgressState } from '../lib/plan-progress'

const NOT_FOUND_ERROR = 'This plan could not be found or has expired.'
const TIMED_OUT_ERROR = 'This is taking longer than expected. Check back later.'
const VALIDATING_NOTICE = 'Checking the plan…'
const RETRYING_NOTICE = 'Trying again…'

const FAILURE_MESSAGES: Record<PlanJobErrorCode, string> = {
  provider_unavailable: 'The plan service is unavailable right now. Try again later.',
  invalid_output: 'We could not build a valid plan this time. Try again.',
  internal: GENERIC_PLAN_ERROR,
}

const stageMessage = (stage: PlanJobStage | null): string => {
  if (stage === 'drafting') return 'Drafting your plan'
  if (stage === 'reviewing') return 'Reviewing your plan'
  return 'Starting'
}

const formatElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

type ElapsedTimerProps = {
  since: string
}

const ElapsedTimer = ({ since }: ElapsedTimerProps) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return <p className="hint">Elapsed {formatElapsed(now - Date.parse(since))}</p>
}

type ProgressPanelProps = {
  progress: ProgressState
}

const ProgressPanel = ({ progress }: ProgressPanelProps) => {
  const weekLabel = progress.week >= 1 ? `, week ${progress.week} of ${WEEK_COUNT}` : ''
  const notice = progress.retrying ? RETRYING_NOTICE : progress.validating ? VALIDATING_NOTICE : null

  return (
    <div className="plan-progress-panel">
      <p className="status" role="status">
        {stageMessage(progress.stage)}
        {weekLabel}…
      </p>
      <progress
        className="plan-progress"
        aria-label="Plan progress"
        max={WEEK_COUNT}
        value={progress.week}
      />
      {notice && <p className="hint">{notice}</p>}
      {progress.stageStartedAt && <ElapsedTimer since={progress.stageStartedAt} />}
    </div>
  )
}

const INITIAL_STATE: WatchState = { status: 'running', progress: initialProgress }

type PlanGenerationJobProps = {
  jobId: string | undefined
}

const PlanGenerationJob = ({ jobId }: PlanGenerationJobProps) => {
  const { signOut } = useAuth()
  const [watchedState, setState] = useState<WatchState>(INITIAL_STATE)
  const [attempt, setAttempt] = useState(0)
  const state: WatchState = jobId ? watchedState : { status: 'not-found' }

  const handleRetry = () => {
    setState(INITIAL_STATE)
    setAttempt((current) => current + 1)
  }

  useEffect(() => {
    if (!jobId) return

    const controller = new AbortController()

    void watchPlanGeneration(jobId, controller.signal, {
      onState: setState,
      onAuthFailure: async (status) => {
        await handleAuthFailure(status, signOut)
      },
    })

    return () => controller.abort()
  }, [jobId, signOut, attempt])

  return (
    <main className="plan-generation">
      <h1>Your training plan</h1>
      {state.status === 'running' && <ProgressPanel progress={state.progress} />}
      {state.status === 'completed' && <PlanView plan={state.plan} />}
      {state.status === 'failed' && (
        <p className="error" role="alert">
          {FAILURE_MESSAGES[state.code]}
        </p>
      )}
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
      {state.status === 'timed-out' && (
        <p className="error" role="alert">
          {TIMED_OUT_ERROR}
        </p>
      )}
      {(state.status === 'error' || state.status === 'timed-out') && (
        <p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </p>
      )}
      {(state.status === 'completed' || state.status === 'failed' || state.status === 'not-found') && (
        <p>
          <Link to="/plans/new">{state.status === 'completed' ? 'Create another plan' : 'Start again'}</Link>
        </p>
      )}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}

export const PlanGenerationPage = () => {
  const { jobId } = useParams()
  return <PlanGenerationJob key={jobId} jobId={jobId} />
}
