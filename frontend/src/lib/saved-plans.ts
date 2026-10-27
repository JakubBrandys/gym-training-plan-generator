import { apiFetch } from './api'
import { authFailureOf, type AuthFailureResult, type PlanForm } from './plan-generation'

export type SavedPlanSummary = {
  id: string
  createdAt: string
  form: PlanForm
}

export type SaveGeneratedPlanResult =
  | { kind: 'ok'; plan: SavedPlanSummary }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'not-completed' }
  | { kind: 'error' }

export const saveGeneratedPlan = async (jobId: string): Promise<SaveGeneratedPlanResult> => {
  try {
    const response = await apiFetch('/saved-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (response.status === 409) return { kind: 'not-completed' }

    if (!response.ok) return { kind: 'error' }

    const plan = (await response.json()) as SavedPlanSummary
    return { kind: 'ok', plan }
  } catch {
    return { kind: 'error' }
  }
}
