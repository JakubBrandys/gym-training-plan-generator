import { Button } from '../components/Button'
import { ButtonLink } from '../components/ButtonLink'
import { GENERIC_PLAN_ERROR } from '../lib/error-messages'

export type Me = {
  id: string
  email: string
  role: 'MEMBER' | 'ADMIN'
}

export type MeState =
  | { status: 'loading' }
  | { status: 'ready'; me: Me }
  | { status: 'error' }

type HomeViewProps = {
  state: MeState
  signingOut: boolean
  onSignOut: () => void
  onRetry: () => void
}

export const HomeView = ({ state, signingOut, onSignOut, onRetry }: HomeViewProps) => (
  <main className="home">
    <h1>Gym Training Plan Generator</h1>
    {state.status === 'loading' && <p className="status">Loading…</p>}
    {state.status === 'error' && (
      <>
        <p className="error" role="alert">
          {GENERIC_PLAN_ERROR}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </>
    )}
    {state.status === 'ready' && (
      <p className="status">
        <span>{state.me.email}</span> · <span>{state.me.role}</span>
      </p>
    )}
    <div className="home-actions">
      <ButtonLink to="/plans/new">Create a training plan</ButtonLink>
      <ButtonLink to="/plans" variant="secondary">
        My plans
      </ButtonLink>
      {state.status === 'ready' && state.me.role === 'ADMIN' && (
        <ButtonLink to="/admin/users" variant="secondary">
          Registered users
        </ButtonLink>
      )}
    </div>
    <Button variant="secondary" disabled={signingOut} onClick={onSignOut}>
      {signingOut ? 'Signing out…' : 'Sign out'}
    </Button>
  </main>
)
