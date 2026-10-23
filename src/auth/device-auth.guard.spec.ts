import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthPrincipal } from './auth.types';
import { DeviceAuthGuard } from './device-auth.guard';

function contextWithAuthorization(authorization?: string): { context: ExecutionContext; request: any } {
  const request: any = { headers: authorization ? { authorization } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('DeviceAuthGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const guard = new DeviceAuthGuard({ authenticate: jest.fn() } as never);
    await expect(guard.canActivate(contextWithAuthorization().context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid token that is not a patient device', async () => {
    const principal: AuthPrincipal = { kind: 'staff', id: 'staff-1', username: 'operator', role: 'Petugas', mustChangePassword: false };
    const guard = new DeviceAuthGuard({ authenticate: jest.fn(async () => principal) } as never);
    await expect(guard.canActivate(contextWithAuthorization('Bearer staff-token').context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a patient device token and attaches the principal', async () => {
    const principal: AuthPrincipal = { kind: 'patient_device', id: 'device-1', patientId: 'patient-1', version: 2 };
    const guard = new DeviceAuthGuard({ authenticate: jest.fn(async () => principal) } as never);
    const { context, request } = contextWithAuthorization('Bearer device-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(principal);
  });
});
