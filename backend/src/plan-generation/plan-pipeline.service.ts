import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExercisesService } from '../exercises/exercises.service.js';
import {
  PLAN_GENERATION_CONFIG,
  type PlanGenerationConfig,
} from './plan-generation.config.js';
import type { PlanForm } from './plan-form.schema.js';
import {
  PLAN_JOB_TIMEOUT_MS,
  PlanJobStore,
  type PlanJobErrorCode,
  type PlanJobStage,
} from './plan-job.store.js';
import { PlanModelClient, PlanModelError } from './plan-model.client.js';
import {
  buildDraftPrompt,
  buildRetryPrompt,
  buildReviewPrompt,
  PLAN_SYSTEM_PROMPT,
  type CatalogExercise,
} from './plan.prompts.js';
import {
  buildGeneratedPlanSchema,
  type GeneratedPlan,
  type PlanResult,
} from './plan.schema.js';
import { validateGeneratedPlan } from './plan.validator.js';

const ATTEMPTS_PER_PASS = 2;
const SCHEMA_MISMATCH_ISSUE =
  'The previous answer could not be parsed into the required structure. Return a complete plan that matches the required structure exactly.';

type AttemptOutcome = { plan: GeneratedPlan } | { issues: string[] };

class PipelineFailure extends Error {
  constructor(readonly code: PlanJobErrorCode) {
    super(`Plan generation failed: ${code}`);
    this.name = 'PipelineFailure';
  }
}

interface PassContext {
  jobId: string;
  form: PlanForm;
  schema: ReturnType<typeof buildGeneratedPlanSchema>;
  slugs: readonly string[];
  signal: AbortSignal;
}

@Injectable()
export class PlanPipelineService {
  private readonly logger = new Logger(PlanPipelineService.name);

  constructor(
    private readonly exercises: ExercisesService,
    private readonly modelClient: PlanModelClient,
    private readonly store: PlanJobStore,
    @Inject(PLAN_GENERATION_CONFIG)
    private readonly config: PlanGenerationConfig,
  ) {}

  async run(jobId: string, form: PlanForm): Promise<void> {
    try {
      const signal = AbortSignal.timeout(PLAN_JOB_TIMEOUT_MS);
      const catalog = await this.loadCatalog(signal);
      if (catalog.length === 0) {
        throw new PipelineFailure('internal');
      }
      const slugs = catalog.map((exercise) => exercise.slug);
      const [firstSlug, ...otherSlugs] = slugs;
      const context: PassContext = {
        jobId,
        form,
        schema: buildGeneratedPlanSchema([firstSlug, ...otherSlugs]),
        slugs,
        signal,
      };

      const draft = await this.runPass(
        context,
        'drafting',
        this.config.draftModel,
        buildDraftPrompt(form, catalog),
      );
      const reviewed = await this.runPass(
        context,
        'reviewing',
        this.config.reviewModel,
        buildReviewPrompt(form, catalog, draft),
      );
      this.store.complete(jobId, this.toPlanResult(reviewed, catalog));
    } catch (error) {
      this.failJob(jobId, error);
    }
  }

  private async loadCatalog(
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<ExercisesService['findAll']>>> {
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([this.exercises.findAll(), aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private async runPass(
    context: PassContext,
    stage: PlanJobStage,
    model: string,
    basePrompt: string,
  ): Promise<GeneratedPlan> {
    this.store.setStage(context.jobId, stage);
    let prompt = basePrompt;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_PASS; attempt += 1) {
      const outcome = await this.tryAttempt(
        context,
        stage,
        model,
        prompt,
        attempt,
      );
      if ('plan' in outcome) {
        return outcome.plan;
      }
      prompt = buildRetryPrompt(basePrompt, outcome.issues);
    }
    throw new PipelineFailure('invalid_output');
  }

  private async tryAttempt(
    context: PassContext,
    stage: PlanJobStage,
    model: string,
    prompt: string,
    attempt: number,
  ): Promise<AttemptOutcome> {
    const startedAt = Date.now();
    try {
      const result = await this.modelClient.generate({
        model,
        system: PLAN_SYSTEM_PROMPT,
        prompt,
        schema: context.schema,
        signal: context.signal,
      });
      this.logger.log(
        `Job ${context.jobId} stage=${stage} attempt=${attempt} durationMs=${Date.now() - startedAt} inputTokens=${result.usage.inputTokens} outputTokens=${result.usage.outputTokens} finishReason=${result.finishReason}`,
      );
      const validation = validateGeneratedPlan(
        result.output,
        context.form,
        context.slugs,
      );
      if (validation.ok) {
        return { plan: result.output };
      }
      this.logger.warn(
        `Job ${context.jobId} stage=${stage} attempt=${attempt} validation rejected the plan with ${validation.issues.length} issues`,
      );
      return { issues: validation.issues };
    } catch (error) {
      if (!(error instanceof PlanModelError)) {
        throw error;
      }
      this.logger.warn(
        `Job ${context.jobId} stage=${stage} attempt=${attempt} durationMs=${Date.now() - startedAt} modelError=${error.code} finishReason=${error.finishReason} causeName=${error.causeName ?? 'none'} statusCode=${error.statusCode ?? 'none'}`,
      );
      if (error.code === 'unavailable') {
        throw new PipelineFailure('provider_unavailable');
      }
      return { issues: [SCHEMA_MISMATCH_ISSUE] };
    }
  }

  private toPlanResult(
    plan: GeneratedPlan,
    catalog: readonly CatalogExercise[],
  ): PlanResult {
    const namesBySlug = new Map(
      catalog.map((exercise) => [exercise.slug, exercise.name]),
    );
    return {
      weeks: plan.weeks.map((week) => ({
        week: week.week,
        goal: week.goal,
        sessions: week.sessions.map((session) => ({
          title: session.title,
          exercises: session.exercises.map((exercise) => ({
            ...exercise,
            name: namesBySlug.get(exercise.slug) ?? exercise.slug,
          })),
        })),
      })),
    };
  }

  private failJob(jobId: string, error: unknown): void {
    if (error instanceof PipelineFailure) {
      if (error.code === 'internal') {
        this.logger.error(`Job ${jobId} failed: empty exercise catalog`);
      }
      this.store.fail(jobId, error.code);
      return;
    }
    this.logger.error(
      `Job ${jobId} failed unexpectedly: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'}`,
    );
    this.store.fail(jobId, 'internal');
  }
}
