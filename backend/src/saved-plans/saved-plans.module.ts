import { Module } from '@nestjs/common';
import { PlanGenerationModule } from '../plan-generation/plan-generation.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SavedPlansController } from './saved-plans.controller.js';
import { SavedPlansService } from './saved-plans.service.js';

@Module({
  imports: [PrismaModule, PlanGenerationModule],
  controllers: [SavedPlansController],
  providers: [SavedPlansService],
})
export class SavedPlansModule {}
