import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdherenceService } from '../adherence/adherence.service';
import { WebAuthenticatedRequest } from '../auth/auth.types';
import { requiredString } from '../common/input';
import { PatientDeviceDataService } from '../devices/patient-device-data.service';
import { WebSessionGuard } from './web-session.guard';
import {
  WEB_SESSION_COOKIE,
  WebSessionService,
  webSessionCookieOptions,
} from './web-session.service';
import { WebPushService } from './web-push.service';

@Controller('web')
export class WebSessionController {
  constructor(
    private readonly sessions: WebSessionService,
    private readonly data: PatientDeviceDataService,
    private readonly adherence: AdherenceService,
    private readonly push: WebPushService,
  ) {}

  @Post('activation')
  @HttpCode(200)
  async activate(
    @Body() body: { activationCode?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (typeof body?.activationCode !== 'string') {
      throw new BadRequestException('Kode aktivasi wajib diisi.');
    }
    const code = requiredString(body.activationCode, 'Kode aktivasi', 32);
    const result = await this.sessions.activate(code, request.ip ?? 'local', {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    response.cookie(
      WEB_SESSION_COOKIE,
      result.token,
      webSessionCookieOptions(new Date(result.session.expiresAt)),
    );
    return {
      patient: result.session.patient,
      expiresAt: result.session.expiresAt,
      push: this.push.publicConfig(),
    };
  }

  @Get('session')
  @UseGuards(WebSessionGuard)
  async session(@Req() request: WebAuthenticatedRequest) {
    const session = request.webSession;
    return {
      sessionId: session.id,
      patient: session.patient,
      expiresAt: session.expiresAt.toISOString(),
      push: this.push.publicConfig(),
      pushSubscriptions: await this.push.subscriptionCount(session.id),
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(WebSessionGuard)
  async logout(
    @Req() request: WebAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.revoke(request.webSession.id);
    response.clearCookie(WEB_SESSION_COOKIE, webSessionCookieOptions());
    return { success: true };
  }

  @Get('me')
  @UseGuards(WebSessionGuard)
  async me(@Req() request: WebAuthenticatedRequest) {
    const patientId = request.webSession.patientId;
    const [sync, progress] = await Promise.all([
      this.data.getSyncData(patientId, { sinceVersion: 0 }),
      this.data.getProgress(patientId),
    ]);
    return {
      ...sync,
      progress,
      session: {
        expiresAt: request.webSession.expiresAt.toISOString(),
      },
    };
  }

  @Post('me/treatments/:treatmentId/adherence')
  @HttpCode(200)
  @UseGuards(WebSessionGuard)
  confirm(
    @Param('treatmentId') treatmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: WebAuthenticatedRequest,
  ) {
    return this.adherence.confirmWeb(
      request.webSession.patientId,
      treatmentId,
      body ?? {},
    );
  }
}
