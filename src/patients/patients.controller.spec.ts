import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../auth/admin.guard';
import { AuthService } from '../auth/auth.service';
import { StaffPrincipal } from '../auth/auth.types';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

const admin: StaffPrincipal = {
  kind: 'staff',
  id: 'admin-1',
  username: 'admin',
  role: 'Admin',
  mustChangePassword: false,
};
const officer: StaffPrincipal = {
  kind: 'staff',
  id: 'staff-1',
  username: 'petugas',
  role: 'Petugas',
  mustChangePassword: false,
};

const destructiveRoutes = [
  { method: 'POST', path: '/patients/patient-1/archive', service: 'archive' },
  { method: 'POST', path: '/patients/patient-1/restore', service: 'restore' },
  { method: 'DELETE', path: '/patients/patient-1/permanent', service: 'purge' },
] as const;

describe('PatientsController destructive routes', () => {
  let app: INestApplication;
  let url: string;
  let patients: Record<(typeof destructiveRoutes)[number]['service'], jest.Mock>;

  beforeAll(async () => {
    patients = {
      archive: jest.fn().mockResolvedValue({ ok: true }),
      restore: jest.fn().mockResolvedValue({ ok: true }),
      purge: jest.fn().mockResolvedValue({ ok: true }),
    };
    const auth = {
      authenticate: jest.fn(async (token: string) => {
        if (token === 'admin-token') return admin;
        if (token === 'officer-token') return officer;
        throw new UnauthorizedException();
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        StaffAuthGuard,
        AdminGuard,
        { provide: AuthService, useValue: auth },
        { provide: PatientsService, useValue: patients },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(destructiveRoutes)('refuses $method $path without a token', async (route) => {
    const response = await fetch(`${url}${route.path}`, { method: route.method });

    expect(response.status).toBe(401);
    expect(patients[route.service]).not.toHaveBeenCalled();
  });

  it.each(destructiveRoutes)('refuses $method $path for Petugas without mutating data', async (route) => {
    const response = await fetch(`${url}${route.path}`, {
      method: route.method,
      headers: { authorization: 'Bearer officer-token' },
    });

    expect(response.status).toBe(403);
    expect(patients[route.service]).not.toHaveBeenCalled();
  });

  it.each(destructiveRoutes)('allows $method $path for Admin', async (route) => {
    const response = await fetch(`${url}${route.path}`, {
      method: route.method,
      headers: { authorization: 'Bearer admin-token' },
    });

    expect([200, 201]).toContain(response.status);
    expect(patients[route.service]).toHaveBeenCalledTimes(1);
  });
});
