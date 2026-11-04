import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalReport } from './eval-report.js';
import {
  checkBaselineCandidate,
  readBaseline,
  readReportFile,
  readRun,
  startRunDir,
  writeGeneratedRun,
  writeJobFile,
  writeJudgedFile,
} from './eval-run-io.js';
import type { JudgedJob, RecordedJob, RunMeta } from './eval-types.js';

const meta: RunMeta = {
  tier: 'full',
  startedAt: '2026-11-04T10:00:00.000Z',
  draftModel: 'draft',
  reviewModel: 'review',
  gitCommit: null,
  promptHash: 'hash',
  concurrency: 2,
};

const job = (inputId: string, repeat: number): RecordedJob => ({
  inputId,
  repeat,
  form: {
    experience: 'beginner',
    currentFrequency: 2,
    desiredFrequency: 2,
    heightCm: 170,
    weightKg: 70,
    goals: 'get fit',
  },
  status: 'completed',
  errorCode: null,
  plan: { weeks: [] },
  calls: [],
});

const reportWith = (
  overrides: Partial<EvalReport['meta']> = {},
  unscored = 0,
): EvalReport => ({
  meta: {
    tier: 'full',
    startedAt: 'now',
    draftModel: 'd',
    reviewModel: 'r',
    judgeModel: 'judge',
    gitCommit: null,
    promptHash: 'h',
    inputIds: [],
    ...overrides,
  },
  metrics: {
    callValidity: null,
    jobFailureRate: null,
    weekRepetition: null,
    distinctMuscles: null,
    aboveLevelShare: null,
    goalsFit: null,
    experienceFit: null,
  },
  details: {
    calls: {
      drafting: { passed: 0, total: 0 },
      reviewing: { passed: 0, total: 0 },
      retries: { passed: 0, total: 0 },
    },
    outages: { calls: 0, jobs: 0 },
    jobs: { total: 0, completed: 0, byErrorCode: {} },
    judge: {
      goalsFitPassShare: null,
      experienceFitPassShare: null,
      unscored,
      errorNames: [],
      calibration: {
        matchedMean: null,
        mismatchedMean: null,
        separation: null,
        discriminating: null,
      },
    },
  },
  perInput: {},
});

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'eval-io-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('run files', () => {
  it('reads a finished run from generated.json', async () => {
    const jobs = [job('a', 1), job('b', 1)];
    await writeGeneratedRun(dir, { meta, jobs });

    expect(await readRun(dir)).toEqual({ meta, jobs });
  });

  it('rebuilds a cut-off run from meta.json and the per-job files', async () => {
    await startRunDir(dir, meta);
    await writeJobFile(dir, job('b', 1));
    await writeJobFile(dir, job('a', 2));

    const run = await readRun(dir);

    expect(run.meta).toEqual(meta);
    expect(run.jobs.map((entry) => `${entry.inputId}#${entry.repeat}`)).toEqual(
      ['a#2', 'b#1'],
    );
  });

  it('prefers the finished run over the per-job files', async () => {
    await startRunDir(dir, meta);
    await writeJobFile(dir, job('partial', 1));
    await writeGeneratedRun(dir, { meta, jobs: [job('final', 1)] });

    expect((await readRun(dir)).jobs[0].inputId).toBe('final');
  });

  it('names the directory when neither file exists', async () => {
    await expect(readRun(dir)).rejects.toThrow(
      `No saved run in ${dir}: neither generated.json nor meta.json was found.`,
    );
  });

  it('rethrows a corrupt generated.json instead of treating it as missing', async () => {
    await writeFile(join(dir, 'generated.json'), '{not json');
    await expect(readRun(dir)).rejects.toThrow(SyntaxError);
  });

  it('saves judge scores together with the reasons', async () => {
    const judged: JudgedJob[] = [
      {
        inputId: 'a',
        repeat: 1,
        matched: {
          goalsFit: { score: 4, reason: 'Leg press suits the goal.' },
          experienceFit: { score: 3, reason: 'No progression.' },
        },
        mismatched: null,
        errors: [],
      },
    ];
    await writeJudgedFile(dir, judged);

    expect(
      JSON.parse(await readFile(join(dir, 'judged.json'), 'utf8')),
    ).toEqual(judged);
  });
});

describe('readBaseline', () => {
  it('returns null only when the file does not exist', async () => {
    expect(await readBaseline(join(dir, 'missing.json'))).toBeNull();
  });

  it('throws on a corrupt baseline instead of reporting no baseline', async () => {
    const path = join(dir, 'baseline.json');
    await writeFile(path, '{"meta":');
    await expect(readBaseline(path)).rejects.toThrow('is not valid JSON');
  });

  it('throws on an old shape without perInput', async () => {
    const path = join(dir, 'baseline.json');
    await writeFile(
      path,
      JSON.stringify({ meta: {}, metrics: {}, details: {} }),
    );
    await expect(readBaseline(path)).rejects.toThrow('unexpected shape');
  });

  it('reads a valid baseline', async () => {
    const path = join(dir, 'baseline.json');
    const report = reportWith();
    await writeFile(path, JSON.stringify(report));
    expect(await readBaseline(path)).toEqual(report);
  });
});

describe('readReportFile', () => {
  it('tells the user to run eval:score when report.json is missing', async () => {
    await mkdir(dir, { recursive: true });
    await expect(readReportFile(dir)).rejects.toThrow(
      `No report.json in ${dir}. Run "npm run eval:score" on it first.`,
    );
  });
});

describe('checkBaselineCandidate', () => {
  it('accepts a full, judged, complete report', () => {
    expect(checkBaselineCandidate(reportWith())).toBeNull();
  });

  it('refuses a smoke report', () => {
    expect(checkBaselineCandidate(reportWith({ tier: 'smoke' }))).toContain(
      '"smoke" tier',
    );
  });

  it('refuses a report made without the judge', () => {
    expect(checkBaselineCandidate(reportWith({ judgeModel: null }))).toContain(
      'without the judge',
    );
  });

  it('refuses a report with unscored judge results', () => {
    expect(checkBaselineCandidate(reportWith({}, 2))).toContain('incomplete');
  });
});
