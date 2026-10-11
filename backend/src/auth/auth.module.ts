import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AuthGuard } from './auth.guard.js';
import { supabaseJwksProvider } from './jwks.provider.js';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier.js';

@Module({
  imports: [ProfilesModule],
  providers: [
    supabaseJwksProvider,
    SupabaseJwtVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
