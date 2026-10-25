import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  isValidWeekNumber,
  type PlanProgressDraft,
  type PlanProgressEvent,
  type PlanProgressInput,
  type PlanProgressListener,
} from './plan-progress.js';
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
  week: number | null;
  events: PlanProgressEvent[];
  plan: PlanResult | null;
  error: { code: PlanJobErrorCode } | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export const TERMINAL_JOB_RETENTION_MS = 60 * 60 * 1000;
export const PLAN_JOB_TIMEOUT_MS = 10 * 60 * 1000;
export const STALE_RUNNING_JOB_MS = PLAN_JOB_TIMEOUT_MS + 2 * 60 * 1000;

interface Subscription {
  listener: PlanProgressListener;
}

const logger = new Logger('PlanJobStore');

const deliver = (
  jobId: string,
  listener: PlanProgressListener,
  event: PlanProgressEvent,
): void => {
  try {
    listener(event);
  } catch (error) {
    logger.warn(
      `Job ${jobId} progress listener failed on event ${event.id}: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
  }
};

@Injectable()
export class PlanJobStore {
  private readonly jobs = new Map<string, PlanJob>();
  private readonly subscriptions = new Map<string, Set<Subscription>>();

  create(ownerId: string): PlanJob {
    this.purgeExpired();
    const now = new Date();
    const job: PlanJob = {
      id: randomUUID(),
      ownerId,
      status: 'running',
      stage: null,
      week: null,
      events: [],
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
    this.purgeExpired();
    return [...this.jobs.values()].some(
      (job) => job.ownerId === ownerId && job.status === 'running',
    );
  }

  setStage(jobId: string, stage: PlanJobStage): void {
    this.append(jobId, { type: 'stage', stage });
  }

  append(jobId: string, event: PlanProgressDraft): void {
    const job = this.jobs.get(jobId);
    if (job?.status !== 'running') {
      return;
    }
    if (event.type === 'stage') {
      job.stage = event.stage;
      job.week = null;
    } else if (event.type === 'retrying') {
      job.week = null;
    } else if (event.type === 'week') {
      const isNewWeek =
        isValidWeekNumber(event.week) &&
        (job.week === null || event.week > job.week);
      if (!isNewWeek) {
        return;
      }
      job.week = event.week;
    }
    job.updatedAt = new Date();
    this.record(job, event);
  }

  subscriberCount(jobId: string, ownerId: string): number {
    return this.get(jobId, ownerId)
      ? (this.subscriptions.get(jobId)?.size ?? 0)
      : 0;
  }

  subscribe(
    jobId: string,
    ownerId: string,
    afterId: number,
    listener: PlanProgressListener,
  ): (() => void) | undefined {
    const job = this.get(jobId, ownerId);
    if (!job) {
      return undefined;
    }
    for (const event of job.events.filter(({ id }) => id > afterId)) {
      deliver(job.id, listener, event);
    }
    if (job.status !== 'running') {
      return () => undefined;
    }
    const subscription: Subscription = { listener };
    const forJob = this.subscriptions.get(jobId) ?? new Set<Subscription>();
    forJob.add(subscription);
    this.subscriptions.set(jobId, forJob);
    return () => {
      forJob.delete(subscription);
    };
  }

  complete(jobId: string, plan: PlanResult): void {
    this.finish(
      jobId,
      { status: 'completed', plan, error: null },
      { type: 'completed' },
    );
  }

  fail(jobId: string, code: PlanJobErrorCode): void {
    this.finish(
      jobId,
      { status: 'failed', plan: null, error: { code } },
      { type: 'failed', code },
    );
  }

  private finish(
    jobId: string,
    outcome: Pick<PlanJob, 'status' | 'plan' | 'error'>,
    terminal: PlanProgressInput,
  ): void {
    const job = this.jobs.get(jobId);
    if (job?.status === 'running') {
      const now = new Date();
      Object.assign(job, outcome, {
        stage: null,
        week: null,
        updatedAt: now,
        finishedAt: now,
      });
      this.record(job, terminal);
      this.subscriptions.delete(jobId);
    }
  }

  private record(job: PlanJob, input: PlanProgressInput): void {
    const event: PlanProgressEvent = {
      ...input,
      id: job.events.length + 1,
      at: new Date().toISOString(),
    };
    job.events.push(event);
    const forJob = this.subscriptions.get(job.id);
    if (forJob) {
      for (const subscription of forJob) {
        deliver(job.id, subscription.listener, event);
      }
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    const terminalCutoff = now - TERMINAL_JOB_RETENTION_MS;
    const staleCutoff = now - STALE_RUNNING_JOB_MS;
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'running' && job.createdAt.getTime() <= staleCutoff) {
        this.fail(jobId, 'internal');
      } else if (job.finishedAt && job.finishedAt.getTime() <= terminalCutoff) {
        this.jobs.delete(jobId);
        this.subscriptions.delete(jobId);
      }
    }
  }
}
