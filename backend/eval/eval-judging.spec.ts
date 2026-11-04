import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { PlanResult } from '../src/plan-generation/plan.schema.js';
import { EVAL_INPUTS, mismatchedFormFor } from './eval-inputs.js';
import type { PlanJudge } from './eval-judge.js';
import { judgeJob, judgeJobs } from './eval-judging.js';
import type { JudgeScores, RecordedJob } from './eval-types.js';

const plan: PlanResult = { weeks: [] };

const scores = (goals: number, experience: number): JudgeScores => ({
  goalsFit: { score: goals, reason: 'r' },
  experienceFit: { score: experience, reason: 'r' },
});

const jobFor = (
  inputId: string,
  repeat: number,
  hasPlan = true,
): RecordedJob => ({
  inputId,
  repeat,
  form: EVAL_INPUTS.find((input) => input.id === inputId)!.form,
  status: hasPlan ? 'completed' : 'failed',
  errorCode: hasPlan ? null : 'invalid_output',
  plan: hasPlan ? plan : null,
  calls: [],
});

const FIRST = EVAL_INPUTS[0];

describe('judgeJob', () => {
  it('judges the matched form and, on the first repeat, the next input form too', async () => {
    const seen: PlanForm[] = [];
    const judge: PlanJudge = ({ form }) => {
      seen.push(form);
      return Promise.resolve(form === FIRST.form ? scores(5, 5) : scores(2, 2));
    };

    const judged = await judgeJob(jobFor(FIRST.id, 1), judge);

    expect(seen).toEqual([FIRST.form, mismatchedFormFor(FIRST.id)]);
    expect(judged.matched).toEqual(scores(5, 5));
    expect(judged.mismatched).toEqual(scores(2, 2));
    expect(judged.errors).toEqual([]);
  });

  it('skips the mismatched judgement after the first repeat', async () => {
    const judge = vi.fn<PlanJudge>(() => Promise.resolve(scores(4, 4)));

    const judged = await judgeJob(jobFor(FIRST.id, 2), judge);

    expect(judge).toHaveBeenCalledTimes(1);
    expect(judged.mismatched).toBeNull();
  });

  it('reports a job without a final plan as unscored and calls no judge', async () => {
    const judge = vi.fn<PlanJudge>(() => Promise.resolve(scores(5, 5)));

    const judged = await judgeJob(jobFor(FIRST.id, 1, false), judge);

    expect(judge).not.toHaveBeenCalled();
    expect(judged).toEqual({
      inputId: FIRST.id,
      repeat: 1,
      matched: null,
      mismatched: null,
      errors: ['no_plan'],
    });
  });

  it('records a failing judge call as an error and never as a score', async () => {
    class JudgeOutage extends Error {
      override name = 'JudgeOutage';
    }
    const judge: PlanJudge = () => Promise.reject(new JudgeOutage('down'));

    const judged = await judgeJob(jobFor(FIRST.id, 1), judge);

    expect(judged.matched).toBeNull();
    expect(judged.mismatched).toBeNull();
    expect(judged.errors).toEqual(['JudgeOutage', 'JudgeOutage']);
  });

  it('keeps the matched score when only the mismatched call fails', async () => {
    let calls = 0;
    const judge: PlanJudge = () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(scores(4, 4))
        : Promise.reject(new Error('boom'));
    };

    const judged = await judgeJob(jobFor(FIRST.id, 1), judge);

    expect(judged.matched).toEqual(scores(4, 4));
    expect(judged.mismatched).toBeNull();
    expect(judged.errors).toEqual(['Error']);
  });
});

describe('judgeJobs', () => {
  it('returns one judged entry per job in order', async () => {
    const jobs = [jobFor(FIRST.id, 1), jobFor(FIRST.id, 2, false)];
    const judged = await judgeJobs(
      jobs,
      () => Promise.resolve(scores(3, 3)),
      2,
    );

    expect(judged.map((entry) => entry.repeat)).toEqual([1, 2]);
    expect(judged[1].errors).toEqual(['no_plan']);
  });
});
