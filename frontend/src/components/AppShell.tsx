import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ProfileProvider } from '../profile/ProfileProvider'
import { useProfile } from '../profile/useProfile'
import { AppFooter } from './AppFooter'
import { AppHeader } from './AppHeader'

const ShellFrame = () => {
  const { signOut } = useAuth()
  const { state } = useProfile()
  const { pathname } = useLocation()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut('user')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader
        profile={state}
        pathname={pathname}
        signingOut={signingOut}
        onSignOut={() => void handleSignOut()}
      />
      <Outlet />
      <AppFooter />
    </div>
  )
}

export const AppShell = () => (
  <ProfileProvider>
    <ShellFrame />
  </ProfileProvider>
)
