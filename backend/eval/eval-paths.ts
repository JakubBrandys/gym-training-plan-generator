import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = join(EVAL_DIR, 'runs');
export const BASELINE_PATH = join(EVAL_DIR, 'baseline', 'report.json');
export const GENERATED_FILE = 'generated.json';
export const REPORT_FILE = 'report.json';

export const newestRunDir = async (): Promise<string> => {
  const entries = await readdir(RUNS_DIR).catch(() => [] as string[]);
  const newest = entries.sort().at(-1);
  if (!newest) {
    throw new Error(
      `No saved run under ${RUNS_DIR}. Run "npm run eval:generate" first.`,
    );
  }
  return join(RUNS_DIR, newest);
};
