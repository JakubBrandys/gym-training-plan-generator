import {
  PlanJobStore,
  PLAN_JOB_TIMEOUT_MS,
  STALE_RUNNING_JOB_MS,
  TERMINAL_JOB_RETENTION_MS,
} from './plan-job.store.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';

describe('PlanJobStore', () => {
  let store: PlanJobStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    store = new PlanJobStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a running job owned by the caller with a uuid id', () => {
    const job = store.create(OWNER);
    expect(job).toMatchObject({
      ownerId: OWNER,
      status: 'running',
      stage: null,
      plan: null,
      error: null,
      finishedAt: null,
    });
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the job to its owner', () => {
    const job = store.create(OWNER);
    expect(store.get(job.id, OWNER)).toBe(job);
  });

  it('returns undefined for another owner and for an unknown job alike', () => {
    const job = store.create(OWNER);
    expect(store.get(job.id, OTHER)).toBeUndefined();
    expect(store.get('unknown-job', OWNER)).toBeUndefined();
  });

  it('reports hasActive only while the owner has a running job', () => {
    expect(store.hasActive(OWNER)).toBe(false);
    const job = store.create(OWNER);
    expect(store.hasActive(OWNER)).toBe(true);
    expect(store.hasActive(OTHER)).toBe(false);
    store.fail(job.id, 'internal');
    expect(store.hasActive(OWNER)).toBe(false);
  });

  it('records stage changes and bumps updatedAt', () => {
    const job = store.create(OWNER);
    vi.setSystemTime(new Date('2026-10-14T10:00:05Z'));
    store.setStage(job.id, 'reviewing');
    expect(job.stage).toBe('reviewing');
    expect(job.updatedAt.toISOString()).toBe('2026-10-14T10:00:05.000Z');
  });

  it('completes a job with its plan and clears the stage', () => {
    const job = store.create(OWNER);
    store.setStage(job.id, 'reviewing');
    const plan = { weeks: [] };
    store.complete(job.id, plan);
    expect(job).toMatchObject({
      status: 'completed',
      stage: null,
      plan,
      error: null,
    });
    expect(job.finishedAt).toBeInstanceOf(Date);
  });

  it('fails a job with an error code and no plan', () => {
    const job = store.create(OWNER);
    store.fail(job.id, 'invalid_output');
    expect(job).toMatchObject({
      status: 'failed',
      plan: null,
      error: { code: 'invalid_output' },
    });
    expect(job.finishedAt).toBeInstanceOf(Date);
  });

  describe('purging', () => {
    it('keeps a terminal job just before one hour after finishedAt', () => {
      const job = store.create(OWNER);
      store.fail(job.id, 'internal');
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS - 1);
      expect(store.get(job.id, OWNER)).toBe(job);
    });

    it('purges a terminal job one hour after finishedAt on get', () => {
      const job = store.create(OWNER);
      store.fail(job.id, 'internal');
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS);
      expect(store.get(job.id, OWNER)).toBeUndefined();
    });

    it('purges expired terminal jobs lazily on create', () => {
      const old = store.create(OWNER);
      store.complete(old.id, { weeks: [] });
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS + 1);
      store.create(OTHER);
      expect(store.get(old.id, OWNER)).toBeUndefined();
    });

    it('does not reap a running job that is still within the job timeout margin', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS - 1);
      expect(store.get(job.id, OWNER)).toBe(job);
      expect(job.status).toBe('running');
      expect(store.hasActive(OWNER)).toBe(true);
    });

    it('keeps a fresh running job running past the plain job timeout', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + PLAN_JOB_TIMEOUT_MS);
      expect(store.get(job.id, OWNER)?.status).toBe('running');
    });

    it('fails a stale running job as internal on get', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      const found = store.get(job.id, OWNER);
      expect(found).toBe(job);
      expect(job).toMatchObject({
        status: 'failed',
        plan: null,
        stage: null,
        error: { code: 'internal' },
      });
      expect(job.finishedAt).toBeInstanceOf(Date);
    });

    it('stops counting a stale running job as active', () => {
      const job = store.create(OWNER);
      expect(store.hasActive(OWNER)).toBe(true);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      expect(store.hasActive(OWNER)).toBe(false);
      expect(job.status).toBe('failed');
    });

    it('fails a stale running job lazily on create', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      store.create(OTHER);
      expect(job).toMatchObject({
        status: 'failed',
        error: { code: 'internal' },
      });
    });

    it('does not let a late completion overwrite a reaped job', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      store.hasActive(OWNER);
      store.complete(job.id, { weeks: [] });
      expect(job).toMatchObject({
        status: 'failed',
        plan: null,
        error: { code: 'internal' },
      });
    });

    it('measures retention from finishedAt, not createdAt', () => {
      const job = store.create(OWNER);
      vi.setSystemTime(Date.now() + 30 * 60 * 1000);
      store.complete(job.id, { weeks: [] });
      vi.setSystemTime(Date.now() + 45 * 60 * 1000);
      expect(store.get(job.id, OWNER)).toBe(job);
    });
  });
});
