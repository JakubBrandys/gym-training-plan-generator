import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { RequestUser } from './auth-user.js';
import { AdminGuard } from './admin.guard.js';

const makeContext = (
  user?: RequestUser,
  urls = { url: '/admin/users', originalUrl: '/admin/users' },
): ExecutionContext => {
  const request = { method: 'GET', ...urls, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

const memberUser = (email: string): RequestUser => ({
  id: 'profile-1',
  email,
  role: 'MEMBER',
});

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows a request whose user has the ADMIN role', () => {
    const admin: RequestUser = {
      id: 'profile-1',
      email: 'owner@example.com',
      role: 'ADMIN',
    };

    expect(guard.canActivate(makeContext(admin))).toBe(true);
  });

  it('answers a MEMBER exactly like an unknown route', () => {
    const attempt = () =>
      guard.canActivate(makeContext(memberUser('member@example.com')));

    expect(attempt).toThrow(NotFoundException);
    expect(attempt).toThrow('Cannot GET /admin/users');
  });

  it('echoes the original url like the unmatched-route 404 does', () => {
    const context = makeContext(memberUser('member@example.com'), {
      url: '/users',
      originalUrl: '/api/admin/users',
    });

    expect(() => guard.canActivate(context)).toThrow(
      'Cannot GET /api/admin/users',
    );
  });

  it('denies a MEMBER whose email looks like an admin address', () => {
    expect(() =>
      guard.canActivate(makeContext(memberUser('admin@example.com'))),
    ).toThrow(NotFoundException);
  });

  it('denies a request without a user', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(NotFoundException);
  });
});
