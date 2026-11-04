import type { ExercisesService } from '../src/exercises/exercises.service.js';
import type { PlanGenerationConfig } from '../src/plan-generation/plan-generation.config.js';
import { PlanJobStore } from '../src/plan-generation/plan-job.store.js';
import type { PlanModelClient } from '../src/plan-generation/plan-model.client.js';
import { PlanPipelineService } from '../src/plan-generation/plan-pipeline.service.js';
import type { EvalCatalogExercise } from './eval-catalog.js';
import { createRecordingClient } from './eval-record.js';
import type { EvalJobSpec, RecordedJob } from './eval-types.js';

const EVAL_OWNER = 'eval';

export interface EvalRunDeps {
  client: Pick<PlanModelClient, 'generate'>;
  catalog: readonly EvalCatalogExercise[];
  config: PlanGenerationConfig;
}

export const mapPool = async <T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = Array.from<R>({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane),
  );
  return results;
};

export const runEvalJob = async (
  spec: EvalJobSpec,
  deps: EvalRunDeps,
): Promise<RecordedJob> => {
  const store = new PlanJobStore();
  const job = store.create(EVAL_OWNER, spec.form);
  const recording = createRecordingClient(deps.client, {
    stageOf: () => store.get(job.id, EVAL_OWNER)?.stage ?? null,
    form: spec.form,
    slugs: deps.catalog.map((exercise) => exercise.slug),
  });
  const pipeline = new PlanPipelineService(
    {
      findAll: () => Promise.resolve(deps.catalog),
    } as unknown as ExercisesService,
    recording.client as unknown as PlanModelClient,
    store,
    deps.config,
  );
  let runnerFailed = false;
  try {
    await pipeline.run(job.id, spec.form);
  } catch {
    runnerFailed = true;
  }
  const finished = store.get(job.id, EVAL_OWNER);
  return {
    ...spec,
    status: runnerFailed ? 'failed' : (finished?.status ?? 'failed'),
    errorCode: finished?.error?.code ?? (runnerFailed ? 'runner_error' : null),
    plan: finished?.plan ?? null,
    calls: recording.calls,
  };
};

export const runEvalJobs = (
  specs: readonly EvalJobSpec[],
  deps: EvalRunDeps,
  concurrency: number,
  onJobDone?: (job: RecordedJob) => void,
): Promise<RecordedJob[]> =>
  mapPool(specs, concurrency, async (spec) => {
    const recorded = await runEvalJob(spec, deps);
    onJobDone?.(recorded);
    return recorded;
  });
