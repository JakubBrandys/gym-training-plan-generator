import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { authErrorMessage, GENERIC_AUTH_ERROR } from '../auth/auth-errors'

type SignInLocationState = {
  from?: { pathname?: string; search?: string; hash?: string }
} | null

const isProtocolRelative = (path: string) => path.startsWith('//') || path.startsWith('/\\')

const safeReturnPath = (state: SignInLocationState): string => {
  const pathname = state?.from?.pathname
  if (!pathname?.startsWith('/') || isProtocolRelative(pathname)) {
    return '/'
  }
  return `${pathname}${state?.from?.search ?? ''}${state?.from?.hash ?? ''}`
}

export const SignInPage = () => {
  const { session, loading, signOutReason } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = location.state as SignInLocationState
  const from = safeReturnPath(state)
  const blocked = signOutReason === 'blocked'

  if (loading) {
    return <p className="status">Loading…</p>
  }

  if (session) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(authErrorMessage(signInError))
        return
      }
      navigate(from, { replace: true })
    } catch {
      setError(GENERIC_AUTH_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth">
      <h1>Sign in</h1>
      {blocked && (
        <p className="banner" role="alert">
          Your account has been blocked
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        No account yet? <Link to="/sign-up">Sign up</Link>
      </p>
    </main>
  )
}
