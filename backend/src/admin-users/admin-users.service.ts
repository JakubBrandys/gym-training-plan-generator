import { Injectable } from '@nestjs/common';
import type { ProfileRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminUserSummary {
  id: string;
  email: string;
  role: ProfileRole;
  blockedAt: Date | null;
  createdAt: Date;
}

const SUMMARY_SELECT = {
  id: true,
  email: true,
  role: true,
  blockedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<AdminUserSummary[]> {
    return this.prisma.profile.findMany({
      select: SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
