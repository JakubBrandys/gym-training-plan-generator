import type { z } from 'zod';
import type { PlanForm } from '../src/plan-generation/plan-form.schema.js';
import type { PlanJobStage } from '../src/plan-generation/plan-job.store.js';
import {
  PlanModelError,
  type PlanModelClient,
  type PlanModelRequest,
  type PlanModelResult,
} from '../src/plan-generation/plan-model.client.js';
import type { GeneratedPlan } from '../src/plan-generation/plan.schema.js';
import { callValidity } from './eval-metrics.js';
import type { RecordedCall } from './eval-types.js';

export interface RecordingContext {
  stageOf: () => PlanJobStage | null;
  form: PlanForm;
  slugs: readonly string[];
}

const errorCodeOf = (error: unknown): string =>
  error instanceof PlanModelError ? error.code : 'unexpected';

export const createRecordingClient = (
  inner: Pick<PlanModelClient, 'generate'>,
  context: RecordingContext,
) => {
  const calls: RecordedCall[] = [];

  const generate = async <T extends z.ZodType>(
    request: PlanModelRequest<T>,
  ): Promise<PlanModelResult<z.output<T>>> => {
    const stage = context.stageOf();
    const attempt = calls.filter((call) => call.stage === stage).length + 1;
    const startedAt = Date.now();
    let result: PlanModelResult<z.output<T>>;
    try {
      result = await inner.generate(request);
    } catch (error) {
      calls.push({
        stage,
        attempt,
        ok: false,
        issueCount: 0,
        errorCode: errorCodeOf(error),
        finishReason:
          error instanceof PlanModelError ? (error.finishReason ?? null) : null,
        durationMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        output: null,
      });
      throw error;
    }
    const validity = callValidity(
      result.output as GeneratedPlan,
      context.form,
      context.slugs,
    );
    calls.push({
      stage,
      attempt,
      ok: validity.ok,
      issueCount: validity.issueCount,
      errorCode: null,
      finishReason: result.finishReason,
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      output: result.output,
    });
    return result;
  };

  return { calls, client: { generate } };
};
