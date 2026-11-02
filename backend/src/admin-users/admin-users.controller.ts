import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  @Post(':id/block')
  @HttpCode(200)
  block(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: string,
  ): Promise<AdminUserSummary> {
    return this.service.block(id);
  }
}
