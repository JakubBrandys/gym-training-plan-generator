import { Module } from '@nestjs/common';
import { SupabaseAdminClient } from './supabase-admin.client.js';
import { supabaseAdminConfigProvider } from './supabase-admin.config.js';

@Module({
  providers: [supabaseAdminConfigProvider, SupabaseAdminClient],
  exports: [SupabaseAdminClient],
})
export class SupabaseAdminModule {}
