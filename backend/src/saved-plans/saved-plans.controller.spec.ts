import { BadRequestException } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import {
  SavedPlansController,
  saveBodySchema,
} from './saved-plans.controller.js';
import type {
  SavedPlansService,
  SavedPlanSummary,
  SavedPlanView,
} from './saved-plans.service.js';
import { ZodValidationPipe } from '../plan-generation/zod-validation.pipe.js';

const user: RequestUser = {
  id: 'profile-1',
  email: 'one@example.com',
  role: 'MEMBER',
};

const summary: SavedPlanSummary = {
  id: 'saved-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  form: {
    experience: 'beginner',
    currentFrequency: 2,
    desiredFrequency: 4,
    heightCm: 170,
    weightKg: 65,
    goals: 'Get stronger',
  },
};

const setup = () => {
  const save = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const controller = new SavedPlansController({
    save,
    list,
    get,
  } as unknown as SavedPlansService);
  return { controller, save, list, get };
};

describe('SavedPlansController', () => {
  it('saves for user.id and the body job id', async () => {
    const { controller, save } = setup();
    save.mockResolvedValue(summary);

    await expect(controller.save(user, { jobId: 'job-1' })).resolves.toBe(
      summary,
    );
    expect(save).toHaveBeenCalledWith('profile-1', 'job-1');
  });

  it('lists for user.id', async () => {
    const { controller, list } = setup();
    list.mockResolvedValue([summary]);

    await expect(controller.list(user)).resolves.toEqual([summary]);
    expect(list).toHaveBeenCalledWith('profile-1');
  });

  it('gets for user.id and the path id', async () => {
    const { controller, get } = setup();
    const view = { ...summary, plan: { weeks: [] } } satisfies SavedPlanView;
    get.mockResolvedValue(view);

    await expect(controller.get(user, 'saved-1')).resolves.toBe(view);
    expect(get).toHaveBeenCalledWith('profile-1', 'saved-1');
  });

  it('keys every call on user.id, never the email', async () => {
    const { controller, save, list, get } = setup();
    save.mockResolvedValue(summary);
    list.mockResolvedValue([]);
    get.mockResolvedValue(summary);

    await controller.save(user, { jobId: 'job-1' });
    await controller.list(user);
    await controller.get(user, 'saved-1');

    for (const call of [save, list, get]) {
      expect(call.mock.calls[0]).not.toContain(user.email);
      expect(call.mock.calls[0]?.[0]).toBe(user.id);
    }
  });

  describe('body validation', () => {
    const pipe = new ZodValidationPipe(saveBodySchema);

    it('accepts a uuid job id', () => {
      const jobId = '00000000-0000-4000-8000-000000000000';

      expect(pipe.transform({ jobId })).toEqual({ jobId });
    });

    it.each([{}, { jobId: 'not-a-uuid' }, { jobId: 5 }, null])(
      'rejects %j with 400',
      (body) => {
        expect(() => pipe.transform(body)).toThrow(BadRequestException);
      },
    );
  });
});
