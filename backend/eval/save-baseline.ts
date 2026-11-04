import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { BASELINE_PATH, newestRunDir, REPORT_FILE } from './eval-paths.js';

const main = async (): Promise<void> => {
  const argument = process.argv[2];
  const runDir = argument ? resolve(argument) : await newestRunDir();
  await mkdir(dirname(BASELINE_PATH), { recursive: true });
  await copyFile(join(runDir, REPORT_FILE), BASELINE_PATH);
  console.log(`Baseline saved from ${runDir} to ${BASELINE_PATH}`);
};

await main();
