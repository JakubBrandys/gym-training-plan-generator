import type { PlanForm } from './plan-form.schema.js';
import type { PlanGenerationConfig } from './plan-generation.config.js';
import { PlanJobStore, STALE_RUNNING_JOB_MS } from './plan-job.store.js';
import { DAILY_WINDOW_MS, PlanLimiter } from './plan.limiter.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';
const HOUR = 60 * 60 * 1000;

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 4,
  heightCm: 170,
  weightKg: 65,
  goals: 'Get stronger',
};

const buildConfig = (dailyLimit: number): PlanGenerationConfig => ({
  openAiApiKey: 'sk-test',
  draftModel: 'draft',
  reviewModel: 'review',
  dailyLimit,
});

describe('PlanLimiter', () => {
  let store: PlanJobStore;

  beforeEach(() => {
    store = new PlanJobStore();
  });

  it('allows the first request', () => {
    const limiter = new PlanLimiter(store, buildConfig(2));
    expect(limiter.tryAcquire(OWNER, 0)).toEqual({ allowed: true });
  });

  it('stops denying with active_job once a running job is stale', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
      const limiter = new PlanLimiter(store, buildConfig(5));
      store.create(OWNER, form);
      expect(limiter.tryAcquire(OWNER, Date.now())).toEqual({
        allowed: false,
        reason: 'active_job',
      });
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      expect(limiter.tryAcquire(OWNER, Date.now())).toEqual({ allowed: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies with active_job while the owner has a running job', () => {
    const limiter = new PlanLimiter(store, buildConfig(5));
    store.create(OWNER, form);
    expect(limiter.tryAcquire(OWNER, 0)).toEqual({
      allowed: false,
      reason: 'active_job',
    });
  });

  it('does not let one owner running job block another owner', () => {
    const limiter = new PlanLimiter(store, buildConfig(5));
    store.create(OWNER, form);
    expect(limiter.tryAcquire(OTHER, 0)).toEqual({ allowed: true });
  });

  it('denies with daily_limit after dailyLimit starts, counting failed jobs', () => {
    const limiter = new PlanLimiter(store, buildConfig(2));
    const first = limiter.tryAcquire(OWNER, 0);
    store.fail(store.create(OWNER, form).id, 'provider_unavailable');
    const second = limiter.tryAcquire(OWNER, HOUR);
    store.complete(store.create(OWNER, form).id, { weeks: [] });
    expect(first).toEqual({ allowed: true });
    expect(second).toEqual({ allowed: true });
    expect(limiter.tryAcquire(OWNER, 2 * HOUR)).toEqual({
      allowed: false,
      reason: 'daily_limit',
    });
  });

  it('reports active_job before daily_limit when both apply', () => {
    const limiter = new PlanLimiter(store, buildConfig(1));
    limiter.tryAcquire(OWNER, 0);
    store.create(OWNER, form);
    expect(limiter.tryAcquire(OWNER, HOUR)).toEqual({
      allowed: false,
      reason: 'active_job',
    });
  });

  it('records the start only when it allows, so denied calls do not count', () => {
    const limiter = new PlanLimiter(store, buildConfig(2));
    limiter.tryAcquire(OWNER, 0);
    const job = store.create(OWNER, form);
    limiter.tryAcquire(OWNER, 1);
    limiter.tryAcquire(OWNER, 2);
    store.fail(job.id, 'internal');
    expect(limiter.tryAcquire(OWNER, 3)).toEqual({ allowed: true });
  });

  it('counts starts per owner', () => {
    const limiter = new PlanLimiter(store, buildConfig(1));
    expect(limiter.tryAcquire(OWNER, 0)).toEqual({ allowed: true });
    expect(limiter.tryAcquire(OTHER, 0)).toEqual({ allowed: true });
  });

  it('stops counting a start once it is 24 hours old', () => {
    const limiter = new PlanLimiter(store, buildConfig(1));
    limiter.tryAcquire(OWNER, 0);
    expect(limiter.tryAcquire(OWNER, DAILY_WINDOW_MS - 1)).toEqual({
      allowed: false,
      reason: 'daily_limit',
    });
    expect(limiter.tryAcquire(OWNER, DAILY_WINDOW_MS)).toEqual({
      allowed: true,
    });
  });

  it('rolls the window rather than resetting it at a fixed time', () => {
    const limiter = new PlanLimiter(store, buildConfig(2));
    limiter.tryAcquire(OWNER, 0);
    limiter.tryAcquire(OWNER, 20 * HOUR);
    expect(limiter.tryAcquire(OWNER, 25 * HOUR)).toEqual({ allowed: true });
    expect(limiter.tryAcquire(OWNER, 26 * HOUR)).toEqual({
      allowed: false,
      reason: 'daily_limit',
    });
  });
});
