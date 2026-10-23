import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { PatientDeviceDataService, SyncParams } from './patient-device-data.service';

@Controller('patient')
@UseGuards(DeviceAuthGuard)
export class PatientDeviceController {
  constructor(private readonly data: PatientDeviceDataService) {}

  @Get('me')
  get(@Req() request: AuthenticatedRequest) {
    return this.data.getCurrentData(this.patientId(request));
  }

  @Get('me/progress')
  progress(@Req() request: AuthenticatedRequest) {
    return this.data.getProgress(this.patientId(request));
  }

  @Get('me/sync')
  sync(@Req() request: AuthenticatedRequest, @Query() query: SyncParams) {
    return this.data.getSyncData(this.patientId(request), query);
  }

  private patientId(request: AuthenticatedRequest): string {
    if (request.user.kind !== 'patient_device') {
      throw new UnauthorizedException('Akses device diperlukan.');
    }
    return request.user.patientId;
  }
}
