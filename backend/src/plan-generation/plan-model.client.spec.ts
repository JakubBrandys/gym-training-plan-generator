import { z } from 'zod';

const mocks = vi.hoisted(() => {
  class FakeNoObjectGeneratedError extends Error {
    constructor(readonly finishReason?: string) {
      super('no object');
    }
    static isInstance(error: unknown): error is FakeNoObjectGeneratedError {
      return error instanceof FakeNoObjectGeneratedError;
    }
  }
  class FakeAPICallError extends Error {
    constructor(
      message: string,
      readonly statusCode?: number,
      readonly requestBodyValues?: unknown,
      readonly responseBody?: string,
    ) {
      super(message);
      this.name = 'AI_APICallError';
    }
    static isInstance(error: unknown): error is FakeAPICallError {
      return error instanceof FakeAPICallError;
    }
  }
  return {
    FakeAPICallError,
    streamText: vi.fn(),
    objectOutput: vi.fn((options: unknown) => ({ kind: 'object', options })),
    createOpenAI: vi.fn(),
    modelFactory: vi.fn((modelId: string) => ({ modelId })),
    FakeNoObjectGeneratedError,
  };
});

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  Output: { object: mocks.objectOutput },
  NoObjectGeneratedError: mocks.FakeNoObjectGeneratedError,
  APICallError: mocks.FakeAPICallError,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mocks.createOpenAI.mockImplementation(() => mocks.modelFactory),
}));

const { PlanModelClient, PlanModelError } =
  await import('./plan-model.client.js');

const schema = z.object({ answer: z.string() });
const signal = new AbortController().signal;

interface StreamScript {
  partials?: unknown[];
  output?: unknown;
  outputError?: unknown;
  iterationError?: unknown;
  streamError?: unknown;
  usage?: unknown;
  finishReason?: string;
}

const scriptStream = (script: StreamScript = {}) =>
  mocks.streamText.mockImplementation(
    (options: {
      onError: (event: { error: unknown }) => void;
      abortSignal: AbortSignal;
    }) => ({
      partialOutputStream: (async function* () {
        for (const partial of script.partials ?? []) {
          yield partial;
        }
        if (script.streamError !== undefined) {
          options.onError({ error: script.streamError });
        }
        if (script.iterationError !== undefined) {
          throw script.iterationError;
        }
      })(),
      get output() {
        return script.outputError === undefined
          ? Promise.resolve(script.output ?? { answer: 'ok' })
          : Promise.reject(script.outputError);
      },
      get usage() {
        return Promise.resolve(script.usage ?? {});
      },
      get finishReason() {
        return Promise.resolve(script.finishReason ?? 'stop');
      },
    }),
  );

const buildClient = () =>
  new PlanModelClient({
    openAiApiKey: 'sk-test',
    draftModel: 'draft',
    reviewModel: 'review',
    dailyLimit: 5,
  });

const request = {
  model: 'some-model',
  system: 'system text',
  prompt: 'prompt text',
  schema,
  signal,
};

describe('PlanModelClient', () => {
  beforeEach(() => {
    mocks.streamText.mockReset();
    mocks.modelFactory.mockClear();
    mocks.createOpenAI.mockClear();
  });

  it('creates the provider with the configured api key', () => {
    buildClient();
    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test' });
  });

  it('returns output, usage and finishReason on success', async () => {
    scriptStream({
      output: { answer: 'ok' },
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        reasoningTokens: 5,
      },
      finishReason: 'stop',
    });

    await expect(buildClient().generate(request)).resolves.toEqual({
      output: { answer: 'ok' },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
    });
  });

  it('calls the SDK with the planned settings', async () => {
    scriptStream();

    await buildClient().generate(request);

    expect(mocks.modelFactory).toHaveBeenCalledWith('some-model');
    expect(mocks.objectOutput).toHaveBeenCalledWith({ schema });
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'some-model' },
        system: 'system text',
        prompt: 'prompt text',
        providerOptions: { openai: { reasoningEffort: 'low' } },
        maxOutputTokens: 32000,
        timeout: { totalMs: 180000, firstChunkMs: 120000, chunkMs: 45000 },
        maxRetries: 1,
        abortSignal: signal,
      }),
    );
  });

  it('does not enable stream retries', async () => {
    scriptStream();

    await buildClient().generate(request);

    expect(mocks.streamText.mock.calls[0][0]).not.toHaveProperty(
      'streamRetries',
    );
  });

  describe('partial progress', () => {
    const collectWeeks = async (partials: unknown[]) => {
      scriptStream({ partials });
      const onPartial = vi.fn();
      await buildClient().generate({ ...request, onPartial });
      return onPartial.mock.calls.map(([weeks]) => weeks as number);
    };

    it('reports the started-week count each time it grows', async () => {
      await expect(
        collectWeeks([
          {},
          { weeks: [] },
          { weeks: [{ week: 1 }] },
          { weeks: [{ week: 1, goal: 'Build' }] },
          { weeks: [{ week: 1 }, {}] },
          { weeks: [{ week: 1 }, { week: 2 }, {}] },
        ]),
      ).resolves.toEqual([1, 2, 3]);
    });

    it('never reports a decrease or a repeat', async () => {
      await expect(
        collectWeeks([
          { weeks: [{}, {}] },
          { weeks: [{}] },
          { weeks: [{}, {}] },
        ]),
      ).resolves.toEqual([2]);
    });

    it('clamps the count to the number of weeks in a plan', async () => {
      await expect(
        collectWeeks([{ weeks: Array.from({ length: 11 }, () => ({})) }]),
      ).resolves.toEqual([8]);
    });

    it('ignores partials that carry no weeks array', async () => {
      await expect(
        collectWeeks([undefined, null, {}, { weeks: 'x' }]),
      ).resolves.toEqual([]);
    });

    it('works without an onPartial callback', async () => {
      scriptStream({ partials: [{ weeks: [{}] }] });

      await expect(buildClient().generate(request)).resolves.toMatchObject({
        output: { answer: 'ok' },
      });
    });

    it('reports partials before resolving and keeps the final output', async () => {
      scriptStream({
        partials: [{ weeks: [{}] }, { weeks: [{}, {}] }],
        output: { answer: 'final' },
      });
      const onPartial = vi.fn();

      const result = await buildClient().generate({ ...request, onPartial });

      expect(onPartial).toHaveBeenCalledTimes(2);
      expect(result.output).toEqual({ answer: 'final' });
    });

    it('keeps the reported partials when the final output fails to parse', async () => {
      scriptStream({
        partials: [{ weeks: [{}] }],
        outputError: new mocks.FakeNoObjectGeneratedError('stop'),
      });
      const onPartial = vi.fn();

      const error = await buildClient()
        .generate({ ...request, onPartial })
        .catch((caught: unknown) => caught);

      expect(onPartial).toHaveBeenCalledWith(1);
      expect(error).toMatchObject({
        code: 'invalid_output',
        finishReason: 'stop',
      });
    });
  });

  describe('stream failures', () => {
    it('maps an error part to unavailable with the stream error diagnostics', async () => {
      scriptStream({
        partials: [{ weeks: [{}] }],
        streamError: new mocks.FakeAPICallError('overloaded', 503),
        outputError: Object.assign(new Error('No output generated'), {
          name: 'AI_NoOutputGeneratedError',
        }),
      });

      const error = await buildClient()
        .generate(request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PlanModelError);
      expect(error).toMatchObject({
        code: 'unavailable',
        causeName: 'AI_APICallError',
        statusCode: 503,
      });
    });

    it('maps an error part to unavailable even when the final output resolves', async () => {
      scriptStream({ streamError: new Error('mid-stream') });

      const error = await buildClient()
        .generate(request)
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'unavailable' });
    });

    it('prefers the error part over the truncated-output parse failure it causes', async () => {
      scriptStream({
        partials: [{ weeks: [{}] }],
        streamError: new mocks.FakeAPICallError('connection reset', 502),
        outputError: new mocks.FakeNoObjectGeneratedError('error'),
      });

      const error = await buildClient()
        .generate(request)
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        code: 'unavailable',
        causeName: 'AI_APICallError',
        statusCode: 502,
      });
    });

    it('maps an error thrown while iterating the partial stream to unavailable', async () => {
      scriptStream({ iterationError: new Error('socket closed') });

      const error = await buildClient()
        .generate(request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PlanModelError);
      expect(error).toMatchObject({
        code: 'unavailable',
        causeName: 'Error',
      });
    });

    it('maps an abort to unavailable with the abort reason as the cause', async () => {
      const controller = new AbortController();
      mocks.streamText.mockImplementation(
        (options: { abortSignal: AbortSignal }) => ({
          partialOutputStream: (async function* () {
            await new Promise<void>((resolve) => {
              options.abortSignal.addEventListener('abort', () => {
                resolve();
              });
            });
            yield* [];
          })(),
          get output() {
            return Promise.reject(options.abortSignal.reason);
          },
          get usage() {
            return Promise.reject(options.abortSignal.reason);
          },
          get finishReason() {
            return Promise.reject(options.abortSignal.reason);
          },
        }),
      );

      const pending = buildClient()
        .generate({ ...request, signal: controller.signal })
        .catch((caught: unknown) => caught);
      controller.abort(new DOMException('aborted', 'AbortError'));
      const error = await pending;

      expect(error).toBeInstanceOf(PlanModelError);
      expect(error).toMatchObject({
        code: 'unavailable',
        causeName: 'AbortError',
      });
    });
  });

  it('maps NoObjectGeneratedError to invalid_output with the finish reason', async () => {
    scriptStream({
      outputError: new mocks.FakeNoObjectGeneratedError('length'),
    });

    const error = await buildClient()
      .generate(request)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanModelError);
    expect(error).toMatchObject({
      code: 'invalid_output',
      finishReason: 'length',
    });
  });

  it.each([
    ['a provider error', new Error('boom')],
    ['an abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    [
      'a timeout',
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    ],
    ['a non-error value', 'weird'],
  ])('maps %s to unavailable', async (_label, thrown) => {
    scriptStream({ outputError: thrown });

    const error = await buildClient()
      .generate(request)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanModelError);
    expect(error).toMatchObject({ code: 'unavailable' });
  });

  describe('diagnostics without leaking the prompt', () => {
    const catchError = async () =>
      (await buildClient()
        .generate(request)
        .catch((caught: unknown) => caught)) as InstanceType<
        typeof PlanModelError
      >;

    it('carries the cause name and status code of an API call error', async () => {
      scriptStream({
        outputError: new mocks.FakeAPICallError('quota exceeded', 429),
      });

      const error = await catchError();

      expect(error).toMatchObject({
        code: 'unavailable',
        causeName: 'AI_APICallError',
        statusCode: 429,
      });
    });

    it('leaves the status code absent for errors that are not API call errors', async () => {
      scriptStream({
        outputError: Object.assign(new Error('boom'), { statusCode: 500 }),
      });

      const error = await catchError();

      expect(error.causeName).toBe('Error');
      expect(error.statusCode).toBeUndefined();
    });

    it('leaves both absent for a non-error value', async () => {
      scriptStream({ outputError: 'weird' });

      const error = await catchError();

      expect(error.causeName).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
    });

    it('carries the cause name on invalid_output', async () => {
      scriptStream({
        outputError: new mocks.FakeNoObjectGeneratedError('length'),
      });

      const error = await catchError();

      expect(error).toMatchObject({
        code: 'invalid_output',
        finishReason: 'length',
        causeName: 'Error',
      });
    });

    it('never copies the message, request body or response body', async () => {
      const secret = 'secret-goals-text-in-body';
      scriptStream({
        outputError: new mocks.FakeAPICallError(
          `request failed for ${secret}`,
          400,
          { prompt: secret },
          `echo ${secret}`,
        ),
      });

      const error = await catchError();

      expect(error.message).toBe('Plan model call failed: unavailable');
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(Object.keys(error).sort()).toEqual(
        ['causeName', 'code', 'finishReason', 'name', 'statusCode'].sort(),
      );
    });
  });
});
