import { apiFetch } from './api'
import {
  authFailureOf,
  type AuthFailureResult,
  type PlanForm,
  type PlanResult,
} from './plan-generation'

export type SavedPlanSummary = {
  id: string
  createdAt: string
  form: PlanForm
  title: string | null
}

export type SavedPlan = SavedPlanSummary & {
  plan: PlanResult
}

export type ListSavedPlansResult =
  | { kind: 'ok'; plans: SavedPlanSummary[] }
  | AuthFailureResult
  | { kind: 'error' }

export type FetchSavedPlanResult =
  | { kind: 'ok'; plan: SavedPlan }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'error' }

export type SaveGeneratedPlanResult =
  | { kind: 'ok'; plan: SavedPlanSummary }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'not-completed' }
  | { kind: 'error' }

export type DeleteSavedPlanResult =
  | { kind: 'ok' }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'error' }

export type RenameSavedPlanResult =
  | { kind: 'ok'; plan: SavedPlanSummary }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'error' }

export const MAX_PLAN_TITLE_LENGTH = 80

const SAVE_REQUEST_TIMEOUT_MS = 30_000
const READ_REQUEST_TIMEOUT_MS = 15_000
const WRITE_REQUEST_TIMEOUT_MS = 15_000

export const saveGeneratedPlan = async (jobId: string): Promise<SaveGeneratedPlanResult> => {
  try {
    const response = await apiFetch('/saved-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(SAVE_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (response.status === 409) return { kind: 'not-completed' }

    if (!response.ok) return { kind: 'error' }

    const plan = (await response.json()) as SavedPlanSummary | null
    return typeof plan?.id === 'string' ? { kind: 'ok', plan } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export const listSavedPlans = async (): Promise<ListSavedPlansResult> => {
  try {
    const response = await apiFetch('/saved-plans', {
      signal: AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (!response.ok) return { kind: 'error' }

    const plans = (await response.json()) as SavedPlanSummary[]
    return Array.isArray(plans) ? { kind: 'ok', plans } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const hasRenderableExercises = (session: unknown): boolean =>
  isRecord(session) && Array.isArray(session.exercises) && session.exercises.every(isRecord)

const hasRenderableSessions = (week: unknown): boolean =>
  isRecord(week) && Array.isArray(week.sessions) && week.sessions.every(hasRenderableExercises)

const isRenderableSavedPlan = (value: unknown): value is SavedPlan =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isRecord(value.form) &&
  isRecord(value.plan) &&
  Array.isArray(value.plan.weeks) &&
  value.plan.weeks.every(hasRenderableSessions)

export const fetchSavedPlan = async (id: string): Promise<FetchSavedPlanResult> => {
  try {
    const response = await apiFetch(`/saved-plans/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (!response.ok) return { kind: 'error' }

    const plan: unknown = await response.json()
    return isRenderableSavedPlan(plan) ? { kind: 'ok', plan } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export const deleteSavedPlan = async (id: string): Promise<DeleteSavedPlanResult> => {
  try {
    const response = await apiFetch(`/saved-plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(WRITE_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    return response.ok ? { kind: 'ok' } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export const renameSavedPlan = async (
  id: string,
  title: string | null,
): Promise<RenameSavedPlanResult> => {
  try {
    const response = await apiFetch(`/saved-plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
      signal: AbortSignal.timeout(WRITE_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (!response.ok) return { kind: 'error' }

    const plan = (await response.json()) as SavedPlanSummary | null
    return typeof plan?.id === 'string' ? { kind: 'ok', plan } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
