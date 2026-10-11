import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MeController } from './me.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MeController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
