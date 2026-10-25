import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import { PlanGenerationController } from './plan-generation.controller.js';
import { planFormSchema, type PlanForm } from './plan-form.schema.js';
import type { PlanGenerationConfig } from './plan-generation.config.js';
import { PlanJobStore } from './plan-job.store.js';
import { PlanLimiter } from './plan.limiter.js';
import type { PlanPipelineService } from './plan-pipeline.service.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const user: RequestUser = {
  id: 'profile-1',
  email: 'one@example.com',
  role: 'MEMBER',
};
const otherUser: RequestUser = {
  id: 'profile-2',
  email: 'two@example.com',
  role: 'MEMBER',
};

const form: PlanForm = {
  experience: 'beginner',
  currentFrequency: 2,
  desiredFrequency: 4,
  heightCm: 170,
  weightKg: 65,
  goals: 'Get stronger',
};

const config: PlanGenerationConfig = {
  openAiApiKey: 'sk-test',
  draftModel: 'draft',
  reviewModel: 'review',
  dailyLimit: 2,
};

const setup = () => {
  const store = new PlanJobStore();
  const limiter = new PlanLimiter(store, config);
  const run = vi.fn(() => Promise.resolve());
  const controller = new PlanGenerationController(store, limiter, {
    run,
  } as unknown as PlanPipelineService);
  return { store, limiter, run, controller };
};

const rejectionOf = (action: () => unknown): unknown => {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('PlanGenerationController', () => {
  describe('start', () => {
    it('returns the job id and starts the pipeline with the job id and form', () => {
      const { controller, run, store } = setup();

      const response = controller.start(user, form);

      expect(response).toEqual({ jobId: expect.any(String) });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(response.jobId, form);
      expect(store.get(response.jobId, user.id)).toMatchObject({
        status: 'running',
      });
    });

    it('creates the job for user.id rather than the email', () => {
      const { controller, store } = setup();

      const { jobId } = controller.start(user, form);

      expect(store.get(jobId, user.id)?.ownerId).toBe('profile-1');
      expect(store.get(jobId, user.email)).toBeUndefined();
    });

    it('denies a second start with 429 active_job while the first job runs', () => {
      const { controller, run } = setup();
      controller.start(user, form);

      const error = rejectionOf(() => controller.start(user, form));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toEqual({
        code: 'active_job',
      });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('denies with 429 daily_limit after the limit of finished jobs', () => {
      const { controller, store, run } = setup();
      const first = controller.start(user, form);
      store.fail(first.jobId, 'internal');
      const second = controller.start(user, form);
      store.complete(second.jobId, { weeks: [] });

      const error = rejectionOf(() => controller.start(user, form));

      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).getResponse()).toEqual({
        code: 'daily_limit',
      });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('does not let another user run into the first user limits', () => {
      const { controller } = setup();
      controller.start(user, form);

      expect(controller.start(otherUser, form)).toEqual({
        jobId: expect.any(String),
      });
    });
  });

  describe('body validation', () => {
    const pipe = new ZodValidationPipe(planFormSchema);

    it('rejects a bad body with 400 before the controller runs', () => {
      expect(() => pipe.transform({ ...form, currentFrequency: 9 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getJob', () => {
    it('returns the status, stage, plan and error of the callers own job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'reviewing');

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'running',
        stage: 'reviewing',
        week: null,
        plan: null,
        error: null,
      });
    });

    it('returns the latest started week while the job runs', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.append(jobId, { type: 'week', stage: 'drafting', week: 3 });

      expect(controller.getJob(user, jobId)).toMatchObject({
        stage: 'drafting',
        week: 3,
      });
    });

    it('resets the week when the next stage starts', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.setStage(jobId, 'drafting');
      store.append(jobId, { type: 'week', stage: 'drafting', week: 8 });
      store.setStage(jobId, 'reviewing');

      expect(controller.getJob(user, jobId)).toMatchObject({
        stage: 'reviewing',
        week: null,
      });
    });

    it('returns the plan for a completed job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      const plan = { weeks: [] };
      store.complete(jobId, plan);

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'completed',
        stage: null,
        week: null,
        plan,
        error: null,
      });
    });

    it('returns the error code and no plan for a failed job', () => {
      const { controller, store } = setup();
      const { jobId } = controller.start(user, form);
      store.fail(jobId, 'provider_unavailable');

      expect(controller.getJob(user, jobId)).toEqual({
        status: 'failed',
        stage: null,
        week: null,
        plan: null,
        error: { code: 'provider_unavailable' },
      });
    });

    it('throws NotFoundException for another owners job', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      expect(() => controller.getJob(otherUser, jobId)).toThrow(
        NotFoundException,
      );
    });

    it('throws the same NotFoundException for an unknown job', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);

      const foreign = rejectionOf(() => controller.getJob(otherUser, jobId));
      const unknown = rejectionOf(() => controller.getJob(user, 'no-such-job'));

      expect(unknown).toBeInstanceOf(NotFoundException);
      expect((foreign as NotFoundException).getResponse()).toEqual(
        (unknown as NotFoundException).getResponse(),
      );
    });

    it('keys ownership on user.id, not the email', () => {
      const { controller } = setup();
      const { jobId } = controller.start(user, form);
      const sameEmailOtherId: RequestUser = { ...user, id: 'profile-3' };

      expect(() => controller.getJob(sameEmailOtherId, jobId)).toThrow(
        NotFoundException,
      );
    });
  });
});
