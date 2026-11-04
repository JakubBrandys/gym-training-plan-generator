import 'dotenv/config';
import { resolve } from 'node:path';
import { loadEvalCatalog } from './eval-catalog.js';
import { isJudgeSkipped, readConcurrency } from './eval-env.js';
import { createOpenAiJudge, readJudgeConfig } from './eval-judge.js';
import { judgeJobs } from './eval-judging.js';
import { BASELINE_PATH, newestRunDir } from './eval-paths.js';
import { buildReport, diffReports, formatReport } from './eval-report.js';
import {
  readBaseline,
  readRun,
  writeJudgedFile,
  writeReportFile,
} from './eval-run-io.js';
import type { JudgedJob } from './eval-types.js';

describe('eval score', () => {
  it('scores a saved run, prints the report and diffs it against the baseline', async () => {
    const judgeConfig = isJudgeSkipped(process.env)
      ? null
      : readJudgeConfig(process.env);
    const concurrency = readConcurrency(process.env);
    const runDir = process.env.EVAL_RUN_DIR
      ? resolve(process.env.EVAL_RUN_DIR)
      : await newestRunDir();
    const run = await readRun(runDir);
    const catalog = await loadEvalCatalog();

    let judged: JudgedJob[] | null = null;
    if (judgeConfig) {
      judged = await judgeJobs(
        run.jobs,
        createOpenAiJudge(judgeConfig),
        concurrency,
      );
      await writeJudgedFile(runDir, judged);
    }

    const report = buildReport({
      run,
      catalog,
      judged,
      judgeModel: judgeConfig?.model ?? null,
    });
    const baseline = await readBaseline(BASELINE_PATH);
    console.log(
      `Run directory: ${runDir}\n${formatReport(report, baseline ? diffReports(report, baseline) : null)}`,
    );

    await writeReportFile(runDir, report);
    expect(report.details.jobs.total + report.details.outages.jobs).toBe(
      run.jobs.length,
    );
  });
});
