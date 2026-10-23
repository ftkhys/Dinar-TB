import { AuthService } from './auth.service';

function queryBuilder(result: unknown) {
  const builder: any = {
    getOne: jest.fn(async () => result),
  };
  for (const method of ['addSelect', 'where', 'andWhere', 'orderBy']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
}

const noopAudit = { record: jest.fn().mockResolvedValue(undefined) };

describe('AuthService password and token handling', () => {
  const auth = new AuthService({} as never, {} as never, noopAudit as never);
  const originalSecret = process.env.AUTH_JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  });

  it('hashes passwords with a per-password salt and verifies them', async () => {
    const first = await auth.hashPassword('example-password');
    const second = await auth.hashPassword('example-password');
    expect(first).not.toBe(second);
    expect(await auth.verifyPassword('example-password', first)).toBe(true);
    expect(await auth.verifyPassword('incorrect-password', first)).toBe(false);
  });

  it('rejects tokens with a changed signature', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32);
    const token = auth.sign({ sub: 'id', kind: 'staff', username: 'operator' }, 60);
    expect(auth.verify(token).kind).toBe('staff');
    // Flip the first character of the signature (full 6 bits), not the last one:
    // the trailing base64url character only carries dropped padding bits, so
    // some different trailing characters decode to the identical signature.
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(() => auth.verify(tampered)).toThrow();
  });

  it('reports an expired token distinctly from an invalid token', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32);
    const expired = auth.sign({ sub: 'id', kind: 'staff', username: 'operator' }, -10);
    expect(() => auth.verify(expired)).toThrow('Token kedaluwarsa.');
    expect(() => auth.verify('not-a-jwt')).toThrow('Token tidak valid.');
  });
});

describe('AuthService staff login activity', () => {
  const originalSecret = process.env.AUTH_JWT_SECRET;
  beforeEach(() => { process.env.AUTH_JWT_SECRET = 'c'.repeat(32); });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  });

  async function authWithAccount(account: Record<string, unknown> | null) {
    const staffRepo = { createQueryBuilder: jest.fn(() => queryBuilder(account)) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(staffRepo as never, {} as never, audit as never);
    return { service, audit };
  }

  it('records exactly one login activity for a successful session', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const passwordHash = await service0.hashPassword('rahasia-kuat');
    const { service, audit } = await authWithAccount({ id: 'staff-dian', username: 'Dian', passwordHash });

    const result = await service.login('Dian', 'rahasia-kuat');

    expect(typeof result.accessToken).toBe('string');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      actorStaffId: 'staff-dian',
      objectType: 'staff_account',
      objectId: 'staff-dian',
      action: 'login',
    });
  });

  it('reports must-change-password for a reset account on login and authenticate', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const passwordHash = await service0.hashPassword('rahasia-kuat');
    const { service } = await authWithAccount({
      id: 'staff-dian', username: 'Dian', passwordHash, mustChangePassword: true,
    });

    const { accessToken, mustChangePassword } = await service.login('Dian', 'rahasia-kuat');

    expect(mustChangePassword).toBe(true);
    await expect(service.authenticate(accessToken)).resolves.toMatchObject({ kind: 'staff', mustChangePassword: true });
  });

  it('defaults must-change-password to false for a normal login', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const passwordHash = await service0.hashPassword('rahasia-kuat');
    const { service } = await authWithAccount({
      id: 'staff-dian', username: 'Dian', passwordHash, mustChangePassword: false,
    });

    await expect(service.login('Dian', 'rahasia-kuat')).resolves.toMatchObject({ mustChangePassword: false });
  });

  it('does not record a login activity when authentication fails', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const passwordHash = await service0.hashPassword('rahasia-kuat');
    const { service, audit } = await authWithAccount({ id: 'staff-dian', username: 'Dian', passwordHash });

    await expect(service.login('Dian', 'salah')).rejects.toThrow();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('accepts a freshly minted staff token for the same password hash', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const passwordHash = await service0.hashPassword('rahasia-kuat');
    const { service } = await authWithAccount({ id: 'staff-dian', username: 'Dian', passwordHash });

    const { accessToken } = await service.login('Dian', 'rahasia-kuat');

    await expect(service.authenticate(accessToken)).resolves.toMatchObject({ kind: 'staff', id: 'staff-dian' });
  });

  it('invalidates a staff session after the password changes', async () => {
    const service0 = new AuthService({} as never, {} as never, noopAudit as never);
    const oldHash = await service0.hashPassword('old-password');
    const newHash = await service0.hashPassword('new-password');
    const sessionSvc = (await authWithAccount({ id: 'staff-dian', username: 'Dian', passwordHash: oldHash })).service;
    const { accessToken } = await sessionSvc.login('Dian', 'old-password');

    const afterChange = (await authWithAccount({ id: 'staff-dian', username: 'Dian', passwordHash: newHash })).service;

    await expect(afterChange.authenticate(accessToken)).rejects.toThrow('Sesi sudah tidak berlaku. Silakan masuk kembali.');
  });
});

describe('AuthService device authentication', () => {
  const originalSecret = process.env.AUTH_JWT_SECRET;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = 'b'.repeat(32);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  });

  function authFor(device: unknown) {
    const activeDevice = device && (device as { deactivatedAt?: Date | null }).deactivatedAt === null
      ? device
      : null;
    const deviceQuery = queryBuilder(activeDevice);
    const devicesRepo = { createQueryBuilder: jest.fn(() => deviceQuery) };
    return { auth: new AuthService({} as never, devicesRepo as never, noopAudit as never), deviceQuery };
  }

  it('returns the device principal when the token version matches', async () => {
    const { auth } = authFor({ id: 'device-1', patientId: 'patient-1', version: 3, deactivatedAt: null });
    const token = auth.sign({ sub: 'device-1', kind: 'patient_device', patientId: 'patient-1', version: 3 }, 60);

    const principal = await auth.authenticate(token);

    expect(principal).toEqual({ kind: 'patient_device', id: 'device-1', patientId: 'patient-1', version: 3 });
  });

  it('rejects a token whose version no longer matches (after re-activation)', async () => {
    const { auth } = authFor({ id: 'device-1', patientId: 'patient-1', version: 4, deactivatedAt: null });
    const staleToken = auth.sign({ sub: 'device-1', kind: 'patient_device', patientId: 'patient-1', version: 3 }, 60);

    await expect(auth.authenticate(staleToken)).rejects.toThrow('Device tidak aktif atau token sudah kedaluwarsa.');
  });

  it('rejects the old device token after archive deactivates its device', async () => {
    const { auth, deviceQuery } = authFor({
      id: 'device-1', patientId: 'patient-1', version: 1, deactivatedAt: new Date(),
    });
    const token = auth.sign({ sub: 'device-1', kind: 'patient_device', patientId: 'patient-1', version: 1 }, 60);

    await expect(auth.authenticate(token)).rejects.toThrow('Device tidak aktif atau token sudah kedaluwarsa.');
    expect(deviceQuery.andWhere).toHaveBeenCalledWith('device.deactivatedAt IS NULL');
  });
});
