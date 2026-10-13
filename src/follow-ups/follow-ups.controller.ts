import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { FollowUpsService } from './follow-ups.service';

@Controller('control-schedule/:scheduleId/follow-ups')
@UseGuards(StaffAuthGuard)
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Post()
  create(@Param('scheduleId') scheduleId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.followUps.create(scheduleId, body, request.user.id);
  }

  @Get()
  list(@Param('scheduleId') scheduleId: string) {
    return this.followUps.list(scheduleId);
  }
}
