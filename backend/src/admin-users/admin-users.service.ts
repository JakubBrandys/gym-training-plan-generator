import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ProfileRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SupabaseAdminClient } from '../supabase-admin/supabase-admin.client.js';

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
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminClient,
  ) {}

  list(): Promise<AdminUserSummary[]> {
    return this.prisma.profile.findMany({
      select: SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async block(id: string): Promise<AdminUserSummary> {
    const target = await this.findSummary(id);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === 'ADMIN') {
      throw new ConflictException('Admins cannot be blocked');
    }

    const blocked = target.blockedAt ? target : await this.stampBlock(id);

    try {
      await this.supabaseAdmin.banUser(id);
    } catch (error) {
      this.logger.error(
        `Banning user ${id} in Supabase failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadGatewayException();
    }

    return blocked;
  }

  private findSummary(id: string): Promise<AdminUserSummary | null> {
    return this.prisma.profile.findUnique({
      where: { id },
      select: SUMMARY_SELECT,
    });
  }

  private async stampBlock(id: string): Promise<AdminUserSummary> {
    await this.prisma.profile.updateMany({
      where: { id, role: 'MEMBER', blockedAt: null },
      data: { blockedAt: new Date() },
    });

    const current = await this.findSummary(id);
    if (!current) {
      throw new NotFoundException('User not found');
    }
    if (current.role === 'ADMIN') {
      throw new ConflictException('Admins cannot be blocked');
    }
    return current;
  }
}
