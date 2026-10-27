import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PlanForm } from '../plan-generation/plan-form.schema.js';
import { PlanJobStore } from '../plan-generation/plan-job.store.js';
import type { PlanResult } from '../plan-generation/plan.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SavedPlanSummary {
  id: string;
  createdAt: Date;
  form: PlanForm;
}

export interface SavedPlanView extends SavedPlanSummary {
  plan: PlanResult;
}

interface SummaryRow {
  id: string;
  createdAt: Date;
  form: Prisma.JsonValue;
}

interface ViewRow extends SummaryRow {
  plan: Prisma.JsonValue;
}

const SUMMARY_SELECT = { id: true, createdAt: true, form: true } as const;

const toSummary = (row: SummaryRow): SavedPlanSummary => ({
  id: row.id,
  createdAt: row.createdAt,
  form: row.form as unknown as PlanForm,
});

const toView = (row: ViewRow): SavedPlanView => ({
  ...toSummary(row),
  plan: row.plan as unknown as PlanResult,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class SavedPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PlanJobStore,
  ) {}

  async save(ownerId: string, jobId: string): Promise<SavedPlanSummary> {
    const existing = await this.findBySourceJob(ownerId, jobId);
    if (existing) {
      return toSummary(existing);
    }

    const job = this.store.get(jobId, ownerId);
    if (!job) {
      throw new NotFoundException();
    }
    if (job.status !== 'completed' || !job.plan) {
      throw new HttpException({ code: 'not_completed' }, HttpStatus.CONFLICT);
    }

    try {
      const created = await this.prisma.savedPlan.create({
        data: {
          ownerId,
          sourceJobId: jobId,
          form: job.form as unknown as Prisma.InputJsonValue,
          plan: job.plan as unknown as Prisma.InputJsonValue,
        },
        select: SUMMARY_SELECT,
      });
      return toSummary(created);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.findBySourceJob(ownerId, jobId);
      if (!raced) {
        throw error;
      }
      return toSummary(raced);
    }
  }

  async list(ownerId: string): Promise<SavedPlanSummary[]> {
    const rows = await this.prisma.savedPlan.findMany({
      where: { ownerId },
      select: SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toSummary);
  }

  async get(ownerId: string, id: string): Promise<SavedPlanView> {
    const row = await this.prisma.savedPlan.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return toView(row);
  }

  private findBySourceJob(
    ownerId: string,
    jobId: string,
  ): Promise<SummaryRow | null> {
    return this.prisma.savedPlan.findUnique({
      where: { ownerId_sourceJobId: { ownerId, sourceJobId: jobId } },
      select: SUMMARY_SELECT,
    });
  }
}
