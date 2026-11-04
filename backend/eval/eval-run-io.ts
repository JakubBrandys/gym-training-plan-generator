import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GENERATED_FILE,
  JOBS_DIR,
  JUDGED_FILE,
  META_FILE,
  REPORT_FILE,
} from './eval-paths.js';
import type { EvalReport } from './eval-report.js';
import type {
  GeneratedRun,
  JudgedJob,
  RecordedJob,
  RunMeta,
} from './eval-types.js';

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const writeJson = (path: string, value: unknown): Promise<void> =>
  writeFile(path, JSON.stringify(value, null, 2));

export const startRunDir = async (
  runDir: string,
  meta: RunMeta,
): Promise<void> => {
  await mkdir(join(runDir, JOBS_DIR), { recursive: true });
  await writeJson(join(runDir, META_FILE), meta);
};

export const writeJobFile = (runDir: string, job: RecordedJob): Promise<void> =>
  writeJson(join(runDir, JOBS_DIR, `${job.inputId}-${job.repeat}.json`), job);

export const writeGeneratedRun = (
  runDir: string,
  run: GeneratedRun,
): Promise<void> => writeJson(join(runDir, GENERATED_FILE), run);

export const writeJudgedFile = (
  runDir: string,
  judged: JudgedJob[],
): Promise<void> => writeJson(join(runDir, JUDGED_FILE), judged);

export const writeReportFile = (
  runDir: string,
  report: EvalReport,
): Promise<void> => writeJson(join(runDir, REPORT_FILE), report);

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

export const readRun = async (runDir: string): Promise<GeneratedRun> => {
  try {
    return await readJson<GeneratedRun>(join(runDir, GENERATED_FILE));
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  try {
    const meta = await readJson<RunMeta>(join(runDir, META_FILE));
    const names = (await readdir(join(runDir, JOBS_DIR))).sort();
    const jobs = await Promise.all(
      names.map((name) => readJson<RecordedJob>(join(runDir, JOBS_DIR, name))),
    );
    return { meta, jobs };
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(
        `No saved run in ${runDir}: neither ${GENERATED_FILE} nor ${META_FILE} was found.`,
      );
    }
    throw error;
  }
};

const isReportShape = (value: unknown): value is EvalReport =>
  typeof value === 'object' &&
  value !== null &&
  'meta' in value &&
  'metrics' in value &&
  'details' in value &&
  'perInput' in value;

export const readBaseline = async (
  path: string,
): Promise<EvalReport | null> => {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Baseline ${path} is not valid JSON.`);
  }
  if (!isReportShape(parsed)) {
    throw new Error(
      `Baseline ${path} has an unexpected shape. Regenerate it with "npm run eval:baseline".`,
    );
  }
  return parsed;
};

export const readReportFile = async (runDir: string): Promise<EvalReport> => {
  const path = join(runDir, REPORT_FILE);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isReportShape(parsed)) {
      throw new Error(`${path} has an unexpected shape.`);
    }
    return parsed;
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(
        `No ${REPORT_FILE} in ${runDir}. Run "npm run eval:score" on it first.`,
      );
    }
    throw error;
  }
};

export const checkBaselineCandidate = (report: EvalReport): string | null => {
  if (report.meta.tier !== 'full') {
    return `the report is from the "${report.meta.tier}" tier, not "full"`;
  }
  if (report.meta.judgeModel === null) {
    return 'the report was made without the judge';
  }
  if ((report.details.judge?.unscored ?? 0) > 0) {
    return 'the judge section is incomplete (some results were unscored)';
  }
  return null;
};
