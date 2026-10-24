import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiFetch } from '../lib/api'
import { handleAuthFailure } from '../lib/auth-failure'
import { useAuth } from '../auth/useAuth'

type Me = {
  id: string
  email: string
  role: 'MEMBER' | 'ADMIN'
}

type MeState =
  | { status: 'loading' }
  | { status: 'ready'; me: Me }
  | { status: 'error' }

export const HomePage = () => {
  const { signOut } = useAuth()
  const [state, setState] = useState<MeState>({ status: 'loading' })

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
  }, [signOut])

  return (
    <main className="home">
      <h1>Gym Training Plan Generator</h1>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          Something went wrong, try again
        </p>
      )}
      {state.status === 'ready' && (
        <dl>
          <dt>Email</dt>
          <dd>{state.me.email}</dd>
          <dt>Role</dt>
          <dd>{state.me.role}</dd>
        </dl>
      )}
      <p>
        <Link to="/plans/new">Create a training plan</Link>
      </p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}
