import { AdminUsersController } from './admin-users.controller.js';
import type {
  AdminUsersService,
  AdminUserSummary,
} from './admin-users.service.js';

const summary: AdminUserSummary = {
  id: 'profile-1',
  email: 'one@example.com',
  role: 'MEMBER',
  blockedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('AdminUsersController', () => {
  it('returns the service result', async () => {
    const list = vi.fn().mockResolvedValue([summary]);
    const controller = new AdminUsersController({
      list,
    } as unknown as AdminUsersService);

    await expect(controller.list()).resolves.toEqual([summary]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('delegates block to the service with the parsed id and returns its result', async () => {
    const blocked = { ...summary, blockedAt: new Date('2026-04-01T00:00:00Z') };
    const block = vi.fn().mockResolvedValue(blocked);
    const controller = new AdminUsersController({
      block,
    } as unknown as AdminUsersService);

    await expect(controller.block('profile-1')).resolves.toBe(blocked);
    expect(block).toHaveBeenCalledWith('profile-1');
  });
});
