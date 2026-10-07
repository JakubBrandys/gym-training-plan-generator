import { Injectable } from '@nestjs/common';
import type { Exercise } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Exercise[]> {
    return this.prisma.exercise.findMany({ orderBy: { slug: 'asc' } });
  }
}
