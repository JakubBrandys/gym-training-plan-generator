import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, type Profile } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfilesService } from './profiles.service.js';

const USER = { id: '6f1c1f0e-7a8b-4c1d-9e2f-0a1b2c3d4e5f', email: 'a@x.com' };

const makeProfile = (overrides: Partial<Profile> = {}): Profile => {
  return {
    id: USER.id,
    email: USER.email,
    role: 'MEMBER',
    blockedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
};

describe('ProfilesService', () => {
  let service: ProfilesService;
  const findUnique = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  beforeEach(async () => {
    for (const fn of [findUnique, findUniqueOrThrow, create, update]) {
      fn.mockReset();
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: PrismaService,
          useValue: {
            profile: { findUnique, findUniqueOrThrow, create, update },
          },
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  describe('resolve', () => {
    it('returns an existing profile without writing', async () => {
      const profile = makeProfile();
      findUnique.mockResolvedValue(profile);

      await expect(service.resolve(USER)).resolves.toBe(profile);
      expect(findUnique).toHaveBeenCalledWith({ where: { id: USER.id } });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('creates the profile when none exists', async () => {
      const created = makeProfile();
      findUnique.mockResolvedValue(null);
      create.mockResolvedValue(created);

      await expect(service.resolve(USER)).resolves.toBe(created);
      expect(create).toHaveBeenCalledWith({
        data: { id: USER.id, email: USER.email },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('updates the email when it changed in the auth provider', async () => {
      const updated = makeProfile({ email: 'new@x.com' });
      findUnique.mockResolvedValue(makeProfile({ email: 'old@x.com' }));
      update.mockResolvedValue(updated);

      await expect(
        service.resolve({ id: USER.id, email: 'new@x.com' }),
      ).resolves.toBe(updated);
      expect(update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { email: 'new@x.com' },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('re-reads the row when a concurrent create hits P2002', async () => {
      const raced = makeProfile();
      findUnique.mockResolvedValue(null);
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: Prisma.prismaVersion.client,
        }),
      );
      findUniqueOrThrow.mockResolvedValue(raced);

      await expect(service.resolve(USER)).resolves.toBe(raced);
      expect(findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: USER.id },
      });
    });

    it('rethrows create errors other than P2002', async () => {
      const failure = new Error('connection lost');
      findUnique.mockResolvedValue(null);
      create.mockRejectedValue(failure);

      await expect(service.resolve(USER)).rejects.toBe(failure);
      expect(findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
