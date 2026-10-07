import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ExercisesService } from './exercises.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ExercisesService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
