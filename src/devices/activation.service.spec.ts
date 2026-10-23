import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ActivationCode } from '../database/entities/activation-code.entity';
import { Patient } from '../database/entities/patient.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import {
  ACTIVATION_CODE_ALPHABET,
  ACTIVATION_CODE_LENGTH,
  ACTIVATION_CODE_VALIDITY_MS,
  ActivationAttemptLimiter,
  ActivationService,
  generateActivationCode,
  isUuid,
  normalizeActivationCode,
} from './activation.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface QueryTerminal {
  one?: unknown;
  many?: unknown;
}

function queryBuilder(terminal: QueryTerminal = {}) {
  const builder: any = {
    getOne: jest.fn(async () => terminal.one ?? null),
    getMany: jest.fn(async () => terminal.many ?? []),
    execute: jest.fn(async () => ({ affected: 1 })),
  };
  for (const method of [
    'addSelect',
    'setLock',
    'where',
    'andWhere',
    'orderBy',
    'limit',
    'offset',
    'select',
    'from',
    'update',
    'set',
    'delete',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
}

function makeService(options: {
  transactionManager?: unknown;
  devicesRepo?: unknown;
  patientsRepo?: unknown;
  authSign?: jest.Mock;
  audit?: { record: jest.Mock };
}) {
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: unknown) => unknown) => callback(options.transactionManager)),
  };
  const service = new ActivationService(
    {} as never,
    (options.patientsRepo ?? {}) as never,
    (options.devicesRepo ?? {}) as never,
    dataSource as never,
    { sign: options.authSign ?? jest.fn(() => 'access-token') } as never,
    (options.audit ?? { record: jest.fn(async () => undefined) }) as never,
  );
  return { service, dataSource };
}

describe('patient activation requirements', () => {
  it('uses a single-use code validity window of exactly 24 hours', () => {
    expect(ACTIVATION_CODE_VALIDITY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('accepts UUID device identifiers and rejects non-UUID identifiers', () => {
    expect(isUuid('d7b5c1da-60d4-47f3-9786-6162e9714e53')).toBe(true);
    expect(isUuid('patient-1')).toBe(false);
  });
});

describe('activation code format', () => {
  it('generates a grouped 8-character code from the unambiguous alphabet', () => {
    for (let i = 0; i < 25; i += 1) {
      const code = generateActivationCode();
      const groups = code.split('-');
      expect(groups).toHaveLength(2);
      expect(groups.every((group) => group.length === 4)).toBe(true);
      const normalized = normalizeActivationCode(code);
      expect(normalized).toHaveLength(ACTIVATION_CODE_LENGTH);
      for (const char of normalized) expect(ACTIVATION_CODE_ALPHABET).toContain(char);
      expect(normalized).not.toMatch(/[ILO01]/);
    }
  });

  it('normalizes case, spaces and separators so input is forgiving', () => {
    expect(normalizeActivationCode(' k7qp-3rmn ')).toBe('K7QP3RMN');
    expect(normalizeActivationCode('K7QP 3RMN')).toBe('K7QP3RMN');
    expect(normalizeActivationCode('k7qp3rmn')).toBe('K7QP3RMN');
  });
});

describe('ActivationAttemptLimiter', () => {
  it('blocks a client after the configured number of failures in the window', () => {
    const limiter = new ActivationAttemptLimiter(3, 60_000);
    const t0 = 1_000_000;
    expect(limiter.isBlocked('ip', t0)).toBe(false);
    limiter.record('ip', t0);
    limiter.record('ip', t0 + 1);
    expect(limiter.isBlocked('ip', t0 + 2)).toBe(false);
    limiter.record('ip', t0 + 3);
    expect(limiter.isBlocked('ip', t0 + 4)).toBe(true);
  });

  it('forgets attempts that fall outside the window and resets on success', () => {
    const limiter = new ActivationAttemptLimiter(2, 1_000);
    limiter.record('ip', 0);
    limiter.record('ip', 1);
    expect(limiter.isBlocked('ip', 500)).toBe(true);
    expect(limiter.isBlocked('ip', 2_000)).toBe(false);
    limiter.record('ip', 2_001);
    limiter.reset('ip');
    expect(limiter.isBlocked('ip', 2_002)).toBe(false);
  });
});

describe('ActivationService.issueCode', () => {
  function setup(patient: unknown) {
    const patientsRepo = { findOneBy: jest.fn(async () => patient) };
    const updateQb = queryBuilder();
    const codeRepo = {
      createQueryBuilder: jest.fn(() => updateQb),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ActivationCode) return codeRepo;
        throw new Error('unexpected entity');
      }),
    };
    const audit = { record: jest.fn(async () => undefined) };
    const { service } = makeService({ transactionManager: manager, patientsRepo, audit });
    return { service, updateQb, codeRepo, audit };
  }

  it('cancels the patient previous unused codes inside a transaction', async () => {
    const { service, updateQb, codeRepo, audit } = setup({ id: 'patient-1' });

    const result = await service.issueCode('patient-1', 'staff-1');

    expect(result.activationCode).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
    expect(updateQb.set).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
    expect(updateQb.where).toHaveBeenCalledWith(
      'patient_id = :patientId AND used_at IS NULL',
      { patientId: 'patient-1' },
    );
    expect(updateQb.execute).toHaveBeenCalled();
    expect(codeRepo.save).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'issued' }));
  });

  it('rejects unknown patients without issuing a code', async () => {
    const { service, codeRepo } = setup(null);
    await expect(service.issueCode('missing', 'staff-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(codeRepo.save).not.toHaveBeenCalled();
  });
});

describe('ActivationService.activate', () => {
  const deviceIdentifier = '11111111-1111-4111-8111-111111111111';
  const validCode = { id: 'code-1', patientId: 'patient-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000) };

  function setup(options: {
    codeRow: unknown;
    patient?: unknown;
    sameDevice?: unknown;
    savedDevice?: unknown;
    authSign?: jest.Mock;
  }) {
    const codeQb = queryBuilder({ one: options.codeRow });
    const patientQb = queryBuilder({ one: options.patient ?? { id: 'patient-1' } });
    const deviceQb = queryBuilder();
    const deviceRepo = {
      findOneBy: jest.fn(async () => options.sameDevice ?? null),
      findOneByOrFail: jest.fn(async () => options.savedDevice ?? { id: 'device-1', version: 2 }),
      createQueryBuilder: jest.fn(() => deviceQb),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async () => options.savedDevice ?? { id: 'device-1', version: 1 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ActivationCode) return { createQueryBuilder: jest.fn(() => codeQb) };
        if (entity === Patient) return { createQueryBuilder: jest.fn(() => patientQb) };
        if (entity === PatientDevice) return deviceRepo;
        throw new Error('unexpected entity');
      }),
      save: jest.fn(async (value: unknown) => value),
    };
    const audit = { record: jest.fn(async () => undefined) };
    const authSign = options.authSign ?? jest.fn(() => 'access-token');
    const { service } = makeService({ transactionManager: manager, authSign, audit });
    return { service, deviceQb, deviceRepo, manager, authSign, audit };
  }

  it('activates a new device and returns credential and token', async () => {
    const codeRow = { ...validCode };
    const { service, deviceQb, deviceRepo, manager, authSign } = setup({ codeRow });

    const result = await service.activate('CODE-123', deviceIdentifier);

    expect(result.deviceId).toBe('device-1');
    expect(result.deviceCredential).toEqual(expect.any(String));
    expect(result.deviceCredential.length).toBeGreaterThan(0);
    expect(result.accessToken).toBe('access-token');
    expect(authSign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'patient_device', patientId: 'patient-1' }),
      30 * 24 * 60 * 60,
    );
    expect(codeRow.usedAt).not.toBeNull();
    expect(manager.save).toHaveBeenCalledWith(codeRow);
    expect(deviceRepo.save).toHaveBeenCalledTimes(1);
    // deactivates any currently active device for the patient first
    expect(deviceQb.set).toHaveBeenCalledWith({ deactivatedAt: expect.any(Date) });
  });

  it.each([
    ['missing', null],
    ['already used', { ...validCode, usedAt: new Date() }],
    ['expired', { ...validCode, expiresAt: new Date(Date.now() - 1000) }],
  ])('rejects a %s activation code', async (_label, codeRow) => {
    const { service } = setup({ codeRow });
    await expect(service.activate('CODE', deviceIdentifier)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the device is already linked to another patient', async () => {
    const { service } = setup({
      codeRow: { ...validCode },
      sameDevice: { id: 'device-1', patientId: 'other-patient', version: 1 },
    });
    await expect(service.activate('CODE', deviceIdentifier)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rotates the credential and bumps the version when the same device re-activates', async () => {
    const { service, deviceQb } = setup({
      codeRow: { ...validCode },
      sameDevice: { id: 'device-1', patientId: 'patient-1', version: 4 },
      savedDevice: { id: 'device-1', version: 5 },
    });

    const result = await service.activate('CODE', deviceIdentifier);

    const rotationSet: any[] = deviceQb.set.mock.calls.map((call: any[]) => call[0]);
    const versioned = rotationSet.find((value: any) => typeof value.version === 'function');
    expect(versioned).toBeDefined();
    expect(versioned.version()).toBe('version + 1');
    expect(result.accessToken).toBe('access-token');
    expect(result.deviceId).toBe('device-1');
  });
});

describe('ActivationService.refresh', () => {
  function setup(device: unknown) {
    const deviceQb = queryBuilder({ one: device });
    const devicesRepo = { createQueryBuilder: jest.fn(() => deviceQb) };
    const authSign = jest.fn(() => 'refreshed-token');
    const { service } = makeService({ devicesRepo, authSign });
    return { service, authSign };
  }

  it('issues a new access token for a valid credential', async () => {
    const { service, authSign } = setup({
      id: 'device-1',
      patientId: 'patient-1',
      version: 3,
      deactivatedAt: null,
      credentialHash: sha256('correct-credential'),
    });

    const result = await service.refresh('device-1', 'correct-credential');

    expect(result.accessToken).toBe('refreshed-token');
    expect(authSign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'device-1', kind: 'patient_device', patientId: 'patient-1', version: 3 }),
      30 * 24 * 60 * 60,
    );
  });

  it('rejects an incorrect credential', async () => {
    const { service } = setup({
      id: 'device-1',
      patientId: 'patient-1',
      version: 3,
      deactivatedAt: null,
      credentialHash: sha256('correct-credential'),
    });
    await expect(service.refresh('device-1', 'wrong-credential')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a deactivated or unknown device without leaking details', async () => {
    const { service } = setup(null);
    await expect(service.refresh('device-1', 'anything')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
