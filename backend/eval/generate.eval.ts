import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPlanGenerationConfig } from '../src/plan-generation/plan-generation.config.js';
import { PlanModelClient } from '../src/plan-generation/plan-model.client.js';
import { loadEvalCatalog } from './eval-catalog.js';
import { readConcurrency, readTier } from './eval-env.js';
import { buildJobSpecs, tierInputs } from './eval-inputs.js';
import { computePromptHash } from './eval-report.js';
import { runEvalJobs } from './eval-runner.js';
import { GENERATED_FILE, RUNS_DIR } from './eval-paths.js';
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

    const jobs = await runEvalJobs(
      specs,
      { client: new PlanModelClient(config), catalog, config },
      concurrency,
      (job) =>
        console.log(
          `eval job ${job.inputId}#${job.repeat}: ${job.status}${job.errorCode ? ` (${job.errorCode})` : ''}, ${job.calls.length} calls`,
        ),
    );

    const run: GeneratedRun = {
      meta: {
        tier,
        startedAt,
        draftModel: config.draftModel,
        reviewModel: config.reviewModel,
        gitCommit: readGitCommit(),
        promptHash: computePromptHash(tierInputs(tier), catalog),
        concurrency,
      },
      jobs,
    };
    const runDir = join(RUNS_DIR, startedAt.replace(/[:.]/g, '-'));
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, GENERATED_FILE), JSON.stringify(run, null, 2));
    console.log(`eval run saved to ${runDir}`);
    expect(jobs).toHaveLength(specs.length);
  });
});
