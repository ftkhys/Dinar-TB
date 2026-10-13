import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { VisitsService } from './visits.service';

@Controller()
@UseGuards(StaffAuthGuard)
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Post('treatments/:treatmentId/visits')
  create(@Param('treatmentId') treatmentId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.visits.create(treatmentId, body, request.user.id);
  }

  @Get('patients/:patientId/visits')
  list(@Param('patientId') patientId: string) {
    return this.visits.listByPatient(patientId);
  }
}
