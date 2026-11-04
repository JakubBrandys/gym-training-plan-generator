import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadEvalCatalog } from './eval-catalog.js';
import { isJudgeSkipped, readConcurrency } from './eval-env.js';
import { createOpenAiJudge, readJudgeConfig } from './eval-judge.js';
import { judgeJobs } from './eval-judging.js';
import {
  BASELINE_PATH,
  GENERATED_FILE,
  newestRunDir,
  REPORT_FILE,
} from './eval-paths.js';
import {
  buildReport,
  diffReports,
  formatReport,
  type EvalReport,
} from './eval-report.js';
import type { GeneratedRun, JudgedJob } from './eval-types.js';

const readBaseline = async (): Promise<EvalReport | null> => {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as EvalReport;
  } catch {
    return null;
  }
};

describe('eval score', () => {
  it('scores a saved run, prints the report and diffs it against the baseline', async () => {
    const judgeConfig = isJudgeSkipped(process.env)
      ? null
      : readJudgeConfig(process.env);
    const concurrency = readConcurrency(process.env);
    const runDir = process.env.EVAL_RUN_DIR
      ? resolve(process.env.EVAL_RUN_DIR)
      : await newestRunDir();
    const run = JSON.parse(
      await readFile(join(runDir, GENERATED_FILE), 'utf8'),
    ) as GeneratedRun;
    const catalog = await loadEvalCatalog();

    let judged: JudgedJob[] | null = null;
    if (judgeConfig) {
      judged = await judgeJobs(
        run.jobs,
        createOpenAiJudge(judgeConfig),
        concurrency,
      );
    }

    const report = buildReport({
      run,
      catalog,
      judged,
      judgeModel: judgeConfig?.model ?? null,
    });
    const baseline = await readBaseline();
    console.log(
      `Run directory: ${runDir}\n${formatReport(report, baseline ? diffReports(report, baseline) : null)}`,
    );

    const reportPath = join(runDir, REPORT_FILE);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    expect(report.details.jobs.total).toBe(run.jobs.length);
  });
});
