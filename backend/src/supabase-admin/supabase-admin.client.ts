import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CONFIG,
  type SupabaseAdminConfig,
} from './supabase-admin.config.js';

export const BAN_DURATION = '876000h';
export const BAN_REQUEST_TIMEOUT_MS = 10_000;
const USER_NOT_FOUND_CODE = 'user_not_found';

const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(BAN_REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

@Injectable()
export class SupabaseAdminClient {
  private readonly client: SupabaseClient;

  constructor(@Inject(SUPABASE_ADMIN_CONFIG) config: SupabaseAdminConfig) {
    this.client = createClient(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout },
    });
  }

  async banUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(userId, {
      ban_duration: BAN_DURATION,
    });
    if (error && error.code !== USER_NOT_FOUND_CODE) {
      throw error;
    }
  }
}
