import type { PlanJobErrorCode, PlanJobStage, PlanJobView } from './plan-generation'

export const WEEK_COUNT = 8

export type PlanProgressInput =
  | { type: 'stage'; stage: PlanJobStage }
  | { type: 'week'; stage: PlanJobStage; week: number }
  | { type: 'validating'; stage: PlanJobStage }
  | { type: 'retrying'; stage: PlanJobStage; attempt: number }
  | { type: 'completed' }
  | { type: 'failed'; code: PlanJobErrorCode }

export type PlanProgressEvent = PlanProgressInput & {
  id: number
  at: string
}

export type ProgressState = {
  stage: PlanJobStage | null
  week: number
  retrying: boolean
  validating: boolean
  stageStartedAt: string | null
  terminal: boolean
}

export const initialProgress: ProgressState = {
  stage: null,
  week: 0,
  retrying: false,
  validating: false,
  stageStartedAt: null,
  terminal: false,
}

export const reduceProgress = (state: ProgressState, event: PlanProgressEvent): ProgressState => {
  switch (event.type) {
    case 'stage':
      return {
        stage: event.stage,
        week: 0,
        retrying: false,
        validating: false,
        stageStartedAt: event.at,
        terminal: false,
      }
    case 'week':
      return { ...state, stage: event.stage, week: event.week, retrying: false, validating: false }
    case 'validating':
      return { ...state, stage: event.stage, retrying: false, validating: true }
    case 'retrying':
      return { ...state, stage: event.stage, week: 0, retrying: true, validating: false }
    case 'completed':
    case 'failed':
      return { ...state, retrying: false, validating: false, terminal: true }
    default:
      return state
  }
}

export const progressFromSnapshot = (
  previous: ProgressState,
  job: Pick<PlanJobView, 'stage' | 'week'>,
  nowIso: string,
): ProgressState => {
  const sameStage = previous.stage === job.stage
  const stageStartedAt = job.stage === null ? null : sameStage ? previous.stageStartedAt ?? nowIso : nowIso
  return {
    stage: job.stage,
    week: job.week ?? 0,
    retrying: false,
    validating: false,
    stageStartedAt,
    terminal: false,
  }
}

export const isTerminalEvent = (event: Pick<PlanProgressEvent, 'type'>): boolean =>
  event.type === 'completed' || event.type === 'failed'

export const parseProgressEvent = (data: string): PlanProgressEvent | null => {
  try {
    const value: unknown = JSON.parse(data)
    if (typeof value !== 'object' || value === null) return null
    const candidate = value as Record<string, unknown>
    if (
      typeof candidate.id !== 'number' ||
      typeof candidate.at !== 'string' ||
      typeof candidate.type !== 'string'
    ) {
      return null
    }
    return candidate as unknown as PlanProgressEvent
  } catch {
    return null
  }
}
