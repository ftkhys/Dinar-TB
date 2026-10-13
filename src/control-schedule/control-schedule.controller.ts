import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ControlScheduleService } from './control-schedule.service';

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
