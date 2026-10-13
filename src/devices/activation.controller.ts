import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { isUuid, ActivationService } from './activation.service';

@Controller()
export class ActivationController {
  constructor(private readonly activation: ActivationService) {}

  @Post('patients/:patientId/activation-codes')
  @UseGuards(StaffAuthGuard)
  issue(@Param('patientId') patientId: string, @Req() request: AuthenticatedRequest) {
    return this.activation.issueCode(patientId, request.user.id);
  }

  @Post('activation/activate')
  activate(@Body() body: { activationCode: string; deviceIdentifier: string }) {
    if (!body.activationCode || !body.deviceIdentifier || !isUuid(body.deviceIdentifier)) {
      throw new BadRequestException('Kode aktivasi dan deviceIdentifier UUID wajib diisi.');
    }
    return this.activation.activate(body.activationCode, body.deviceIdentifier);
  }

  @Post('activation/refresh')
  refresh(@Body() body: { deviceId: string; deviceCredential: string }) {
    if (!body.deviceId || !isUuid(body.deviceId) || !body.deviceCredential) {
      throw new BadRequestException('deviceId dan deviceCredential wajib diisi.');
    }
    return this.activation.refresh(body.deviceId, body.deviceCredential);
  }
}
