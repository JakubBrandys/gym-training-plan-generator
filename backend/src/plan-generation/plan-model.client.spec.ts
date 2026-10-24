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
  return {
    generateText: vi.fn(),
    objectOutput: vi.fn((options: unknown) => ({ kind: 'object', options })),
    createOpenAI: vi.fn(),
    modelFactory: vi.fn((modelId: string) => ({ modelId })),
    FakeNoObjectGeneratedError,
  };
});

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.objectOutput },
  NoObjectGeneratedError: mocks.FakeNoObjectGeneratedError,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mocks.createOpenAI.mockImplementation(() => mocks.modelFactory),
}));

const { PlanModelClient, PlanModelError } =
  await import('./plan-model.client.js');

const schema = z.object({ answer: z.string() });
const signal = new AbortController().signal;

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
    mocks.generateText.mockReset();
    mocks.modelFactory.mockClear();
    mocks.createOpenAI.mockClear();
  });

  it('creates the provider with the configured api key', () => {
    buildClient();
    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test' });
  });

  it('returns output, usage and finishReason on success', async () => {
    mocks.generateText.mockResolvedValue({
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
    mocks.generateText.mockResolvedValue({
      output: { answer: 'ok' },
      usage: {},
      finishReason: 'stop',
    });

    await buildClient().generate(request);

    expect(mocks.modelFactory).toHaveBeenCalledWith('some-model');
    expect(mocks.objectOutput).toHaveBeenCalledWith({ schema });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'some-model' },
        system: 'system text',
        prompt: 'prompt text',
        providerOptions: { openai: { reasoningEffort: 'low' } },
        maxOutputTokens: 32000,
        timeout: 180000,
        maxRetries: 1,
        abortSignal: signal,
      }),
    );
  });

  it('maps NoObjectGeneratedError to invalid_output with the finish reason', async () => {
    mocks.generateText.mockRejectedValue(
      new mocks.FakeNoObjectGeneratedError('length'),
    );

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
    mocks.generateText.mockRejectedValue(thrown);

    const error = await buildClient()
      .generate(request)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanModelError);
    expect(error).toMatchObject({ code: 'unavailable' });
  });
});
