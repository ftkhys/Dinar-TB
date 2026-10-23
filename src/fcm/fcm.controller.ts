import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { FcmService } from './fcm.service';

@Controller('patient/device')
@UseGuards(DeviceAuthGuard)
export class FcmController {
  constructor(private readonly fcm: FcmService) {}

  @Post('fcm-token')
  async registerToken(@Req() request: AuthenticatedRequest, @Body() body: { token: string }) {
    if (!body.token || typeof body.token !== 'string') {
      return { success: false, message: 'Token FCM wajib diisi' };
    }
    await this.fcm.registerFcmToken(request.user.id, body.token);
    return { success: true };
  }
}