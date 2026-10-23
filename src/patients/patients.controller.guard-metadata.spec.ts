import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PatientsController } from './patients.controller';

describe('PatientsController destructive route guards', () => {
  const controller = PatientsController.prototype;
  const routes = ['archive', 'restore', 'purge'] as const;

  it('requires staff authentication at controller level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PatientsController) as Function[];

    expect(guards).toContain(StaffAuthGuard);
  });

  it.each(routes)('keeps AdminGuard on %s', (route) => {
    const handler = controller[route];
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as Function[];

    expect(guards).toContain(AdminGuard);
  });
});
