import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PlanView } from '../components/PlanView'
import { useAuth } from '../auth/useAuth'
import { handleAuthFailure } from '../lib/auth-failure'
import {
  fetchPlanGeneration,
  type PlanJobErrorCode,
  type PlanJobStage,
  type PlanResult,
} from '../lib/plan-generation'

const POLL_INTERVAL_MS = 3000
const MAX_CONSECUTIVE_FAILURES = 3

const GENERIC_PLAN_ERROR = 'Something went wrong, try again'
const NOT_FOUND_ERROR = 'This plan could not be found or has expired.'

const FAILURE_MESSAGES: Record<PlanJobErrorCode, string> = {
  provider_unavailable: 'The plan service is unavailable right now. Try again later.',
  invalid_output: 'We could not build a valid plan this time. Try again.',
  internal: GENERIC_PLAN_ERROR,
}

const stageMessage = (stage: PlanJobStage | null): string => {
  if (stage === 'drafting') return 'Drafting your plan…'
  if (stage === 'reviewing') return 'Reviewing your plan…'
  return 'Starting…'
}

type JobPageState =
  | { status: 'polling'; stage: PlanJobStage | null }
  | { status: 'completed'; plan: PlanResult }
  | { status: 'failed'; code: PlanJobErrorCode }
  | { status: 'not-found' }
  | { status: 'error' }

export const PlanGenerationPage = () => {
  const { jobId } = useParams()
  const { signOut } = useAuth()
  const [polledState, setState] = useState<JobPageState>({ status: 'polling', stage: null })
  const state: JobPageState = jobId ? polledState : { status: 'not-found' }

  useEffect(() => {
    if (!jobId) return

    const controller = new AbortController()
    let timer: number | undefined
    let consecutiveFailures = 0

    const scheduleNextPoll = () => {
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS)
    }

    const poll = async () => {
      const result = await fetchPlanGeneration(jobId, controller.signal)
      if (controller.signal.aborted) return

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      if (result.kind === 'not-found') {
        setState({ status: 'not-found' })
        return
      }

      if (result.kind === 'error') {
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setState({ status: 'error' })
          return
        }
        scheduleNextPoll()
        return
      }

      consecutiveFailures = 0
      const { job } = result

      if (job.status === 'completed') {
        setState(job.plan ? { status: 'completed', plan: job.plan } : { status: 'error' })
        return
      }

      if (job.status === 'failed') {
        setState({ status: 'failed', code: job.error?.code ?? 'internal' })
        return
      }

      setState({ status: 'polling', stage: job.stage })
      scheduleNextPoll()
    }

    void poll()

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [jobId, signOut])

  return (
    <main className="plan-generation">
      <h1>Your training plan</h1>
      {state.status === 'polling' && (
        <p className="status" role="status">
          {stageMessage(state.stage)}
        </p>
      )}
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
      {state.status !== 'polling' && (
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
