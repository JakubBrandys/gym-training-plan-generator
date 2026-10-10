import { Controller, Get } from '@nestjs/common';
import type { RequestUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('me')
export class MeController {
  @Get()
  getMe(@CurrentUser() user: RequestUser): RequestUser {
    return { id: user.id, email: user.email, role: user.role };
  }
}
