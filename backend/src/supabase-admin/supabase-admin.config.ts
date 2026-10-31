import type { Provider } from '@nestjs/common';
import { getSupabaseUrl } from '../auth/jwks.provider.js';

export const SUPABASE_ADMIN_CONFIG = Symbol('SUPABASE_ADMIN_CONFIG');

export interface SupabaseAdminConfig {
  url: string;
  secretKey: string;
}

const readSecretKey = (): string => {
  const value = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!value) {
    throw new Error(
      'SUPABASE_SECRET_KEY is not set. Add SUPABASE_SECRET_KEY=<your-supabase-secret-key> to backend/.env.',
    );
  }
  return value;
};

export const readSupabaseAdminConfig = (): SupabaseAdminConfig => ({
  url: getSupabaseUrl(),
  secretKey: readSecretKey(),
});

export const supabaseAdminConfigProvider: Provider<SupabaseAdminConfig> = {
  provide: SUPABASE_ADMIN_CONFIG,
  useFactory: (): SupabaseAdminConfig => readSupabaseAdminConfig(),
};
