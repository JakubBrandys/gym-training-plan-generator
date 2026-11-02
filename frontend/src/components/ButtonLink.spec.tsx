import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ButtonLink } from './ButtonLink'

const renderLink = (element: ReactElement) =>
  render(<MemoryRouter initialEntries={['/']}>{element}</MemoryRouter>)

describe('ButtonLink', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a link with the target href', () => {
    renderLink(<ButtonLink to="/plans/new">Create</ButtonLink>)

    expect(screen.getByRole('link', { name: 'Create' }).getAttribute('href')).toBe('/plans/new')
  })

  it('renders the primary variant by default', () => {
    renderLink(<ButtonLink to="/plans">My plans</ButtonLink>)

    expect(screen.getByRole('link', { name: 'My plans' }).className).toBe('btn')
  })

  it('adds the secondary class for the secondary variant', () => {
    renderLink(
      <ButtonLink to="/plans" variant="secondary">
        My plans
      </ButtonLink>,
    )

    expect(screen.getByRole('link', { name: 'My plans' }).className).toBe('btn btn-secondary')
  })
})
