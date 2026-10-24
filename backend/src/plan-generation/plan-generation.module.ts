import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module.js';
import { planGenerationConfigProvider } from './plan-generation.config.js';
import { PlanGenerationController } from './plan-generation.controller.js';
import { PlanJobStore } from './plan-job.store.js';
import { PlanLimiter } from './plan.limiter.js';
import { PlanModelClient } from './plan-model.client.js';
import { PlanPipelineService } from './plan-pipeline.service.js';

@Module({
  imports: [ExercisesModule],
  controllers: [PlanGenerationController],
  providers: [
    planGenerationConfigProvider,
    PlanModelClient,
    PlanJobStore,
    PlanLimiter,
    PlanPipelineService,
  ],
})
export class PlanGenerationModule {}
