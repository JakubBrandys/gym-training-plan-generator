import {
  fetchPlanGeneration,
  type PlanJobErrorCode,
  type PlanJobView,
  type PlanResult,
} from './plan-generation'
import { streamPlanEvents } from './plan-generation-stream'
import {
  initialProgress,
  progressFromSnapshot,
  reduceProgress,
  type ProgressState,
} from './plan-progress'
import {
  isStableConnection,
  nextBackoffMs,
  nextFailureCount,
  shouldFallBackToPolling,
} from './stream-policy'

export const POLL_INTERVAL_MS = 3000
export const MAX_CONSECUTIVE_POLL_FAILURES = 3
export const MAX_WATCH_MS = 12 * 60 * 1000

export type WatchState =
  | { status: 'running'; progress: ProgressState }
  | { status: 'completed'; plan: PlanResult }
  | { status: 'failed'; code: PlanJobErrorCode }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'timed-out' }

export type WatchHandlers = {
  onState: (state: WatchState) => void
  onAuthFailure: (status: 401 | 403) => void | Promise<void>
}

const ERROR_CODES: readonly PlanJobErrorCode[] = ['provider_unavailable', 'invalid_output', 'internal']

const toErrorCode = (code: unknown): PlanJobErrorCode =>
  ERROR_CODES.find((known) => known === code) ?? 'internal'

const settleFromSnapshot = (job: PlanJobView): WatchState | null => {
  if (job.status === 'completed') {
    return job.plan ? { status: 'completed', plan: job.plan } : { status: 'error' }
  }
  if (job.status === 'failed') {
    return { status: 'failed', code: toErrorCode(job.error?.code) }
  }
  return null
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, ms)
    signal.addEventListener('abort', finish)
  })

export const watchPlanGeneration = async (
  jobId: string,
  signal: AbortSignal,
  handlers: WatchHandlers,
): Promise<void> => {
  const startedAt = Date.now()

  const emit = (state: WatchState) => {
    if (!signal.aborted) handlers.onState(state)
  }

  const hasTimedOut = () => Date.now() - startedAt >= MAX_WATCH_MS

  const poll = async (initial: ProgressState): Promise<void> => {
    let progress = initial
    let consecutiveFailures = 0

    for (;;) {
      const result = await fetchPlanGeneration(jobId, signal)
      if (signal.aborted) return

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handlers.onAuthFailure(result.status)
        return
      }

      if (result.kind === 'not-found') {
        emit({ status: 'not-found' })
        return
      }

      if (result.kind === 'error') {
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          emit({ status: 'error' })
          return
        }
      } else {
        consecutiveFailures = 0
        const settled = settleFromSnapshot(result.job)
        if (settled) {
          emit(settled)
          return
        }
        progress = progressFromSnapshot(progress, result.job, new Date().toISOString())
        emit({ status: 'running', progress })
      }

      if (hasTimedOut()) {
        emit({ status: 'timed-out' })
        return
      }

      await sleep(POLL_INTERVAL_MS, signal)
      if (signal.aborted) return
    }
  }

  const settleCompleted = async (): Promise<void> => {
    const result = await fetchPlanGeneration(jobId, signal)
    if (signal.aborted) return

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handlers.onAuthFailure(result.status)
      return
    }

    if (result.kind === 'not-found') {
      emit({ status: 'not-found' })
      return
    }

    const settled = result.kind === 'ok' ? settleFromSnapshot(result.job) : null
    emit(settled ?? { status: 'error' })
  }

  let progress = initialProgress
  let lastEventId = 0
  let consecutiveFailures = 0

  emit({ status: 'running', progress })

  while (!signal.aborted) {
    if (hasTimedOut()) {
      emit({ status: 'timed-out' })
      return
    }

    const idBeforeAttempt = lastEventId
    const connectionStartedAt = Date.now()
    const outcome = await streamPlanEvents({
      jobId,
      lastEventId,
      signal,
      onEvent: (event) => {
        lastEventId = event.id
        progress = reduceProgress(progress, event)
        if (!progress.terminal) emit({ status: 'running', progress })
      },
    })
    if (signal.aborted) return

    if (outcome.kind === 'unauthorized' || outcome.kind === 'blocked') {
      await handlers.onAuthFailure(outcome.status)
      return
    }

    if (outcome.kind === 'not-found') {
      emit({ status: 'not-found' })
      return
    }

    if (outcome.kind === 'terminal') {
      if (outcome.event.type === 'failed') {
        emit({ status: 'failed', code: toErrorCode(outcome.event.code) })
        return
      }
      await settleCompleted()
      return
    }

    if (outcome.kind === 'closed' && isStableConnection(Date.now() - connectionStartedAt)) {
      consecutiveFailures = 0
      continue
    }

    const receivedEvent = outcome.kind !== 'closed' && lastEventId > idBeforeAttempt
    consecutiveFailures = nextFailureCount(consecutiveFailures, receivedEvent)

    if (shouldFallBackToPolling(consecutiveFailures)) {
      await poll(progress)
      return
    }

    await sleep(nextBackoffMs(consecutiveFailures), signal)
  }
}
