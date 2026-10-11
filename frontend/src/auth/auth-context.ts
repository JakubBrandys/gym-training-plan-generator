import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

// Why the user was last signed out by the app, shown on the sign-in page.
// Kept in auth state rather than router state so it survives RequireAuth's
// own redirect to /sign-in, which would otherwise overwrite it.
export type SignOutReason = 'blocked'

export type AuthContextValue = {
  session: Session | null
  loading: boolean
  signOutReason: SignOutReason | null
  signOut: (reason?: SignOutReason) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
