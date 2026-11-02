import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../lib/api'
import { ProfileProvider } from './ProfileProvider'
import { useProfile } from './useProfile'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)
const useAuthMock = vi.mocked(useAuth)
const signOut = vi.fn()

const profileResponse = (role: 'MEMBER' | 'ADMIN' = 'MEMBER') =>
  new Response(JSON.stringify({ id: 'user-1', email: 'someone@example.com', role }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const Probe = () => {
  const { state, reload } = useProfile()

  return (
    <>
      <p data-testid="status">{state.status}</p>
      {state.status === 'ready' && <p>{`${state.profile.email} ${state.profile.role}`}</p>}
      <button type="button" onClick={reload}>
        reload
      </button>
    </>
  )
}

const renderProvider = () =>
  render(
    <ProfileProvider>
      <Probe />
    </ProfileProvider>,
  )

describe('ProfileProvider', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    signOut.mockReset()
    signOut.mockResolvedValue(undefined)
    useAuthMock.mockReturnValue({
      session: null,
      loading: false,
      signOutReason: null,
      signOut,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('starts loading and then exposes the profile', async () => {
    apiFetchMock.mockResolvedValue(profileResponse('ADMIN'))
    renderProvider()

    expect(screen.getByTestId('status').textContent).toBe('loading')
    expect(await screen.findByText('someone@example.com ADMIN')).toBeTruthy()
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(apiFetchMock).toHaveBeenCalledWith('/me')
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an error for a non-OK response', async () => {
    apiFetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    renderProvider()

    expect(await screen.findByText('error')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('reports an error for a body that is not JSON', async () => {
    apiFetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    renderProvider()

    expect(await screen.findByText('error')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('reports an error without signing out when the request is rejected', async () => {
    apiFetchMock.mockRejectedValue(new TypeError('supabase.auth.getSession is not a function'))
    renderProvider()

    expect(await screen.findByText('error')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out without a reason on 401 and stays loading', async () => {
    apiFetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    renderProvider()

    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(signOut).toHaveBeenCalledWith()
    expect(screen.getByTestId('status').textContent).toBe('loading')
  })

  it('signs out as blocked on 403 and stays loading', async () => {
    apiFetchMock.mockResolvedValue(new Response('{}', { status: 403 }))
    renderProvider()

    await vi.waitFor(() => expect(signOut).toHaveBeenCalledWith('blocked'))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('loading')
  })

  it('requests the profile again on reload and recovers', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    apiFetchMock.mockResolvedValueOnce(profileResponse())
    renderProvider()
    await screen.findByText('error')

    fireEvent.click(screen.getByRole('button', { name: 'reload' }))

    expect(await screen.findByText('someone@example.com MEMBER')).toBeTruthy()
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not update state or log errors when unmounted before the response', async () => {
    let resolveResponse: (response: Response) => void = () => {}
    apiFetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve
      }),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderProvider()
    unmount()
    await act(async () => {
      resolveResponse(profileResponse())
    })

    expect(consoleError).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('throws when useProfile is used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow('useProfile must be used within a ProfileProvider')

    consoleError.mockRestore()
  })
})
