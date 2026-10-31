import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
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

  beforeEach(async () => {
    findMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: { profile: { findMany } } },
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
});
