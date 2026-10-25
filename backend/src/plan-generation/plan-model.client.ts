import { createOpenAI } from '@ai-sdk/openai';
import { Inject, Injectable } from '@nestjs/common';
import { APICallError, NoObjectGeneratedError, Output, streamText } from 'ai';
import type { z } from 'zod';
import {
  PLAN_GENERATION_CONFIG,
  type PlanGenerationConfig,
} from './plan-generation.config.js';
import { WEEK_COUNT } from './plan.validator.js';

const MAX_OUTPUT_TOKENS = 32_000;
const CALL_TIMEOUT_MS = 180_000;
const FIRST_CHUNK_TIMEOUT_MS = 120_000;
const CHUNK_TIMEOUT_MS = 45_000;
const SDK_MAX_RETRIES = 1;

export type PlanModelErrorCode = 'invalid_output' | 'unavailable';

export class PlanModelError extends Error {
  constructor(
    readonly code: PlanModelErrorCode,
    readonly finishReason?: string,
    readonly causeName?: string,
    readonly statusCode?: number,
  ) {
    super(`Plan model call failed: ${code}`);
    this.name = 'PlanModelError';
  }
}

export interface PlanModelUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

export interface PlanModelRequest<T extends z.ZodType> {
  model: string;
  system: string;
  prompt: string;
  schema: T;
  signal: AbortSignal;
  onPartial?: (startedWeeks: number) => void;
}

export interface PlanModelResult<TOutput> {
  output: TOutput;
  usage: PlanModelUsage;
  finishReason: string;
}

const countStartedWeeks = (partial: unknown): number => {
  const weeks = (partial as { weeks?: unknown } | null | undefined)?.weeks;
  return Array.isArray(weeks) ? Math.min(weeks.length, WEEK_COUNT) : 0;
};

@Injectable()
export class PlanModelClient {
  private readonly provider: ReturnType<typeof createOpenAI>;

  constructor(@Inject(PLAN_GENERATION_CONFIG) config: PlanGenerationConfig) {
    this.provider = createOpenAI({ apiKey: config.openAiApiKey });
  }

  async generate<T extends z.ZodType>(
    request: PlanModelRequest<T>,
  ): Promise<PlanModelResult<z.output<T>>> {
    const streamErrors: unknown[] = [];
    try {
      const result = streamText({
        model: this.provider(request.model),
        system: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        providerOptions: { openai: { reasoningEffort: 'low' } },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: {
          totalMs: CALL_TIMEOUT_MS,
          firstChunkMs: FIRST_CHUNK_TIMEOUT_MS,
          chunkMs: CHUNK_TIMEOUT_MS,
        },
        maxRetries: SDK_MAX_RETRIES,
        abortSignal: request.signal,
        onError: ({ error }) => {
          streamErrors.push(error);
        },
      });
      let reportedWeeks = 0;
      for await (const partial of result.partialOutputStream) {
        const startedWeeks = countStartedWeeks(partial);
        if (startedWeeks > reportedWeeks) {
          reportedWeeks = startedWeeks;
          request.onPartial?.(startedWeeks);
        }
      }
      if (streamErrors.length > 0) {
        throw streamErrors[0];
      }
      const output = await result.output;
      const usage = await result.usage;
      const finishReason = await result.finishReason;
      return {
        output: output as z.output<T>,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
        finishReason,
      };
    } catch (error) {
      const causeName = error instanceof Error ? error.name : undefined;
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new PlanModelError(
          'invalid_output',
          error.finishReason,
          causeName,
        );
      }
      throw new PlanModelError(
        'unavailable',
        undefined,
        causeName,
        APICallError.isInstance(error) ? error.statusCode : undefined,
      );
    }
  }
}
