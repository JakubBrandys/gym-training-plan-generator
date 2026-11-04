import { BadRequestException } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import {
  MAX_PLAN_TITLE_LENGTH,
  renameBodySchema,
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
  title: null,
};

const setup = () => {
  const save = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const remove = vi.fn();
  const update = vi.fn();
  const controller = new SavedPlansController({
    save,
    list,
    get,
    delete: remove,
    rename: update,
  } as unknown as SavedPlansService);
  return { controller, save, list, get, remove, update };
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

  it('renames for user.id, the path id and the body title', async () => {
    const { controller, update } = setup();
    const renamed = { ...summary, title: 'Cut' };
    update.mockResolvedValue(renamed);

    await expect(
      controller.rename(user, 'saved-1', { title: 'Cut' }),
    ).resolves.toBe(renamed);
    expect(update).toHaveBeenCalledWith('profile-1', 'saved-1', 'Cut');
  });

  it('clears the title for user.id with a null body title', async () => {
    const { controller, update } = setup();
    update.mockResolvedValue(summary);

    await controller.rename(user, 'saved-1', { title: null });

    expect(update).toHaveBeenCalledWith('profile-1', 'saved-1', null);
  });

  it('deletes for user.id and the path id', async () => {
    const { controller, remove } = setup();
    remove.mockResolvedValue(undefined);

    await expect(controller.delete(user, 'saved-1')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('profile-1', 'saved-1');
  });

  it('keys every call on user.id, never the email', async () => {
    const { controller, save, list, get, remove, update } = setup();
    save.mockResolvedValue(summary);
    list.mockResolvedValue([]);
    get.mockResolvedValue(summary);
    remove.mockResolvedValue(undefined);
    update.mockResolvedValue(summary);

    await controller.save(user, { jobId: 'job-1' });
    await controller.list(user);
    await controller.get(user, 'saved-1');
    await controller.rename(user, 'saved-1', { title: 'Cut' });
    await controller.delete(user, 'saved-1');

    for (const call of [save, list, get, remove, update]) {
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

  describe('rename body validation', () => {
    const pipe = new ZodValidationPipe(renameBodySchema);

    it.each([
      ['a string', 'Cut', 'Cut'],
      [
        'an 80-character string',
        'a'.repeat(MAX_PLAN_TITLE_LENGTH),
        'a'.repeat(MAX_PLAN_TITLE_LENGTH),
      ],
      ['null', null, null],
      ['a whitespace-only string', '   ', null],
      ['an empty string', '', null],
      ['a padded string', '  Cut  ', 'Cut'],
    ])('accepts %s', (_label, title, expected) => {
      expect(pipe.transform({ title })).toEqual({ title: expected });
    });

    it('does not count surrounding whitespace toward the length limit', () => {
      const padded = `  ${'a'.repeat(MAX_PLAN_TITLE_LENGTH)}  `;

      expect(pipe.transform({ title: padded })).toEqual({
        title: 'a'.repeat(MAX_PLAN_TITLE_LENGTH),
      });
    });

    it.each([
      ['an 81-character string', { title: 'a'.repeat(81) }],
      ['a string with a NUL character', { title: 'Cut\u0000plan' }],
      ['a number', { title: 5 }],
      ['an array', { title: ['Cut'] }],
      ['a missing title', {}],
      ['an undefined title', { title: undefined }],
      ['a null body', null],
    ])('rejects %s with 400', (_label, body) => {
      expect(() => pipe.transform(body)).toThrow(BadRequestException);
    });
  });
});
