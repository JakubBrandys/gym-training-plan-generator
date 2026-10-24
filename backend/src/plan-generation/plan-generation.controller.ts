import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { planFormSchema, type PlanForm } from './plan-form.schema.js';
import { PlanLimiter } from './plan.limiter.js';
import {
  PlanJobStore,
  type PlanJobErrorCode,
  type PlanJobStage,
  type PlanJobStatus,
} from './plan-job.store.js';
import { PlanPipelineService } from './plan-pipeline.service.js';
import type { PlanResult } from './plan.schema.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export interface PlanJobView {
  status: PlanJobStatus;
  stage: PlanJobStage | null;
  plan: PlanResult | null;
  error: { code: PlanJobErrorCode } | null;
}

@Controller('plan-generations')
export class PlanGenerationController {
  constructor(
    private readonly store: PlanJobStore,
    private readonly limiter: PlanLimiter,
    private readonly pipeline: PlanPipelineService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  start(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(planFormSchema)) form: PlanForm,
  ): { jobId: string } {
    const decision = this.limiter.tryAcquire(user.id, Date.now());
    if (!decision.allowed) {
      throw new HttpException(
        { code: decision.reason },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const job = this.store.create(user.id);
    void this.pipeline.run(job.id, form);
    return { jobId: job.id };
  }

  @Get(':jobId')
  getJob(
    @CurrentUser() user: RequestUser,
    @Param('jobId') jobId: string,
  ): PlanJobView {
    const job = this.store.get(jobId, user.id);
    if (!job) {
      throw new NotFoundException();
    }
    return {
      status: job.status,
      stage: job.stage,
      plan: job.plan,
      error: job.error,
    };
  }
}
