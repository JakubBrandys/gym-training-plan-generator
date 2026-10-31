import { randomUUID } from 'node:crypto';
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
import type { AuthenticatedRequest } from '../src/auth/auth-user.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import {
  PlanJobStore,
  TERMINAL_JOB_RETENTION_MS,
} from '../src/plan-generation/plan-job.store.js';
import type { PlanResult } from '../src/plan-generation/plan.schema.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SavedPlansController } from '../src/saved-plans/saved-plans.controller.js';
import { SavedPlansService } from '../src/saved-plans/saved-plans.service.js';

const USER_HEADER = 'x-test-user';

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
    httpRequest.user = { id, email: `${id}@example.com`, role: 'MEMBER' };
    return true;
  }
}

interface SavedPlanRow {
  id: string;
  ownerId: string;
  sourceJobId: string;
  form: unknown;
  plan: unknown;
  createdAt: Date;
}

type Projection = Record<string, boolean> | undefined;

const project = (row: SavedPlanRow, select: Projection): unknown => {
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

class FakeSavedPlanTable {
  rows: SavedPlanRow[] = [];
  beforeCreate: (() => void) | undefined;

  seed(row: Partial<SavedPlanRow> & Pick<SavedPlanRow, 'ownerId'>): void {
    this.rows.push({
      id: randomUUID(),
      sourceJobId: randomUUID(),
      form: {},
      plan: { weeks: [] },
      createdAt: new Date(),
      ...row,
    });
  }

  findUnique = vi.fn(
    ({
      where,
      select,
    }: {
      where: { ownerId_sourceJobId: { ownerId: string; sourceJobId: string } };
      select?: Projection;
    }) => {
      const { ownerId, sourceJobId } = where.ownerId_sourceJobId;
      const row = this.rows.find(
        (candidate) =>
          candidate.ownerId === ownerId &&
          candidate.sourceJobId === sourceJobId,
      );
      return Promise.resolve(row ? project(row, select) : null);
    },
  );

  create = vi.fn(
    ({
      data,
      select,
    }: {
      data: Pick<SavedPlanRow, 'ownerId' | 'sourceJobId' | 'form' | 'plan'>;
      select?: Projection;
    }) => {
      this.beforeCreate?.();
      this.beforeCreate = undefined;
      const duplicate = this.rows.some(
        (candidate) =>
          candidate.ownerId === data.ownerId &&
          candidate.sourceJobId === data.sourceJobId,
      );
      if (duplicate) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: Prisma.prismaVersion.client,
          }),
        );
      }
      const row: SavedPlanRow = {
        id: randomUUID(),
        createdAt: new Date(),
        ...structuredClone(data),
      };
      this.rows.push(row);
      return Promise.resolve(project(row, select));
    },
  );

  findMany = vi.fn(
    ({
      where,
      select,
      orderBy,
    }: {
      where: { ownerId: string };
      select?: Projection;
      orderBy: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      const owned = this.rows.filter((row) => row.ownerId === where.ownerId);
      const sorted = owned.sort((a, b) => {
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

  findFirst = vi.fn(
    ({
      where,
      select,
    }: {
      where: { id: string; ownerId: string };
      select?: Projection;
    }) => {
      const row = this.rows.find(
        (candidate) =>
          candidate.id === where.id && candidate.ownerId === where.ownerId,
      );
      return Promise.resolve(row ? project(row, select) : null);
    },
  );
}

const form: PlanForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 4,
  heightCm: 180,
  weightKg: 80,
  goals: 'Build strength',
};

const plan: PlanResult = {
  weeks: [
    {
      week: 1,
      goal: 'Foundation',
      sessions: [
        {
          title: 'Full body',
          exercises: [
            {
              slug: 'squat',
              name: 'Squat',
              imageKey: null,
              sets: 3,
              reps: '8-10',
              restSeconds: 90,
              note: null,
            },
          ],
        },
      ],
    },
  ],
};

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('SavedPlansController (http)', () => {
  let app: INestApplication;
  let table: FakeSavedPlanTable;
  let store: PlanJobStore;

  const completedJob = (ownerId: string): string => {
    const job = store.create(ownerId, form);
    store.complete(job.id, plan);
    return job.id;
  };

  const postSave = (userId: string, body: unknown) =>
    request(app.getHttpServer())
      .post('/saved-plans')
      .set(USER_HEADER, userId)
      .send(body as object);

  beforeEach(async () => {
    table = new FakeSavedPlanTable();
    const moduleRef = await Test.createTestingModule({
      controllers: [SavedPlansController],
      providers: [
        SavedPlansService,
        PlanJobStore,
        { provide: PrismaService, useValue: { savedPlan: table } },
        { provide: APP_GUARD, useClass: HeaderUserGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    store = app.get(PlanJobStore);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('POST /saved-plans', () => {
    it('answers 201 with the summary and stores the form and plan unchanged', async () => {
      const jobId = completedJob('user-1');

      const response = await postSave('user-1', { jobId }).expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        createdAt: expect.any(String),
        form,
      });
      expect(response.body).not.toHaveProperty('plan');
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]).toMatchObject({
        ownerId: 'user-1',
        sourceJobId: jobId,
        form,
        plan,
      });
    });

    it('returns the same summary for a repeat save without a second row', async () => {
      const jobId = completedJob('user-1');
      const first = await postSave('user-1', { jobId }).expect(201);

      const second = await postSave('user-1', { jobId }).expect(201);

      expect(second.body).toEqual(first.body);
      expect(table.rows).toHaveLength(1);
      expect(table.create).toHaveBeenCalledTimes(1);
    });

    it('answers a retry with the saved row after the job was purged', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const jobId = completedJob('user-1');
      const first = await postSave('user-1', { jobId }).expect(201);
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS + 1_000);
      expect(store.get(jobId, 'user-1')).toBeUndefined();

      const retry = await postSave('user-1', { jobId }).expect(201);

      expect(retry.body).toEqual(first.body);
      expect(table.rows).toHaveLength(1);
    });

    it('returns the existing row when a concurrent save wins the race', async () => {
      const jobId = completedJob('user-1');
      table.beforeCreate = () => {
        table.seed({
          ownerId: 'user-1',
          sourceJobId: jobId,
          id: '11111111-1111-4111-8111-111111111111',
          form,
          plan,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        });
      };

      const response = await postSave('user-1', { jobId }).expect(201);

      expect(response.body).toEqual({
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-01-01T00:00:00.000Z',
        form,
      });
      expect(table.rows).toHaveLength(1);
    });

    it('answers 404 for a job owned by another user', async () => {
      const jobId = completedJob('user-2');

      await postSave('user-1', { jobId }).expect(404);

      expect(table.rows).toHaveLength(0);
    });

    it('answers 404 for an unknown job', async () => {
      await postSave('user-1', { jobId: UNKNOWN_ID }).expect(404);
    });

    it('answers 404 for an expired job that was never saved', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const jobId = completedJob('user-1');
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS + 1_000);

      await postSave('user-1', { jobId }).expect(404);

      expect(table.rows).toHaveLength(0);
    });

    it('answers 409 not_completed for a running job', async () => {
      const job = store.create('user-1', form);

      const response = await postSave('user-1', { jobId: job.id }).expect(409);

      expect(response.body).toEqual({ code: 'not_completed' });
      expect(table.rows).toHaveLength(0);
    });

    it('answers 409 not_completed for a failed job', async () => {
      const job = store.create('user-1', form);
      store.fail(job.id, 'internal');

      const response = await postSave('user-1', { jobId: job.id }).expect(409);

      expect(response.body).toEqual({ code: 'not_completed' });
      expect(table.rows).toHaveLength(0);
    });

    it.each([{}, { jobId: 'not-a-uuid' }, { jobId: 42 }])(
      'answers 400 for the invalid body %j',
      async (body) => {
        await postSave('user-1', body).expect(400);
      },
    );

    it('answers 401 without a user', async () => {
      await request(app.getHttpServer())
        .post('/saved-plans')
        .send({ jobId: UNKNOWN_ID })
        .expect(401);
    });
  });

  describe('GET /saved-plans', () => {
    it('lists only the callers saved plans without the plan body', async () => {
      table.seed({ ownerId: 'user-1', form });
      table.seed({ ownerId: 'user-2', form });

      const response = await request(app.getHttpServer())
        .get('/saved-plans')
        .set(USER_HEADER, 'user-1')
        .expect(200);

      const body = response.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({
        id: table.rows[0]!.id,
        createdAt: expect.any(String),
        form,
      });
    });

    it('lists newest first and breaks createdAt ties by id descending', async () => {
      const sameMoment = new Date('2026-02-01T00:00:00Z');
      table.seed({
        ownerId: 'user-1',
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      table.seed({
        ownerId: 'user-1',
        id: '00000000-0000-4000-8000-000000000002',
        createdAt: sameMoment,
      });
      table.seed({
        ownerId: 'user-1',
        id: '00000000-0000-4000-8000-000000000003',
        createdAt: sameMoment,
      });
      table.seed({
        ownerId: 'user-1',
        id: '00000000-0000-4000-8000-000000000004',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });

      const response = await request(app.getHttpServer())
        .get('/saved-plans')
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect((response.body as Array<{ id: string }>).map((p) => p.id)).toEqual(
        [
          '00000000-0000-4000-8000-000000000004',
          '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001',
        ],
      );
    });

    it('answers an empty list when the caller has nothing saved', async () => {
      table.seed({ ownerId: 'user-2' });

      const response = await request(app.getHttpServer())
        .get('/saved-plans')
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('answers 401 without a user', async () => {
      await request(app.getHttpServer()).get('/saved-plans').expect(401);
    });
  });

  describe('GET /saved-plans/:id', () => {
    it('returns the summary fields with the plan for the owner', async () => {
      const jobId = completedJob('user-1');
      const saved = await postSave('user-1', { jobId }).expect(201);
      const { id } = saved.body as { id: string };

      const response = await request(app.getHttpServer())
        .get(`/saved-plans/${id}`)
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect(response.body).toEqual({
        id,
        createdAt: (saved.body as { createdAt: string }).createdAt,
        form,
        plan,
      });
    });

    it('answers 404 for another owners saved plan', async () => {
      const jobId = completedJob('user-1');
      const saved = await postSave('user-1', { jobId }).expect(201);
      const { id } = saved.body as { id: string };

      await request(app.getHttpServer())
        .get(`/saved-plans/${id}`)
        .set(USER_HEADER, 'user-2')
        .expect(404);
    });

    it('answers 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get(`/saved-plans/${UNKNOWN_ID}`)
        .set(USER_HEADER, 'user-1')
        .expect(404);
    });

    it('answers 404 for a malformed id', async () => {
      await request(app.getHttpServer())
        .get('/saved-plans/not-a-uuid')
        .set(USER_HEADER, 'user-1')
        .expect(404);
      expect(table.findFirst).not.toHaveBeenCalled();
    });

    it('answers 401 without a user', async () => {
      await request(app.getHttpServer())
        .get(`/saved-plans/${UNKNOWN_ID}`)
        .expect(401);
    });
  });
});
