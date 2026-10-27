import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import { PlanGenerationController } from './plan-generation.controller.js';
import { planFormSchema, type PlanForm } from './plan-form.schema.js';
import type { PlanGenerationConfig } from './plan-generation.config.js';
import { PlanJobStore } from './plan-job.store.js';
import { PlanLimiter } from './plan.limiter.js';
import type { PlanStreamConfig } from './plan-stream.config.js';
import type { PlanPipelineService } from './plan-pipeline.service.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const user: RequestUser = {
  id: 'profile-1',
  email: 'one@example.com',
  role: 'MEMBER',
};
const otherUser: RequestUser = {
  id: 'profile-2',
  email: 'two@example.com',
  role: 'MEMBER',
};

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 4,
  heightCm: 170,
  weightKg: 65,
  goals: 'Get stronger',
};

const config: PlanGenerationConfig = {
  openAiApiKey: 'sk-test',
  draftModel: 'draft',
  reviewModel: 'review',
  dailyLimit: 2,
};

const streamConfig: PlanStreamConfig = {
  heartbeatMs: 1_000,
  windowMs: 10_000,
  maxStreamsPerJob: 2,
};

const setup = () => {
  const store = new PlanJobStore();
  const limiter = new PlanLimiter(store, config);
  const run = vi.fn(() => Promise.resolve());
  const controller = new PlanGenerationController(
    store,
    limiter,
    { run } as unknown as PlanPipelineService,
    streamConfig,
  );
  return { store, limiter, run, controller };
};

class FakeResponse extends EventEmitter {
  writableEnded = false;
  head: { status: number; headers: Record<string, string> } | undefined;
  chunks: string[] = [];
  writeHead = vi.fn((status: number, headers: Record<string, string>) => {
    this.head = { status, headers };
  });
  flushHeaders = vi.fn();
  write = vi.fn((chunk: string) => {
    this.chunks.push(chunk);
    return true;
  });
  end = vi.fn(() => {
    this.writableEnded = true;
  });

  get body(): string {
    return this.chunks.join('');
  }
}

const openStream = (
  controller: PlanGenerationController,
  asUser: RequestUser,
  jobId: string,
  lastEventId?: string,
) => {
  const response = new FakeResponse();
  controller.streamEvents(
    asUser,
    jobId,
    lastEventId,
    response as unknown as Response,
  );
  return response;
};

const rejectionOf = (action: () => unknown): unknown => {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('PlanGenerationController', () => {
  describe('start', () => {
    it('returns the job id and starts the pipeline with the job id and form', () => {
      const { controller, run, store } = setup();

      const response = controller.start(user, form);

      expect(response).toEqual({ jobId: expect.any(String) });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(response.jobId, form);
      expect(store.get(response.jobId, user.id)).toMatchObject({
        status: 'running',
      });
    });

    it('keeps the validated form on the job', () => {
      const { controller, store } = setup();

      const { jobId } = controller.start(user, form);

      expect(store.get(jobId, user.id)?.form).toEqual(form);
    });

    it('creates the job for user.id rather than the email', () => {
      const { controller, store } = setup();

      const { jobId } = controller.start(user, form);

      expect(store.get(jobId, user.id)?.ownerId).toBe('profile-1');
      expect(store.get(jobId, user.email)).toBeUndefined();
    });

    it('denies a second start with 429 active_job while the first job runs', () => {
      const { controller, run } = setup();
      controller.start(user, form);

      const error = rejectionOf(() => controller.start(user, form));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toEqual({
        code: 'active_job',
      });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('denies with 429 daily_limit after the limit of finished jobs', () => {
      const { controller, store, run } = setup();
      const first = controller.start(user, form);
      store.fail(first.jobId, 'internal');
      const second = controller.start(user, form);
      store.complete(second.jobId, { weeks: [] });

      const error = rejectionOf(() => controller.start(user, form));

      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toEqual({
        code: 'daily_limit',
      });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('does not let another user run into the first user limits', () => {
      const { controller } = setup();
      controller.start(user, form);

      expect(controller.start(otherUser, form)).toEqual({
        jobId: expect.any(String),
      });
    });
  });

  describe('body validation', () => {
    const pipe = new ZodValidationPipe(planFormSchema);

    it('rejects a bad body with 400 before the controller runs', () => {
      expect(() => pipe.transform({ ...form, currentFrequency: 9 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getJob', () => {
    it('returns the status, stage, plan and error of the callers own job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'reviewing');

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'running',
        stage: 'reviewing',
        week: null,
        plan: null,
        error: null,
      });
    });

    it('does not expose the form', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      expect(controller.getJob(user, jobId)).not.toHaveProperty('form');
    });

    it('returns the latest started week while the job runs', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.append(jobId, { type: 'week', stage: 'drafting', week: 3 });

      expect(controller.getJob(user, jobId)).toMatchObject({
        stage: 'drafting',
        week: 3,
      });
    });

    it('resets the week when the next stage starts', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.append(jobId, { type: 'week', stage: 'drafting', week: 8 });
      store.setStage(jobId, 'reviewing');

      expect(controller.getJob(user, jobId)).toMatchObject({
        stage: 'reviewing',
        week: null,
      });
    });

    it('returns the plan for a completed job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      const plan = { weeks: [] };
      store.complete(jobId, plan);

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'completed',
        stage: null,
        week: null,
        plan,
        error: null,
      });
    });

    it('returns the error code and no plan for a failed job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.fail(jobId, 'provider_unavailable');

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'failed',
        stage: null,
        week: null,
        plan: null,
        error: { code: 'provider_unavailable' },
      });
    });

    it('throws NotFoundException for another owners job', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      expect(() => controller.getJob(otherUser, jobId)).toThrow(
        NotFoundException,
      );
    });

    it('throws the same NotFoundException for an unknown job', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      const foreign = rejectionOf(() => controller.getJob(otherUser, jobId));
      const unknown = rejectionOf(() => controller.getJob(user, 'no-such-job'));

      expect(unknown).toBeInstanceOf(NotFoundException);
      expect((foreign as NotFoundException).getResponse()).toEqual(
        (unknown as NotFoundException).getResponse(),
      );
    });

    it('keys ownership on user.id, not the email', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const sameEmailOtherId: RequestUser = { ...user, id: 'profile-3' };

      expect(() => controller.getJob(sameEmailOtherId, jobId)).toThrow(
        NotFoundException,
      );
    });
  });

  describe('streamEvents', () => {
    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('writes event frames with id, event name and JSON data', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');

      const response = openStream(controller, user, jobId);

      expect(response.head?.status).toBe(200);
      expect(response.head?.headers['Content-Type']).toContain(
        'text/event-stream',
      );
      expect(response.flushHeaders).toHaveBeenCalledTimes(1);
      const [event] = store.get(jobId, user.id)?.events ?? [];
      expect(response.body).toBe(
        `id: 1\nevent: stage\ndata: ${JSON.stringify(event)}\n\n`,
      );
      response.emit('close');
    });

    it('flushes headers with a connected comment when there is nothing to replay', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      const response = openStream(controller, user, jobId);

      expect(response.flushHeaders).toHaveBeenCalledTimes(1);
      expect(response.body).toBe(': connected\n\n');
      response.emit('close');
    });

    it('replays only events after Last-Event-ID', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.append(jobId, { type: 'week', stage: 'drafting', week: 1 });
      store.append(jobId, { type: 'week', stage: 'drafting', week: 2 });

      const response = openStream(controller, user, jobId, '2');

      expect(response.body).toContain('id: 3\n');
      expect(response.body).not.toContain('id: 1\n');
      expect(response.body).not.toContain('id: 2\n');
      response.emit('close');
    });

    it.each([undefined, '', 'abc', '-3', '1.5', '2x'])(
      'treats Last-Event-ID %j as zero',
      (raw) => {
        const { controller, store } = setup();
        const { jobId } = controller.start(user, form);
        store.setStage(jobId, 'drafting');

        const response = openStream(controller, user, jobId, raw);

        expect(response.body).toContain('id: 1\n');
        response.emit('close');
      },
    );

    it('follows live events and closes after the terminal event', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      const response = openStream(controller, user, jobId);

      store.setStage(jobId, 'drafting');
      expect(response.body).toContain('event: stage\n');
      expect(response.end).not.toHaveBeenCalled();

      store.complete(jobId, { weeks: [] });

      expect(response.body).toContain('id: 2\nevent: completed\n');
      expect(response.end).toHaveBeenCalledTimes(1);
    });

    it('replays a finished job including the terminal event and closes', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.fail(jobId, 'provider_unavailable');

      const response = openStream(controller, user, jobId);

      expect(response.body).toContain('id: 2\nevent: failed\n');
      expect(response.body).not.toContain(': connected');
      expect(response.end).toHaveBeenCalledTimes(1);
    });

    it('replays nothing but still closes for a finished job when Last-Event-ID is past the end', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.complete(jobId, { weeks: [] });

      const response = openStream(controller, user, jobId, '1');

      expect(response.body).toBe(': connected\n\n');
      expect(response.end).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException before writing anything for an unknown job', () => {
      const { controller } = setup();
      const response = new FakeResponse();

      expect(() =>
        controller.streamEvents(
          user,
          'no-such-job',
          undefined,
          response as unknown as Response,
        ),
      ).toThrow(NotFoundException);
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.write).not.toHaveBeenCalled();
      expect(response.listenerCount('close')).toBe(0);
    });

    it('throws NotFoundException for another owners job', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const response = new FakeResponse();

      expect(() =>
        controller.streamEvents(
          otherUser,
          jobId,
          undefined,
          response as unknown as Response,
        ),
      ).toThrow(NotFoundException);
      expect(response.writeHead).not.toHaveBeenCalled();
    });

    it('sends id-less heartbeat comments on the configured interval', () => {
      vi.useFakeTimers();
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const response = openStream(controller, user, jobId);

      vi.advanceTimersByTime(streamConfig.heartbeatMs * 2);

      expect(response.body).toBe(
        ': connected\n\n: heartbeat\n\n: heartbeat\n\n',
      );
      response.emit('close');
    });

    it('sends a reconnect event without an id and closes when the window elapses', () => {
      vi.useFakeTimers();
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      const response = openStream(controller, user, jobId);

      vi.advanceTimersByTime(streamConfig.windowMs);

      expect(response.body.endsWith('event: reconnect\ndata: {}\n\n')).toBe(
        true,
      );
      expect(response.body).not.toContain('id:');
      expect(response.end).toHaveBeenCalledTimes(1);
      expect(store.get(jobId, user.id)?.status).toBe('running');
    });

    it('denies a stream over the per-job cap with 429 before writing anything', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const first = openStream(controller, user, jobId);
      const second = openStream(controller, user, jobId);

      const response = new FakeResponse();
      const error = rejectionOf(() =>
        controller.streamEvents(
          user,
          jobId,
          undefined,
          response as unknown as Response,
        ),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toEqual({
        code: 'too_many_streams',
      });
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.chunks).toHaveLength(0);
      first.emit('close');
      second.emit('close');
    });

    it('frees a slot when a stream disconnects', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const first = openStream(controller, user, jobId);
      const second = openStream(controller, user, jobId);
      first.emit('close');

      const third = openStream(controller, user, jobId);

      expect(third.head?.status).toBe(200);
      second.emit('close');
      third.emit('close');
    });

    it('does not count another owners streams toward the cap', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const first = openStream(controller, user, jobId);
      const second = openStream(controller, user, jobId);

      const error = rejectionOf(() => openStream(controller, otherUser, jobId));

      expect(error).toBeInstanceOf(NotFoundException);
      first.emit('close');
      second.emit('close');
    });

    describe('logging', () => {
      const loggedLines = (spy: { mock: { calls: unknown[][] } }): string[] =>
        spy.mock.calls.map(([message]) => String(message));

      it('logs the open with the job id and the numeric Last-Event-ID', () => {
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller } = setup();
        const { jobId } = controller.start(user, form);

        const response = openStream(controller, user, jobId, '7');

        expect(loggedLines(log)).toContain(
          `Job ${jobId} stream opened lastEventId=7`,
        );
        response.emit('close');
      });

      it('logs the raw header value never, only the parsed id', () => {
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller } = setup();
        const { jobId } = controller.start(user, form);

        const response = openStream(
          controller,
          user,
          jobId,
          'abc\nforged line',
        );

        const lines = loggedLines(log);
        expect(lines).toContain(`Job ${jobId} stream opened lastEventId=0`);
        expect(lines.join('\n')).not.toContain('forged');
        response.emit('close');
      });

      it('logs the close reason when the client disconnects', () => {
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller } = setup();
        const { jobId } = controller.start(user, form);
        const response = openStream(controller, user, jobId);

        response.emit('close');

        expect(
          loggedLines(log).some((line) =>
            line.startsWith(
              `Job ${jobId} stream closed reason=client-disconnect durationMs=`,
            ),
          ),
        ).toBe(true);
      });

      it('logs the close reason after a terminal event', () => {
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller, store } = setup();
        const { jobId } = controller.start(user, form);
        openStream(controller, user, jobId);

        store.complete(jobId, { weeks: [] });

        expect(
          loggedLines(log).some((line) =>
            line.includes(`Job ${jobId} stream closed reason=terminal`),
          ),
        ).toBe(true);
      });

      it('logs the close reason when the window elapses', () => {
        vi.useFakeTimers();
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller } = setup();
        const { jobId } = controller.start(user, form);
        openStream(controller, user, jobId);

        vi.advanceTimersByTime(streamConfig.windowMs);

        expect(
          loggedLines(log).some((line) =>
            line.includes(`Job ${jobId} stream closed reason=window`),
          ),
        ).toBe(true);
      });

      it('logs a finished job that had nothing left to replay', () => {
        const log = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const { controller, store } = setup();
        const { jobId } = controller.start(user, form);
        store.complete(jobId, { weeks: [] });
        const lastId = store.get(jobId, user.id)?.events.length ?? 0;

        openStream(controller, user, jobId, String(lastId));

        expect(
          loggedLines(log).some((line) =>
            line.includes(`Job ${jobId} stream closed reason=job-finished`),
          ),
        ).toBe(true);
      });

      it('warns without echoing the job id when the job is unknown', () => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const { controller } = setup();

        rejectionOf(() => openStream(controller, user, 'x\nforged'));

        expect(loggedLines(warn)).toEqual(['Stream rejected reason=not-found']);
      });

      it('warns when a stream is refused over the cap', () => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const { controller } = setup();
        const { jobId } = controller.start(user, form);
        const first = openStream(controller, user, jobId);
        const second = openStream(controller, user, jobId);

        rejectionOf(() => openStream(controller, user, jobId));

        expect(loggedLines(warn)).toEqual([
          `Job ${jobId} stream rejected reason=too-many-streams`,
        ]);
        first.emit('close');
        second.emit('close');
      });
    });

    it('stops timers and listening once the client disconnects', () => {
      vi.useFakeTimers();
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      const response = openStream(controller, user, jobId);
      response.emit('close');
      const written = response.chunks.length;

      vi.advanceTimersByTime(streamConfig.windowMs * 2);
      store.setStage(jobId, 'drafting');

      expect(response.chunks).toHaveLength(written);
      expect(vi.getTimerCount()).toBe(0);
      expect(store.get(jobId, user.id)?.status).toBe('running');
    });
  });
});
