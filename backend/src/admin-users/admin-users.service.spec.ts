import {
  BadGatewayException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SupabaseAdminClient } from '../supabase-admin/supabase-admin.client.js';
import {
  AdminUsersService,
  type AdminUserSummary,
} from './admin-users.service.js';

const rows: AdminUserSummary[] = [
  {
    id: 'profile-2',
    email: 'two@example.com',
    role: 'ADMIN',
    blockedAt: null,
    createdAt: new Date('2026-02-01T00:00:00Z'),
  },
  {
    id: 'profile-1',
    email: 'one@example.com',
    role: 'MEMBER',
    blockedAt: new Date('2026-03-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const banUser = vi.fn();

  beforeEach(async () => {
    findMany.mockReset();
    findUnique.mockReset();
    update.mockReset();
    banUser.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        {
          provide: PrismaService,
          useValue: { profile: { findMany, findUnique, update } },
        },
        { provide: SupabaseAdminClient, useValue: { banUser } },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  it('selects the five summary fields, newest first with an id tiebreak', async () => {
    findMany.mockResolvedValue(rows);

    await service.list();

    expect(findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        email: true,
        role: true,
        blockedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns every row unchanged', async () => {
    findMany.mockResolvedValue(rows);

    await expect(service.list()).resolves.toBe(rows);
  });

  it('does not filter or paginate', async () => {
    findMany.mockResolvedValue(rows);

    await service.list();

    const [args] = findMany.mock.calls[0] as [Record<string, unknown>];
    expect(args).not.toHaveProperty('where');
    expect(args).not.toHaveProperty('take');
    expect(args).not.toHaveProperty('skip');
  });

  describe('block', () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const SUMMARY_SELECT = {
      id: true,
      email: true,
      role: true,
      blockedAt: true,
      createdAt: true,
    };
    const member: AdminUserSummary = {
      id: userId,
      email: 'member@example.com',
      role: 'MEMBER',
      blockedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('answers not found without writing or banning when the user does not exist', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.block(userId)).rejects.toThrow(
        new NotFoundException('User not found'),
      );

      expect(update).not.toHaveBeenCalled();
      expect(banUser).not.toHaveBeenCalled();
    });

    it('reads the target with the summary select only', async () => {
      findUnique.mockResolvedValue(null);

      await service.block(userId).catch(() => undefined);

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: SUMMARY_SELECT,
      });
    });

    it('answers conflict without writing or banning when the target is an admin', async () => {
      findUnique.mockResolvedValue({ ...member, role: 'ADMIN' });

      await expect(service.block(userId)).rejects.toThrow(
        new ConflictException('Admins cannot be blocked'),
      );

      expect(update).not.toHaveBeenCalled();
      expect(banUser).not.toHaveBeenCalled();
    });

    it('stamps blockedAt on an active member, bans them and returns the updated summary', async () => {
      const blockedAt = new Date('2026-04-01T00:00:00Z');
      const updated = { ...member, blockedAt };
      findUnique.mockResolvedValue(member);
      update.mockResolvedValue(updated);
      banUser.mockResolvedValue(undefined);

      await expect(service.block(userId)).resolves.toBe(updated);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { blockedAt: expect.any(Date) as Date },
        select: SUMMARY_SELECT,
      });
      expect(banUser).toHaveBeenCalledWith(userId);
    });

    it('keeps the original blockedAt and skips the write for an already blocked member, but still bans', async () => {
      const blocked = {
        ...member,
        blockedAt: new Date('2026-03-01T00:00:00Z'),
      };
      findUnique.mockResolvedValue(blocked);
      banUser.mockResolvedValue(undefined);

      await expect(service.block(userId)).resolves.toBe(blocked);

      expect(update).not.toHaveBeenCalled();
      expect(banUser).toHaveBeenCalledWith(userId);
    });

    it('writes the block before it bans', async () => {
      findUnique.mockResolvedValue(member);
      update.mockResolvedValue({ ...member, blockedAt: new Date() });
      banUser.mockResolvedValue(undefined);

      await service.block(userId);

      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        banUser.mock.invocationCallOrder[0]!,
      );
    });

    it('answers bad gateway after the write when the ban fails, and logs the id and message', async () => {
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      findUnique.mockResolvedValue(member);
      update.mockResolvedValue({ ...member, blockedAt: new Date() });
      banUser.mockRejectedValue(new Error('supabase unavailable'));

      await expect(service.block(userId)).rejects.toBeInstanceOf(
        BadGatewayException,
      );

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        banUser.mock.invocationCallOrder[0]!,
      );
      expect(logError).toHaveBeenCalledTimes(1);
      const [message] = logError.mock.calls[0] as [string];
      expect(message).toContain(userId);
      expect(message).toContain('supabase unavailable');
    });

    it('answers bad gateway when the ban fails for an already blocked member', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      findUnique.mockResolvedValue({
        ...member,
        blockedAt: new Date('2026-03-01T00:00:00Z'),
      });
      banUser.mockRejectedValue(new Error('supabase unavailable'));

      await expect(service.block(userId)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
