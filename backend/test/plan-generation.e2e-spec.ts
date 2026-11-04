import { once } from 'node:events';
import http, { type IncomingMessage } from 'node:http';
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
import { PLAN_GENERATION_CONFIG } from '../src/plan-generation/plan-generation.config.js';
import { PlanGenerationController } from '../src/plan-generation/plan-generation.controller.js';
import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import { PlanJobStore } from '../src/plan-generation/plan-job.store.js';
import { PlanPipelineService } from '../src/plan-generation/plan-pipeline.service.js';
import { PlanLimiter } from '../src/plan-generation/plan.limiter.js';
import {
  PLAN_STREAM_CONFIG,
  type PlanStreamConfig,
} from '../src/plan-generation/plan-stream.config.js';

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

const validForm: PlanForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 4,
  heightCm: 180,
  weightKg: 80,
  goals: 'Build strength',
};

const UNKNOWN_JOB_ID = '00000000-0000-4000-8000-000000000000';

const EVENTS_PATH = (jobId: string): string =>
  `/plan-generations/${jobId}/events`;

const openRawStream = async (
  url: string,
  headers: Record<string, string>,
): Promise<IncomingMessage> =>
  new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, resolve);
    req.on('error', reject);
  });

describe('PlanGenerationController (http)', () => {
  let app: INestApplication;
  let pipelineRun: ReturnType<typeof vi.fn>;
  let streamConfig: PlanStreamConfig;
  let extraApps: INestApplication[];

  const createApp = async (): Promise<{
    app: INestApplication;
    pipelineRun: ReturnType<typeof vi.fn>;
    streamConfig: PlanStreamConfig;
  }> => {
    const createdStreamConfig: PlanStreamConfig = {
      heartbeatMs: 3_600_000,
      windowMs: 3_600_000,
      maxStreamsPerJob: 3,
    };
    const createdPipelineRun = vi.fn(() => new Promise<void>(() => undefined));
    const moduleRef = await Test.createTestingModule({
      controllers: [PlanGenerationController],
      providers: [
        PlanJobStore,
        PlanLimiter,
        {
          provide: PLAN_GENERATION_CONFIG,
          useValue: {
            openAiApiKey: 'sk-test',
            draftModel: 'draft',
            reviewModel: 'review',
            dailyLimit: 5,
          },
        },
        { provide: PLAN_STREAM_CONFIG, useValue: createdStreamConfig },
        { provide: PlanPipelineService, useValue: { run: createdPipelineRun } },
        { provide: APP_GUARD, useClass: HeaderUserGuard },
      ],
    }).compile();
    const createdApp = moduleRef.createNestApplication();
    await createdApp.init();
    return {
      app: createdApp,
      pipelineRun: createdPipelineRun,
      streamConfig: createdStreamConfig,
    };
  };

  beforeEach(async () => {
    extraApps = [];
    ({ app, pipelineRun, streamConfig } = await createApp());
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
    await Promise.all(extraApps.map(async (extra) => extra.close()));
  });

  const startAs = (target: INestApplication, userId: string): request.Test =>
    request(target.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, userId)
      .send(validForm);

  it('answers 202 with a job id and starts the pipeline', async () => {
    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    expect(response.body).toEqual({ jobId: expect.any(String) });
    expect(pipelineRun).toHaveBeenCalledTimes(1);
    expect(pipelineRun).toHaveBeenCalledWith(
      (response.body as { jobId: string }).jobId,
      validForm,
    );
  });

  it('answers 429 with the active_job code while a job is running', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(429);

    expect(response.body).toEqual({ code: 'active_job' });
    expect(pipelineRun).toHaveBeenCalledTimes(1);
  });

  it('does not let one user running job block another user', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-2')
      .send(validForm)
      .expect(202);
  });

  describe('abuse limits', () => {
    const FIVE_STARTS_PER_DAY = 5;
    const HOUR_MS = 60 * 60 * 1000;

    const startAndFinish = async (
      target: INestApplication,
      userId: string,
      outcome: 'complete' | 'fail',
    ): Promise<void> => {
      const started = await startAs(target, userId).expect(202);
      const { jobId } = started.body as { jobId: string };
      const store = target.get(PlanJobStore);
      if (outcome === 'complete') {
        store.complete(jobId, { weeks: [] });
      } else {
        store.fail(jobId, 'invalid_output');
      }
    };

    const exhaustDailyLimit = async (
      target: INestApplication,
      userId: string,
    ): Promise<void> => {
      for (let index = 0; index < FIVE_STARTS_PER_DAY; index += 1) {
        await startAndFinish(
          target,
          userId,
          index % 2 === 0 ? 'complete' : 'fail',
        );
      }
    };

    it('answers exactly one 202 and five active_job 429 to six simultaneous starts by one user, without touching another user', async () => {
      await app.listen(0, '127.0.0.1');
      const baseUrl = await app.getUrl();
      const startOverNetwork = (userId: string): request.Test =>
        request(baseUrl)
          .post('/plan-generations')
          .set(USER_HEADER, userId)
          .send(validForm);

      const burst = await Promise.all([
        ...Array.from({ length: 6 }, () => startOverNetwork('user-1')),
        startOverNetwork('user-2'),
      ]);

      const userOne = burst.slice(0, 6);
      expect(userOne.filter(({ status }) => status === 202)).toHaveLength(1);
      const refused = userOne.filter(({ status }) => status === 429);
      expect(refused).toHaveLength(5);
      for (const response of refused) {
        expect(response.body).toEqual({ code: 'active_job' });
      }
      expect(burst[6]!.status).toBe(202);
      expect(pipelineRun).toHaveBeenCalledTimes(2);
    });

    it('answers daily_limit to the sixth start in 24 hours, counting failed jobs, and leaves another user unaffected', async () => {
      await exhaustDailyLimit(app, 'user-1');

      const sixth = await startAs(app, 'user-1').expect(429);

      expect(sixth.body).toEqual({ code: 'daily_limit' });
      expect(pipelineRun).toHaveBeenCalledTimes(5);
      await startAs(app, 'user-2').expect(202);
    });

    it('slides the daily window so starts older than 24 hours stop counting', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const firstStart = new Date('2026-11-04T10:00:00Z').getTime();
      vi.setSystemTime(firstStart);
      await exhaustDailyLimit(app, 'user-1');

      vi.setSystemTime(firstStart + 24 * HOUR_MS - 60_000);
      const stillLimited = await startAs(app, 'user-1').expect(429);
      expect(stillLimited.body).toEqual({ code: 'daily_limit' });

      vi.setSystemTime(firstStart + 24 * HOUR_MS + 5_000);
      await startAs(app, 'user-1').expect(202);
      expect(pipelineRun).toHaveBeenCalledTimes(6);
    });

    it('resets the quota on restart because limiter state is in memory (accepted MVP behaviour)', async () => {
      await exhaustDailyLimit(app, 'user-1');
      const refused = await startAs(app, 'user-1').expect(429);
      expect(refused.body).toEqual({ code: 'daily_limit' });

      const restarted = await createApp();
      extraApps.push(restarted.app);

      await startAs(restarted.app, 'user-1').expect(202);
      expect(restarted.pipelineRun).toHaveBeenCalledTimes(1);
      const stale = await startAs(app, 'user-1').expect(429);
      expect(stale.body).toEqual({ code: 'daily_limit' });
    });
  });

  it('answers 400 without echoing the rejected value or starting a job', async () => {
    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send({ ...validForm, experience: 'SECRET-REJECTED-VALUE' })
      .expect(400);

    expect(JSON.stringify(response.body)).not.toContain(
      'SECRET-REJECTED-VALUE',
    );
    expect(response.body).toMatchObject({ message: 'Validation failed' });
    expect(pipelineRun).not.toHaveBeenCalled();
  });

  it('answers 401 without a user', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .send(validForm)
      .expect(401);
  });

  it('returns the running job view to its owner', async () => {
    const started = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);
    const { jobId } = started.body as { jobId: string };

    const response = await request(app.getHttpServer())
      .get(`/plan-generations/${jobId}`)
      .set(USER_HEADER, 'user-1')
      .expect(200);

    expect(response.body).toEqual({
      status: 'running',
      stage: null,
      week: null,
      plan: null,
      error: null,
    });
    expect(response.body).not.toHaveProperty('form');
  });

  it('answers 404 for an unknown job', async () => {
    await request(app.getHttpServer())
      .get('/plan-generations/00000000-0000-4000-8000-000000000000')
      .set(USER_HEADER, 'user-1')
      .expect(404);
  });

  it('answers 404 for a job owned by another user', async () => {
    const started = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);
    const { jobId } = started.body as { jobId: string };

    await request(app.getHttpServer())
      .get(`/plan-generations/${jobId}`)
      .set(USER_HEADER, 'user-2')
      .expect(404);
  });

  it('answers a job owned by another user exactly as an unknown job and leaves the job unchanged', async () => {
    const started = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);
    const { jobId } = started.body as { jobId: string };
    const getSnapshot = (userId: string, id: string) =>
      request(app.getHttpServer())
        .get(`/plan-generations/${id}`)
        .set(USER_HEADER, userId);
    const snapshotBefore = (await getSnapshot('user-1', jobId).expect(200))
      .body;

    const foreign = await getSnapshot('user-2', jobId);
    const unknown = await getSnapshot('user-2', UNKNOWN_JOB_ID);

    expect(unknown.status).toBe(404);
    expect(foreign.status).toBe(unknown.status);
    expect(foreign.body).toEqual(unknown.body);
    const snapshotAfter = await getSnapshot('user-1', jobId).expect(200);
    expect(snapshotAfter.body).toEqual(snapshotBefore);
  });

  describe('GET /plan-generations/:jobId/events', () => {
    const finishedJob = (ownerId: string): string => {
      const store = app.get(PlanJobStore);
      const job = store.create(ownerId, validForm);
      store.setStage(job.id, 'drafting');
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.complete(job.id, { weeks: [] });
      return job.id;
    };

    const frameIds = (body: string): number[] =>
      [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));

    it('streams the stored events as SSE frames and closes after the terminal event', async () => {
      const jobId = finishedJob('user-1');

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(jobId))
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['cache-control']).toContain('no-transform');
      expect(response.headers['x-accel-buffering']).toBe('no');
      expect(response.headers['content-encoding']).toBeUndefined();
      const frames = response.text.trim().split('\n\n');
      expect(frames).toHaveLength(3);
      expect(frames[0]).toMatch(/^id: 1\nevent: stage\ndata: \{.*\}$/);
      expect(frames[1]).toMatch(/^id: 2\nevent: week\ndata: \{.*\}$/);
      expect(frames[2]).toMatch(/^id: 3\nevent: completed\ndata: \{.*\}$/);
      const data = JSON.parse(frames[1]!.split('\ndata: ')[1]!) as unknown;
      expect(data).toEqual({
        type: 'week',
        stage: 'drafting',
        week: 1,
        id: 2,
        at: expect.any(String),
      });
    });

    it('replays only events after Last-Event-ID without duplicates', async () => {
      const jobId = finishedJob('user-1');

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(jobId))
        .set(USER_HEADER, 'user-1')
        .set('Last-Event-ID', '2')
        .expect(200);

      expect(frameIds(response.text)).toEqual([3]);
    });

    it('replays every event when Last-Event-ID is not an integer', async () => {
      const jobId = finishedJob('user-1');

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(jobId))
        .set(USER_HEADER, 'user-1')
        .set('Last-Event-ID', 'garbage')
        .expect(200);

      expect(frameIds(response.text)).toEqual([1, 2, 3]);
    });

    it('follows live events after the replay without duplicates and closes on the terminal event', async () => {
      const store = app.get(PlanJobStore);
      const job = store.create('user-1', validForm);
      store.setStage(job.id, 'drafting');
      const subscribe = vi.spyOn(store, 'subscribe');

      const pending = request(app.getHttpServer())
        .get(EVENTS_PATH(job.id))
        .set(USER_HEADER, 'user-1')
        .set('Last-Event-ID', '1')
        .then((response) => response);
      await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
      store.append(job.id, { type: 'week', stage: 'drafting', week: 1 });
      store.complete(job.id, { weeks: [] });
      const response = await pending;

      expect(frameIds(response.text)).toEqual([2, 3]);
      expect(response.text).toContain('event: completed');
    });

    it('sends heartbeat comments and a reconnect event when the window elapses', async () => {
      streamConfig.heartbeatMs = 15;
      streamConfig.windowMs = 200;
      const store = app.get(PlanJobStore);
      const job = store.create('user-1', validForm);

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(job.id))
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect(response.text.startsWith(': connected\n\n')).toBe(true);
      expect(
        response.text.match(/^: heartbeat$/gm)?.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
      expect(response.text.endsWith('event: reconnect\ndata: {}\n\n')).toBe(
        true,
      );
      expect(response.text).not.toContain('id:');
      expect(store.get(job.id, 'user-1')?.status).toBe('running');
    });

    it('keeps the replayed event ids intact around heartbeats and reconnect', async () => {
      streamConfig.heartbeatMs = 15;
      streamConfig.windowMs = 120;
      const store = app.get(PlanJobStore);
      const job = store.create('user-1', validForm);
      store.setStage(job.id, 'drafting');

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(job.id))
        .set(USER_HEADER, 'user-1')
        .expect(200);

      expect(frameIds(response.text)).toEqual([1]);
      expect(response.text).toContain('event: reconnect');
    });

    it('flushes headers at once, and unsubscribes when the client disconnects', async () => {
      const store = app.get(PlanJobStore);
      const job = store.create('user-1', validForm);
      const original = store.subscribe.bind(store);
      const unsubscribed = vi.fn();
      vi.spyOn(store, 'subscribe').mockImplementation((...args) => {
        const unsubscribe = original(...args);
        return (
          unsubscribe &&
          (() => {
            unsubscribed();
            unsubscribe();
          })
        );
      });
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}${EVENTS_PATH(job.id)}`;

      const response = await openRawStream(url, { [USER_HEADER]: 'user-1' });
      const [firstChunk] = (await once(response, 'data')) as [Buffer];

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(firstChunk.toString()).toBe(': connected\n\n');
      expect(unsubscribed).not.toHaveBeenCalled();

      response.destroy();

      await vi.waitFor(() => expect(unsubscribed).toHaveBeenCalledTimes(1));
      expect(store.get(job.id, 'user-1')?.status).toBe('running');
    });

    it('answers a normal 404 JSON response for a job owned by another user', async () => {
      const jobId = finishedJob('user-1');

      const response = await request(app.getHttpServer())
        .get(EVENTS_PATH(jobId))
        .set(USER_HEADER, 'user-2')
        .expect(404);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.text).not.toContain('event:');
    });

    it.each([
      { name: 'without Last-Event-ID', headers: {} },
      { name: 'with Last-Event-ID 0', headers: { 'Last-Event-ID': '0' } },
    ])(
      'answers another users finished job exactly as an unknown job $name and leaves the job unchanged',
      async ({ headers }) => {
        const jobId = finishedJob('user-1');
        const streamAs = (userId: string, id: string) =>
          request(app.getHttpServer())
            .get(EVENTS_PATH(id))
            .set(USER_HEADER, userId)
            .set(headers);
        const getSnapshot = () =>
          request(app.getHttpServer())
            .get(`/plan-generations/${jobId}`)
            .set(USER_HEADER, 'user-1');
        const snapshotBefore = (await getSnapshot().expect(200)).body;

        const foreign = await streamAs('user-2', jobId);
        const unknown = await streamAs('user-2', UNKNOWN_JOB_ID);

        expect(unknown.status).toBe(404);
        expect(foreign.status).toBe(unknown.status);
        expect(foreign.headers['content-type']).toBe(
          unknown.headers['content-type'],
        );
        expect(foreign.body).toEqual(unknown.body);
        expect(foreign.text).toBe(unknown.text);
        expect(foreign.text).not.toContain('event:');
        const snapshotAfter = await getSnapshot().expect(200);
        expect(snapshotAfter.body).toEqual(snapshotBefore);
      },
    );

    it('answers 404 for an unknown job', async () => {
      await request(app.getHttpServer())
        .get(EVENTS_PATH('00000000-0000-4000-8000-000000000000'))
        .set(USER_HEADER, 'user-1')
        .expect(404);
    });

    it('answers 401 without a user', async () => {
      const jobId = finishedJob('user-1');

      await request(app.getHttpServer()).get(EVENTS_PATH(jobId)).expect(401);
    });
  });
});
