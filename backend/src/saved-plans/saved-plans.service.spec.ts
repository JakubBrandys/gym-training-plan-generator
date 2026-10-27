import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client.js';
import type { PlanForm } from '../plan-generation/plan-form.schema.js';
import { PlanJobStore } from '../plan-generation/plan-job.store.js';
import type { PlanResult } from '../plan-generation/plan.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SavedPlansService } from './saved-plans.service.js';

const OWNER_ID = '6f1c1f0e-7a8b-4c1d-9e2f-0a1b2c3d4e5f';
const OTHER_OWNER_ID = '0b9d6f0a-2c1e-4b7a-8d3f-5e4a3b2c1d0e';
const UNKNOWN_JOB_ID = '00000000-0000-4000-8000-000000000000';
const SAVED_ID = '11111111-1111-4111-8111-111111111111';

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

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: SAVED_ID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  form,
  ...overrides,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: Prisma.prismaVersion.client,
  });

describe('SavedPlansService', () => {
  let service: SavedPlansService;
  let store: PlanJobStore;
  const findUnique = vi.fn();
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();

  const completedJobId = (ownerId = OWNER_ID): string => {
    const job = store.create(ownerId, form);
    store.complete(job.id, plan);
    return job.id;
  };

  beforeEach(async () => {
    for (const fn of [findUnique, create, findMany, findFirst]) {
      fn.mockReset();
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedPlansService,
        PlanJobStore,
        {
          provide: PrismaService,
          useValue: { savedPlan: { findUnique, create, findMany, findFirst } },
        },
      ],
    }).compile();

    service = module.get(SavedPlansService);
    store = module.get(PlanJobStore);
  });

  describe('save', () => {
    it('stores the form and plan of a completed job unchanged', async () => {
      const jobId = completedJobId();
      findUnique.mockResolvedValue(null);
      create.mockResolvedValue(makeRow());

      await expect(service.save(OWNER_ID, jobId)).resolves.toEqual(makeRow());

      expect(create).toHaveBeenCalledWith({
        data: { ownerId: OWNER_ID, sourceJobId: jobId, form, plan },
        select: { id: true, createdAt: true, form: true },
      });
    });

    it('looks up an existing save by the compound owner and job key', async () => {
      const jobId = completedJobId();
      findUnique.mockResolvedValue(null);
      create.mockResolvedValue(makeRow());

      await service.save(OWNER_ID, jobId);

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          ownerId_sourceJobId: { ownerId: OWNER_ID, sourceJobId: jobId },
        },
        select: { id: true, createdAt: true, form: true },
      });
    });

    it('returns the existing row without reading the job or creating', async () => {
      const existing = makeRow();
      findUnique.mockResolvedValue(existing);
      const getJob = vi.spyOn(store, 'get');

      await expect(service.save(OWNER_ID, UNKNOWN_JOB_ID)).resolves.toEqual(
        existing,
      );

      expect(getJob).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('returns the existing row on retry after the job was purged', async () => {
      const jobId = completedJobId();
      findUnique.mockResolvedValueOnce(null);
      create.mockResolvedValueOnce(makeRow());
      const first = await service.save(OWNER_ID, jobId);

      const freshStore = new PlanJobStore();
      const freshService = new SavedPlansService(
        { savedPlan: { findUnique, create } } as unknown as PrismaService,
        freshStore,
      );
      findUnique.mockResolvedValueOnce(makeRow());

      await expect(freshService.save(OWNER_ID, jobId)).resolves.toEqual(first);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('re-reads the existing row when a concurrent save hits P2002', async () => {
      const jobId = completedJobId();
      const raced = makeRow();
      findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
      create.mockRejectedValue(uniqueViolation());

      await expect(service.save(OWNER_ID, jobId)).resolves.toEqual(raced);
      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('rethrows create errors other than P2002', async () => {
      const jobId = completedJobId();
      const failure = new Error('connection lost');
      findUnique.mockResolvedValue(null);
      create.mockRejectedValue(failure);

      await expect(service.save(OWNER_ID, jobId)).rejects.toBe(failure);
      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for an unknown or expired job', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.save(OWNER_ID, UNKNOWN_JOB_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for another owners job', async () => {
      const jobId = completedJobId(OTHER_OWNER_ID);
      findUnique.mockResolvedValue(null);

      await expect(service.save(OWNER_ID, jobId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('throws 409 not_completed for a running job', async () => {
      const job = store.create(OWNER_ID, form);
      findUnique.mockResolvedValue(null);

      const error = await service.save(OWNER_ID, job.id).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toEqual({
        code: 'not_completed',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('throws 409 not_completed for a failed job', async () => {
      const job = store.create(OWNER_ID, form);
      store.fail(job.id, 'internal');
      findUnique.mockResolvedValue(null);

      const error = await service.save(OWNER_ID, job.id).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toEqual({
        code: 'not_completed',
      });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('selects summaries for the owner newest first with an id tiebreak', async () => {
      const rows = [makeRow(), makeRow({ id: 'second' })];
      findMany.mockResolvedValue(rows);

      await expect(service.list(OWNER_ID)).resolves.toEqual(rows);

      expect(findMany).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID },
        select: { id: true, createdAt: true, form: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });
  });

  describe('get', () => {
    it('returns the saved plan with the form and plan', async () => {
      findFirst.mockResolvedValue({ ...makeRow(), plan });

      await expect(service.get(OWNER_ID, SAVED_ID)).resolves.toEqual({
        ...makeRow(),
        plan,
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: SAVED_ID, ownerId: OWNER_ID },
      });
    });

    it('throws NotFoundException when no row matches the owner and id', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.get(OTHER_OWNER_ID, SAVED_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
