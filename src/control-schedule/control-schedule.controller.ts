import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ControlScheduleService } from './control-schedule.service';
import { parsePagination } from '../common/pagination';
import { CONTROL_SCHEDULE_STATUSES, ControlScheduleStatus } from './control-schedule.rules';

/**
 * Management list for the Kontrol menu: all control schedules staff need to
 * manage (not only the ones currently flagged by the alert feed).
 */
@Controller('control-schedules')
@UseGuards(StaffAuthGuard)
export class ControlScheduleListController {
  constructor(private readonly schedules: ControlScheduleService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    if (status && status !== 'Semua' && !CONTROL_SCHEDULE_STATUSES.includes(status as (typeof CONTROL_SCHEDULE_STATUSES)[number])) {
      throw new BadRequestException('Filter status kontrol tidak valid.');
    }
    const statusFilter = status && status !== 'Semua' ? status as ControlScheduleStatus : undefined;
    return this.schedules.listManaged(search, undefined, parsePagination(page ?? '1', pageSize ?? '20')!, statusFilter);
  }
}

@Controller('treatments/:treatmentId/control-schedule')
@UseGuards(StaffAuthGuard)
export class ControlScheduleController {
  constructor(private readonly schedules: ControlScheduleService) {}

  @Get()
  get(@Param('treatmentId') treatmentId: string) {
    return this.schedules.findByTreatment(treatmentId);
  }

  @Post()
  setInitial(@Param('treatmentId') treatmentId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.schedules.setInitial(treatmentId, body, request.user.id);
  }

  @Patch()
  override(@Param('treatmentId') treatmentId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.schedules.override(treatmentId, body, request.user.id);
  }
}
