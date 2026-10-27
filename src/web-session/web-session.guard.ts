import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebAuthenticatedRequest } from '../auth/auth.types';
import {
  readCookie,
  WEB_SESSION_COOKIE,
  WebSessionService,
} from './web-session.service';

@Injectable()
export class WebSessionGuard implements CanActivate {
  constructor(private readonly sessions: WebSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & WebAuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, WEB_SESSION_COOKIE);
    if (!token) {
      throw new UnauthorizedException(
        'Sesi web diperlukan. Masukkan kode aktivasi.',
      );
    }
    const session = await this.sessions.resolve(token);
    request.webSession = {
      kind: 'patient_web',
      id: session.sessionId,
      patientId: session.patientId,
      patient: session.patient,
      expiresAt: new Date(session.expiresAt),
    };
    return true;
  }
}
