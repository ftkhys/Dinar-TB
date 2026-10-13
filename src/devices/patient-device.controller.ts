import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { PatientDeviceDataService } from './patient-device-data.service';

@Controller('patient')
@UseGuards(DeviceAuthGuard)
export class PatientDeviceController {
  constructor(private readonly data: PatientDeviceDataService) {}

  @Get('me')
  get(@Req() request: AuthenticatedRequest) {
    return this.data.getCurrentData(request.user.id);
  }
}
