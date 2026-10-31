import { APP_GUARD } from '@nestjs/core';
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminUsersController } from '../src/admin-users/admin-users.controller.js';
import { AdminUsersService } from '../src/admin-users/admin-users.service.js';
import type { AuthenticatedRequest } from '../src/auth/auth-user.js';
import type { ProfileRole } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const USER_HEADER = 'x-test-user';
const ROLE_HEADER = 'x-test-role';

@Injectable()
class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpRequest = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const id = httpRequest.header(USER_HEADER);
    if (!id) {
      throw new UnauthorizedException();
    }
    const role = (httpRequest.header(ROLE_HEADER) ?? 'MEMBER') as ProfileRole;
    httpRequest.user = { id, email: `${id}@example.com`, role };
    return true;
  }
}

interface ProfileRow {
  id: string;
  email: string;
  role: ProfileRole;
  blockedAt: Date | null;
  createdAt: Date;
  internalNote: string;
}

type Projection = Record<string, boolean> | undefined;

const project = (row: ProfileRow, select: Projection): unknown => {
  const copy = structuredClone(row) as unknown as Record<string, unknown>;
  if (!select) {
    return copy;
  }
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, copy[key]]),
  );
};

class FakeProfileTable {
  rows: ProfileRow[] = [];

  seed(row: Pick<ProfileRow, 'id' | 'email'> & Partial<ProfileRow>): void {
    this.rows.push({
      role: 'MEMBER',
      blockedAt: null,
      createdAt: new Date(),
      internalNote: 'must never be exposed',
      ...row,
    });
  }

  findMany = vi.fn(
    ({
      select,
      orderBy,
    }: {
      select?: Projection;
      orderBy: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      const sorted = [...this.rows].sort((a, b) => {
        for (const order of orderBy) {
          const direction = Object.values(order)[0] === 'desc' ? -1 : 1;
          const field = Object.keys(order)[0] as 'createdAt' | 'id';
          const left = a[field] instanceof Date ? a[field].getTime() : a[field];
          const right =
            b[field] instanceof Date ? b[field].getTime() : b[field];
          if (left < right) {
            return -direction;
          }
          if (left > right) {
            return direction;
          }
        }
        return 0;
      });
      return Promise.resolve(sorted.map((row) => project(row, select)));
    },
  );
}

const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';
const ID_3 = '00000000-0000-4000-8000-000000000003';
const ID_4 = '00000000-0000-4000-8000-000000000004';

describe('AdminUsersController (http)', () => {
  let app: INestApplication;
  let table: FakeProfileTable;

  const getList = (role?: string) => {
    const call = request(app.getHttpServer())
      .get('/admin/users')
      .set(USER_HEADER, 'caller-1');
    return role === undefined ? call : call.set(ROLE_HEADER, role);
  };

  beforeEach(async () => {
    table = new FakeProfileTable();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: { profile: table } },
        { provide: APP_GUARD, useClass: HeaderUserGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /admin/users', () => {
    it('answers 401 without a user', async () => {
      await request(app.getHttpServer()).get('/admin/users').expect(401);
    });

    it('answers a member 404 exactly like an unknown route', async () => {
      table.seed({ id: ID_1, email: 'one@example.com' });

      const response = await getList('MEMBER').expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        message: 'Cannot GET /admin/users',
      });
      expect(table.findMany).not.toHaveBeenCalled();
    });

    it('answers a member without a role header 404', async () => {
      await getList().expect(404);
      expect(table.findMany).not.toHaveBeenCalled();
    });

    it('answers an admin 200 with every profile as the five summary fields', async () => {
      table.seed({
        id: ID_1,
        email: 'one@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      table.seed({
        id: ID_2,
        email: 'two@example.com',
        role: 'ADMIN',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });
      table.seed({
        id: ID_3,
        email: 'three@example.com',
        blockedAt: new Date('2026-03-05T12:00:00Z'),
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });

      const response = await getList('ADMIN').expect(200);

      expect(response.body).toEqual([
        {
          id: ID_3,
          email: 'three@example.com',
          role: 'MEMBER',
          blockedAt: '2026-03-05T12:00:00.000Z',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: ID_2,
          email: 'two@example.com',
          role: 'ADMIN',
          blockedAt: null,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
        {
          id: ID_1,
          email: 'one@example.com',
          role: 'MEMBER',
          blockedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('lists newest first and breaks createdAt ties by id descending', async () => {
      const sameMoment = new Date('2026-02-01T00:00:00Z');
      table.seed({
        id: ID_1,
        email: 'one@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      table.seed({ id: ID_2, email: 'two@example.com', createdAt: sameMoment });
      table.seed({
        id: ID_3,
        email: 'three@example.com',
        createdAt: sameMoment,
      });
      table.seed({
        id: ID_4,
        email: 'four@example.com',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });

      const response = await getList('ADMIN').expect(200);

      expect((response.body as Array<{ id: string }>).map((p) => p.id)).toEqual(
        [ID_4, ID_3, ID_2, ID_1],
      );
    });

    it('never exposes columns outside the summary', async () => {
      table.seed({ id: ID_1, email: 'one@example.com' });

      const response = await getList('ADMIN').expect(200);

      const [row] = response.body as Array<Record<string, unknown>>;
      expect(Object.keys(row!).sort()).toEqual([
        'blockedAt',
        'createdAt',
        'email',
        'id',
        'role',
      ]);
    });

    it('answers an empty list when no profile exists', async () => {
      const response = await getList('ADMIN').expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
