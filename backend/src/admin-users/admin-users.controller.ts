import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import {
  AdminUsersService,
  type AdminUserSummary,
} from './admin-users.service.js';

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  list(): Promise<AdminUserSummary[]> {
    return this.service.list();
  }
}
