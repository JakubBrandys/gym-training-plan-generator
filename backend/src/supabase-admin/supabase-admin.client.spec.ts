import { createClient } from '@supabase/supabase-js';
import {
  BAN_DURATION,
  BAN_REQUEST_TIMEOUT_MS,
  SupabaseAdminClient,
} from './supabase-admin.client.js';

const updateUserById = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { admin: { updateUserById } } })),
}));

const config = { url: 'https://abc.supabase.co', secretKey: 'sb-secret-test' };

const sdkFetch = (): typeof fetch => {
  const options = vi.mocked(createClient).mock.calls[0]![2] as unknown as {
    global: { fetch: typeof fetch };
  };
  return options.global.fetch;
};

const sdkError = (message: string, code?: string): Error =>
  Object.assign(new Error(message), { code });

describe('SupabaseAdminClient', () => {
  let client: SupabaseAdminClient;

  beforeEach(() => {
    updateUserById.mockReset();
    vi.mocked(createClient).mockClear();
    client = new SupabaseAdminClient(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the sdk client with the secret key, no session handling and a timeout fetch', () => {
    expect(createClient).toHaveBeenCalledWith(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: expect.any(Function) as typeof fetch },
    });
  });

  it('bans for roughly a century using an hours duration', () => {
    expect(BAN_DURATION).toBe('876000h');
  });

  it('times out ban requests after ten seconds', () => {
    expect(BAN_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it('sends the ban duration for the given user id', async () => {
    updateUserById.mockResolvedValue({ data: {}, error: null });

    await expect(client.banUser('user-1')).resolves.toBeUndefined();

    expect(updateUserById).toHaveBeenCalledWith('user-1', {
      ban_duration: BAN_DURATION,
    });
  });

  it('rejects when the sdk returns an error', async () => {
    updateUserById.mockResolvedValue({
      data: null,
      error: new Error('Service unavailable'),
    });

    await expect(client.banUser('user-1')).rejects.toThrow(
      'Service unavailable',
    );
  });

  it('rejects when the sdk returns an error with another code', async () => {
    updateUserById.mockResolvedValue({
      data: null,
      error: sdkError('Forbidden', 'not_admin'),
    });

    await expect(client.banUser('user-1')).rejects.toThrow('Forbidden');
  });

  it('resolves when the sdk reports the user as not found', async () => {
    updateUserById.mockResolvedValue({
      data: { user: null },
      error: sdkError('User not found', 'user_not_found'),
    });

    await expect(client.banUser('user-1')).resolves.toBeUndefined();
  });

  it('rejects when the sdk throws', async () => {
    updateUserById.mockRejectedValue(new Error('network down'));

    await expect(client.banUser('user-1')).rejects.toThrow('network down');
  });

  describe('request timeout', () => {
    const response = new Response('{}');

    it('forwards the call to the global fetch with a live abort signal', async () => {
      const underlying = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', underlying);

      await expect(
        sdkFetch()('https://abc.supabase.co/admin/users/user-1', {
          method: 'PUT',
          body: '{}',
        }),
      ).resolves.toBe(response);

      expect(underlying).toHaveBeenCalledTimes(1);
      const [url, init] = underlying.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://abc.supabase.co/admin/users/user-1');
      expect(init).toMatchObject({ method: 'PUT', body: '{}' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal!.aborted).toBe(false);
    });

    it('arms the signal with the ban timeout', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const timeout = vi.spyOn(AbortSignal, 'timeout');

      await sdkFetch()('https://abc.supabase.co/admin/users/user-1');

      expect(timeout).toHaveBeenCalledWith(BAN_REQUEST_TIMEOUT_MS);
      timeout.mockRestore();
    });

    it('keeps a caller supplied signal working alongside the timeout', async () => {
      const underlying = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', underlying);
      const caller = new AbortController();

      await sdkFetch()('https://abc.supabase.co/admin/users/user-1', {
        signal: caller.signal,
      });

      const [, init] = underlying.mock.calls[0] as [string, RequestInit];
      expect(init.signal!.aborted).toBe(false);
      caller.abort();
      expect(init.signal!.aborted).toBe(true);
    });

    it('makes banUser reject when the timeout aborts the request', async () => {
      const timeoutController = new AbortController();
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(timeoutController.signal);
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal!.addEventListener('abort', () =>
                reject(new Error('This operation was aborted')),
              );
            }),
        ),
      );
      updateUserById.mockImplementation(async () => {
        try {
          await sdkFetch()('https://abc.supabase.co/admin/users/user-1');
          return { data: {}, error: null };
        } catch (error) {
          return {
            data: { user: null },
            error: sdkError((error as Error).message),
          };
        }
      });

      const ban = client.banUser('user-1');
      timeoutController.abort();

      await expect(ban).rejects.toThrow('This operation was aborted');
      timeout.mockRestore();
    });
  });
});
