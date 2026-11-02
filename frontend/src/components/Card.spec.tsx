import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders its children in a card container', () => {
    render(<Card>Content</Card>)

    expect(screen.getByText('Content').className).toBe('card')
  })

  it('keeps a caller class next to the card class', () => {
    render(<Card className="extra">Content</Card>)

    expect(screen.getByText('Content').className).toBe('card extra')
  })

  it('forwards role and aria attributes', () => {
    render(
      <Card role="group" aria-label="Summary">
        Content
      </Card>,
    )

    expect(screen.getByRole('group', { name: 'Summary' }).textContent).toBe('Content')
  })
})
