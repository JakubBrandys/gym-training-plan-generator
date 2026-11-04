import { Logger } from '@nestjs/common';
import type { PlanGenerationConfig } from '../src/plan-generation/plan-generation.config.js';
import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import {
  PlanModelError,
  type PlanModelClient,
} from '../src/plan-generation/plan-model.client.js';
import type { GeneratedPlan } from '../src/plan-generation/plan.schema.js';
import type { EvalCatalogExercise } from './eval-catalog.js';
import { createRecordingClient } from './eval-record.js';
import { mapPool, runEvalJob, runEvalJobs } from './eval-runner.js';

const SLUGS = ['squat', 'bench-press', 'deadlift', 'row', 'press', 'pull-up'];

const catalog: EvalCatalogExercise[] = SLUGS.map((slug) => ({
  slug,
  name: `Name of ${slug}`,
  primaryMuscles: ['chest'],
  equipment: 'barbell',
  level: 'BEGINNER',
  category: 'strength',
  imageKey: `exercises/${slug}.jpg`,
}));

const config: PlanGenerationConfig = {
  openAiApiKey: 'sk-test',
  draftModel: 'draft-model',
  reviewModel: 'review-model',
  dailyLimit: 5,
};

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 2,
  heightCm: 170,
  weightKg: 70,
  goals: 'get fit',
};

const validPlan = (): GeneratedPlan => ({
  weeks: Array.from({ length: 8 }, (_unused, index) => ({
    week: index + 1,
    goal: 'goal',
    sessions: Array.from({ length: 2 }, (_session, sessionIndex) => ({
      title: `Session ${sessionIndex + 1}`,
      exercises: SLUGS.slice(0, 3).map((slug) => ({
        slug,
        sets: 3,
        reps: '8-10',
        restSeconds: 90,
        note: null,
      })),
    })),
  })),
});

const sevenWeekPlan = (): GeneratedPlan => ({
  weeks: validPlan().weeks.slice(0, 7),
});

type Reply = GeneratedPlan | Error;

const scriptedClient = (replies: Reply[]) => {
  const requests: string[] = [];
  const client = {
    generate: (request: { prompt: string }) => {
      requests.push(request.prompt);
      const reply = replies.shift();
      if (reply === undefined) {
        return Promise.reject(new Error('no reply queued'));
      }
      if (reply instanceof Error) {
        return Promise.reject(reply);
      }
      return Promise.resolve({
        output: reply,
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        finishReason: 'stop',
      });
    },
  } as unknown as PlanModelClient;
  return { client, requests };
};

const spec = { inputId: 'a', repeat: 1, form };

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runEvalJob', () => {
  it('records a retried draft as attempt 1 failed and attempt 2 passed, then the review', async () => {
    const { client } = scriptedClient([
      sevenWeekPlan(),
      validPlan(),
      validPlan(),
    ]);

    const job = await runEvalJob(spec, { client, catalog, config });

    expect(job.status).toBe('completed');
    expect(job.plan).not.toBeNull();
    expect(
      job.calls.map((call) => [call.stage, call.attempt, call.ok]),
    ).toEqual([
      ['drafting', 1, false],
      ['drafting', 2, true],
      ['reviewing', 1, true],
    ]);
    expect(job.calls[0].issueCount).toBeGreaterThan(0);
    expect(job.calls[0].output).toEqual(sevenWeekPlan());
  });

  it('keeps the draft output apart from the final plan', async () => {
    const draft = validPlan();
    draft.weeks[0].goal = 'draft goal';
    const reviewed = validPlan();
    reviewed.weeks[0].goal = 'reviewed goal';
    const { client } = scriptedClient([draft, reviewed]);

    const job = await runEvalJob(spec, { client, catalog, config });

    expect((job.calls[0].output as GeneratedPlan).weeks[0].goal).toBe(
      'draft goal',
    );
    expect(job.plan?.weeks[0].goal).toBe('reviewed goal');
  });

  it('fails with invalid_output and makes no review call when the draft is invalid twice', async () => {
    const { client } = scriptedClient([sevenWeekPlan(), sevenWeekPlan()]);

    const job = await runEvalJob(spec, { client, catalog, config });

    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('invalid_output');
    expect(job.plan).toBeNull();
    expect(job.calls.map((call) => call.stage)).toEqual([
      'drafting',
      'drafting',
    ]);
  });

  it('records an unparseable answer as a failed call with its error code', async () => {
    const unparseable = new PlanModelError('invalid_output', 'length');
    const { client } = scriptedClient([unparseable, unparseable]);

    const job = await runEvalJob(spec, { client, catalog, config });

    expect(job.errorCode).toBe('invalid_output');
    expect(job.calls).toEqual([
      expect.objectContaining({
        ok: false,
        errorCode: 'invalid_output',
        finishReason: 'length',
        output: null,
      }),
      expect.objectContaining({ attempt: 2, errorCode: 'invalid_output' }),
    ]);
  });

  it('records a provider error and ends the job with provider_unavailable', async () => {
    const { client } = scriptedClient([new PlanModelError('unavailable')]);

    const job = await runEvalJob(spec, { client, catalog, config });

    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('provider_unavailable');
    expect(job.calls).toHaveLength(1);
    expect(job.calls[0].errorCode).toBe('unavailable');
  });
});

describe('createRecordingClient', () => {
  it('rethrows the same error the inner client threw', async () => {
    const failure = new PlanModelError('unavailable');
    const { client: inner } = scriptedClient([failure]);
    const recording = createRecordingClient(inner, {
      stageOf: () => 'drafting',
      form,
      slugs: SLUGS,
    });

    await expect(
      recording.client.generate({
        model: 'm',
        system: 's',
        prompt: 'p',
        schema: undefined as never,
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);
    expect(recording.calls).toHaveLength(1);
  });

  it('returns the inner result unchanged', async () => {
    const plan = validPlan();
    const { client: inner } = scriptedClient([plan]);
    const recording = createRecordingClient(inner, {
      stageOf: () => 'reviewing',
      form,
      slugs: SLUGS,
    });

    const result = await recording.client.generate({
      model: 'm',
      system: 's',
      prompt: 'p',
      schema: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.output).toBe(plan);
    expect(recording.calls[0]).toEqual(
      expect.objectContaining({
        stage: 'reviewing',
        attempt: 1,
        ok: true,
        inputTokens: 100,
        outputTokens: 200,
      }),
    );
  });
});

describe('runEvalJobs', () => {
  it('keeps the order of the specs and survives a failing job', async () => {
    const specs = ['a', 'b', 'c'].map((inputId) => ({
      inputId,
      repeat: 1,
      form,
    }));
    const failing = new PlanModelError('unavailable');
    const queue: Reply[] = [validPlan(), validPlan()];
    const client = {
      generate: (request: { prompt: string }) => {
        const goesToB = request.prompt.includes('MARK-B');
        if (goesToB) {
          return Promise.reject(failing);
        }
        return Promise.resolve({
          output: queue[0],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          finishReason: 'stop',
        });
      },
    } as unknown as PlanModelClient;
    const forms = [
      { ...form, goals: 'goal A' },
      { ...form, goals: 'MARK-B' },
      { ...form, goals: 'goal C' },
    ];

    const jobs = await runEvalJobs(
      specs.map((entry, index) => ({ ...entry, form: forms[index] })),
      { client, catalog, config },
      2,
    );

    expect(jobs.map((job) => job.inputId)).toEqual(['a', 'b', 'c']);
    expect(jobs.map((job) => job.status)).toEqual([
      'completed',
      'failed',
      'completed',
    ]);
  });
});

describe('mapPool', () => {
  it('never runs more workers at once than the concurrency', async () => {
    let inFlight = 0;
    let highest = 0;
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      highest = Math.max(highest, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });

    expect(highest).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('handles an empty list', async () => {
    expect(await mapPool([], 4, () => Promise.resolve(1))).toEqual([]);
  });
});
