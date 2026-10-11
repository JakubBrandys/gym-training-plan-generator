import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type SignOutReason = 'blocked'

export type AuthContextValue = {
  session: Session | null
  loading: boolean
  signOutReason: SignOutReason | null
  signOut: (reason?: SignOutReason) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
