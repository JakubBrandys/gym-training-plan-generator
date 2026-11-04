import type { EvalCatalogExercise } from './eval-catalog.js';

const retryPromptSuffix = vi.hoisted(() => ({ value: '' }));

vi.mock('../src/plan-generation/plan.prompts.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../src/plan-generation/plan.prompts.js')
    >();
  return {
    ...actual,
    buildRetryPrompt: (prompt: string, issues: readonly string[]) =>
      actual.buildRetryPrompt(prompt, issues) + retryPromptSuffix.value,
  };
});
import {
  buildReport,
  computePromptHash,
  diffReports,
  formatReport,
  type EvalReport,
  type InputAggregate,
} from './eval-report.js';
import { EVAL_INPUTS } from './eval-inputs.js';
import type {
  JudgedJob,
  JudgeScores,
  RecordedCall,
  RecordedJob,
} from './eval-types.js';

const catalog: EvalCatalogExercise[] = [
  {
    slug: 'squat',
    name: 'Squat',
    primaryMuscles: ['quadriceps'],
    equipment: 'barbell',
    level: 'BEGINNER',
    category: 'strength',
    imageKey: 'exercises/squat.jpg',
  },
];

const form = {
  experience: 'beginner' as const,
  currentFrequency: 2,
  desiredFrequency: 2,
  heightCm: 170,
  weightKg: 70,
  goals: 'get fit',
};

const call = (
  stage: 'drafting' | 'reviewing',
  attempt: number,
  ok: boolean,
): RecordedCall => ({
  stage,
  attempt,
  ok,
  issueCount: ok ? 0 : 2,
  errorCode: null,
  finishReason: 'stop',
  durationMs: 10,
  inputTokens: 1,
  outputTokens: 1,
  output: null,
});

const job = (
  inputId: string,
  status: RecordedJob['status'],
  calls: RecordedCall[],
  errorCode: string | null = null,
): RecordedJob => ({
  inputId,
  repeat: 1,
  form,
  status,
  errorCode,
  plan: null,
  calls,
});

const run = (jobs: RecordedJob[]) => ({
  meta: {
    tier: 'smoke' as const,
    startedAt: '2026-11-04T10:00:00.000Z',
    draftModel: 'draft-model',
    reviewModel: 'review-model',
    gitCommit: null,
    promptHash: 'hash',
    concurrency: 1,
  },
  jobs,
});

const scores = (goals: number, experience: number): JudgeScores => ({
  goalsFit: { score: goals, reason: 'r' },
  experienceFit: { score: experience, reason: 'r' },
});

const tally = (passed: number, total: number) => ({ passed, total });
const mean = (sum: number, count: number) => ({ sum, count });

const aggregate = (
  overrides: Partial<InputAggregate> = {},
): InputAggregate => ({
  drafting: tally(0, 0),
  reviewing: tally(0, 0),
  retries: tally(0, 0),
  jobs: tally(0, 0),
  errorCodes: {},
  weekRepetition: mean(0, 0),
  distinctMuscles: mean(0, 0),
  aboveLevel: mean(0, 0),
  goalsFit: mean(0, 0),
  experienceFit: mean(0, 0),
  goalsFitPass: tally(0, 0),
  experienceFitPass: tally(0, 0),
  matchedPaired: mean(0, 0),
  mismatchedPaired: mean(0, 0),
  unscored: 0,
  judgeErrors: [],
  outageCalls: 0,
  outageJobs: 0,
  ...overrides,
});

const reportOf = (perInput: Record<string, InputAggregate>): EvalReport => ({
  meta: {
    tier: 'full',
    startedAt: '2026-11-04T10:00:00.000Z',
    draftModel: 'd',
    reviewModel: 'r',
    judgeModel: null,
    gitCommit: null,
    promptHash: 'h',
    inputIds: Object.keys(perInput),
  },
  metrics: {
    callValidity: null,
    jobFailureRate: null,
    weekRepetition: null,
    distinctMuscles: null,
    aboveLevelShare: null,
    goalsFit: null,
    experienceFit: null,
  },
  details: {
    calls: {
      drafting: tally(0, 0),
      reviewing: tally(0, 0),
      retries: tally(0, 0),
    },
    outages: { calls: 0, jobs: 0 },
    jobs: { total: 0, completed: 0, byErrorCode: {} },
    judge: null,
  },
  perInput,
});

const validityOnly = (passed: number, total: number) =>
  aggregate({ drafting: tally(passed, total), jobs: tally(total, total) });

describe('buildReport', () => {
  it('counts only the first attempt of each pass and reports retries apart', () => {
    const report = buildReport({
      run: run([
        job('a', 'completed', [
          call('drafting', 1, false),
          call('drafting', 2, true),
          call('reviewing', 1, true),
        ]),
      ]),
      catalog,
      judged: null,
      judgeModel: null,
    });

    expect(report.details.calls.drafting).toEqual(tally(0, 1));
    expect(report.details.calls.reviewing).toEqual(tally(1, 1));
    expect(report.details.calls.retries).toEqual(tally(1, 1));
    expect(report.metrics.callValidity).toBe(0.5);
    expect(report.metrics.jobFailureRate).toBe(0);
  });

  it('reports failed jobs by error code and keeps a provider outage out of the rate', () => {
    const report = buildReport({
      run: run([
        job(
          'a',
          'failed',
          [call('drafting', 1, false), call('drafting', 2, false)],
          'invalid_output',
        ),
        job('b', 'failed', [], 'provider_unavailable'),
        job('b', 'completed', [
          call('drafting', 1, true),
          call('reviewing', 1, true),
        ]),
      ]),
      catalog,
      judged: null,
      judgeModel: null,
    });

    expect(report.details.jobs).toEqual({
      total: 2,
      completed: 1,
      byErrorCode: { invalid_output: 1, provider_unavailable: 1 },
    });
    expect(report.details.outages.jobs).toBe(1);
    expect(report.metrics.jobFailureRate).toBe(0.5);
    expect(report.details.judge).toBeNull();
  });

  it('treats a judge score of 4 as a pass and 3 as a fail', () => {
    const judged: JudgedJob[] = [
      {
        inputId: 'a',
        repeat: 1,
        matched: scores(4, 3),
        mismatched: null,
        errors: [],
      },
    ];
    const report = buildReport({
      run: run([job('a', 'completed', [])]),
      catalog,
      judged,
      judgeModel: 'judge-model',
    });

    expect(report.details.judge?.goalsFitPassShare).toBe(1);
    expect(report.details.judge?.experienceFitPassShare).toBe(0);
    expect(report.metrics.goalsFit).toBe(4);
    expect(report.metrics.experienceFit).toBe(3);
  });

  it('counts failed judge calls as unscored and never as a pass', () => {
    const judged: JudgedJob[] = [
      {
        inputId: 'a',
        repeat: 1,
        matched: null,
        mismatched: null,
        errors: ['no_plan'],
      },
      {
        inputId: 'a',
        repeat: 2,
        matched: scores(5, 5),
        mismatched: null,
        errors: ['NoObjectGeneratedError'],
      },
    ];
    const report = buildReport({
      run: run([job('a', 'completed', [])]),
      catalog,
      judged,
      judgeModel: 'judge-model',
    });

    expect(report.details.judge?.unscored).toBe(2);
    expect(report.details.judge?.errorNames).toEqual([
      'no_plan',
      'NoObjectGeneratedError',
    ]);
    expect(report.details.judge?.goalsFitPassShare).toBe(1);
  });

  it('measures calibration separation on matched and mismatched pairs only', () => {
    const judged: JudgedJob[] = [
      {
        inputId: 'a',
        repeat: 1,
        matched: scores(5, 5),
        mismatched: scores(2, 2),
        errors: [],
      },
      {
        inputId: 'b',
        repeat: 1,
        matched: scores(4, 4),
        mismatched: scores(3, 3),
        errors: [],
      },
      {
        inputId: 'b',
        repeat: 2,
        matched: scores(1, 1),
        mismatched: null,
        errors: [],
      },
    ];
    const calibration = buildReport({
      run: run([job('a', 'completed', []), job('b', 'completed', [])]),
      catalog,
      judged,
      judgeModel: 'judge-model',
    }).details.judge?.calibration;

    expect(calibration?.matchedMean).toBe(4.5);
    expect(calibration?.mismatchedMean).toBe(2.5);
    expect(calibration?.separation).toBe(2);
    expect(calibration?.discriminating).toBe(true);
  });

  it('marks a judge that barely separates matched from mismatched', () => {
    const judged: JudgedJob[] = [
      {
        inputId: 'a',
        repeat: 1,
        matched: scores(4, 4),
        mismatched: scores(3.5, 3.5),
        errors: [],
      },
    ];
    const calibration = buildReport({
      run: run([job('a', 'completed', [])]),
      catalog,
      judged,
      judgeModel: 'judge-model',
    }).details.judge?.calibration;

    expect(calibration?.separation).toBe(0.5);
    expect(calibration?.discriminating).toBe(false);
  });
});

describe('provider outages', () => {
  const outageCall = (stage: 'drafting' | 'reviewing') => ({
    ...call(stage, 1, false),
    errorCode: 'unavailable',
    output: null,
  });

  it('keeps outage calls and jobs out of the validity and failure rates', () => {
    const report = buildReport({
      run: run([
        job('a', 'completed', [
          call('drafting', 1, true),
          call('reviewing', 1, true),
        ]),
        job('a', 'failed', [outageCall('drafting')], 'provider_unavailable'),
        job(
          'a',
          'failed',
          [call('drafting', 1, true), outageCall('reviewing')],
          'provider_unavailable',
        ),
      ]),
      catalog,
      judged: null,
      judgeModel: null,
    });

    expect(report.details.calls.drafting).toEqual(tally(2, 2));
    expect(report.details.calls.reviewing).toEqual(tally(1, 1));
    expect(report.details.outages).toEqual({ calls: 2, jobs: 2 });
    expect(report.metrics.callValidity).toBe(1);
    expect(report.metrics.jobFailureRate).toBe(0);
    expect(report.details.jobs.byErrorCode).toEqual({
      provider_unavailable: 2,
    });
  });

  it('still counts a real invalid_output failure next to an outage', () => {
    const report = buildReport({
      run: run([
        job(
          'a',
          'failed',
          [call('drafting', 1, false), call('drafting', 2, false)],
          'invalid_output',
        ),
        job('a', 'failed', [outageCall('drafting')], 'provider_unavailable'),
      ]),
      catalog,
      judged: null,
      judgeModel: null,
    });

    expect(report.metrics.jobFailureRate).toBe(1);
    expect(report.metrics.callValidity).toBe(0);
  });

  it('prints the excluded outages in the report text', () => {
    const report = buildReport({
      run: run([
        job('a', 'failed', [outageCall('drafting')], 'provider_unavailable'),
      ]),
      catalog,
      judged: null,
      judgeModel: null,
    });
    expect(formatReport(report, null)).toContain(
      'Provider outages excluded from the rates: 1 calls, 1 jobs',
    );
  });
});

describe('diffReports', () => {
  const baseline = reportOf({ a: validityOnly(20, 20) });

  it('does not mark a drop of exactly the margin', () => {
    const diff = diffReports(reportOf({ a: validityOnly(19, 20) }), baseline);
    const validity = diff.metrics.find(
      (entry) => entry.metric === 'callValidity',
    );
    expect(validity?.delta).toBeCloseTo(-0.05);
    expect(validity?.regressed).toBe(false);
  });

  it('marks a drop past the margin', () => {
    const diff = diffReports(reportOf({ a: validityOnly(18, 20) }), baseline);
    expect(
      diff.metrics.find((entry) => entry.metric === 'callValidity')?.regressed,
    ).toBe(true);
  });

  it('does not mark an improvement', () => {
    const diff = diffReports(baseline, reportOf({ a: validityOnly(18, 20) }));
    expect(
      diff.metrics.find((entry) => entry.metric === 'callValidity')?.regressed,
    ).toBe(false);
  });

  it('marks a rise in week repetition past 0.15 and not at 0.15', () => {
    const base = reportOf({ a: aggregate({ weekRepetition: mean(0.1, 1) }) });
    const atMargin = reportOf({
      a: aggregate({ weekRepetition: mean(0.25, 1) }),
    });
    const past = reportOf({ a: aggregate({ weekRepetition: mean(0.3, 1) }) });
    const find = (diff: ReturnType<typeof diffReports>) =>
      diff.metrics.find((entry) => entry.metric === 'weekRepetition')
        ?.regressed;
    expect(find(diffReports(atMargin, base))).toBe(false);
    expect(find(diffReports(past, base))).toBe(true);
  });

  it('marks a judge mean drop past 0.3 on goals fit', () => {
    const base = reportOf({ a: aggregate({ goalsFit: mean(8.5, 2) }) });
    const worse = reportOf({ a: aggregate({ goalsFit: mean(7.5, 2) }) });
    expect(
      diffReports(worse, base).metrics.find(
        (entry) => entry.metric === 'goalsFit',
      )?.regressed,
    ).toBe(true);
  });

  it('compares only the inputs both reports contain', () => {
    const current = reportOf({
      b: validityOnly(10, 10),
      c: validityOnly(0, 10),
    });
    const base = reportOf({ a: validityOnly(0, 10), b: validityOnly(10, 10) });
    const diff = diffReports(current, base);
    expect(diff.sharedInputIds).toEqual(['b']);
    expect(
      diff.metrics.find((entry) => entry.metric === 'callValidity')?.delta,
    ).toBe(0);
  });

  it('gives no deltas when no input is shared', () => {
    const diff = diffReports(
      reportOf({ b: validityOnly(10, 10) }),
      reportOf({ a: validityOnly(0, 10) }),
    );
    expect(diff.sharedInputIds).toEqual([]);
    expect(
      diff.metrics.every((entry) => entry.delta === null && !entry.regressed),
    ).toBe(true);
  });

  it('flags an incomplete judge section when anything is unscored', () => {
    const current = reportOf({ a: validityOnly(20, 20) });
    current.details.judge = {
      goalsFitPassShare: 1,
      experienceFitPassShare: 1,
      unscored: 1,
      errorNames: ['x'],
      calibration: {
        matchedMean: null,
        mismatchedMean: null,
        separation: null,
        discriminating: null,
      },
    };
    expect(diffReports(current, baseline).judgeIncomplete).toBe(true);
  });
});

describe('diffReports comparability', () => {
  it('warns when the tier or a model differs from the baseline', () => {
    const baseline = reportOf({ a: validityOnly(20, 20) });
    const current = reportOf({ a: validityOnly(20, 20) });
    current.meta.tier = 'smoke';
    current.meta.draftModel = 'other-model';

    const diff = diffReports(current, baseline);

    expect(diff.warnings).toEqual([
      'tier differs from the baseline (full -> smoke), deltas may not be comparable',
      'draftModel differs from the baseline (d -> other-model), deltas may not be comparable',
    ]);
  });

  it('has no warnings for matching runs and reports the prompt as unchanged', () => {
    const diff = diffReports(
      reportOf({ a: validityOnly(20, 20) }),
      reportOf({ a: validityOnly(20, 20) }),
    );
    expect(diff.warnings).toEqual([]);
    expect(diff.promptChanged).toBe(false);
  });

  it('reports a changed prompt hash', () => {
    const current = reportOf({ a: validityOnly(20, 20) });
    current.meta.promptHash = 'different';
    const diff = diffReports(current, reportOf({ a: validityOnly(20, 20) }));
    expect(diff.promptChanged).toBe(true);
    expect(formatReport(current, diff)).toContain(
      'Prompt hash differs from the baseline',
    );
  });
});

describe('formatReport', () => {
  it('names the regressed metric', () => {
    const current = reportOf({ a: validityOnly(18, 20) });
    const text = formatReport(
      current,
      diffReports(current, reportOf({ a: validityOnly(20, 20) })),
    );
    expect(text).toMatch(/callValidity.*REGRESSED/);
  });

  it('says so when there is no baseline', () => {
    expect(formatReport(reportOf({ a: validityOnly(20, 20) }), null)).toContain(
      'No baseline found',
    );
  });
});

describe('computePromptHash', () => {
  it('changes when the retry prompt template changes', () => {
    const before = computePromptHash(EVAL_INPUTS, catalog);
    retryPromptSuffix.value = ' changed';
    const after = computePromptHash(EVAL_INPUTS, catalog);
    retryPromptSuffix.value = '';
    expect(after).not.toBe(before);
  });

  it('is stable for the same inputs and changes with the catalog', () => {
    const first = computePromptHash(EVAL_INPUTS, catalog);
    expect(computePromptHash(EVAL_INPUTS, catalog)).toBe(first);
    expect(
      computePromptHash(EVAL_INPUTS, [{ ...catalog[0], name: 'Other' }]),
    ).not.toBe(first);
  });
});
