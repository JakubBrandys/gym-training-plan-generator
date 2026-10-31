import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import type { RequestUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../plan-generation/zod-validation.pipe.js';
import {
  SavedPlansService,
  type SavedPlanSummary,
  type SavedPlanView,
} from './saved-plans.service.js';

export const saveBodySchema = z.object({ jobId: z.uuid() });

type SaveBody = z.infer<typeof saveBodySchema>;

@Controller('saved-plans')
export class SavedPlansController {
  constructor(private readonly service: SavedPlansService) {}

  @Post()
  save(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(saveBodySchema)) body: SaveBody,
  ): Promise<SavedPlanSummary> {
    return this.service.save(user.id, body.jobId);
  }

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<SavedPlanSummary[]> {
    return this.service.list(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: RequestUser,
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: string,
  ): Promise<SavedPlanView> {
    return this.service.get(user.id, id);
  }
}
