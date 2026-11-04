import { isJudgeSkipped, readConcurrency, readTier } from './eval-env.js';

describe('readTier', () => {
  it('defaults to smoke', () => {
    expect(readTier({})).toBe('smoke');
  });

  it('accepts full', () => {
    expect(readTier({ EVAL_TIER: 'full' })).toBe('full');
  });

  it('rejects anything else naming the variable', () => {
    expect(() => readTier({ EVAL_TIER: 'huge' })).toThrow('EVAL_TIER');
  });
});

describe('readConcurrency', () => {
  it('defaults to 4', () => {
    expect(readConcurrency({})).toBe(4);
  });

  it.each(['0', '-1', '2.5', 'abc'])('rejects %s', (value) => {
    expect(() => readConcurrency({ EVAL_CONCURRENCY: value })).toThrow(
      'EVAL_CONCURRENCY',
    );
  });

  it('reads a positive whole number', () => {
    expect(readConcurrency({ EVAL_CONCURRENCY: '8' })).toBe(8);
  });
});

describe('isJudgeSkipped', () => {
  it('is true only for 1', () => {
    expect(isJudgeSkipped({ EVAL_SKIP_JUDGE: '1' })).toBe(true);
    expect(isJudgeSkipped({ EVAL_SKIP_JUDGE: '0' })).toBe(false);
    expect(isJudgeSkipped({})).toBe(false);
  });
});
