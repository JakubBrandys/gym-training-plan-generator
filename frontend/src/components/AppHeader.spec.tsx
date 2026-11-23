import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProfileState } from '../profile/profile-context'
import { AppHeader } from './AppHeader'

const member: ProfileState = {
  status: 'ready',
  profile: { id: 'member-1', email: 'member@example.com', role: 'MEMBER' },
}

const admin: ProfileState = {
  status: 'ready',
  profile: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
}

type RenderOptions = {
  profile?: ProfileState
  pathname?: string
  signingOut?: boolean
  onSignOut?: () => void
}

const renderHeader = ({
  profile = member,
  pathname = '/',
  signingOut = false,
  onSignOut = () => {},
}: RenderOptions = {}) =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppHeader
        profile={profile}
        pathname={pathname}
        signingOut={signingOut}
        onSignOut={onSignOut}
      />
    </MemoryRouter>,
  )

describe('AppHeader', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the brand as a link to home and adds no heading', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Gym Training Plan Generator' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('renders a labelled main navigation', () => {
    renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav.textContent).toContain('Create plan')
    expect(nav.textContent).toContain('My plans')
  })

  it('shows no email and no Users link while the profile is loading, and keeps Sign out', () => {
    renderHeader({ profile: { status: 'loading' } })

    expect(screen.queryByText('member@example.com')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Create plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('keeps an identity line in the header in every profile state so the height does not change', () => {
    const states: ProfileState[] = [{ status: 'loading' }, { status: 'error' }, member]

    for (const profile of states) {
      const { container, unmount } = renderHeader({ profile })

      expect(container.querySelectorAll('.app-header-identity')).toHaveLength(1)
      unmount()
    }
  })

  it('reserves the width of the Users link as a hidden spacer unless the profile is an admin', () => {
    const states: ProfileState[] = [{ status: 'loading' }, { status: 'error' }, member]

    for (const profile of states) {
      const { container, unmount } = renderHeader({ profile })

      expect(container.querySelectorAll('.app-header-nav-spacer[aria-hidden="true"]')).toHaveLength(1)
      expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
      unmount()
    }

    const { container } = renderHeader({ profile: admin })
    expect(container.querySelectorAll('.app-header-nav-spacer')).toHaveLength(0)
  })

  it('exposes the full address and role as the identity title once the profile is ready', () => {
    const { container } = renderHeader({ profile: member })

    expect(container.querySelector('.app-header-identity')?.getAttribute('title')).toBe('member@example.com · MEMBER')
  })

  it('shows the email and the role of a member and no Users link', () => {
    renderHeader({ profile: member })

    expect(screen.getByText('member@example.com')).toBeTruthy()
    expect(screen.getByText('MEMBER')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
  })

  it('shows the Users link to an admin', () => {
    renderHeader({ profile: admin })

    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/admin/users')
    expect(screen.getByText('ADMIN')).toBeTruthy()
  })

  it('keeps the navigation and Sign out when the profile failed to load', () => {
    renderHeader({ profile: { status: 'error' } })

    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('href')).toBe('/plans')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('calls onSignOut when Sign out is clicked', () => {
    const onSignOut = vi.fn()
    renderHeader({ onSignOut })

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled pending Sign out while signing out', () => {
    const onSignOut = vi.fn()
    renderHeader({ signingOut: true, onSignOut })

    const button = screen.getByRole('button', { name: 'Signing out…' }) as HTMLButtonElement
    fireEvent.click(button)

    expect(button.disabled).toBe(true)
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('marks exactly one link as the current page on /plans/new', () => {
    const { container } = renderHeader({ pathname: '/plans/new', profile: admin })

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Create plan' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('aria-current')).toBeNull()
  })

  it('marks My plans on a saved plan and Users on the admin page', () => {
    const { unmount } = renderHeader({ pathname: '/plans/abc', profile: admin })
    expect(screen.getByRole('link', { name: 'My plans' }).getAttribute('aria-current')).toBe('page')
    unmount()

    renderHeader({ pathname: '/admin/users', profile: admin })
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
  })

  it('marks no link as the current page on home', () => {
    const { container } = renderHeader({ pathname: '/' })

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })
})
