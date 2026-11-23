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
  const reserved = NAV_ITEMS.filter((item) => item.adminOnly && !isAdmin)
  const identity = profile.status === 'ready' ? `${profile.profile.email} · ${profile.profile.role}` : null

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-id">
          <Link to="/" className="app-header-brand">
            Gym Training Plan Generator
          </Link>
          <p className="app-header-identity" title={identity ?? undefined}>
            {profile.status === 'ready' && (
              <>
                <span>{profile.profile.email}</span> · <span>{profile.profile.role}</span>
              </>
            )}
          </p>
        </div>
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
          {reserved.map((item) => (
            <span key={item.key} className="app-header-nav-spacer" aria-hidden="true">
              {item.label}
            </span>
          ))}
        </nav>
        <div className="app-header-user">
          <Button variant="secondary" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </header>
  )
}
