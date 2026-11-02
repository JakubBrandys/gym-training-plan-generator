import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../lib/api'
import { handleAuthFailure } from '../lib/auth-failure'
import { ProfileContext, type Profile, type ProfileState } from './profile-context'

type ProfileProviderProps = {
  children: ReactNode
}

export const ProfileProvider = ({ children }: ProfileProviderProps) => {
  const { signOut } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      let response: Response
      try {
        response = await apiFetch('/me')
      } catch {
        if (!cancelled) setState({ status: 'error' })
        return
      }
      if (cancelled) return

      if (await handleAuthFailure(response.status, signOut)) return

      if (!response.ok) {
        setState({ status: 'error' })
        return
      }

      try {
        const profile = (await response.json()) as Profile
        if (!cancelled) setState({ status: 'ready', profile })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [signOut, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  const value = useMemo(() => ({ state, reload }), [state, reload])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
