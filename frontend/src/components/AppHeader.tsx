import { Link } from 'react-router'
import type { ProfileState } from '../profile/profile-context'
import { Button } from './Button'
import { NAV_ITEMS } from './nav-active'

type AppHeaderProps = {
  profile: ProfileState
  pathname: string
  signingOut: boolean
  onSignOut: () => void
}

export const AppHeader = ({ profile, pathname, signingOut, onSignOut }: AppHeaderProps) => {
  const isAdmin = profile.status === 'ready' && profile.profile.role === 'ADMIN'
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="app-header-brand">
          Gym Training Plan Generator
        </Link>
        <nav aria-label="Main" className="app-header-nav">
          {items.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              aria-current={item.isActive(pathname) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-header-user">
          {profile.status === 'ready' && (
            <span>
              <span>{profile.profile.email}</span> · <span>{profile.profile.role}</span>
            </span>
          )}
          <Button variant="secondary" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </header>
  )
}
