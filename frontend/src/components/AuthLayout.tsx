import { Outlet } from 'react-router'

export const AuthLayout = () => (
  <div className="auth-layout">
    <p className="auth-layout-brand">Gym Training Plan Generator</p>
    <Outlet />
  </div>
)
