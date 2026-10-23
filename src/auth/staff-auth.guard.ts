import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';

/**
 * Routes a staff member with a pending temporary password is still allowed to
 * call: only viewing their own profile and setting a new password. Everything
 * else is refused until the temporary password has been replaced.
 */
const PASSWORD_CHANGE_ALLOWED = [
  { method: 'GET', path: '/staff/me' },
  { method: 'POST', path: '/staff/me/password' },
];

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Token petugas diperlukan.');
    const principal = await this.auth.authenticate(token);
    if (principal.kind !== 'staff') throw new UnauthorizedException('Akses petugas diperlukan.');

    if (principal.mustChangePassword) {
      const path = request.path || request.url?.split('?')[0] || '';
      const allowed = PASSWORD_CHANGE_ALLOWED.some(
        (route) => route.method === request.method && route.path === path.replace(/\/+$/, ''),
      );
      if (!allowed) {
        throw new ForbiddenException('Ganti kata sandi sementara Anda sebelum melanjutkan.');
      }
    }

    request.user = principal;
    return true;
  }
}
