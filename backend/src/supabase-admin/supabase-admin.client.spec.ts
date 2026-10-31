import { createClient } from '@supabase/supabase-js';
import { BAN_DURATION, SupabaseAdminClient } from './supabase-admin.client.js';

const updateUserById = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { admin: { updateUserById } } })),
}));

const config = { url: 'https://abc.supabase.co', secretKey: 'sb-secret-test' };

describe('SupabaseAdminClient', () => {
  let client: SupabaseAdminClient;

  beforeEach(() => {
    updateUserById.mockReset();
    vi.mocked(createClient).mockClear();
    client = new SupabaseAdminClient(config);
  });

  it('creates the sdk client with the secret key and no session handling', () => {
    expect(createClient).toHaveBeenCalledWith(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('bans for roughly a century using an hours duration', () => {
    expect(BAN_DURATION).toBe('876000h');
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
      error: new Error('User not found'),
    });

    await expect(client.banUser('user-1')).rejects.toThrow('User not found');
  });

  it('rejects when the sdk throws', async () => {
    updateUserById.mockRejectedValue(new Error('network down'));

    await expect(client.banUser('user-1')).rejects.toThrow('network down');
  });
});
