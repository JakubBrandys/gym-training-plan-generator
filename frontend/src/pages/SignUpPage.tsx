import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'

export const SignUpPage = () => {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  if (loading) {
    return <p className="status">Loading…</p>
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    setPending(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }
    if (!data.session) {
      setConfirmationSent(true)
      return
    }
    navigate('/', { replace: true })
  }

  if (confirmationSent) {
    return (
      <main className="auth">
        <h1>Sign up</h1>
        <p role="status">Check your email to confirm your account</p>
        <p>
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="auth">
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="sign-up-email">Email</label>
        <input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="sign-up-password">Password</label>
        <input
          id="sign-up-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          aria-describedby="sign-up-password-hint"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p id="sign-up-password-hint" className="hint">
          At least 6 characters.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Signing up…' : 'Sign up'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </main>
  )
}
