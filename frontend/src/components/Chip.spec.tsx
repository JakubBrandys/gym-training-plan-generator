import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders its text in a chip', () => {
    render(<Chip>3 × 8-10</Chip>)

    const chip = screen.getByText('3 × 8-10')
    expect(chip.className).toBe('chip')
    expect(chip.tagName).toBe('SPAN')
  })
})
