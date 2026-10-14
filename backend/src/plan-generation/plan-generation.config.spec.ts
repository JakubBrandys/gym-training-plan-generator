import {
  planGenerationConfigProvider,
  PLAN_GENERATION_CONFIG,
  readPlanGenerationConfig,
} from './plan-generation.config.js';

const validEnv = {
  OPENAI_API_KEY: 'sk-test',
  PLAN_DRAFT_MODEL: 'draft-model',
  PLAN_REVIEW_MODEL: 'review-model',
};

describe('readPlanGenerationConfig', () => {
  it('returns the trimmed settings and defaults the daily limit to 5', () => {
    expect(
      readPlanGenerationConfig({ ...validEnv, OPENAI_API_KEY: '  sk-test  ' }),
    ).toEqual({
      openAiApiKey: 'sk-test',
      draftModel: 'draft-model',
      reviewModel: 'review-model',
      dailyLimit: 5,
    });
  });

  it('uses PLAN_DAILY_LIMIT when it is a positive integer', () => {
    expect(
      readPlanGenerationConfig({ ...validEnv, PLAN_DAILY_LIMIT: '12' })
        .dailyLimit,
    ).toBe(12);
  });

  it('falls back to the default when PLAN_DAILY_LIMIT is blank', () => {
    expect(
      readPlanGenerationConfig({ ...validEnv, PLAN_DAILY_LIMIT: '  ' })
        .dailyLimit,
    ).toBe(5);
  });

  it.each(['OPENAI_API_KEY', 'PLAN_DRAFT_MODEL', 'PLAN_REVIEW_MODEL'])(
    'throws naming %s when it is missing',
    (name) => {
      const env: Record<string, string | undefined> = { ...validEnv };
      delete env[name];
      expect(() => readPlanGenerationConfig(env)).toThrow(
        new RegExp(`${name} is not set.*backend/\\.env`),
      );
    },
  );

  it.each(['OPENAI_API_KEY', 'PLAN_DRAFT_MODEL', 'PLAN_REVIEW_MODEL'])(
    'throws naming %s when it is blank',
    (name) => {
      expect(() =>
        readPlanGenerationConfig({ ...validEnv, [name]: '   ' }),
      ).toThrow(new RegExp(`${name} is not set`));
    },
  );

  it.each(['0', '-3', '2.5', 'abc', '5 days', '1e2'])(
    'throws naming PLAN_DAILY_LIMIT for %s',
    (value) => {
      expect(() =>
        readPlanGenerationConfig({ ...validEnv, PLAN_DAILY_LIMIT: value }),
      ).toThrow(/PLAN_DAILY_LIMIT must be a positive whole number/);
    },
  );
});

describe('planGenerationConfigProvider', () => {
  it('is registered under the config token', () => {
    expect(planGenerationConfigProvider).toMatchObject({
      provide: PLAN_GENERATION_CONFIG,
    });
  });

  it('fails the factory with a message naming OPENAI_API_KEY when it is unset', () => {
    const original = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    try {
      const { useFactory } = planGenerationConfigProvider as {
        useFactory: () => unknown;
      };
      expect(() => useFactory()).toThrow(/OPENAI_API_KEY is not set/);
    } finally {
      process.env = original;
    }
  });
});
