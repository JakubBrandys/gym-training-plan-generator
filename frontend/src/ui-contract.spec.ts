/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/

const GUARDED_FILES = [
  './pages/HomePage.tsx',
  './pages/HomeView.tsx',
  './components/Button.tsx',
  './components/ButtonLink.tsx',
  './components/button-class.ts',
  './dev/KitchenSinkPage.tsx',
  './dev/kitchen-sink.css',
]

const ALLOWED_INDEX_CSS_LITERALS = ['background: #fff;']

const REQUIRED_TOKENS = ['--accent', '--accent-hover', '--on-accent', '--radius']

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const literalLines = (source: string) =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => COLOUR_LITERAL.test(line))

const tokenBlocks = (css: string) => css.match(/:root\s*\{[^}]*\}/g) ?? []

describe('UI contract', () => {
  it.each(GUARDED_FILES)('%s is read and has no colour literals', (file) => {
    const source = read(file)

    expect(source.length).toBeGreaterThan(0)
    expect(literalLines(source)).toEqual([])
  })

  it('index.css keeps colour literals inside the token blocks, apart from the allowlist', () => {
    const css = read('./index.css')
    const outsideTokenBlocks = css.replace(/:root\s*\{[^}]*\}/g, '')

    expect(tokenBlocks(css)).toHaveLength(2)
    expect(literalLines(outsideTokenBlocks)).toEqual(ALLOWED_INDEX_CSS_LITERALS)
  })

  it.each(REQUIRED_TOKENS)('index.css defines %s in the token block', (token) => {
    const [lightBlock] = tokenBlocks(read('./index.css'))

    expect(lightBlock).toContain(`${token}:`)
  })

  it('index.css overrides the accent tokens for the dark theme', () => {
    const darkBlock = tokenBlocks(read('./index.css'))[1]

    expect(darkBlock).toContain('--accent:')
    expect(darkBlock).toContain('--accent-hover:')
    expect(darkBlock).toContain('--on-accent:')
  })
})
