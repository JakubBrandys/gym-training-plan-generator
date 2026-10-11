import { Injectable } from '@nestjs/common';
import { Prisma, type Profile } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: AuthUser): Promise<Profile> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: user.id },
    });
    if (!existing) {
      return this.create(user);
    }
    if (existing.email !== user.email) {
      return this.prisma.profile.update({
        where: { id: user.id },
        data: { email: user.email },
      });
    }
    return existing;
  }

  private async create(user: AuthUser): Promise<Profile> {
    try {
      return await this.prisma.profile.create({
        data: { id: user.id, email: user.email },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return this.prisma.profile.findUniqueOrThrow({
          where: { id: user.id },
        });
      }
      throw e;
    }
  }
}
