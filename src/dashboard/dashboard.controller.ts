import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(StaffAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }

  @Get('activities')
  activities(@Req() request: AuthenticatedRequest) {
    return this.dashboard.activities(undefined, request.user.id);
  }

  @Get('notifications')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.dashboard.notifications(request.user.id);
  }

  @Post('notifications/read')
  markRead(@Body() body: { seenAt?: string }, @Req() request: AuthenticatedRequest) {
    return this.dashboard.markActivitiesRead(request.user.id, body?.seenAt);
  }

  @Get('export.xlsx')
  async export(@Res() response: Response): Promise<void> {
    const { filename, buffer } = await this.dashboard.exportSummary();
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }
}
