import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import {
  blockAdminUser,
  listAdminUsers,
  type AdminUser,
  type ListAdminUsersResult,
} from '../lib/admin-users'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { formatSavedDate } from '../lib/saved-plan-format'

type AdminUsersState =
  | { status: 'loading' }
  | { status: 'ready'; users: AdminUser[] }
  | { status: 'not-found' }
  | { status: 'error' }

type BlockActionState = { userId: string; phase: 'confirming' | 'pending' } | null

const BAN_FAILED_MESSAGE =
  'The user is blocked in the app but the Supabase sign-in ban failed. Use Re-apply block to retry it.'
const ADMIN_CONFLICT_MESSAGE = 'Admins cannot be blocked.'
const USER_NOT_FOUND_MESSAGE = 'User not found.'

export const AdminUsersPage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<AdminUsersState>({ status: 'loading' })
  const [action, setAction] = useState<BlockActionState>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const applyListResult = useCallback(
    async (result: ListAdminUsersResult, keepListOnError: boolean) => {
      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      if (result.kind === 'ok') {
        setState({ status: 'ready', users: result.users })
        return
      }

      if (result.kind === 'error' && keepListOnError) return

      setState({ status: result.kind === 'not-found' ? 'not-found' : 'error' })
    },
    [signOut],
  )

  const refreshUsers = useCallback(async () => {
    const result = await listAdminUsers()
    if (!mountedRef.current) return
    await applyListResult(result, true)
  }, [applyListResult])

  useEffect(() => {
    const loadInitialUsers = async () => {
      const result = await listAdminUsers()
      if (!mountedRef.current) return
      await applyListResult(result, false)
    }

    void loadInitialUsers()
  }, [applyListResult])

  const startConfirmation = (userId: string) => {
    setNotice(null)
    setAction({ userId, phase: 'confirming' })
  }

  const cancelConfirmation = () => {
    setAction(null)
  }

  const confirmBlock = async (userId: string) => {
    setNotice(null)
    setAction({ userId, phase: 'pending' })

    const result = await blockAdminUser(userId)
    if (!mountedRef.current) return

    setAction(null)

    if (result.kind === 'unauthorized' || result.kind === 'blocked') {
      await handleAuthFailure(result.status, signOut)
      return
    }

    if (result.kind === 'ok') {
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              users: current.users.map((user) => (user.id === result.user.id ? result.user : user)),
            }
          : current,
      )
      return
    }

    if (result.kind === 'conflict') {
      setNotice(ADMIN_CONFLICT_MESSAGE)
      return
    }

    if (result.kind === 'ban-failed') {
      setNotice(BAN_FAILED_MESSAGE)
      await refreshUsers()
      return
    }

    if (result.kind === 'not-found') {
      setNotice(USER_NOT_FOUND_MESSAGE)
      await refreshUsers()
      return
    }

    setNotice(GENERIC_PLAN_ERROR)
  }

  const renderAction = (user: AdminUser) => {
    if (user.role === 'ADMIN') return null

    const anotherRowPending = action?.phase === 'pending' && action.userId !== user.id
    const rowAction = action?.userId === user.id ? action : null

    if (!rowAction) {
      const label = user.blockedAt ? 'Re-apply block' : 'Block'

      return (
        <div className="admin-users-actions">
          <button
            type="button"
            aria-label={`${label} for ${user.email}`}
            disabled={anotherRowPending}
            onClick={() => startConfirmation(user.id)}
          >
            {label}
          </button>
        </div>
      )
    }

    const pending = rowAction.phase === 'pending'

    return (
      <div className="admin-users-actions">
        <span>{`${user.blockedAt ? 'Re-apply block for' : 'Block'} ${user.email}?`}</span>
        <button
          type="button"
          aria-label={`Confirm blocking ${user.email}`}
          disabled={pending}
          onClick={() => void confirmBlock(user.id)}
        >
          {pending ? 'Blocking…' : 'Confirm'}
        </button>
        <button
          type="button"
          aria-label={`Cancel blocking ${user.email}`}
          disabled={pending}
          onClick={cancelConfirmation}
        >
          Cancel
        </button>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <main>
        <p className="error" role="alert">
          Page not found
        </p>
        <p>
          <Link to="/">Back to home</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="admin-users">
      <h1>Registered users</h1>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {GENERIC_PLAN_ERROR}
        </p>
      )}
      {state.status === 'ready' && notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      {state.status === 'ready' && state.users.length === 0 && <p>No registered users yet.</p>}
      {state.status === 'ready' && state.users.length > 0 && (
        <ul className="admin-users-list" role="list">
          {state.users.map((user) => (
            <li key={user.id} className="admin-users-item">
              <span className="admin-users-email">{user.email}</span>
              <span>{`Role: ${user.role === 'ADMIN' ? 'Admin' : 'Member'}`}</span>
              <span>{`Status: ${user.blockedAt ? 'Blocked' : 'Active'}`}</span>
              <span>{`Joined: ${formatSavedDate(user.createdAt)}`}</span>
              {renderAction(user)}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}
