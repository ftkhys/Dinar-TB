import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { StaffAuthGuard } from './staff-auth.guard';
import { AuthPrincipal } from './auth.types';

function contextFor(request: Record<string, unknown>): { context: ExecutionContext; request: any } {
  const requestWithHeaders = { headers: {}, ...request };
  const context = {
    switchToHttp: () => ({ getRequest: () => requestWithHeaders }),
  } as unknown as ExecutionContext;
  return { context, request: requestWithHeaders };
}

describe('StaffAuthGuard', () => {
  it.each([
    ['missing', undefined],
    ['malformed', 'Basic credentials'],
  ])('rejects %s authorization without authenticating a token', async (_label, authorization) => {
    const authenticate = jest.fn();
    const guard = new StaffAuthGuard({ authenticate } as unknown as AuthService);
    const { context } = contextFor({ headers: authorization ? { authorization } : {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('propagates the authentication failure for an invalid bearer token', async () => {
    const authenticate = jest.fn().mockRejectedValue(new UnauthorizedException('Token tidak valid.'));
    const guard = new StaffAuthGuard({ authenticate } as unknown as AuthService);
    const { context } = contextFor({ headers: { authorization: 'Bearer invalid-token' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).toHaveBeenCalledWith('invalid-token');
  });

  it('rejects an authenticated principal that is not a staff account', async () => {
    const patient: AuthPrincipal = { kind: 'patient_device', id: 'device-1', patientId: 'patient-1', version: 1 };
    const authenticate = jest.fn().mockResolvedValue(patient);
    const guard = new StaffAuthGuard({ authenticate } as unknown as AuthService);
    const { context, request } = contextFor({ headers: { authorization: 'Bearer patient-token' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('authenticates and attaches a staff principal for a protected patient route', async () => {
    const staff: AuthPrincipal = {
      kind: 'staff', id: 'staff-1', username: 'petugas', role: 'Petugas', mustChangePassword: false,
    };
    const authenticate = jest.fn().mockResolvedValue(staff);
    const guard = new StaffAuthGuard({ authenticate } as unknown as AuthService);
    const { context, request } = contextFor({
      method: 'POST', path: '/patients/patient-1/archive',
      headers: { authorization: 'Bearer staff-token' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(staff);
  });

  it('restricts temporary-password staff to the profile and password-change routes', async () => {
    const staff: AuthPrincipal = {
      kind: 'staff', id: 'staff-1', username: 'petugas', role: 'Petugas', mustChangePassword: true,
    };
    const guard = new StaffAuthGuard({ authenticate: jest.fn().mockResolvedValue(staff) } as unknown as AuthService);
    const protectedRoute = contextFor({
      method: 'POST', path: '/patients/patient-1/archive',
      headers: { authorization: 'Bearer staff-token' },
    });
    await expect(guard.canActivate(protectedRoute.context)).rejects.toBeInstanceOf(ForbiddenException);

    for (const [method, path] of [['GET', '/staff/me'], ['POST', '/staff/me/password']]) {
      const allowedRoute = contextFor({ method, path, headers: { authorization: 'Bearer staff-token' } });
      await expect(guard.canActivate(allowedRoute.context)).resolves.toBe(true);
      expect(allowedRoute.request.user).toEqual(staff);
    }
  });
});
