import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { handleAuthFailure } from '../lib/auth-failure'
import { useAuth } from '../auth/useAuth'
import { HomeView, type Me, type MeState } from './HomeView'

export const HomePage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<MeState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadMe = async () => {
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
        const me = (await response.json()) as Me
        if (!cancelled) setState({ status: 'ready', me })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    }

    void loadMe()

    return () => {
      cancelled = true
    }
  }, [signOut, attempt])

  const handleRetry = () => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <HomeView
      state={state}
      signingOut={signingOut}
      onSignOut={() => void handleSignOut()}
      onRetry={handleRetry}
    />
  )
}
