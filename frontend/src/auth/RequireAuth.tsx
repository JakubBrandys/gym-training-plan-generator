import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

export const RequireAuth = () => {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="status">Loading…</p>
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }

  return <Outlet />
}
