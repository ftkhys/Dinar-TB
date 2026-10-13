import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { TreatmentsService } from './treatments.service';

@Controller()
@UseGuards(StaffAuthGuard)
export class TreatmentsController {
  constructor(private readonly treatments: TreatmentsService) {}

  @Post('patients/:patientId/treatments')
  create(@Param('patientId') patientId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.treatments.create(patientId, body, request.user.id);
  }

  @Get('patients/:patientId/treatments')
  list(@Param('patientId') patientId: string) {
    return this.treatments.listByPatient(patientId);
  }

  @Get('treatments/:id')
  get(@Param('id') id: string) {
    return this.treatments.findOne(id);
  }

  @Post('treatments/:id/final-review')
  review(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.treatments.review(id, body, request.user.id);
  }
}
