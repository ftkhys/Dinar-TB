import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';

/**
 * Allows the request only when the already-authenticated staff principal is an
 * Admin. Must run after `StaffAuthGuard`, which resolves `request.user` from
 * the database on every request so a role change takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user || user.kind !== 'staff' || user.role !== 'Admin') {
      throw new ForbiddenException('Akses hanya untuk Admin.');
    }
    return true;
  }
}
