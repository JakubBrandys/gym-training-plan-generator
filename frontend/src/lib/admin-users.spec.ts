import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAdminUsers, type AdminUser } from './admin-users'
import { apiFetch } from './api'

vi.mock('./api', () => ({ apiFetch: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)

const member: AdminUser = {
  id: 'user-2',
  email: 'member@example.com',
  role: 'MEMBER',
  blockedAt: null,
  createdAt: '2026-10-27T10:00:00.000Z',
}

const blockedAdmin: AdminUser = {
  id: 'user-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  blockedAt: '2026-10-28T10:00:00.000Z',
  createdAt: '2026-10-20T10:00:00.000Z',
}

const respondWith = (status: number, body: unknown = {}) =>
  apiFetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

describe('listAdminUsers', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('requests the admin users endpoint', async () => {
    respondWith(200, [])

    await listAdminUsers()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(apiFetchMock.mock.calls[0][0]).toBe('/admin/users')
  })

  it('maps 200 to ok keeping the server order', async () => {
    respondWith(200, [member, blockedAdmin])

    expect(await listAdminUsers()).toEqual({ kind: 'ok', users: [member, blockedAdmin] })
  })

  it('maps 200 with an empty list to ok', async () => {
    respondWith(200, [])

    expect(await listAdminUsers()).toEqual({ kind: 'ok', users: [] })
  })

  it('maps 401 to unauthorized', async () => {
    respondWith(401)

    expect(await listAdminUsers()).toEqual({ kind: 'unauthorized', status: 401 })
  })

  it('maps 403 to blocked', async () => {
    respondWith(403)

    expect(await listAdminUsers()).toEqual({ kind: 'blocked', status: 403 })
  })

  it('maps 404 to not-found', async () => {
    respondWith(404)

    expect(await listAdminUsers()).toEqual({ kind: 'not-found' })
  })

  it.each([400, 500, 503])('maps %i to error', async (status) => {
    respondWith(status)

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps a non-array success body to error', async () => {
    respondWith(200, { users: [member] })

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps a list with an element missing an email to error', async () => {
    respondWith(200, [member, { id: 'user-3' }])

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps a list with an element missing an id to error', async () => {
    respondWith(200, [{ email: 'no-id@example.com' }])

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it.each([
    ['a missing role', { ...member, role: undefined }],
    ['an unexpected role', { ...member, role: 'OWNER' }],
    ['a missing blockedAt', { ...member, blockedAt: undefined }],
    ['a non-string blockedAt', { ...member, blockedAt: 42 }],
    ['a missing createdAt', { ...member, createdAt: undefined }],
    ['a non-string createdAt', { ...member, createdAt: 42 }],
  ])('maps a list with an element with %s to error', async (_label, element) => {
    respondWith(200, [member, element])

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps a list with a non-object element to error', async () => {
    respondWith(200, [member, null])

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps an unreadable success body to error', async () => {
    apiFetchMock.mockResolvedValue(new Response('not json', { status: 200 }))

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('maps a thrown fetch to error', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('network down'))

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })

  it('passes an abort signal to apiFetch', async () => {
    respondWith(200, [])

    await listAdminUsers()

    expect(apiFetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('maps a request timeout to error', async () => {
    apiFetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))

    expect(await listAdminUsers()).toEqual({ kind: 'error' })
  })
})
