import { Logger } from '@nestjs/common';
import type { ExercisesService } from '../exercises/exercises.service.js';
import type { PlanGenerationConfig } from './plan-generation.config.js';
import type { PlanForm } from './plan-form.schema.js';
import { PlanJobStore, type PlanJob } from './plan-job.store.js';
import {
  PlanModelError,
  type PlanModelClient,
  type PlanModelRequest,
} from './plan-model.client.js';
import { PlanPipelineService } from './plan-pipeline.service.js';
import type { GeneratedPlan } from './plan.schema.js';

const OWNER = 'owner-1';
const GOALS_TEXT = 'my-very-secret-goals-text-xyz';

const CATALOG = [
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
  level: 'beginner' as const,
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

const rampViolation = (): GeneratedPlan => buildPlan([3, 3, 3, 3, 3, 3, 3, 4]);

type Reply = GeneratedPlan | Error;

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
  catalog: unknown[] | Error = CATALOG,
  frequencyForm: PlanForm = form,
) => {
  const store = new PlanJobStore();
  const client = new FakePlanModelClient(store, replies);
  const findAll = vi.fn(() =>
    catalog instanceof Error
      ? Promise.reject(catalog)
      : Promise.resolve(catalog),
  );
  const pipeline = new PlanPipelineService(
    { findAll } as unknown as ExercisesService,
    client as unknown as PlanModelClient,
    store,
    config,
  );
  const job = store.create(OWNER);
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
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
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
        'squat|Name of squat|chest|barbell|beginner|strength',
      );
      expect(client.calls[0].prompt).toContain(
        `<goals>\n${GOALS_TEXT}\n</goals>`,
      );
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
