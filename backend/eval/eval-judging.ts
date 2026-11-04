import { mismatchedFormFor } from './eval-inputs.js';
import type { PlanJudge } from './eval-judge.js';
import { mapPool } from './eval-runner.js';
import type { JudgedJob, JudgeScores, RecordedJob } from './eval-types.js';

const errorNameOf = (error: unknown): string =>
  error instanceof Error ? error.name : 'unknown_error';

const attempt = async (
  judge: () => Promise<JudgeScores>,
  errors: string[],
): Promise<JudgeScores | null> => {
  try {
    return await judge();
  } catch (error) {
    errors.push(errorNameOf(error));
    return null;
  }
};

export const judgeJob = async (
  job: RecordedJob,
  judge: PlanJudge,
): Promise<JudgedJob> => {
  const errors: string[] = [];
  const { plan } = job;
  if (!plan) {
    return {
      inputId: job.inputId,
      repeat: job.repeat,
      matched: null,
      mismatched: null,
      errors: ['no_plan'],
    };
  }
  const matched = await attempt(() => judge({ form: job.form, plan }), errors);
  const otherForm = job.repeat === 1 ? mismatchedFormFor(job.inputId) : null;
  const mismatched = otherForm
    ? await attempt(() => judge({ form: otherForm, plan }), errors)
    : null;
  return {
    inputId: job.inputId,
    repeat: job.repeat,
    matched,
    mismatched,
    errors,
  };
};

export const judgeJobs = (
  jobs: readonly RecordedJob[],
  judge: PlanJudge,
  concurrency: number,
): Promise<JudgedJob[]> =>
  mapPool(jobs, concurrency, (job) => judgeJob(job, judge));
