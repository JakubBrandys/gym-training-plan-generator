import { APP_GUARD } from '@nestjs/core';
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedRequest } from '../src/auth/auth-user.js';
import { PLAN_GENERATION_CONFIG } from '../src/plan-generation/plan-generation.config.js';
import { PlanGenerationController } from '../src/plan-generation/plan-generation.controller.js';
import { PlanJobStore } from '../src/plan-generation/plan-job.store.js';
import { PlanPipelineService } from '../src/plan-generation/plan-pipeline.service.js';
import { PlanLimiter } from '../src/plan-generation/plan.limiter.js';

const USER_HEADER = 'x-test-user';

@Injectable()
class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpRequest = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const id = httpRequest.header(USER_HEADER);
    if (!id) {
      throw new UnauthorizedException();
    }
    httpRequest.user = { id, email: `${id}@example.com`, role: 'MEMBER' };
    return true;
  }
}

const validForm = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 4,
  heightCm: 180,
  weightKg: 80,
  goals: 'Build strength',
};

describe('PlanGenerationController (http)', () => {
  let app: INestApplication;
  let pipelineRun: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    pipelineRun = vi.fn(() => new Promise<void>(() => undefined));
    const moduleRef = await Test.createTestingModule({
      controllers: [PlanGenerationController],
      providers: [
        PlanJobStore,
        PlanLimiter,
        {
          provide: PLAN_GENERATION_CONFIG,
          useValue: {
            openAiApiKey: 'sk-test',
            draftModel: 'draft',
            reviewModel: 'review',
            dailyLimit: 5,
          },
        },
        { provide: PlanPipelineService, useValue: { run: pipelineRun } },
        { provide: APP_GUARD, useClass: HeaderUserGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers 202 with a job id and starts the pipeline', async () => {
    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    expect(response.body).toEqual({ jobId: expect.any(String) });
    expect(pipelineRun).toHaveBeenCalledTimes(1);
    expect(pipelineRun).toHaveBeenCalledWith(
      (response.body as { jobId: string }).jobId,
      validForm,
    );
  });

  it('answers 429 with the active_job code while a job is running', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(429);

    expect(response.body).toEqual({ code: 'active_job' });
    expect(pipelineRun).toHaveBeenCalledTimes(1);
  });

  it('does not let one user running job block another user', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);

    await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-2')
      .send(validForm)
      .expect(202);
  });

  it('answers 400 without echoing the rejected value or starting a job', async () => {
    const response = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send({ ...validForm, experience: 'SECRET-REJECTED-VALUE' })
      .expect(400);

    expect(JSON.stringify(response.body)).not.toContain(
      'SECRET-REJECTED-VALUE',
    );
    expect(response.body).toMatchObject({ message: 'Validation failed' });
    expect(pipelineRun).not.toHaveBeenCalled();
  });

  it('answers 401 without a user', async () => {
    await request(app.getHttpServer())
      .post('/plan-generations')
      .send(validForm)
      .expect(401);
  });

  it('returns the running job view to its owner', async () => {
    const started = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);
    const { jobId } = started.body as { jobId: string };

    const response = await request(app.getHttpServer())
      .get(`/plan-generations/${jobId}`)
      .set(USER_HEADER, 'user-1')
      .expect(200);

    expect(response.body).toEqual({
      status: 'running',
      stage: null,
      plan: null,
      error: null,
    });
  });

  it('answers 404 for an unknown job', async () => {
    await request(app.getHttpServer())
      .get('/plan-generations/00000000-0000-4000-8000-000000000000')
      .set(USER_HEADER, 'user-1')
      .expect(404);
  });

  it('answers 404 for a job owned by another user', async () => {
    const started = await request(app.getHttpServer())
      .post('/plan-generations')
      .set(USER_HEADER, 'user-1')
      .send(validForm)
      .expect(202);
    const { jobId } = started.body as { jobId: string };

    await request(app.getHttpServer())
      .get(`/plan-generations/${jobId}`)
      .set(USER_HEADER, 'user-2')
      .expect(404);
  });
});
