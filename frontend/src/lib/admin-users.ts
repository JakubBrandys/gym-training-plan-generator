import { apiFetch } from './api'
import { authFailureOf, type AuthFailureResult } from './plan-generation'

export type AdminUser = {
  id: string
  email: string
  role: 'MEMBER' | 'ADMIN'
  blockedAt: string | null
  createdAt: string
}

export type ListAdminUsersResult =
  | { kind: 'ok'; users: AdminUser[] }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'error' }

export type BlockAdminUserResult =
  | { kind: 'ok'; user: AdminUser }
  | AuthFailureResult
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'ban-failed' }
  | { kind: 'error' }

const READ_REQUEST_TIMEOUT_MS = 15_000
const WRITE_REQUEST_TIMEOUT_MS = 15_000

const isAdminUser = (value: unknown): value is AdminUser => {
  if (typeof value !== 'object' || value === null) return false
  const { id, email, role, blockedAt, createdAt } = value as Record<string, unknown>
  return (
    typeof id === 'string' &&
    typeof email === 'string' &&
    (role === 'MEMBER' || role === 'ADMIN') &&
    (blockedAt === null || typeof blockedAt === 'string') &&
    typeof createdAt === 'string'
  )
}

export const listAdminUsers = async (): Promise<ListAdminUsersResult> => {
  try {
    const response = await apiFetch('/admin/users', {
      signal: AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }

    if (!response.ok) return { kind: 'error' }

    const users = (await response.json()) as unknown
    return Array.isArray(users) && users.every(isAdminUser)
      ? { kind: 'ok', users }
      : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export const blockAdminUser = async (id: string): Promise<BlockAdminUserResult> => {
  try {
    const response = await apiFetch(`/admin/users/${encodeURIComponent(id)}/block`, {
      method: 'POST',
      signal: AbortSignal.timeout(WRITE_REQUEST_TIMEOUT_MS),
    })

    const authFailure = authFailureOf(response.status)
    if (authFailure) return authFailure

    if (response.status === 404) return { kind: 'not-found' }
    if (response.status === 409) return { kind: 'conflict' }
    if (response.status === 502) return { kind: 'ban-failed' }

    if (!response.ok) return { kind: 'error' }

    const user = (await response.json()) as unknown
    return isAdminUser(user) ? { kind: 'ok', user } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
