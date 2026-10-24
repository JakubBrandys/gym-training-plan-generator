import { createOpenAI } from '@ai-sdk/openai';
import { Inject, Injectable } from '@nestjs/common';
import { APICallError, generateText, NoObjectGeneratedError, Output } from 'ai';
import type { z } from 'zod';
import {
  PLAN_GENERATION_CONFIG,
  type PlanGenerationConfig,
} from './plan-generation.config.js';

const MAX_OUTPUT_TOKENS = 32_000;
const CALL_TIMEOUT_MS = 180_000;
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
}

export interface PlanModelResult<TOutput> {
  output: TOutput;
  usage: PlanModelUsage;
  finishReason: string;
}

@Injectable()
export class PlanModelClient {
  private readonly provider: ReturnType<typeof createOpenAI>;

  constructor(@Inject(PLAN_GENERATION_CONFIG) config: PlanGenerationConfig) {
    this.provider = createOpenAI({ apiKey: config.openAiApiKey });
  }

  async generate<T extends z.ZodType>(
    request: PlanModelRequest<T>,
  ): Promise<PlanModelResult<z.output<T>>> {
    try {
      const result = await generateText({
        model: this.provider(request.model),
        system: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        providerOptions: { openai: { reasoningEffort: 'low' } },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: CALL_TIMEOUT_MS,
        maxRetries: SDK_MAX_RETRIES,
        abortSignal: request.signal,
      });
      return {
        output: result.output as z.output<T>,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        },
        finishReason: result.finishReason,
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
