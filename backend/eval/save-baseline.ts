import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { checkBaselineCandidate, readReportFile } from './eval-run-io.js';
import { BASELINE_PATH, newestRunDir, REPORT_FILE } from './eval-paths.js';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const argument = args.find((arg) => !arg.startsWith('--'));
  const runDir = argument ? resolve(argument) : await newestRunDir();
  const refusal = checkBaselineCandidate(await readReportFile(runDir));
  if (refusal && !force) {
    throw new Error(
      `Refusing to overwrite the baseline: ${refusal}. Use --force to save it anyway.`,
    );
  }
  await mkdir(dirname(BASELINE_PATH), { recursive: true });
  await copyFile(join(runDir, REPORT_FILE), BASELINE_PATH);
  console.log(`Baseline saved from ${runDir} to ${BASELINE_PATH}`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}
