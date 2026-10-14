import type { Provider } from '@nestjs/common';

export const PLAN_GENERATION_CONFIG = Symbol('PLAN_GENERATION_CONFIG');

export const DEFAULT_PLAN_DAILY_LIMIT = 5;

export interface PlanGenerationConfig {
  openAiApiKey: string;
  draftModel: string;
  reviewModel: string;
  dailyLimit: number;
}

type Env = Record<string, string | undefined>;

const readRequired = (env: Env, name: string, example: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Add ${name}=${example} to backend/.env.`,
    );
  }
  return value;
};

const readDailyLimit = (env: Env): number => {
  const raw = env.PLAN_DAILY_LIMIT?.trim();
  if (!raw) {
    return DEFAULT_PLAN_DAILY_LIMIT;
  }
  const limit = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(
      `PLAN_DAILY_LIMIT must be a positive whole number like 5, got "${raw}". Fix PLAN_DAILY_LIMIT in backend/.env or remove it to use the default of ${DEFAULT_PLAN_DAILY_LIMIT}.`,
    );
  }
  return limit;
};

export const readPlanGenerationConfig = (
  env: Env = process.env,
): PlanGenerationConfig => ({
  openAiApiKey: readRequired(env, 'OPENAI_API_KEY', '<your-openai-api-key>'),
  draftModel: readRequired(env, 'PLAN_DRAFT_MODEL', '<openai-model-id>'),
  reviewModel: readRequired(env, 'PLAN_REVIEW_MODEL', '<openai-model-id>'),
  dailyLimit: readDailyLimit(env),
});

export const planGenerationConfigProvider: Provider<PlanGenerationConfig> = {
  provide: PLAN_GENERATION_CONFIG,
  useFactory: (): PlanGenerationConfig => readPlanGenerationConfig(),
};
