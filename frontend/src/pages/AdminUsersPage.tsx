import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { listAdminUsers, type AdminUser } from '../lib/admin-users'
import { handleAuthFailure } from '../lib/auth-failure'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'
import { formatSavedDate } from '../lib/saved-plan-format'

type AdminUsersState =
  | { status: 'loading' }
  | { status: 'ready'; users: AdminUser[] }
  | { status: 'not-found' }
  | { status: 'error' }

export const AdminUsersPage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<AdminUsersState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const loadUsers = async () => {
      const result = await listAdminUsers()
      if (cancelled) return

      if (result.kind === 'unauthorized' || result.kind === 'blocked') {
        await handleAuthFailure(result.status, signOut)
        return
      }

      if (result.kind === 'ok') {
        setState({ status: 'ready', users: result.users })
        return
      }

      setState({ status: result.kind === 'not-found' ? 'not-found' : 'error' })
    }

    void loadUsers()

    return () => {
      cancelled = true
    }
  }, [signOut])

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
      {state.status === 'ready' && state.users.length === 0 && <p>No registered users yet.</p>}
      {state.status === 'ready' && state.users.length > 0 && (
        <ul className="admin-users-list" role="list">
          {state.users.map((user) => (
            <li key={user.id} className="admin-users-item">
              <span className="admin-users-email">{user.email}</span>
              <span>{`Role: ${user.role === 'ADMIN' ? 'Admin' : 'Member'}`}</span>
              <span>{`Status: ${user.blockedAt ? 'Blocked' : 'Active'}`}</span>
              <span>{`Joined: ${formatSavedDate(user.createdAt)}`}</span>
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
