import { getSupabaseUrl } from './jwks.provider.js';

describe('getSupabaseUrl', () => {
  const previous = process.env.SUPABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previous;
    }
  });

  const withValue = (value: string | undefined): (() => string) => {
    if (value === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = value;
    }
    return getSupabaseUrl;
  };

  it('throws when SUPABASE_URL is not set', () => {
    expect(withValue(undefined)).toThrow('SUPABASE_URL is not set');
    expect(withValue('   ')).toThrow('SUPABASE_URL is not set');
  });

  it.each([
    ['//https://abc.supabase.co', 'not a valid URL'],
    ['https://abc.supabase.co/auth/v1/.well-known/jwks.json', 'no path'],
    ['https://abc.supabase.co/auth/v1', 'no path'],
    ['https://abc.supabase.co?x=1', 'no path, query or hash'],
    ['http://abc.supabase.co', 'must use https'],
  ])('rejects %s', (value, reason) => {
    expect(withValue(value)).toThrow(reason);
    expect(withValue(value)).toThrow(`got "${value}"`);
  });

  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['  https://abc.supabase.co  ', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
    ['http://localhost:54321/', 'http://localhost:54321'],
  ])('accepts %s as %s', (value, expected) => {
    expect(withValue(value)()).toBe(expected);
  });
});
