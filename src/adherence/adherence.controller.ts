import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AdherenceService } from './adherence.service';

@Controller()
export class AdherenceController {
  constructor(private readonly adherence: AdherenceService) {}

  @Post('patient/sync')
  @UseGuards(DeviceAuthGuard)
  sync(@Body() body: { operations: unknown[] }, @Req() request: AuthenticatedRequest) {
    return this.adherence.sync(request.user.id, body.operations);
  }

  @Post('patient/treatments/:treatmentId/adherence')
  @UseGuards(DeviceAuthGuard)
  confirm(@Param('treatmentId') treatmentId: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.adherence.confirmOnline(request.user.id, treatmentId, body);
  }

  @Get('patient/treatments/:treatmentId/adherence')
  @UseGuards(DeviceAuthGuard)
  getForPatient(@Param('treatmentId') treatmentId: string, @Req() request: AuthenticatedRequest) {
    return this.adherence.getDeviceSummary(request.user.id, treatmentId);
  }

  @Get('treatments/:treatmentId/adherence')
  @UseGuards(StaffAuthGuard)
  getForStaff(@Param('treatmentId') treatmentId: string) {
    return this.adherence.getStaffSummary(treatmentId);
  }
}
