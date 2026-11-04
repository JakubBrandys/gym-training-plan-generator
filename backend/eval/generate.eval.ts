import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readPlanGenerationConfig } from '../src/plan-generation/plan-generation.config.js';
import { PlanModelClient } from '../src/plan-generation/plan-model.client.js';
import { loadEvalCatalog } from './eval-catalog.js';
import { readConcurrency, readTier } from './eval-env.js';
import { buildJobSpecs, tierInputs } from './eval-inputs.js';
import { RUNS_DIR } from './eval-paths.js';
import { computePromptHash } from './eval-report.js';
import { startRunDir, writeGeneratedRun, writeJobFile } from './eval-run-io.js';
import { runEvalJobs } from './eval-runner.js';
import type { GeneratedRun } from './eval-types.js';

const readGitCommit = (): string | null => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
};

describe('eval generate', () => {
  it('runs the real pipeline over the tier inputs and saves the plans', async () => {
    const config = readPlanGenerationConfig();
    const tier = readTier(process.env);
    const concurrency = readConcurrency(process.env);
    const catalog = await loadEvalCatalog();
    const specs = buildJobSpecs(tier);
    const startedAt = new Date().toISOString();
    const meta: GeneratedRun['meta'] = {
      tier,
      startedAt,
      draftModel: config.draftModel,
      reviewModel: config.reviewModel,
      gitCommit: readGitCommit(),
      promptHash: computePromptHash(tierInputs(tier), catalog),
      concurrency,
    };
    const runDir = join(RUNS_DIR, startedAt.replace(/[:.]/g, '-'));
    await startRunDir(runDir, meta);

    const jobs = await runEvalJobs(
      specs,
      { client: new PlanModelClient(config), catalog, config },
      concurrency,
      async (job) => {
        await writeJobFile(runDir, job);
        console.log(
          `eval job ${job.inputId}#${job.repeat}: ${job.status}${job.errorCode ? ` (${job.errorCode})` : ''}, ${job.calls.length} calls`,
        );
      },
    );

    await writeGeneratedRun(runDir, { meta, jobs });
    console.log(`eval run saved to ${runDir}`);
    expect(jobs).toHaveLength(specs.length);
  });
});
