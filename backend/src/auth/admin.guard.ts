import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './auth-user.js';

type MaybeAuthenticatedRequest = Request & { user?: RequestUser };

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();
    if (request.user?.role === 'ADMIN') {
      return true;
    }
    throw new NotFoundException(`Cannot ${request.method} ${request.url}`);
  }
}
