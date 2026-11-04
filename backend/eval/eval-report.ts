import { createHash } from 'node:crypto';
import {
  buildDraftPrompt,
  buildReviewPrompt,
  PLAN_SYSTEM_PROMPT,
} from '../src/plan-generation/plan.prompts.js';
import type { EvalCatalogExercise } from './eval-catalog.js';
import type { EvalInput } from './eval-inputs.js';
import {
  aboveLevelShare,
  meanDistinctMusclesPerWeek,
  weekRepetitionRate,
} from './eval-metrics.js';
import type { GeneratedRun, JudgedJob, RecordedJob } from './eval-types.js';

export interface Tally {
  passed: number;
  total: number;
}

export interface Mean {
  sum: number;
  count: number;
}

export interface InputAggregate {
  drafting: Tally;
  reviewing: Tally;
  retries: Tally;
  jobs: Tally;
  errorCodes: Record<string, number>;
  weekRepetition: Mean;
  distinctMuscles: Mean;
  aboveLevel: Mean;
  goalsFit: Mean;
  experienceFit: Mean;
  goalsFitPass: Tally;
  experienceFitPass: Tally;
  matchedPaired: Mean;
  mismatchedPaired: Mean;
  unscored: number;
  judgeErrors: string[];
}

export type MetricName =
  | 'callValidity'
  | 'jobFailureRate'
  | 'weekRepetition'
  | 'distinctMuscles'
  | 'aboveLevelShare'
  | 'goalsFit'
  | 'experienceFit';

export type MetricValues = Record<MetricName, number | null>;

export const JUDGE_PASS_SCORE = 4;
export const JUDGE_SEPARATION_MIN = 1;
const MARGIN_EPSILON = 1e-9;

export const MARGINS: Record<
  MetricName,
  { worse: 'lower' | 'higher'; margin: number }
> = {
  callValidity: { worse: 'lower', margin: 0.05 },
  jobFailureRate: { worse: 'higher', margin: 0.05 },
  weekRepetition: { worse: 'higher', margin: 0.15 },
  distinctMuscles: { worse: 'lower', margin: 1 },
  aboveLevelShare: { worse: 'higher', margin: 0.1 },
  goalsFit: { worse: 'lower', margin: 0.3 },
  experienceFit: { worse: 'lower', margin: 0.3 },
};

export interface JudgeDetails {
  goalsFitPassShare: number | null;
  experienceFitPassShare: number | null;
  unscored: number;
  errorNames: string[];
  calibration: {
    matchedMean: number | null;
    mismatchedMean: number | null;
    separation: number | null;
    discriminating: boolean | null;
  };
}

export interface ReportDetails {
  calls: { drafting: Tally; reviewing: Tally; retries: Tally };
  jobs: {
    total: number;
    completed: number;
    byErrorCode: Record<string, number>;
  };
  judge: JudgeDetails | null;
}

export interface EvalReport {
  meta: {
    tier: string;
    startedAt: string;
    draftModel: string;
    reviewModel: string;
    judgeModel: string | null;
    gitCommit: string | null;
    promptHash: string;
    inputIds: string[];
  };
  metrics: MetricValues;
  details: ReportDetails;
  perInput: Record<string, InputAggregate>;
}

export interface MetricDiff {
  metric: MetricName;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  regressed: boolean;
}

export interface ReportDiff {
  sharedInputIds: string[];
  metrics: MetricDiff[];
  judgeIncomplete: boolean;
}

const emptyTally = (): Tally => ({ passed: 0, total: 0 });
const emptyMean = (): Mean => ({ sum: 0, count: 0 });

const emptyAggregate = (): InputAggregate => ({
  drafting: emptyTally(),
  reviewing: emptyTally(),
  retries: emptyTally(),
  jobs: emptyTally(),
  errorCodes: {},
  weekRepetition: emptyMean(),
  distinctMuscles: emptyMean(),
  aboveLevel: emptyMean(),
  goalsFit: emptyMean(),
  experienceFit: emptyMean(),
  goalsFitPass: emptyTally(),
  experienceFitPass: emptyTally(),
  matchedPaired: emptyMean(),
  mismatchedPaired: emptyMean(),
  unscored: 0,
  judgeErrors: [],
});

const addToTally = (tally: Tally, passed: boolean): void => {
  tally.total += 1;
  if (passed) {
    tally.passed += 1;
  }
};

const addToMean = (mean: Mean, value: number | null): void => {
  if (value === null) {
    return;
  }
  mean.sum += value;
  mean.count += 1;
};

const meanValue = (mean: Mean): number | null =>
  mean.count === 0 ? null : mean.sum / mean.count;

const tallyShare = (tally: Tally): number | null =>
  tally.total === 0 ? null : tally.passed / tally.total;

const mergeTally = (tallies: Tally[]): Tally =>
  tallies.reduce(
    (merged, tally) => ({
      passed: merged.passed + tally.passed,
      total: merged.total + tally.total,
    }),
    emptyTally(),
  );

const mergeMean = (means: Mean[]): Mean =>
  means.reduce(
    (merged, mean) => ({
      sum: merged.sum + mean.sum,
      count: merged.count + mean.count,
    }),
    emptyMean(),
  );

const addJob = (
  aggregate: InputAggregate,
  job: RecordedJob,
  catalog: readonly EvalCatalogExercise[],
): void => {
  addToTally(aggregate.jobs, job.status === 'completed');
  if (job.errorCode !== null) {
    aggregate.errorCodes[job.errorCode] =
      (aggregate.errorCodes[job.errorCode] ?? 0) + 1;
  }
  job.calls.forEach((call) => {
    if (call.attempt > 1) {
      addToTally(aggregate.retries, call.ok);
    } else if (call.stage === 'drafting') {
      addToTally(aggregate.drafting, call.ok);
    } else if (call.stage === 'reviewing') {
      addToTally(aggregate.reviewing, call.ok);
    }
  });
  if (job.plan) {
    addToMean(aggregate.weekRepetition, weekRepetitionRate(job.plan));
    addToMean(
      aggregate.distinctMuscles,
      meanDistinctMusclesPerWeek(job.plan, catalog),
    );
    addToMean(
      aggregate.aboveLevel,
      aboveLevelShare(job.plan, catalog, job.form.experience),
    );
  }
};

const addJudged = (aggregate: InputAggregate, judged: JudgedJob): void => {
  aggregate.unscored += judged.errors.length;
  aggregate.judgeErrors.push(...judged.errors);
  if (judged.matched) {
    addToMean(aggregate.goalsFit, judged.matched.goalsFit.score);
    addToMean(aggregate.experienceFit, judged.matched.experienceFit.score);
    addToTally(
      aggregate.goalsFitPass,
      judged.matched.goalsFit.score >= JUDGE_PASS_SCORE,
    );
    addToTally(
      aggregate.experienceFitPass,
      judged.matched.experienceFit.score >= JUDGE_PASS_SCORE,
    );
  }
  if (judged.matched && judged.mismatched) {
    addToMean(
      aggregate.matchedPaired,
      (judged.matched.goalsFit.score + judged.matched.experienceFit.score) / 2,
    );
    addToMean(
      aggregate.mismatchedPaired,
      (judged.mismatched.goalsFit.score +
        judged.mismatched.experienceFit.score) /
        2,
    );
  }
};

export const metricsOf = (aggregates: InputAggregate[]): MetricValues => {
  const calls = mergeTally(
    aggregates.flatMap((aggregate) => [
      aggregate.drafting,
      aggregate.reviewing,
    ]),
  );
  const jobs = mergeTally(aggregates.map((aggregate) => aggregate.jobs));
  const completedShare = tallyShare(jobs);
  return {
    callValidity: tallyShare(calls),
    jobFailureRate: completedShare === null ? null : 1 - completedShare,
    weekRepetition: meanValue(
      mergeMean(aggregates.map((aggregate) => aggregate.weekRepetition)),
    ),
    distinctMuscles: meanValue(
      mergeMean(aggregates.map((aggregate) => aggregate.distinctMuscles)),
    ),
    aboveLevelShare: meanValue(
      mergeMean(aggregates.map((aggregate) => aggregate.aboveLevel)),
    ),
    goalsFit: meanValue(
      mergeMean(aggregates.map((aggregate) => aggregate.goalsFit)),
    ),
    experienceFit: meanValue(
      mergeMean(aggregates.map((aggregate) => aggregate.experienceFit)),
    ),
  };
};

const judgeDetailsOf = (aggregates: InputAggregate[]): JudgeDetails => {
  const matchedMean = meanValue(
    mergeMean(aggregates.map((aggregate) => aggregate.matchedPaired)),
  );
  const mismatchedMean = meanValue(
    mergeMean(aggregates.map((aggregate) => aggregate.mismatchedPaired)),
  );
  const separation =
    matchedMean === null || mismatchedMean === null
      ? null
      : matchedMean - mismatchedMean;
  return {
    goalsFitPassShare: tallyShare(
      mergeTally(aggregates.map((aggregate) => aggregate.goalsFitPass)),
    ),
    experienceFitPassShare: tallyShare(
      mergeTally(aggregates.map((aggregate) => aggregate.experienceFitPass)),
    ),
    unscored: aggregates.reduce(
      (sum, aggregate) => sum + aggregate.unscored,
      0,
    ),
    errorNames: [
      ...new Set(aggregates.flatMap((aggregate) => aggregate.judgeErrors)),
    ],
    calibration: {
      matchedMean,
      mismatchedMean,
      separation,
      discriminating:
        separation === null
          ? null
          : separation + MARGIN_EPSILON >= JUDGE_SEPARATION_MIN,
    },
  };
};

export const computePromptHash = (
  inputs: readonly EvalInput[],
  catalog: readonly EvalCatalogExercise[],
): string => {
  const hash = createHash('sha256');
  hash.update(PLAN_SYSTEM_PROMPT);
  inputs.forEach((input) => hash.update(buildDraftPrompt(input.form, catalog)));
  hash.update(buildReviewPrompt(inputs[0].form, catalog, { weeks: [] }));
  return hash.digest('hex');
};

export interface BuildReportArgs {
  run: GeneratedRun;
  catalog: readonly EvalCatalogExercise[];
  judged: JudgedJob[] | null;
  judgeModel: string | null;
}

export const buildReport = ({
  run,
  catalog,
  judged,
  judgeModel,
}: BuildReportArgs): EvalReport => {
  const perInput: Record<string, InputAggregate> = {};
  const aggregateFor = (inputId: string): InputAggregate => {
    perInput[inputId] ??= emptyAggregate();
    return perInput[inputId];
  };
  run.jobs.forEach((job) => addJob(aggregateFor(job.inputId), job, catalog));
  judged?.forEach((entry) => addJudged(aggregateFor(entry.inputId), entry));
  const aggregates = Object.values(perInput);
  const jobsTally = mergeTally(aggregates.map((aggregate) => aggregate.jobs));
  const errorCodes: Record<string, number> = {};
  aggregates.forEach((aggregate) =>
    Object.entries(aggregate.errorCodes).forEach(([code, count]) => {
      errorCodes[code] = (errorCodes[code] ?? 0) + count;
    }),
  );
  return {
    meta: {
      tier: run.meta.tier,
      startedAt: run.meta.startedAt,
      draftModel: run.meta.draftModel,
      reviewModel: run.meta.reviewModel,
      judgeModel,
      gitCommit: run.meta.gitCommit,
      promptHash: run.meta.promptHash,
      inputIds: Object.keys(perInput),
    },
    metrics: metricsOf(aggregates),
    details: {
      calls: {
        drafting: mergeTally(aggregates.map((aggregate) => aggregate.drafting)),
        reviewing: mergeTally(
          aggregates.map((aggregate) => aggregate.reviewing),
        ),
        retries: mergeTally(aggregates.map((aggregate) => aggregate.retries)),
      },
      jobs: {
        total: jobsTally.total,
        completed: jobsTally.passed,
        byErrorCode: errorCodes,
      },
      judge: judged ? judgeDetailsOf(aggregates) : null,
    },
    perInput,
  };
};

const isRegressed = (
  metric: MetricName,
  current: number,
  baseline: number,
): boolean => {
  const { worse, margin } = MARGINS[metric];
  const change = worse === 'lower' ? baseline - current : current - baseline;
  return change > margin + MARGIN_EPSILON;
};

export const diffReports = (
  current: EvalReport,
  baseline: EvalReport,
): ReportDiff => {
  const sharedInputIds = Object.keys(current.perInput).filter(
    (id) => id in baseline.perInput,
  );
  const currentMetrics = metricsOf(
    sharedInputIds.map((id) => current.perInput[id]),
  );
  const baselineMetrics = metricsOf(
    sharedInputIds.map((id) => baseline.perInput[id]),
  );
  const metrics = (Object.keys(MARGINS) as MetricName[]).map((metric) => {
    const currentValue = currentMetrics[metric];
    const baselineValue = baselineMetrics[metric];
    const comparable =
      sharedInputIds.length > 0 &&
      currentValue !== null &&
      baselineValue !== null;
    return {
      metric,
      current: sharedInputIds.length > 0 ? currentValue : null,
      baseline: sharedInputIds.length > 0 ? baselineValue : null,
      delta: comparable ? currentValue - baselineValue : null,
      regressed: comparable
        ? isRegressed(metric, currentValue, baselineValue)
        : false,
    };
  });
  return {
    sharedInputIds,
    metrics,
    judgeIncomplete: (current.details.judge?.unscored ?? 0) > 0,
  };
};

const formatNumber = (value: number | null): string =>
  value === null ? 'n/a' : value.toFixed(3);

const formatTally = (tally: Tally): string => `${tally.passed}/${tally.total}`;

export const formatReport = (
  report: EvalReport,
  diff: ReportDiff | null,
): string => {
  const { details, meta } = report;
  const lines = [
    `Eval report: tier=${meta.tier} models draft=${meta.draftModel} review=${meta.reviewModel} judge=${meta.judgeModel ?? 'skipped'}`,
    `Inputs: ${meta.inputIds.join(', ')}`,
    `First-attempt validity: drafting ${formatTally(details.calls.drafting)}, reviewing ${formatTally(details.calls.reviewing)}`,
    `Retry calls: ${formatTally(details.calls.retries)} valid`,
    `Jobs: ${details.jobs.completed}/${details.jobs.total} completed, failures by code ${JSON.stringify(details.jobs.byErrorCode)}`,
  ];
  if (details.judge) {
    const { calibration } = details.judge;
    lines.push(
      `Judge: goals fit pass share ${formatNumber(details.judge.goalsFitPassShare)}, experience fit pass share ${formatNumber(details.judge.experienceFitPassShare)}, unscored ${details.judge.unscored}${details.judge.unscored > 0 ? ' (judge INCOMPLETE)' : ''}`,
      `Calibration: matched ${formatNumber(calibration.matchedMean)}, mismatched ${formatNumber(calibration.mismatchedMean)}, separation ${formatNumber(calibration.separation)}${calibration.discriminating === false ? ' (judge NOT DISCRIMINATING)' : ''}`,
    );
  }
  if (diff === null) {
    lines.push(
      'Metrics:',
      ...(Object.keys(MARGINS) as MetricName[]).map(
        (metric) => `  ${metric}: ${formatNumber(report.metrics[metric])}`,
      ),
      'No baseline found, no deltas.',
    );
    return lines.join('\n');
  }
  lines.push(
    `Compared with baseline over shared inputs: ${diff.sharedInputIds.join(', ') || 'none'}`,
    ...diff.metrics.map(
      (entry) =>
        `  ${entry.metric}: ${formatNumber(entry.current)} (baseline ${formatNumber(entry.baseline)}, delta ${formatNumber(entry.delta)})${entry.regressed ? '  REGRESSED' : ''}`,
    ),
  );
  return lines.join('\n');
};
