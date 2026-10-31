import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
import {
  isTerminalProgressEvent,
  type PlanProgressEvent,
} from './plan-progress.js';
import {
  PLAN_STREAM_CONFIG,
  type PlanStreamConfig,
} from './plan-stream.config.js';
import type { PlanResult } from './plan.schema.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export interface PlanJobView {
  status: PlanJobStatus;
  stage: PlanJobStage | null;
  week: number | null;
  plan: PlanResult | null;
  error: { code: PlanJobErrorCode } | null;
}

const parseLastEventId = (raw: string | undefined): number => {
  const trimmed = raw?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return 0;
  }
  const id = Number(trimmed);
  return Number.isSafeInteger(id) ? id : 0;
};

const toEventFrame = (event: PlanProgressEvent): string =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const CONNECTED_FRAME = ': connected\n\n';
const HEARTBEAT_FRAME = ': heartbeat\n\n';
const RECONNECT_FRAME = 'event: reconnect\ndata: {}\n\n';

type StreamCloseReason =
  'terminal' | 'window' | 'client-disconnect' | 'job-finished';

@Controller('plan-generations')
export class PlanGenerationController {
  private readonly logger = new Logger(PlanGenerationController.name);

  constructor(
    private readonly store: PlanJobStore,
    private readonly limiter: PlanLimiter,
    private readonly pipeline: PlanPipelineService,
    @Inject(PLAN_STREAM_CONFIG) private readonly streamConfig: PlanStreamConfig,
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
    const job = this.store.create(user.id, form);
    void this.pipeline.run(job.id, form);
    return { jobId: job.id };
  }

  @Get(':jobId/events')
  streamEvents(
    @CurrentUser() user: RequestUser,
    @Param('jobId') jobId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() response: Response,
  ): void {
    const afterId = parseLastEventId(lastEventId);
    let openedAt = 0;
    let closed = false;
    let opened = false;
    let unsubscribe: (() => void) | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let windowTimer: NodeJS.Timeout | undefined;

    const open = (): void => {
      if (opened) {
        return;
      }
      opened = true;
      response.writeHead(HttpStatus.OK, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
    };

    const send = (frame: string): void => {
      open();
      response.write(frame);
    };

    const close = (reason: StreamCloseReason): void => {
      if (closed) {
        return;
      }
      closed = true;
      this.logger.log(
        `Job ${jobId} stream closed reason=${reason} durationMs=${Date.now() - openedAt}`,
      );
      clearInterval(heartbeat);
      clearTimeout(windowTimer);
      unsubscribe?.();
      if (!response.writableEnded) {
        response.end();
      }
    };

    if (!this.store.get(jobId, user.id)) {
      this.logger.warn('Stream rejected reason=not-found');
      throw new NotFoundException();
    }

    if (
      this.store.subscriberCount(jobId, user.id) >=
      this.streamConfig.maxStreamsPerJob
    ) {
      this.logger.warn(`Job ${jobId} stream rejected reason=too-many-streams`);
      throw new HttpException(
        { code: 'too_many_streams' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const onClientClose = (): void => {
      close('client-disconnect');
    };
    response.once('close', onClientClose);
    openedAt = Date.now();
    this.logger.log(`Job ${jobId} stream opened lastEventId=${afterId}`);

    unsubscribe = this.store.subscribe(jobId, user.id, afterId, (event) => {
      if (closed) {
        return;
      }
      send(toEventFrame(event));
      if (isTerminalProgressEvent(event)) {
        close('terminal');
      }
    });

    if (!unsubscribe) {
      response.off('close', onClientClose);
      throw new NotFoundException();
    }
    if (closed) {
      unsubscribe();
      return;
    }

    if (!opened) {
      send(CONNECTED_FRAME);
    }
    if (this.store.get(jobId, user.id)?.status !== 'running') {
      close('job-finished');
      return;
    }
    heartbeat = setInterval(() => {
      send(HEARTBEAT_FRAME);
    }, this.streamConfig.heartbeatMs);
    windowTimer = setTimeout(() => {
      send(RECONNECT_FRAME);
      close('window');
    }, this.streamConfig.windowMs);
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
      week: job.week,
      plan: job.plan,
      error: job.error,
    };
  }
}
