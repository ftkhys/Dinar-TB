import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @UseGuards(StaffAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.staff.profile(request.user.id);
  }

  @UseGuards(StaffAuthGuard)
  @Patch('me')
  updateMe(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.staff.updateProfile(request.user.id, body ?? {});
  }

  @UseGuards(StaffAuthGuard)
  @Post('me/password')
  changePassword(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.staff.changePassword(request.user.id, body ?? {});
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Get('accounts')
  listAccounts(@Req() request: AuthenticatedRequest) {
    return this.staff.listAccounts(request.user.id);
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Post('accounts')
  createAccount(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.staff.createAccount(request.user.id, body ?? {});
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Patch('accounts/:id')
  updateAccount(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.staff.updateAccount(request.user.id, id, body ?? {});
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Post('accounts/:id/reset-password')
  resetPassword(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.staff.resetPassword(request.user.id, id);
  }

  @UseGuards(StaffAuthGuard, AdminGuard)
  @Delete('accounts/:id')
  deleteAccount(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.staff.deleteAccount(request.user.id, id);
  }
}
