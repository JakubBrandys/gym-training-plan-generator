import type { ReactNode } from 'react'
import { AppFooter } from '../components/AppFooter'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { HomePage } from '../pages/HomePage'
import type { ProfileState } from '../profile/profile-context'
import './kitchen-sink.css'

const noop = () => {}

const member: ProfileState = {
  status: 'ready',
  profile: { id: 'member-1', email: 'member@example.com', role: 'MEMBER' },
}

const admin: ProfileState = {
  status: 'ready',
  profile: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
}

const ACTIVE_PATHS = [
  ['/', 'Active link: none (home)'],
  ['/plans', 'Active link: My plans'],
  ['/plans/0b6f2c1e-6d0e-4a3c-9d6b-2f3a1c4e5d6f', 'Active link: My plans (saved plan)'],
  ['/plans/new', 'Active link: Create plan'],
  ['/plans/generate/job-1', 'Active link: Create plan (generating)'],
  ['/admin/users', 'Active link: Users'],
] as const

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

type HeaderCaseProps = {
  title: string
  profile: ProfileState
  pathname?: string
  signingOut?: boolean
}

const HeaderCase = ({ title, profile, pathname = '/plans', signingOut = false }: HeaderCaseProps) => (
  <Case title={title}>
    <AppHeader profile={profile} pathname={pathname} signingOut={signingOut} onSignOut={noop} />
  </Case>
)

export const KitchenSinkPage = () => (
  <div className="kitchen-sink">
    <Case title="Shell: full frame (member)">
      <div className="app-shell kitchen-sink-frame">
        <AppHeader profile={member} pathname="/" signingOut={false} onSignOut={noop} />
        <HomePage />
        <AppFooter />
      </div>
    </Case>
    <HeaderCase title="Header: loading" profile={{ status: 'loading' }} />
    <HeaderCase title="Header: ready, member" profile={member} />
    <HeaderCase title="Header: ready, admin" profile={admin} />
    <HeaderCase title="Header: error" profile={{ status: 'error' }} />
    <HeaderCase title="Header: signing out (pending, disabled)" profile={member} signingOut />
    {ACTIVE_PATHS.map(([pathname, title]) => (
      <HeaderCase key={pathname} title={title} profile={admin} pathname={pathname} />
    ))}
    <Case title="Footer">
      <AppFooter />
    </Case>
    <Case title="Home">
      <HomePage />
    </Case>
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
    <Case title="Shell: empty">
      <p className="hint">N/A: the shell shows no list, so it has no empty state.</p>
    </Case>
  </div>
)
