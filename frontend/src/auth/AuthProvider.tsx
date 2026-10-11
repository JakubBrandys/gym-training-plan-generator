import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type SignOutReason } from './auth-context'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    // Keep this callback synchronous: awaiting Supabase calls inside it
    // can deadlock the client's internal auth lock.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
      if (event === 'SIGNED_IN') setSignOutReason(null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async (reason?: SignOutReason) => {
    // Set before signing out so the reason lands in the same render as the
    // cleared session.
    setSignOutReason(reason ?? null)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ session, loading, signOutReason, signOut }),
    [session, loading, signOutReason, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
