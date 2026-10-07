import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExercisesService } from './exercises.service.js';

describe('ExercisesService', () => {
  let service: ExercisesService;
  const findMany = vi.fn();

  beforeEach(async () => {
    findMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExercisesService,
        { provide: PrismaService, useValue: { exercise: { findMany } } },
      ],
    }).compile();

    service = module.get<ExercisesService>(ExercisesService);
  });

  describe('findAll', () => {
    it('queries every exercise ordered by slug ascending and returns the rows', async () => {
      const rows = [
        { slug: 'barbell-curl', name: 'Barbell Curl' },
        { slug: 'plank', name: 'Plank' },
      ];
      findMany.mockResolvedValue(rows);

      await expect(service.findAll()).resolves.toBe(rows);
      expect(findMany).toHaveBeenCalledWith({ orderBy: { slug: 'asc' } });
    });
  });
});
