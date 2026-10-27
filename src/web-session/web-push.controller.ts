import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WebAuthenticatedRequest } from '../auth/auth.types';
import { WebSessionGuard } from './web-session.guard';
import { WebPushService } from './web-push.service';

@Controller('web/push')
export class WebPushController {
  constructor(private readonly push: WebPushService) {}

  @Get('key')
  key() {
    return this.push.publicConfig();
  }

  @Post('subscribe')
  @UseGuards(WebSessionGuard)
  @HttpCode(200)
  subscribe(
    @Body() body: Record<string, unknown>,
    @Req() request: WebAuthenticatedRequest,
  ) {
    return this.push.subscribe(
      request.webSession.patientId,
      request.webSession.id,
      body ?? {},
    );
  }

  @Delete('subscribe')
  @UseGuards(WebSessionGuard)
  @HttpCode(200)
  unsubscribe(
    @Body() body: { endpoint?: string },
    @Req() request: WebAuthenticatedRequest,
  ) {
    return this.push.unsubscribe(request.webSession.id, body?.endpoint);
  }

  @Post('test')
  @UseGuards(WebSessionGuard)
  @HttpCode(200)
  test(@Req() request: WebAuthenticatedRequest) {
    return this.push.sendTestToSession(
      request.webSession.patientId,
      request.webSession.id,
    );
  }
}
