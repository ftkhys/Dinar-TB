import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PatientsService } from './patients.service';

function patientEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-1',
    fullName: 'Siti Nur Afifah',
    registerNumber: '2026-00004647-0014',
    medicalRecordNumber: 'RM-0001',
    address: 'Kec. Cipayung, Jakarta Timur',
    dateOfBirth: '1985-04-17',
    gender: 'Perempuan',
    phone: '081234567890',
    nik: '3175010101010001',
    pmoName: null,
    pmoContact: null,
    createdByStaffId: 'staff-1',
    archivedAt: null,
    version: 1,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createService(resolvedPatient: Record<string, unknown> | null = patientEntity(), queryResults: unknown[] = []) {
  const repository = {
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'patient-1', version: 1, ...value })),
    findOneBy: jest.fn().mockResolvedValue(resolvedPatient),
    createQueryBuilder: jest.fn(),
  };
  const transactionQuery = jest.fn().mockResolvedValue(undefined);
  const transactionSave = jest.fn(async (value: Record<string, unknown>) => ({ ...value }));
  const dataSource = {
    query: jest.fn().mockImplementation(async () => queryResults.shift() ?? []),
    transaction: jest.fn((run: (manager: { query: jest.Mock; save: jest.Mock }) => Promise<unknown>) =>
      run({ query: transactionQuery, save: transactionSave })),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PatientsService(repository as never, dataSource as never, audit as never);
  return { service, repository, dataSource, audit, transactionQuery, transactionSave };
}

describe('PatientsService', () => {
  it('creates a patient with the required identity fields and records audit', async () => {
    const { service, repository, audit } = createService();

    const result = await service.create({
      fullName: '  Siti Nur Afifah  ',
      registerNumber: '2026-00004647-0014',
      medicalRecordNumber: 'RM-0001',
      address: 'Kec. Cipayung, Jakarta Timur',
      dateOfBirth: '1985-04-17',
      gender: 'Perempuan',
      phone: '081234567890',
      nik: '3175010101010001',
    }, 'staff-1');

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Siti Nur Afifah',
      registerNumber: '2026-00004647-0014',
      medicalRecordNumber: 'RM-0001',
      dateOfBirth: '1985-04-17',
      gender: 'Perempuan',
      phone: '081234567890',
      createdByStaffId: 'staff-1',
    }));
    expect(result).not.toHaveProperty('nik');
    expect(result).toMatchObject({ dateOfBirth: '1985-04-17', gender: 'Perempuan', phone: '081234567890' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', objectId: 'patient-1' }));
  });

  it('rejects creation without a medical record number', async () => {
    const { service, repository } = createService();

    await expect(service.create({
      fullName: 'Siti Nur Afifah',
      registerNumber: '2026-00004647-0014',
      address: 'Kec. Cipayung, Jakarta Timur',
    }, 'staff-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid gender and a future date of birth', async () => {
    const { service } = createService();
    await expect(service.create({
      fullName: 'X',
      registerNumber: 'R-1',
      medicalRecordNumber: 'RM-1',
      address: 'Alamat',
      gender: 'Waria',
    }, 'staff-1')).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.create({
      fullName: 'X',
      registerNumber: 'R-1',
      medicalRecordNumber: 'RM-1',
      address: 'Alamat',
      dateOfBirth: '2999-01-01',
    }, 'staff-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a new patient that reuses an existing register number or medical record number', async () => {
    const { service, repository } = createService(patientEntity(), [
      [{ id: 'other', registerNumber: 'R-1', medicalRecordNumber: 'RM-X' }],
    ]);

    await expect(service.create({
      fullName: 'X',
      registerNumber: 'R-1',
      medicalRecordNumber: 'RM-1',
      address: 'Alamat',
    }, 'staff-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('maps a database unique-index race (23505) on create to a 409 conflict', async () => {
    const { service, repository } = createService();
    const driverError: Error & { code?: string } = new Error('duplicate key');
    driverError.code = '23505';
    repository.save.mockRejectedValueOnce(new QueryFailedError('INSERT INTO patients', [], driverError));

    await expect(service.create({
      fullName: 'X',
      registerNumber: 'R-1',
      medicalRecordNumber: 'RM-1',
      address: 'Alamat',
    }, 'staff-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists active patients without leaking NIK and applies the search filter', async () => {
    const getMany = jest.fn().mockResolvedValue([patientEntity()]);
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany,
    };
    const { service, repository } = createService();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll('Siti');

    expect(queryBuilder.where).toHaveBeenCalledWith('patient.archivedAt IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { search: '%Siti%' });
    expect(queryBuilder.take).toHaveBeenCalledWith(500);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('nik');
    expect(result[0]).toMatchObject({ fullName: 'Siti Nur Afifah', medicalRecordNumber: 'RM-0001' });
  });

  it('can include archived patients and omits the search filter when no term is provided', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const { service, repository } = createService();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll('   ', { includeArchived: true });

    expect(queryBuilder.where).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('passes the search term to the directory query and null when blank', async () => {
    const searching = createService(null, [[{ total: 1 }], []]);
    await searching.service.directory('Siti', new Date('2026-10-08T02:00:00.000Z'));
    expect(searching.dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining('ILIKE'), ['%Siti%', '2026-10-08', '2026-10-09', null]);

    const blank = createService(null, [[{ total: 0 }], []]);
    await blank.service.directory('   ', new Date('2026-10-08T02:00:00.000Z'));
    expect(blank.dataSource.query).toHaveBeenNthCalledWith(1, expect.any(String), [null, '2026-10-08', '2026-10-09', null]);
  });

  it('paginates the searched and status-filtered directory and reports the filtered total', async () => {
    const { service, dataSource } = createService(null, [[{ total: '6' }], []]);
    const result = await service.directory('Siti', new Date('2026-10-08T02:00:00.000Z'), { page: 2, pageSize: 5 }, 'Terlambat');

    expect(result).toMatchObject({ items: [], total: 6, page: 2, pageSize: 5, totalPages: 2 });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining("END = $4"), ['%Siti%', '2026-10-08', '2026-10-09', 'Terlambat']);
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT $5 OFFSET $6'), ['%Siti%', '2026-10-08', '2026-10-09', 'Terlambat', 5, 5]);
  });

  it('returns an empty first-page result with zero total pages', async () => {
    const { service } = createService(null, [[{ total: 0 }], []]);
    await expect(service.directory()).resolves.toMatchObject({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  });

  it('restricts findAll to archived rows when archivedOnly is set', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const { service, repository } = createService();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll('Siti', { archivedOnly: true });

    expect(queryBuilder.where).toHaveBeenCalledWith('patient.archivedAt IS NOT NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('patient.anonymizedAt IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { search: '%Siti%' });
  });

  it('derives the directory control status from the current schedule', async () => {
    const { service, dataSource } = createService(null, [[{ total: 1 }], [
      {
        id: 'patient-1',
        fullName: 'Siti Nur Afifah',
        registerNumber: '2026-00004647-0014',
        medicalRecordNumber: 'RM-0001',
        address: 'Kec. Cipayung, Jakarta Timur',
        dateOfBirth: '1985-04-17',
        gender: 'Perempuan',
        phone: '081234567890',
        pmoName: null,
        pmoContact: null,
        createdByStaffId: 'staff-1',
        version: 2,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        archivedAt: null,
        treatmentId: 'treatment-1',
        startDate: '2026-07-01',
        treatmentStage: 'Bulan ke-4',
        completedAt: null,
        scheduledDate: '2026-10-10',
      },
    ]]);

    const rows = await service.directory('', new Date('2026-10-08T02:00:00.000Z'));

    expect(dataSource.query).toHaveBeenCalled();
    expect(rows.items[0]).toMatchObject({
      controlStatus: 'Mendatang',
      treatment: { id: 'treatment-1', startDate: '2026-07-01', treatmentStage: 'Bulan ke-4' },
      schedule: { scheduledDate: '2026-10-10' },
    });
  });

  it('does not expose an active control status or schedule before treatment starts', async () => {
    const { service, dataSource } = createService(null, [[{ total: 1 }], [
      {
        id: 'patient-future', fullName: 'Pasien Masa Depan', registerNumber: 'REG-F',
        medicalRecordNumber: 'RM-F', address: 'Alamat', createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z', version: 1, treatmentId: 'treatment-future',
        startDate: '2026-10-09', treatmentStage: null, completedAt: null,
        lastControlDate: null, lastMedicationDate: null, scheduledDate: '2026-10-10',
      },
    ]]);

    const result = await service.directory(undefined, new Date('2026-10-08T02:00:00.000Z'));

    expect(result.items[0]).toMatchObject({
      treatment: { id: 'treatment-future', startDate: '2026-10-09' },
      schedule: null,
      controlStatus: null,
    });
    expect(dataSource.query.mock.calls[0][0]).toContain('tc.start_date > $2::date THEN NULL');
    expect(dataSource.query.mock.calls[0][1][1]).toBe('2026-10-08');
  });

  it('flags an active treatment without a schedule as needing confirmation', async () => {
    const { service } = createService(null, [[{ total: 1 }], [
      {
        id: 'patient-2',
        fullName: 'Dedi Kurniawan',
        registerNumber: '2026-00004648-0015',
        medicalRecordNumber: 'RM-0002',
        address: 'Kec. Cipayung, Jakarta Timur',
        dateOfBirth: '1990-01-01',
        gender: 'Laki-laki',
        phone: null,
        pmoName: null,
        pmoContact: null,
        createdByStaffId: 'staff-1',
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        archivedAt: null,
        treatmentId: 'treatment-2',
        startDate: '2026-07-01',
        treatmentStage: 'Bulan ke-4',
        completedAt: null,
        scheduledDate: null,
      },
    ]]);

    const rows = await service.directory('', new Date('2026-10-08T02:00:00.000Z'));

    expect(rows.items[0]).toMatchObject({
      controlStatus: 'Perlu Konfirmasi',
      schedule: null,
    });
  });

  it('does not expose a stale schedule from a completed treatment', async () => {
    const { service } = createService(null, [[{ total: 1 }], [
      {
        id: 'patient-3',
        fullName: 'Pasien Selesai',
        registerNumber: '2026-00004649-0016',
        medicalRecordNumber: 'RM-0003',
        address: 'Kec. Cipayung, Jakarta Timur',
        dateOfBirth: null,
        gender: null,
        phone: null,
        pmoName: null,
        pmoContact: null,
        createdByStaffId: 'staff-1',
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        archivedAt: null,
        treatmentId: 'treatment-3',
        startDate: '2026-04-01',
        treatmentStage: 'Bulan ke-6',
        completedAt: '2026-09-30T03:00:00.000Z',
        scheduledDate: '2026-10-10',
      },
    ]]);

    const rows = await service.directory('', new Date('2026-10-08T02:00:00.000Z'));

    expect(rows.items[0]).toMatchObject({
      controlStatus: null,
      schedule: null,
      treatment: { id: 'treatment-3', completedAt: '2026-09-30T03:00:00.000Z' },
    });
  });

  it('returns aggregate card stats', async () => {
    const { service } = createService(null, [[{ total: 12, sesuai: 7, dekat: 4, terlambat: 1 }]]);
    await expect(service.stats()).resolves.toEqual({ total: 12, sesuai: 7, dekat: 4, terlambat: 1 });
  });

  it('returns one active patient without NIK and raises 404 when missing or archived', async () => {
    const found = createService(patientEntity());
    const patient = await found.service.findOne('patient-1');
    expect(patient).toMatchObject({ id: 'patient-1' });
    expect(patient).not.toHaveProperty('nik');

    const missing = createService(null);
    await expect(missing.service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);

    const archived = createService(patientEntity({ archivedAt: new Date() }));
    await expect(archived.service.findOne('patient-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives and restores a patient, deactivating every active device in the archive transaction', async () => {
    const { service, repository, audit, dataSource, transactionQuery, transactionSave } = createService(patientEntity());

    const archived = await service.archive('patient-1', 'staff-1');
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(transactionSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-1', archivedAt: expect.any(Date) }));
    expect(transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE patient_devices'),
      ['patient-1'],
    );
    const archiveSql = String(transactionQuery.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(archiveSql).toContain('deactivated_at = now()');
    expect(archiveSql).toContain('WHERE patient_id = $1 AND deactivated_at IS NULL');
    expect(archiveSql).not.toMatch(/device_id\s*=|LIMIT\s+1/i);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'archived' }));

    repository.findOneBy.mockResolvedValue(patientEntity({ archivedAt: new Date() }));
    const restored = await service.restore('patient-1', 'staff-1');
    expect(restored.archivedAt).toBeNull();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionQuery).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'restored' }));
  });

  it('repairs devices of an already-archived patient without duplicating the audit entry', async () => {
    const { service, audit, transactionQuery, transactionSave } = createService(
      patientEntity({ archivedAt: new Date() }),
    );

    await service.archive('patient-1', 'staff-1');

    expect(transactionSave).not.toHaveBeenCalled();
    expect(transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE patient_devices'),
      ['patient-1'],
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses to permanently delete an active (non-archived) patient', async () => {
    const { service, dataSource, transactionQuery } = createService(patientEntity({ archivedAt: null }));

    await expect(service.purge('patient-1', 'staff-1')).rejects.toBeInstanceOf(ConflictException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(transactionQuery).not.toHaveBeenCalled();
  });

  it('anonymizes an archived patient with clinical history instead of destroying the record', async () => {
    const { service, dataSource, transactionQuery, audit } = createService(
      patientEntity({ archivedAt: new Date() }),
      [[{ treatments: 1, visits: 2, adherences: 0, follow_ups: 0 }]],
    );

    await expect(service.purge('patient-1', 'staff-1')).resolves.toEqual({ id: 'patient-1', mode: 'anonymized' });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const statements = transactionQuery.mock.calls.map((call) => String(call[0]));
    // identifying access artifacts are deleted
    expect(statements.some(sql => sql.includes('DELETE FROM patient_devices'))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE FROM activation_codes'))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE FROM provider_notifications'))).toBe(true);
    // clinical record is preserved
    expect(statements.some(sql => sql.includes('DELETE FROM treatment_courses'))).toBe(false);
    expect(statements.some(sql => sql.includes('DELETE FROM control_visits'))).toBe(false);
    expect(statements.some(sql => sql.includes('DELETE FROM patients'))).toBe(false);
    // identity is erased and the row is marked anonymized
    const update = transactionQuery.mock.calls.find((call) => String(call[0]).includes('UPDATE patients SET'));
    expect(update).toBeDefined();
    expect(String(update![0])).toContain('anonymized_at = now()');
    expect(update![1]).toEqual(['patient-1', 'Pasien Dianonimkan', 'ANON-patient-', '-']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'anonymized', objectId: 'patient-1' }));
    const anonymizedCall = (audit.record as jest.Mock).mock.calls.find((call) => (call[0] as { action: string }).action === 'anonymized');
    expect((anonymizedCall?.[0] as { details?: unknown }).details).toBeUndefined();
  });

  it('does not record an audit action when the purge transaction fails (no partial write)', async () => {
    const { service, transactionQuery, audit } = createService(
      patientEntity({ archivedAt: new Date() }),
      [[{ treatments: 1, visits: 0, adherences: 0, follow_ups: 0 }]],
    );
    transactionQuery.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.purge('patient-1', 'staff-1')).rejects.toThrow('database unavailable');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('permanently deletes an archived patient without clinical history in one transaction', async () => {
    const { service, dataSource, audit, transactionQuery } = createService(
      patientEntity({ archivedAt: new Date() }),
      [[{ treatments: 0, visits: 0, adherences: 0, follow_ups: 0 }]],
    );

    await expect(service.purge('patient-1', 'staff-1')).resolves.toEqual({ id: 'patient-1', mode: 'deleted' });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const statements = transactionQuery.mock.calls.map((call) => String(call[0]));
    expect(statements.some(sql => sql.includes('DELETE FROM treatment_courses'))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE FROM patients'))).toBe(true);
    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM patients'), ['patient-1']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'permanently_deleted',
      objectId: 'patient-1',
      details: JSON.stringify({ patientName: 'Siti Nur Afifah' }),
    }));
  });

  it('treats an anonymized patient as not found even when archived is included', async () => {
    const { service } = createService(patientEntity({ archivedAt: new Date(), anonymizedAt: new Date() }));
    await expect(service.findOne('patient-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not leak NIK when an update carries no changed fields', async () => {
    const { service, repository, audit } = createService(patientEntity({ version: 3 }));

    const result = await service.update('patient-1', { version: 3 }, 'staff-1', 3);

    expect(result).not.toHaveProperty('nik');
    expect(repository.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('updates identity fields (including profile) and records what changed', async () => {
    const { service, repository, audit } = createService(patientEntity());

    const result = await service.update('patient-1', {
      fullName: 'Siti Nur Afifah Baru',
      address: 'Kec. Ciracas, Jakarta Timur',
      gender: 'Laki-laki',
      phone: '081200000000',
      version: 1,
    }, 'staff-1', 1);

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Siti Nur Afifah Baru', version: 1 }));
    expect(result).toMatchObject({ fullName: 'Siti Nur Afifah Baru', gender: 'Laki-laki', phone: '081200000000' });
    expect(result).not.toHaveProperty('nik');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'identity_updated', details: 'fullName,address,gender,phone' }));
  });

  it('blocks updates and rejects a stale version without saving', async () => {
    const { service, repository } = createService(patientEntity({ version: 4 }));

    await expect(service.update('patient-1', { fullName: 'X', version: 1 }, 'staff-1', 1))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();

    const archived = createService(patientEntity({ archivedAt: new Date() }));
    await expect(archived.service.update('patient-1', { fullName: 'X' }, 'staff-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
