import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ProfilesService } from '../profiles/profiles.service.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier.js';

const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) {
    return null;
  }
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return null;
  }
  return token;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseJwtVerifier,
    private readonly profiles: ProfilesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const authUser = await this.verifier.verify(token);
    const profile = await this.profiles.resolve(authUser);
    if (profile.blockedAt !== null) {
      throw new ForbiddenException('Account is blocked');
    }

    (request as AuthenticatedRequest).user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
    };
    return true;
  }
}
