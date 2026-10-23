import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AuthPrincipal } from './auth.types';

function contextWithUser(user: AuthPrincipal | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows an Admin principal', () => {
    const user: AuthPrincipal = { kind: 'staff', id: 'a', username: 'admin', role: 'Admin', mustChangePassword: false };
    expect(guard.canActivate(contextWithUser(user))).toBe(true);
  });

  it('rejects a Petugas principal', () => {
    const user: AuthPrincipal = { kind: 'staff', id: 'p', username: 'dian', role: 'Petugas', mustChangePassword: false };
    expect(() => guard.canActivate(contextWithUser(user))).toThrow(ForbiddenException);
  });

  it('rejects a device principal or a missing user', () => {
    const device: AuthPrincipal = { kind: 'patient_device', id: 'd', patientId: 'p', version: 1 };
    expect(() => guard.canActivate(contextWithUser(device))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });
});
