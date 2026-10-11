import type { Provider } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export const SUPABASE_JWKS = Symbol('SUPABASE_JWKS');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const getSupabaseUrl = (): string => {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'SUPABASE_URL is not set. Add SUPABASE_URL=https://<project-ref>.supabase.co to backend/.env.',
    );
  }
  const invalid = (reason: string): Error =>
    new Error(
      `SUPABASE_URL must be the project URL like https://<project-ref>.supabase.co (${reason}), got "${raw}".`,
    );

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid('not a valid URL');
  }
  const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw invalid('must use https');
  }
  if (url.pathname.replace(/\/+$/, '') !== '' || url.search || url.hash) {
    throw invalid('no path, query or hash');
  }
  return url.origin;
};

export const supabaseJwksProvider: Provider<JWTVerifyGetKey> = {
  provide: SUPABASE_JWKS,
  useFactory: (): JWTVerifyGetKey =>
    createRemoteJWKSet(
      new URL(`${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`),
    ),
};
