import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, type NavKey } from './nav-active'

const activeKeys = (pathname: string): NavKey[] =>
  NAV_ITEMS.filter((item) => item.isActive(pathname)).map((item) => item.key)

describe('NAV_ITEMS', () => {
  it('lists Create plan, My plans and Users in that order with only Users admin-only', () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual(['create-plan', 'my-plans', 'users'])
    expect(NAV_ITEMS.filter((item) => item.adminOnly).map((item) => item.key)).toEqual(['users'])
  })

  it.each([
    ['/', []],
    ['/sign-in', []],
    ['/plans', ['my-plans']],
    ['/plans/', ['my-plans']],
    ['/plans/0b6f2c1e-6d0e-4a3c-9d6b-2f3a1c4e5d6f', ['my-plans']],
    ['/plans/new', ['create-plan']],
    ['/plans/new/', ['create-plan']],
    ['/plans/generate/job-1', ['create-plan']],
    ['/admin/users', ['users']],
  ] as const)('marks %s as active for %j', (pathname, expected) => {
    expect(activeKeys(pathname)).toEqual(expected)
  })

  it('never marks more than one link active', () => {
    const paths = ['/', '/plans', '/plans/a', '/plans/new', '/plans/generate/x', '/admin/users']

    for (const path of paths) {
      expect(activeKeys(path).length).toBeLessThanOrEqual(1)
    }
  })
})
