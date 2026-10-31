import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CONFIG,
  type SupabaseAdminConfig,
} from './supabase-admin.config.js';

export const BAN_DURATION = '876000h';

@Injectable()
export class SupabaseAdminClient {
  private readonly client: SupabaseClient;

  constructor(@Inject(SUPABASE_ADMIN_CONFIG) config: SupabaseAdminConfig) {
    this.client = createClient(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async banUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(userId, {
      ban_duration: BAN_DURATION,
    });
    if (error) {
      throw error;
    }
  }
}
