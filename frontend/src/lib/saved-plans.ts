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

const SAVE_REQUEST_TIMEOUT_MS = 30_000
const READ_REQUEST_TIMEOUT_MS = 15_000

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

export const fetchSavedPlan = async (id: string): Promise<FetchSavedPlanResult> => {
  try {
    const response = await apiFetch(`/saved-plans/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (!response.ok) return { kind: 'error' }

    const plan = (await response.json()) as SavedPlan | null
    return typeof plan?.id === 'string' ? { kind: 'ok', plan } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
