import { Inject, Injectable } from '@nestjs/common';
import {
  PLAN_GENERATION_CONFIG,
  type PlanGenerationConfig,
} from './plan-generation.config.js';
import { PlanJobStore } from './plan-job.store.js';

export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PlanLimitReason = 'active_job' | 'daily_limit';

export type PlanLimitDecision =
  { allowed: true } | { allowed: false; reason: PlanLimitReason };

@Injectable()
export class PlanLimiter {
  private readonly startsByOwner = new Map<string, number[]>();

  constructor(
    private readonly store: PlanJobStore,
    @Inject(PLAN_GENERATION_CONFIG)
    private readonly config: PlanGenerationConfig,
  ) {}

  tryAcquire(ownerId: string, now: number): PlanLimitDecision {
    this.dropExpiredStarts(now);
    if (this.store.hasActive(ownerId)) {
      return { allowed: false, reason: 'active_job' };
    }
    const starts = this.startsByOwner.get(ownerId) ?? [];
    if (starts.length >= this.config.dailyLimit) {
      return { allowed: false, reason: 'daily_limit' };
    }
    this.startsByOwner.set(ownerId, [...starts, now]);
    return { allowed: true };
  }

  private dropExpiredStarts(now: number): void {
    for (const [ownerId, starts] of this.startsByOwner) {
      const recent = starts.filter((start) => start > now - DAILY_WINDOW_MS);
      if (recent.length === 0) {
        this.startsByOwner.delete(ownerId);
      } else {
        this.startsByOwner.set(ownerId, recent);
      }
    }
  }
}
