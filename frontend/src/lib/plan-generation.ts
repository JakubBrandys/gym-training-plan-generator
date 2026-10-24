import { apiFetch } from './api'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert'

export type PlanForm = {
  experience: ExperienceLevel
  currentFrequency: number
  desiredFrequency: number
  heightCm: number
  weightKg: number
  goals: string
}

export type PlanResultExercise = {
  slug: string
  name: string
  sets: number
  reps: string
  restSeconds: number
  note: string | null
}

export type PlanResultSession = {
  title: string
  exercises: PlanResultExercise[]
}

export type PlanResultWeek = {
  week: number
  goal: string
  sessions: PlanResultSession[]
}

export type PlanResult = {
  weeks: PlanResultWeek[]
}

export type PlanJobStatus = 'running' | 'completed' | 'failed'
export type PlanJobStage = 'drafting' | 'reviewing'
export type PlanJobErrorCode = 'provider_unavailable' | 'invalid_output' | 'internal'

export type PlanJobView = {
  status: PlanJobStatus
  stage: PlanJobStage | null
  plan: PlanResult | null
  error: { code: PlanJobErrorCode } | null
}

export type LimitReason = 'active_job' | 'daily_limit'

export type AuthFailureResult =
  | { kind: 'unauthorized'; status: 401 }
  | { kind: 'blocked'; status: 403 }

export type StartPlanGenerationResult =
  | { kind: 'ok'; jobId: string }
  | AuthFailureResult
  | { kind: 'limit'; reason: LimitReason }
  | { kind: 'error' }

export type FetchPlanGenerationResult =
  | { kind: 'ok'; job: PlanJobView }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'error' }

const authFailureOf = (status: number): AuthFailureResult | null => {
  if (status === 401) return { kind: 'unauthorized', status: 401 }
  if (status === 403) return { kind: 'blocked', status: 403 }
  return null
}

const isLimitReason = (value: unknown): value is LimitReason =>
  value === 'active_job' || value === 'daily_limit'

export const startPlanGeneration = async (
  form: PlanForm,
): Promise<StartPlanGenerationResult> => {
  try {
    const response = await apiFetch('/plan-generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 429) {
      const body = (await response.json()) as { code?: unknown }
      return isLimitReason(body.code) ? { kind: 'limit', reason: body.code } : { kind: 'error' }
    }

    if (!response.ok) return { kind: 'error' }

    const body = (await response.json()) as { jobId?: unknown }
    return typeof body.jobId === 'string' ? { kind: 'ok', jobId: body.jobId } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export const fetchPlanGeneration = async (
  jobId: string,
  signal: AbortSignal,
): Promise<FetchPlanGenerationResult> => {
  try {
    const response = await apiFetch(`/plan-generations/${encodeURIComponent(jobId)}`, { signal })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (!response.ok) return { kind: 'error' }

    const job = (await response.json()) as PlanJobView
    return { kind: 'ok', job }
  } catch {
    return { kind: 'error' }
  }
}
