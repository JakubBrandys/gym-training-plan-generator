import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PlanResult } from './plan.schema.js';

export type PlanJobStatus = 'running' | 'completed' | 'failed';
export type PlanJobStage = 'drafting' | 'reviewing';
export type PlanJobErrorCode =
  'provider_unavailable' | 'invalid_output' | 'internal';

export interface PlanJob {
  id: string;
  ownerId: string;
  status: PlanJobStatus;
  stage: PlanJobStage | null;
  plan: PlanResult | null;
  error: { code: PlanJobErrorCode } | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export const TERMINAL_JOB_RETENTION_MS = 60 * 60 * 1000;

@Injectable()
export class PlanJobStore {
  private readonly jobs = new Map<string, PlanJob>();

  create(ownerId: string): PlanJob {
    this.purgeExpired();
    const now = new Date();
    const job: PlanJob = {
      id: randomUUID(),
      ownerId,
      status: 'running',
      stage: null,
      plan: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(jobId: string, ownerId: string): PlanJob | undefined {
    this.purgeExpired();
    const job = this.jobs.get(jobId);
    return job?.ownerId === ownerId ? job : undefined;
  }

  hasActive(ownerId: string): boolean {
    return [...this.jobs.values()].some(
      (job) => job.ownerId === ownerId && job.status === 'running',
    );
  }

  setStage(jobId: string, stage: PlanJobStage): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.stage = stage;
      job.updatedAt = new Date();
    }
  }

  complete(jobId: string, plan: PlanResult): void {
    this.finish(jobId, { status: 'completed', plan, error: null });
  }

  fail(jobId: string, code: PlanJobErrorCode): void {
    this.finish(jobId, { status: 'failed', plan: null, error: { code } });
  }

  private finish(
    jobId: string,
    outcome: Pick<PlanJob, 'status' | 'plan' | 'error'>,
  ): void {
    const job = this.jobs.get(jobId);
    if (job) {
      const now = new Date();
      Object.assign(job, outcome, {
        stage: null,
        updatedAt: now,
        finishedAt: now,
      });
    }
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - TERMINAL_JOB_RETENTION_MS;
    for (const [jobId, job] of this.jobs) {
      if (job.finishedAt && job.finishedAt.getTime() <= cutoff) {
        this.jobs.delete(jobId);
      }
    }
  }
}
