import type { Provider } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export const SUPABASE_JWKS = Symbol('SUPABASE_JWKS');

export const getSupabaseUrl = (): string => {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'SUPABASE_URL is not set. Add SUPABASE_URL=https://<project-ref>.supabase.co to backend/.env.',
    );
  }
  return url.replace(/\/+$/, '');
};

export const supabaseJwksProvider: Provider<JWTVerifyGetKey> = {
  provide: SUPABASE_JWKS,
  useFactory: (): JWTVerifyGetKey =>
    createRemoteJWKSet(
      new URL(`${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`),
    ),
};
