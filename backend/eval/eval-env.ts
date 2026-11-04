import type { EvalTier } from './eval-types.js';

type Env = Record<string, string | undefined>;

const DEFAULT_CONCURRENCY = 4;

export const readTier = (env: Env): EvalTier => {
  const raw = env.EVAL_TIER?.trim() || 'smoke';
  if (raw !== 'smoke' && raw !== 'full') {
    throw new Error(`EVAL_TIER must be "smoke" or "full", got "${raw}".`);
  }
  return raw;
};

export const readConcurrency = (env: Env): number => {
  const raw = env.EVAL_CONCURRENCY?.trim();
  if (!raw) {
    return DEFAULT_CONCURRENCY;
  }
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `EVAL_CONCURRENCY must be a positive whole number like 4, got "${raw}".`,
    );
  }
  return value;
};

export const isJudgeSkipped = (env: Env): boolean =>
  env.EVAL_SKIP_JUDGE?.trim() === '1';
