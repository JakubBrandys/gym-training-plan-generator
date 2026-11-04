import type { ReactNode } from 'react'
import { AppFooter } from '../components/AppFooter'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { DeletePlanControl } from '../components/DeletePlanControl'
import { PlanView, PlanViewContent } from '../components/PlanView'
import { RenamePlanForm } from '../components/RenamePlanForm'
import { SavedPlanDetails } from '../components/SavedPlanDetails'
import { SavedPlanListItem } from '../components/SavedPlanListItem'
import type { SavedPlanSummary } from '../lib/saved-plans'
import { HomePage } from '../pages/HomePage'
import type { ProfileState } from '../profile/profile-context'
import {
  buildEdgePlan,
  buildPlanWithFailingImage,
  buildPlanWithoutImages,
  buildSamplePlan,
} from './sample-plan'
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

const samplePlan = buildSamplePlan()
const edgePlan = buildEdgePlan()
const planWithoutImages = buildPlanWithoutImages()
const planWithFailingImage = buildPlanWithFailingImage()

const savedForm = {
  experience: 'intermediate',
  currentFrequency: 4,
  desiredFrequency: 5,
  heightCm: 180,
  weightKg: 80,
  goals: 'Run a faster 5k and keep my strength while training five times a week',
} as const

const LONG_TITLE = 'Twelve-week strength and conditioning block before the summer racing season ahea'

const LONG_LABEL =
  'Twelve-week strength and conditioning block before the summer racing season with a very long name'

const savedSummary: SavedPlanSummary = {
  id: 'plan-1',
  createdAt: '2026-11-02T10:00:00Z',
  form: savedForm,
  title: null,
}

const titledSummary: SavedPlanSummary = { ...savedSummary, id: 'plan-2', title: 'Spring cut' }

const longTitledSummary: SavedPlanSummary = { ...savedSummary, id: 'plan-3', title: LONG_TITLE }

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
    <Case title="Plan: live, follows this page's URL hash (try #week-3)">
      <PlanView plan={samplePlan} />
    </Case>
    <Case title="Plan: saved page, week 1 (summary with details)">
      <div className="app-shell kitchen-sink-frame">
        <AppHeader profile={member} pathname="/plans/abc" signingOut={false} onSignOut={noop} />
        <main className="saved-plan">
          <h1>Saved plan</h1>
          <PlanViewContent
            plan={samplePlan}
            week={1}
            details={<SavedPlanDetails createdAt="2026-11-02T10:00:00Z" form={savedForm} />}
          />
        </main>
        <AppFooter />
      </div>
    </Case>
    <Case title="Plan: saved page with a title, week 1">
      <div className="app-shell kitchen-sink-frame">
        <AppHeader profile={member} pathname="/plans/abc" signingOut={false} onSignOut={noop} />
        <main className="saved-plan">
          <h1>Saved plan</h1>
          <PlanViewContent
            plan={samplePlan}
            week={1}
            details={
              <SavedPlanDetails createdAt="2026-11-02T10:00:00Z" form={savedForm} title="Spring cut" />
            }
          />
        </main>
        <AppFooter />
      </div>
    </Case>
    <Case title="Plan: generation page, last week (summary without details, Save above)">
      <div className="app-shell kitchen-sink-frame">
        <AppHeader profile={member} pathname="/plans/generate/job-1" signingOut={false} onSignOut={noop} />
        <main className="plan-generation">
          <h1>Your training plan</h1>
          <div>
            <Button>Save plan</Button>
          </div>
          <PlanViewContent plan={samplePlan} week={8} />
        </main>
        <AppFooter />
      </div>
    </Case>
    <Case title="Plan: edge-length content (7 sessions, 10 exercises, 80-char title, 200-char goal and notes)">
      <PlanViewContent plan={edgePlan} week={1} />
    </Case>
    <Case title="Plan: no images (week 2)">
      <PlanViewContent plan={planWithoutImages} week={2} />
    </Case>
    <Case title="Plan: first exercise image fails to load (week 1)">
      <PlanViewContent plan={planWithFailingImage} week={1} />
    </Case>
    <Case title="Plan: empty">
      <p className="hint">N/A: a generated plan always has 8 weeks, so the plan view has no empty state.</p>
    </Case>
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
    <Case title="Buttons: danger (default, hover to see the error tint, disabled)">
      <div className="kitchen-sink-buttons">
        <Button variant="danger">Delete</Button>
        <Button variant="danger" disabled>
          Delete disabled
        </Button>
      </div>
    </Case>
    <Case title="Delete control: idle">
      <div className="saved-plans-actions">
        <DeletePlanControl label="Spring cut" phase="idle" onStart={noop} onConfirm={noop} onCancel={noop} />
      </div>
    </Case>
    <Case title="Delete control: idle, disabled (another item is deleting)">
      <div className="saved-plans-actions">
        <DeletePlanControl
          label="Spring cut"
          phase="idle"
          disabled
          onStart={noop}
          onConfirm={noop}
          onCancel={noop}
        />
      </div>
    </Case>
    <Case title="Delete control: confirming">
      <div className="saved-plans-actions">
        <DeletePlanControl label="Spring cut" phase="confirming" onStart={noop} onConfirm={noop} onCancel={noop} />
      </div>
    </Case>
    <Case title="Delete control: pending">
      <div className="saved-plans-actions">
        <DeletePlanControl label="Spring cut" phase="pending" onStart={noop} onConfirm={noop} onCancel={noop} />
      </div>
    </Case>
    <Case title="Delete control: very long label (confirming)">
      <div className="saved-plans-actions">
        <DeletePlanControl label={LONG_LABEL} phase="confirming" onStart={noop} onConfirm={noop} onCancel={noop} />
      </div>
    </Case>
    <Case title="Rename form: editing a plan without a title">
      <RenamePlanForm initialTitle={null} pending={false} error={null} onSave={noop} onCancel={noop} />
    </Case>
    <Case title="Rename form: editing a plan with a title">
      <RenamePlanForm initialTitle="Spring cut" pending={false} error={null} onSave={noop} onCancel={noop} />
    </Case>
    <Case title="Rename form: saving (pending, disabled)">
      <RenamePlanForm initialTitle="Spring cut" pending error={null} onSave={noop} onCancel={noop} />
    </Case>
    <Case title="Rename form: error">
      <RenamePlanForm
        initialTitle="Spring cut"
        pending={false}
        error="Something went wrong, try again"
        onSave={noop}
        onCancel={noop}
      />
    </Case>
    <Case title="Rename form: 80-character title">
      <RenamePlanForm initialTitle={LONG_TITLE} pending={false} error={null} onSave={noop} onCancel={noop} />
    </Case>
    <Case title="Saved plan details: with a title">
      <SavedPlanDetails createdAt="2026-11-02T10:00:00Z" form={savedForm} title="Spring cut" />
    </Case>
    <Case title="Saved plan details: 80-character title">
      <SavedPlanDetails createdAt="2026-11-02T10:00:00Z" form={savedForm} title={LONG_TITLE} />
    </Case>
    <Case title="Saved plan details: no title">
      <SavedPlanDetails createdAt="2026-11-02T10:00:00Z" form={savedForm} title={null} />
    </Case>
    <Case title="Saved plan list item: without a title, with a title, with an 80-character title">
      <ul className="saved-plans-list">
        <SavedPlanListItem
          plan={savedSummary}
          deletePhase="idle"
          deleteDisabled={false}
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
        <SavedPlanListItem
          plan={titledSummary}
          deletePhase="idle"
          deleteDisabled={false}
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
        <SavedPlanListItem
          plan={longTitledSummary}
          deletePhase="idle"
          deleteDisabled={false}
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
      </ul>
    </Case>
    <Case title="Saved plan list item: confirming, then another item pending (idle disabled)">
      <ul className="saved-plans-list">
        <SavedPlanListItem
          plan={titledSummary}
          deletePhase="confirming"
          deleteDisabled={false}
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
        <SavedPlanListItem
          plan={savedSummary}
          deletePhase="idle"
          deleteDisabled
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
      </ul>
    </Case>
    <Case title="Saved plan list item: pending">
      <ul className="saved-plans-list">
        <SavedPlanListItem
          plan={titledSummary}
          deletePhase="pending"
          deleteDisabled={false}
          onDeleteStart={noop}
          onDeleteConfirm={noop}
          onDeleteCancel={noop}
        />
      </ul>
    </Case>
    <Case title="Shell: empty">
      <p className="hint">N/A: the shell shows no list, so it has no empty state.</p>
    </Case>
  </div>
)
