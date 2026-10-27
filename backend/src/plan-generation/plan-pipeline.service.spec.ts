import { Logger } from '@nestjs/common';
import type { Exercise } from '../generated/prisma/client.js';
import type { ExercisesService } from '../exercises/exercises.service.js';
import type { PlanGenerationConfig } from './plan-generation.config.js';
import type { PlanForm } from './plan-form.schema.js';
import {
  PLAN_JOB_TIMEOUT_MS,
  PlanJobStore,
  type PlanJob,
} from './plan-job.store.js';
import {
  PlanModelError,
  type PlanModelClient,
  type PlanModelRequest,
} from './plan-model.client.js';
import { PlanPipelineService } from './plan-pipeline.service.js';
import type { GeneratedPlan } from './plan.schema.js';

const OWNER = 'owner-1';
const GOALS_TEXT = 'my-very-secret-goals-text-xyz';

const CATALOG: Exercise[] = [
  'squat',
  'bench-press',
  'deadlift',
  'overhead-press',
  'barbell-row',
  'pull-up',
].map((slug) => ({
  slug,
  name: `Name of ${slug}`,
  primaryMuscles: ['chest'],
  equipment: 'barbell',
  level: 'BEGINNER',
  category: 'strength',
  imageKey: `${slug}.png`,
}));

const config: PlanGenerationConfig = {
  openAiApiKey: 'sk-test',
  draftModel: 'draft-model',
  reviewModel: 'review-model',
  dailyLimit: 5,
};

const form: PlanForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 3,
  heightCm: 180,
  weightKg: 80,
  goals: GOALS_TEXT,
};

const buildPlan = (counts = [3, 3, 3, 3, 3, 3, 3, 3]): GeneratedPlan => ({
  weeks: counts.map((count, index) => ({
    week: index + 1,
    goal: `Week ${index + 1}`,
    sessions: Array.from({ length: count }, () => ({
      title: 'Full body',
      exercises: ['squat', 'bench-press', 'barbell-row'].map((slug) => ({
        slug,
        sets: 3,
        reps: '8-10',
        restSeconds: 90,
        note: null,
      })),
    })),
  })),
});

const WEEKS_STREAMED_PER_PLAN = 8;

const rampViolation = (): GeneratedPlan => buildPlan([3, 3, 3, 3, 3, 3, 3, 4]);

interface FailingReply {
  error: Error;
  weeksBeforeError: number;
}

type Reply = GeneratedPlan | Error | FailingReply | 'hang';

const isFailingReply = (reply: Reply): reply is FailingReply =>
  typeof reply === 'object' && 'weeksBeforeError' in reply;

interface RecordedCall extends PlanModelRequest<never> {
  stageAtCall: PlanJob['stage'] | undefined;
}

class FakePlanModelClient {
  readonly calls: RecordedCall[] = [];
  jobId = '';

  constructor(
    private readonly store: PlanJobStore,
    private readonly replies: Reply[],
  ) {}

  generate(request: PlanModelRequest<never>) {
    this.calls.push({
      ...request,
      stageAtCall: this.store.get(this.jobId, OWNER)?.stage,
    });
    const reply = this.replies.shift();
    if (reply !== undefined && reply !== 'hang') {
      const weeks = isFailingReply(reply)
        ? reply.weeksBeforeError
        : reply instanceof Error
          ? 0
          : WEEKS_STREAMED_PER_PLAN;
      for (let week = 1; week <= weeks; week += 1) {
        request.onPartial?.(week);
      }
    }
    if (reply === 'hang') {
      return new Promise<never>((_resolve, reject) => {
        request.signal.addEventListener(
          'abort',
          () => {
            reject(new PlanModelError('unavailable'));
          },
          { once: true },
        );
      });
    }
    if (reply !== undefined && isFailingReply(reply)) {
      return Promise.reject(reply.error);
    }
    if (reply === undefined || reply instanceof Error) {
      return Promise.reject(reply ?? new Error('no reply queued'));
    }
    return Promise.resolve({
      output: reply,
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      finishReason: 'stop',
    });
  }
}

const setup = (
  replies: Reply[],
  catalog: Exercise[] | Error | 'hang' = CATALOG,
  frequencyForm: PlanForm = form,
) => {
  const store = new PlanJobStore();
  const client = new FakePlanModelClient(store, replies);
  const findAll = vi.fn((): Promise<Exercise[]> => {
    if (catalog === 'hang') {
      return new Promise<Exercise[]>(() => undefined);
    }
    return catalog instanceof Error
      ? Promise.reject(catalog)
      : Promise.resolve(catalog);
  });
  const pipeline = new PlanPipelineService(
    { findAll } as unknown as ExercisesService,
    client as unknown as PlanModelClient,
    store,
    config,
  );
  const job = store.create(OWNER, frequencyForm);
  client.jobId = job.id;
  const run = () => pipeline.run(job.id, frequencyForm);
  return { store, client, job, run, findAll };
};

describe('PlanPipelineService', () => {
  const loggerOutput: unknown[][] = [];

  beforeEach(() => {
    loggerOutput.length = 0;
    for (const method of [
      'log',
      'warn',
      'error',
      'debug',
      'verbose',
    ] as const) {
      vi.spyOn(Logger.prototype, method).mockImplementation(
        (...args: unknown[]) => {
          loggerOutput.push(args);
        },
      );
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const useFakeJobTimeout = () => {
    vi.useFakeTimers();
    return vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort(
          new DOMException('The operation timed out', 'TimeoutError'),
        );
      }, ms);
      return controller.signal;
    });
  };

  describe('happy path', () => {
    it('resolves each exercise to its own catalog imageKey', async () => {
      const { job, run } = setup([buildPlan(), buildPlan()]);

      await run();

      const exercises = job.plan?.weeks[0].sessions[0].exercises ?? [];
      expect(exercises.map(({ slug, imageKey }) => [slug, imageKey])).toEqual([
        ['squat', 'squat.png'],
        ['bench-press', 'bench-press.png'],
        ['barbell-row', 'barbell-row.png'],
      ]);
    });

    it('makes exactly two calls, draft then review, and completes with names joined', async () => {
      const draft = buildPlan();
      const reviewed = buildPlan();
      reviewed.weeks[0].goal = 'Reviewed week 1';
      const { client, job, run } = setup([draft, reviewed]);

      await run();

      expect(client.calls).toHaveLength(2);
      expect(client.calls[0].model).toBe('draft-model');
      expect(client.calls[1].model).toBe('review-model');
      expect(client.calls[1].prompt).toContain(JSON.stringify(draft));
      expect(job.status).toBe('completed');
      expect(job.error).toBeNull();
      expect(job.plan?.weeks).toHaveLength(8);
      expect(job.plan?.weeks[0].goal).toBe('Reviewed week 1');
      expect(job.plan?.weeks[0].sessions[0].exercises[0]).toEqual({
        slug: 'squat',
        name: 'Name of squat',
        imageKey: 'squat.png',
        sets: 3,
        reps: '8-10',
        restSeconds: 90,
        note: null,
      });
    });

    it('records the stage as drafting then reviewing and clears it at the end', async () => {
      const { client, store, job, run } = setup([buildPlan(), buildPlan()]);
      const setStage = vi.spyOn(store, 'setStage');

      await run();

      expect(setStage.mock.calls.map(([, stage]) => stage)).toEqual([
        'drafting',
        'reviewing',
      ]);
      expect(client.calls.map((call) => call.stageAtCall)).toEqual([
        'drafting',
        'reviewing',
      ]);
      expect(job.stage).toBeNull();
    });

    it('passes one live abort signal to every call', async () => {
      const { client, run } = setup([buildPlan(), buildPlan()]);

      await run();

      expect(client.calls[0].signal).toBeInstanceOf(AbortSignal);
      expect(client.calls[0].signal.aborted).toBe(false);
      expect(client.calls[1].signal).toBe(client.calls[0].signal);
    });

    it('sends the catalog and the goals block in the draft prompt', async () => {
      const { client, run } = setup([buildPlan(), buildPlan()]);

      await run();

      expect(client.calls[0].prompt).toContain(
        'squat|Name of squat|chest|barbell|BEGINNER|strength',
      );
      expect(client.calls[0].prompt).toContain(
        `<goals>\n${GOALS_TEXT}\n</goals>`,
      );
    });
  });

  describe('progress events', () => {
    const weekEvents = (stage: string, from: number, to: number) =>
      Array.from(
        { length: to - from + 1 },
        (_unused, index) => `week:${stage}:${from + index}`,
      );

    const summarize = (job: PlanJob) =>
      job.events.map((event) => {
        switch (event.type) {
          case 'stage':
            return `stage:${event.stage}`;
          case 'week':
            return `week:${event.stage}:${event.week}`;
          case 'validating':
            return `validating:${event.stage}`;
          case 'retrying':
            return `retrying:${event.stage}:${event.attempt}`;
          case 'completed':
            return 'completed';
          case 'failed':
            return `failed:${event.code}`;
        }
      });

    it('emits stage, weeks and validating per pass, then completed, for a clean run', async () => {
      const { job, run } = setup([buildPlan(), buildPlan()]);

      await run();

      expect(summarize(job)).toEqual([
        'stage:drafting',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'stage:reviewing',
        ...weekEvents('reviewing', 1, 8),
        'validating:reviewing',
        'completed',
      ]);
    });

    it('assigns consecutive ids to the events in order', async () => {
      const { job, run } = setup([buildPlan(), buildPlan()]);

      await run();

      expect(job.events.map((event) => event.id)).toEqual(
        job.events.map((_event, index) => index + 1),
      );
    });

    it('appends validating only after the model call has returned and before the verdict', async () => {
      const { job, client, run } = setup([buildPlan(), buildPlan()]);
      const typesAtCall: string[][] = [];
      const generate = client.generate.bind(client);
      client.generate = (request) => {
        typesAtCall.push(job.events.map((event) => event.type));
        return generate(request);
      };

      await run();

      expect(typesAtCall[0]).toEqual(['stage']);
      expect(typesAtCall[1]).toEqual([
        'stage',
        ...Array.from({ length: 8 }, () => 'week'),
        'validating',
        'stage',
      ]);
    });

    it('appends a retrying event with the attempt number before a validation retry', async () => {
      const { job, run } = setup([rampViolation(), buildPlan(), buildPlan()]);

      await run();

      expect(summarize(job)).toEqual([
        'stage:drafting',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'retrying:drafting:2',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'stage:reviewing',
        ...weekEvents('reviewing', 1, 8),
        'validating:reviewing',
        'completed',
      ]);
    });

    it('appends retrying without validating after an unparseable attempt that streamed some weeks', async () => {
      const { job, run } = setup([
        {
          error: new PlanModelError('invalid_output', 'length'),
          weeksBeforeError: 3,
        },
        buildPlan(),
        buildPlan(),
      ]);

      await run();

      expect(summarize(job)).toEqual([
        'stage:drafting',
        ...weekEvents('drafting', 1, 3),
        'retrying:drafting:2',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'stage:reviewing',
        ...weekEvents('reviewing', 1, 8),
        'validating:reviewing',
        'completed',
      ]);
    });

    it('retries the review pass with its own stage on its events', async () => {
      const { job, run } = setup([buildPlan(), rampViolation(), buildPlan()]);

      await run();

      expect(summarize(job).slice(10)).toEqual([
        'stage:reviewing',
        ...weekEvents('reviewing', 1, 8),
        'validating:reviewing',
        'retrying:reviewing:2',
        ...weekEvents('reviewing', 1, 8),
        'validating:reviewing',
        'completed',
      ]);
    });

    it('ends with failed invalid_output after two rejected attempts', async () => {
      const { job, run } = setup([rampViolation(), rampViolation()]);

      await run();

      expect(summarize(job)).toEqual([
        'stage:drafting',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'retrying:drafting:2',
        ...weekEvents('drafting', 1, 8),
        'validating:drafting',
        'failed:invalid_output',
      ]);
    });

    it('ends with failed provider_unavailable and no retry after a hard model failure', async () => {
      const { job, run } = setup([
        {
          error: new PlanModelError('unavailable'),
          weeksBeforeError: 2,
        },
      ]);

      await run();

      expect(summarize(job)).toEqual([
        'stage:drafting',
        'week:drafting:1',
        'week:drafting:2',
        'failed:provider_unavailable',
      ]);
    });

    it('records no week events for a model failure before anything streamed', async () => {
      const { job, run } = setup([
        buildPlan(),
        new PlanModelError('unavailable'),
      ]);

      await run();

      expect(summarize(job).slice(10)).toEqual([
        'stage:reviewing',
        'failed:provider_unavailable',
      ]);
    });

    it('ends with failed internal for an unexpected throw', async () => {
      const { job, run } = setup([new TypeError('kaboom')]);

      await run();

      expect(summarize(job)).toEqual(['stage:drafting', 'failed:internal']);
    });

    it('records no events when the catalog is empty beyond the terminal failure', async () => {
      const { job, run } = setup([], []);

      await run();

      expect(summarize(job)).toEqual(['failed:internal']);
    });

    it('does not duplicate a week event when the client reports the same count twice', async () => {
      const { job, client, run } = setup([buildPlan(), buildPlan()]);
      const generate = client.generate.bind(client);
      client.generate = (request) => {
        request.onPartial?.(1);
        request.onPartial?.(1);
        return generate(request);
      };

      await run();

      const drafting = summarize(job).filter((entry) =>
        entry.startsWith('week:drafting:'),
      );
      expect(drafting).toEqual(weekEvents('drafting', 1, 8));
    });

    it('never puts the goals text into an event', async () => {
      const { job, run } = setup([rampViolation(), buildPlan(), buildPlan()]);

      await run();

      expect(JSON.stringify(job.events)).not.toContain(GOALS_TEXT);
    });
  });

  describe('validation retries', () => {
    it('retries an invalid draft once with the issues fed back, then reviews', async () => {
      const { client, job, run } = setup([
        rampViolation(),
        buildPlan(),
        buildPlan(),
      ]);

      await run();

      expect(client.calls).toHaveLength(3);
      expect(client.calls.map((call) => call.model)).toEqual([
        'draft-model',
        'draft-model',
        'review-model',
      ]);
      expect(client.calls[1].prompt).toContain(client.calls[0].prompt);
      expect(client.calls[1].prompt).toContain(
        'Week 8 must have exactly 3 sessions',
      );
      expect(job.status).toBe('completed');
    });

    it('treats a schema-level invalid_output as an invalid attempt eligible for the retry', async () => {
      const { client, job, run } = setup([
        new PlanModelError('invalid_output', 'length'),
        buildPlan(),
        buildPlan(),
      ]);

      await run();

      expect(client.calls).toHaveLength(3);
      expect(client.calls[1].prompt).toContain('could not be parsed');
      expect(job.status).toBe('completed');
    });

    it('fails with invalid_output and no plan when the draft is invalid twice', async () => {
      const { client, job, run } = setup([rampViolation(), rampViolation()]);

      await run();

      expect(client.calls).toHaveLength(2);
      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'invalid_output' });
      expect(job.plan).toBeNull();
    });

    it('retries an invalid review once and uses the corrected review', async () => {
      const { client, job, run } = setup([
        buildPlan(),
        rampViolation(),
        buildPlan(),
      ]);

      await run();

      expect(client.calls).toHaveLength(3);
      expect(client.calls[2].model).toBe('review-model');
      expect(client.calls[2].prompt).toContain(client.calls[1].prompt);
      expect(job.status).toBe('completed');
    });

    it('fails the job without returning the draft when the review is invalid twice', async () => {
      const { client, job, run } = setup([
        buildPlan(),
        rampViolation(),
        rampViolation(),
      ]);

      await run();

      expect(client.calls).toHaveLength(3);
      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'invalid_output' });
      expect(job.plan).toBeNull();
    });

    it('fails the job without returning the draft when the review output is unparseable twice', async () => {
      const { job, run } = setup([
        buildPlan(),
        new PlanModelError('invalid_output'),
        new PlanModelError('invalid_output'),
      ]);

      await run();

      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'invalid_output' });
      expect(job.plan).toBeNull();
    });
  });

  describe('provider failures', () => {
    it('fails with provider_unavailable on the draft without a validation retry', async () => {
      const { client, job, run } = setup([new PlanModelError('unavailable')]);

      await run();

      expect(client.calls).toHaveLength(1);
      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'provider_unavailable' });
      expect(job.plan).toBeNull();
    });

    it('fails with provider_unavailable on the review without a validation retry or draft fallback', async () => {
      const { client, job, run } = setup([
        buildPlan(),
        new PlanModelError('unavailable'),
      ]);

      await run();

      expect(client.calls).toHaveLength(2);
      expect(job.error).toEqual({ code: 'provider_unavailable' });
      expect(job.plan).toBeNull();
    });

    it('does not retry after an unavailable error that follows an invalid attempt', async () => {
      const { client, job, run } = setup([
        rampViolation(),
        new PlanModelError('unavailable'),
      ]);

      await run();

      expect(client.calls).toHaveLength(2);
      expect(job.error).toEqual({ code: 'provider_unavailable' });
    });
  });

  describe('job timeout', () => {
    it('creates the job-wide signal with the shared job timeout', async () => {
      const timeout = useFakeJobTimeout();
      const { run } = setup([buildPlan(), buildPlan()]);

      await run();

      expect(timeout).toHaveBeenCalledWith(PLAN_JOB_TIMEOUT_MS);
    });

    it('fails with provider_unavailable when the signal aborts a hanging model call', async () => {
      useFakeJobTimeout();
      const { client, job, run } = setup(['hang']);

      const finished = run();
      await vi.advanceTimersByTimeAsync(0);
      expect(job.status).toBe('running');
      expect(client.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(PLAN_JOB_TIMEOUT_MS);
      await finished;

      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'provider_unavailable' });
      expect(job.plan).toBeNull();
      expect(client.calls[0].signal.aborted).toBe(true);
    });

    it('fails with provider_unavailable when the signal aborts during the review pass', async () => {
      useFakeJobTimeout();
      const { client, job, run } = setup([buildPlan(), 'hang']);

      const finished = run();
      await vi.advanceTimersByTimeAsync(PLAN_JOB_TIMEOUT_MS);
      await finished;

      expect(client.calls).toHaveLength(2);
      expect(job.error).toEqual({ code: 'provider_unavailable' });
      expect(job.plan).toBeNull();
    });

    it('fails with internal when the catalog load hangs past the job timeout', async () => {
      useFakeJobTimeout();
      const { client, job, run } = setup([], 'hang');

      const finished = run();
      await vi.advanceTimersByTimeAsync(PLAN_JOB_TIMEOUT_MS - 1);
      expect(job.status).toBe('running');
      await vi.advanceTimersByTimeAsync(1);
      await finished;

      expect(client.calls).toHaveLength(0);
      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'internal' });
      expect(job.plan).toBeNull();
    });

    it('does not log the goals when the catalog load times out', async () => {
      useFakeJobTimeout();
      const { run } = setup([], 'hang');

      const finished = run();
      await vi.advanceTimersByTimeAsync(PLAN_JOB_TIMEOUT_MS);
      await finished;

      expect(loggerOutput.length).toBeGreaterThan(0);
      expect(JSON.stringify(loggerOutput)).not.toContain(GOALS_TEXT);
    });

    it('removes its abort listener once the catalog has loaded', async () => {
      const addListener = vi.spyOn(AbortSignal.prototype, 'addEventListener');
      const removeListener = vi.spyOn(
        AbortSignal.prototype,
        'removeEventListener',
      );
      const { run } = setup([buildPlan(), buildPlan()]);

      await run();

      const abortAdds = addListener.mock.calls.filter(
        ([type]) => type === 'abort',
      );
      const abortRemoves = removeListener.mock.calls.filter(
        ([type]) => type === 'abort',
      );
      expect(abortAdds).toHaveLength(1);
      expect(abortRemoves).toHaveLength(1);
      expect(abortRemoves[0][1]).toBe(abortAdds[0][1]);
    });
  });

  describe('internal failures', () => {
    it('maps an unexpected throw to internal', async () => {
      const { job, run } = setup([new TypeError('kaboom')]);

      await run();

      expect(job.status).toBe('failed');
      expect(job.error).toEqual({ code: 'internal' });
      expect(job.plan).toBeNull();
    });

    it('maps an empty catalog to internal without calling the model', async () => {
      const { client, job, run } = setup([], []);

      await run();

      expect(client.calls).toHaveLength(0);
      expect(job.error).toEqual({ code: 'internal' });
    });

    it('maps a catalog load failure to internal', async () => {
      const { job, run } = setup([], new Error('db down'));

      await run();

      expect(job.error).toEqual({ code: 'internal' });
    });

    it('logs unexpected errors', async () => {
      const { run } = setup([new TypeError('kaboom')]);

      await run();

      expect(loggerOutput.map((args) => String(args[0]))).toContainEqual(
        expect.stringContaining('kaboom'),
      );
    });
  });

  describe('never rejecting', () => {
    it.each([
      ['unexpected throw', () => setup([new Error('x')])],
      ['empty catalog', () => setup([], [])],
      ['catalog failure', () => setup([], new Error('db'))],
      ['provider failure', () => setup([new PlanModelError('unavailable')])],
      ['invalid twice', () => setup([rampViolation(), rampViolation()])],
      ['success', () => setup([buildPlan(), buildPlan()])],
    ])('resolves on %s', async (_label, build) => {
      await expect(build().run()).resolves.toBeUndefined();
    });
  });

  describe('logging', () => {
    it('logs job id, stage, duration, token usage and finish reason per pass', async () => {
      const { job, run } = setup([buildPlan(), buildPlan()]);

      await run();

      const lines = loggerOutput.map((args) => String(args[0]));
      for (const stage of ['drafting', 'reviewing']) {
        expect(lines).toContainEqual(
          expect.stringMatching(
            new RegExp(
              `${job.id} stage=${stage} attempt=1 durationMs=\\d+ inputTokens=100 outputTokens=200 finishReason=stop`,
            ),
          ),
        );
      }
    });

    it.each([
      [
        'an API error with a status code',
        new PlanModelError('unavailable', undefined, 'AI_APICallError', 429),
        'causeName=AI_APICallError statusCode=429',
      ],
      [
        'an error without a status code',
        new PlanModelError('unavailable', undefined, 'TimeoutError'),
        'causeName=TimeoutError statusCode=none',
      ],
      [
        'an unparseable output',
        new PlanModelError(
          'invalid_output',
          'length',
          'AI_NoObjectGeneratedError',
        ),
        'finishReason=length causeName=AI_NoObjectGeneratedError statusCode=none',
      ],
    ])(
      'logs the cause diagnostics of %s without the goals',
      async (_label, modelError, expectedFragment) => {
        const { run } = setup([modelError, modelError]);

        await run();

        const lines = loggerOutput.map((args) => String(args[0]));
        expect(lines).toContainEqual(expect.stringContaining(expectedFragment));
        expect(JSON.stringify(loggerOutput)).not.toContain(GOALS_TEXT);
      },
    );

    it.each([
      ['success', () => setup([buildPlan(), buildPlan()])],
      ['invalid twice', () => setup([rampViolation(), rampViolation()])],
      ['provider failure', () => setup([new PlanModelError('unavailable')])],
      ['unexpected throw', () => setup([new Error('boom')])],
    ])('never logs the goals text on %s', async (_label, build) => {
      await build().run();

      expect(JSON.stringify(loggerOutput)).not.toContain(GOALS_TEXT);
    });
  });
});
