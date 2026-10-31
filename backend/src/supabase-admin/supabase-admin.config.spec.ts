import {
  readSupabaseAdminConfig,
  supabaseAdminConfigProvider,
  SUPABASE_ADMIN_CONFIG,
} from './supabase-admin.config.js';

describe('readSupabaseAdminConfig', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb-secret-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the validated project url and the secret key', () => {
    expect(readSupabaseAdminConfig()).toEqual({
      url: 'https://abc.supabase.co',
      secretKey: 'sb-secret-test',
    });
  });

  it('trims the secret key', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '  sb-secret-test  ');

    expect(readSupabaseAdminConfig().secretKey).toBe('sb-secret-test');
  });

  it('normalises the project url through the shared validator', () => {
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co/');

    expect(readSupabaseAdminConfig().url).toBe('https://abc.supabase.co');
  });

  it.each(['', '   '])(
    'throws naming SUPABASE_SECRET_KEY when it is %j',
    (value) => {
      vi.stubEnv('SUPABASE_SECRET_KEY', value);

      expect(() => readSupabaseAdminConfig()).toThrow(
        /SUPABASE_SECRET_KEY is not set.*backend\/\.env/,
      );
    },
  );

  it('throws naming SUPABASE_SECRET_KEY when it is missing', () => {
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => readSupabaseAdminConfig()).toThrow(
      /SUPABASE_SECRET_KEY is not set/,
    );
  });

  it('throws naming SUPABASE_URL when it is missing', () => {
    delete process.env.SUPABASE_URL;

    expect(() => readSupabaseAdminConfig()).toThrow(/SUPABASE_URL is not set/);
  });

  it('never puts the secret key in an error message', () => {
    vi.stubEnv('SUPABASE_URL', 'not a url');

    expect(() => readSupabaseAdminConfig()).toThrow(/SUPABASE_URL/);
    expect(() => readSupabaseAdminConfig()).not.toThrow(/sb-secret-test/);
  });
});

describe('supabaseAdminConfigProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is registered under the config token', () => {
    expect(supabaseAdminConfigProvider).toMatchObject({
      provide: SUPABASE_ADMIN_CONFIG,
    });
  });

  it('fails the factory naming SUPABASE_SECRET_KEY when it is unset', () => {
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    const { useFactory } = supabaseAdminConfigProvider as {
      useFactory: () => unknown;
    };

    expect(() => useFactory()).toThrow(/SUPABASE_SECRET_KEY is not set/);
  });
});
