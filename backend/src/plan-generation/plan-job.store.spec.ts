import { Logger } from '@nestjs/common';
import {
  PlanJobStore,
  PLAN_JOB_TIMEOUT_MS,
  STALE_RUNNING_JOB_MS,
  TERMINAL_JOB_RETENTION_MS,
} from './plan-job.store.js';
import type { PlanProgressEvent } from './plan-progress.js';
import { WEEK_COUNT } from './plan.validator.js';

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

  describe('progress events', () => {
    const collect = (jobId: string, ownerId = OWNER, afterId = 0) => {
      const received: PlanProgressEvent[] = [];
      const unsubscribe = store.subscribe(jobId, ownerId, afterId, (event) =>
        received.push(event),
      );
      return { received, unsubscribe };
    };

    it('starts a job with no events and no week', () => {
      const job = store.create(OWNER);
      expect(job.events).toEqual([]);
      expect(job.week).toBeNull();
    });

    it('assigns monotonic ids starting at 1 with ISO timestamps', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      vi.setSystemTime(new Date('2026-10-14T10:00:03Z'));
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.append(job.id, { type: 'validating', stage: 'drafting' });
      store.complete(job.id, { weeks: [] });

      expect(job.events.map((event) => event.id)).toEqual([1, 2, 3, 4]);
      expect(job.events.map((event) => event.type)).toEqual([
        'stage',
        'week',
        'validating',
        'completed',
      ]);
      expect(job.events[0].at).toBe('2026-10-14T10:00:00.000Z');
      expect(job.events[1].at).toBe('2026-10-14T10:00:03.000Z');
    });

    it('records the stage, retry and failure payloads', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'retrying', stage: 'drafting', attempt: 2 });
      store.fail(job.id, 'invalid_output');

      expect(job.events).toMatchObject([
        { id: 1, type: 'stage', stage: 'drafting' },
        { id: 2, type: 'retrying', stage: 'drafting', attempt: 2 },
        { id: 3, type: 'failed', code: 'invalid_output' },
      ]);
    });

    it('tracks the latest started week and ignores unchanged, lower or out of range weeks', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 2 });
      store.append(job.id, { type: 'week', stage: 'drafting', week: 2 });
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.append(job.id, {
        type: 'week',
        stage: 'drafting',
        week: WEEK_COUNT + 1,
      });
      store.append(job.id, { type: 'week', stage: 'drafting', week: 0 });
      expect(job.week).toBe(2);
      expect(job.events.filter((event) => event.type === 'week')).toHaveLength(
        1,
      );

      store.append(job.id, { type: 'week', stage: 'drafting', week: 5 });
      expect(job.week).toBe(5);
    });

    it('resets the week to null when a new stage starts and accepts weeks again', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, {
        type: 'week',
        stage: 'drafting',
        week: WEEK_COUNT,
      });
      store.setStage(job.id, 'reviewing');
      expect(job.week).toBeNull();

      store.append(job.id, { type: 'week', stage: 'reviewing', week: 1 });
      expect(job.week).toBe(1);
    });

    it('resets the week to null on a retry and accepts weeks again within the same stage', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 6 });
      store.append(job.id, { type: 'retrying', stage: 'drafting', attempt: 2 });
      expect(job.week).toBeNull();

      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      expect(job.week).toBe(1);
    });

    it('clears the week once the job finishes', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 4 });
      store.complete(job.id, { weeks: [] });
      expect(job.week).toBeNull();
    });

    it('ignores append for an unknown job and for a finished job', () => {
      store.append('unknown-job', { type: 'validating', stage: 'drafting' });
      const job = store.create(OWNER);
      store.fail(job.id, 'internal');
      store.append(job.id, { type: 'validating', stage: 'drafting' });
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.setStage(job.id, 'reviewing');

      expect(job.events.map((event) => event.type)).toEqual(['failed']);
      expect(job.stage).toBeNull();
      expect(job.week).toBeNull();
    });

    it('appends a terminal event only once', () => {
      const job = store.create(OWNER);
      store.complete(job.id, { weeks: [] });
      store.fail(job.id, 'internal');
      store.complete(job.id, { weeks: [] });

      expect(job.events.map((event) => event.type)).toEqual(['completed']);
    });

    it('replays stored events then delivers live ones in order', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });

      const { received } = collect(job.id);
      expect(received.map((event) => event.id)).toEqual([1, 2]);

      store.append(job.id, { type: 'validating', stage: 'drafting' });
      store.complete(job.id, { weeks: [] });
      expect(received.map((event) => event.id)).toEqual([1, 2, 3, 4]);
      expect(received[3].type).toBe('completed');
    });

    it('replays only events after afterId', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.append(job.id, { type: 'week', stage: 'drafting', week: 2 });

      const { received } = collect(job.id, OWNER, 2);
      expect(received.map((event) => event.id)).toEqual([3]);

      store.append(job.id, { type: 'week', stage: 'drafting', week: 3 });
      expect(received.map((event) => event.id)).toEqual([3, 4]);
    });

    it('replays nothing and then follows live when afterId is past the end', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      const { received } = collect(job.id, OWNER, 99);
      expect(received).toEqual([]);

      store.append(job.id, { type: 'validating', stage: 'drafting' });
      expect(received.map((event) => event.id)).toEqual([2]);
    });

    it('delivers every event to each of several subscribers', () => {
      const job = store.create(OWNER);
      const first = collect(job.id);
      const second = collect(job.id);
      store.setStage(job.id, 'drafting');

      expect(first.received.map((event) => event.id)).toEqual([1]);
      expect(second.received.map((event) => event.id)).toEqual([1]);
    });

    it('replays through the terminal event for a finished job', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.fail(job.id, 'provider_unavailable');

      const { received, unsubscribe } = collect(job.id);

      expect(received.map((event) => event.type)).toEqual(['stage', 'failed']);
      expect(received[1]).toMatchObject({ code: 'provider_unavailable' });
      expect(unsubscribe).toBeTypeOf('function');
      expect(() => unsubscribe?.()).not.toThrow();
    });

    it('replays only the tail of a finished job after afterId', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.complete(job.id, { weeks: [] });

      const { received } = collect(job.id, OWNER, 1);
      expect(received.map((event) => event.type)).toEqual(['completed']);
    });

    it('stops delivering after unsubscribe', () => {
      const job = store.create(OWNER);
      const { received, unsubscribe } = collect(job.id);
      store.setStage(job.id, 'drafting');
      unsubscribe?.();
      store.append(job.id, { type: 'validating', stage: 'drafting' });
      store.complete(job.id, { weeks: [] });

      expect(received.map((event) => event.id)).toEqual([1]);
    });

    it('does not call a listener removed by an earlier listener in the same delivery', () => {
      const job = store.create(OWNER);
      const late = vi.fn();
      let unsubscribeLate: (() => void) | undefined;
      store.subscribe(job.id, OWNER, 0, () => unsubscribeLate?.());
      unsubscribeLate = store.subscribe(job.id, OWNER, 0, late);

      store.setStage(job.id, 'drafting');

      expect(late).not.toHaveBeenCalled();
    });

    it('returns undefined and delivers nothing for a foreign or unknown job', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      const listener = vi.fn();

      expect(store.subscribe(job.id, OTHER, 0, listener)).toBeUndefined();
      expect(
        store.subscribe('unknown-job', OWNER, 0, listener),
      ).toBeUndefined();
      store.append(job.id, { type: 'validating', stage: 'drafting' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('counts live subscribers for the owner only', () => {
      const job = store.create(OWNER);
      expect(store.subscriberCount(job.id, OWNER)).toBe(0);

      const stopFirst = store.subscribe(job.id, OWNER, 0, () => undefined);
      const stopSecond = store.subscribe(job.id, OWNER, 0, () => undefined);
      expect(store.subscriberCount(job.id, OWNER)).toBe(2);
      expect(store.subscriberCount(job.id, OTHER)).toBe(0);

      stopFirst?.();
      expect(store.subscriberCount(job.id, OWNER)).toBe(1);
      stopSecond?.();
      expect(store.subscriberCount(job.id, OWNER)).toBe(0);
    });

    it('counts no subscribers once the job finishes or is unknown', () => {
      const job = store.create(OWNER);
      store.subscribe(job.id, OWNER, 0, () => undefined);
      store.complete(job.id, { weeks: [] });

      expect(store.subscriberCount(job.id, OWNER)).toBe(0);
      expect(store.subscriberCount('missing', OWNER)).toBe(0);
    });

    it('survives a throwing listener and still serves the others', () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const job = store.create(OWNER);
      store.subscribe(job.id, OWNER, 0, () => {
        throw new Error('listener boom');
      });
      const healthy = collect(job.id);

      expect(() => store.setStage(job.id, 'drafting')).not.toThrow();
      expect(() => store.complete(job.id, { weeks: [] })).not.toThrow();

      expect(healthy.received.map((event) => event.type)).toEqual([
        'stage',
        'completed',
      ]);
      expect(job.status).toBe('completed');
      warn.mockRestore();
    });

    it('warns with the job id and error name when a listener throws, never with the payload', () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const job = store.create(OWNER);
      store.subscribe(job.id, OWNER, 0, () => {
        throw new TypeError('secret detail');
      });

      store.setStage(job.id, 'drafting');

      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toBe(
        `Job ${job.id} progress listener failed on event 1: TypeError`,
      );
      expect(message).not.toContain('secret detail');
      warn.mockRestore();
    });

    it('survives a throwing listener during replay', () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      const received: PlanProgressEvent[] = [];
      let calls = 0;

      store.subscribe(job.id, OWNER, 0, (event) => {
        calls += 1;
        received.push(event);
        throw new Error('replay boom');
      });
      store.append(job.id, { type: 'validating', stage: 'drafting' });

      expect(calls).toBe(2);
      expect(received.map((event) => event.id)).toEqual([1, 2]);
      warn.mockRestore();
    });

    it('lets the reaper fail a stale job and tell its subscribers', () => {
      const job = store.create(OWNER);
      const { received } = collect(job.id);
      vi.setSystemTime(Date.now() + STALE_RUNNING_JOB_MS);
      store.hasActive(OWNER);

      expect(received).toMatchObject([{ type: 'failed', code: 'internal' }]);
    });

    it('purges the event log together with its job', () => {
      const job = store.create(OWNER);
      store.setStage(job.id, 'drafting');
      store.complete(job.id, { weeks: [] });
      vi.setSystemTime(Date.now() + TERMINAL_JOB_RETENTION_MS);

      expect(store.get(job.id, OWNER)).toBeUndefined();
      expect(store.subscribe(job.id, OWNER, 0, vi.fn())).toBeUndefined();
    });
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
