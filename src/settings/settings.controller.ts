import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @UseGuards(StaffAuthGuard)
  @Get()
  get() {
    return this.settings.get();
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Put()
  update(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.settings.update(request.user.id, body ?? {});
  }
}
