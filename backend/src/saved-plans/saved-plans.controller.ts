import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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

export const MAX_PLAN_TITLE_LENGTH = 80;

export const renameBodySchema = z.object({
  title: z
    .string()
    .trim()
    .max(MAX_PLAN_TITLE_LENGTH)
    .refine((value) => !value.includes('\u0000'), {
      message: 'title must not contain NUL characters',
    })
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

type RenameBody = z.infer<typeof renameBodySchema>;

const planIdPipe = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

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
    @Param('id', planIdPipe) id: string,
  ): Promise<SavedPlanView> {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: RequestUser,
    @Param('id', planIdPipe) id: string,
    @Body(new ZodValidationPipe(renameBodySchema)) body: RenameBody,
  ): Promise<SavedPlanSummary> {
    return this.service.rename(user.id, id, body.title);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: RequestUser,
    @Param('id', planIdPipe) id: string,
  ): Promise<void> {
    return this.service.delete(user.id, id);
  }
}
