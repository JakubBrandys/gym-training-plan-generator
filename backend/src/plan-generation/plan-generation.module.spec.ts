import { Test } from '@nestjs/testing';
import { ExercisesService } from '../exercises/exercises.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlanGenerationController } from './plan-generation.controller.js';
import { PlanGenerationModule } from './plan-generation.module.js';
import { PlanPipelineService } from './plan-pipeline.service.js';

const REQUIRED_ENV = {
  OPENAI_API_KEY: 'sk-test',
  PLAN_DRAFT_MODEL: 'draft-model',
  PLAN_REVIEW_MODEL: 'review-model',
};

const compileModule = () =>
  Test.createTestingModule({ imports: [PlanGenerationModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ExercisesService)
    .useValue({ findAll: () => Promise.resolve([]) })
    .compile();

describe('PlanGenerationModule', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('refuses to instantiate with a message naming OPENAI_API_KEY when it is unset', async () => {
    process.env = { ...originalEnv, ...REQUIRED_ENV };
    delete process.env.OPENAI_API_KEY;

    await expect(compileModule()).rejects.toThrow(/OPENAI_API_KEY is not set/);
  });

  it.each(['PLAN_DRAFT_MODEL', 'PLAN_REVIEW_MODEL'])(
    'refuses to instantiate when %s is unset',
    async (name) => {
      process.env = { ...originalEnv, ...REQUIRED_ENV };
      delete process.env[name];

      await expect(compileModule()).rejects.toThrow(
        new RegExp(`${name} is not set`),
      );
    },
  );

  it('instantiates its controller and pipeline when the three required variables are set', async () => {
    process.env = { ...originalEnv, ...REQUIRED_ENV };

    const moduleRef = await compileModule();

    expect(moduleRef.get(PlanGenerationController)).toBeInstanceOf(
      PlanGenerationController,
    );
    expect(moduleRef.get(PlanPipelineService)).toBeInstanceOf(
      PlanPipelineService,
    );
  });
});
