import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

export const RequireAuth = () => {
  const { session, loading, signOutReason } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="status">Loading…</p>
  }

  if (!session) {
    const state = signOutReason === 'user' ? undefined : { from: location }
    return <Navigate to="/sign-in" replace state={state} />
  }

  return <Outlet />
}
