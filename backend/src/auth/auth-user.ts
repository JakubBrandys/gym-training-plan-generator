import type { Request } from 'express';
import type { ProfileRole } from '../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  email: string;
}

export interface RequestUser extends AuthUser {
  role: ProfileRole;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
