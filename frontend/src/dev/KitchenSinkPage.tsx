import type { ReactNode } from 'react'
import { Button } from '../components/Button'
import { HomeView, type MeState } from '../pages/HomeView'
import './kitchen-sink.css'

const noop = () => {}

const member: MeState = {
  status: 'ready',
  me: { id: 'member-1', email: 'member@example.com', role: 'MEMBER' },
}

const admin: MeState = {
  status: 'ready',
  me: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
}

type CaseProps = {
  title: string
  children: ReactNode
}

const Case = ({ title, children }: CaseProps) => (
  <section className="kitchen-sink-case" aria-label={title}>
    <h2>{title}</h2>
    {children}
  </section>
)

type HomeCaseProps = {
  title: string
  state: MeState
  signingOut?: boolean
}

const HomeCase = ({ title, state, signingOut = false }: HomeCaseProps) => (
  <Case title={title}>
    <HomeView state={state} signingOut={signingOut} onSignOut={noop} onRetry={noop} />
  </Case>
)

export const KitchenSinkPage = () => (
  <div className="kitchen-sink">
    <HomeCase title="Home: loading" state={{ status: 'loading' }} />
    <HomeCase title="Home: ready, member" state={member} />
    <HomeCase title="Home: ready, admin" state={admin} />
    <HomeCase title="Home: error" state={{ status: 'error' }} />
    <HomeCase title="Home: signing out (pending, disabled)" state={member} signingOut />
    <Case title="Buttons: default and disabled">
      <div className="kitchen-sink-buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button disabled>Primary disabled</Button>
        <Button variant="secondary" disabled>
          Secondary disabled
        </Button>
      </div>
    </Case>
    <Case title="Home: empty">
      <p className="hint">N/A: Home shows no list, so it has no empty state.</p>
    </Case>
  </div>
)
