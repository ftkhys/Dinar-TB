import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { Patient } from '../database/entities/patient.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { addCalendarDays, localTodayJakarta } from '../common/date-rules';
import { ImportsService, validateImportRow } from './imports.service';

const HEADERS = [
  'Nomor Register',
  'Nama Lengkap',
  'Nomor Rekam Medis',
  'Tanggal Lahir',
  'Jenis Kelamin',
  'Nomor Telepon',
  'Alamat',
  'Tanggal Mulai Pengobatan',
  'Tahap Pengobatan',
  'Tanggal Kontrol Terakhir',
  'Tanggal Pemberian Obat Terakhir',
];

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data Pasien');
  sheet.addRow(HEADERS);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function createService(options: { existing?: string[]; savedPatient?: unknown } = {}) {
  const savedPatient = options.savedPatient ?? { id: 'patient-new' };
  const patientRepo: any = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async () => savedPatient),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    })),
  };
  const treatmentRepo = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  };
  const scheduleRepo = {
    findOneBy: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => ({ id: 'schedule-new', version: 1, ...(value as object) })),
  };
  const manager = {
    query: jest.fn(async (): Promise<unknown[]> => []),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Patient) return patientRepo;
      if (entity === TreatmentCourse) return treatmentRepo;
      if (entity === ControlSchedule) return scheduleRepo;
      throw new Error('unexpected entity');
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (m: unknown) => unknown) => callback(manager)),
    query: jest.fn(async (_sql: string, params: unknown[]) => {
      const registers = ((params?.[0] as string[]) ?? []).map((value) => value.trim().toLowerCase());
      const records = ((params?.[1] as string[]) ?? []).map((value) => value.trim().toLowerCase());
      const existing = (options.existing ?? []).map((value) => value.trim().toLowerCase());
      return [
        ...registers.filter((value) => existing.includes(value)).map((value) => ({ registerNumber: value, medicalRecordNumber: '' })),
        ...records.filter((value) => existing.includes(value)).map((value) => ({ registerNumber: '', medicalRecordNumber: value })),
      ];
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const settings = { controlIntervalDays: jest.fn(async () => 14) };
  const eventEmitter = { emit: jest.fn() };
  const service = new ImportsService(dataSource as never, audit as never, settings as never, eventEmitter as never);
  return { service, dataSource, manager, patientRepo, treatmentRepo, scheduleRepo, audit, settings, eventEmitter };
}

describe('validateImportRow', () => {
  it('accepts a complete row and normalizes gender casing', () => {
    const { value, errors } = validateImportRow({
      registerNumber: ' 2026-1 ',
      fullName: 'Siti',
      medicalRecordNumber: 'RM-1',
      dateOfBirth: '1985-04-17',
      gender: 'perempuan',
      phone: '081234567890',
      address: 'Alamat',
      startDate: '2026-10-01',
      treatmentStage: 'Bulan ke-1',
    });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ registerNumber: '2026-1', gender: 'Perempuan', dateOfBirth: '1985-04-17' });
  });

  it('collects every problem for an invalid row', () => {
    const { value, errors } = validateImportRow({
      registerNumber: '',
      fullName: '',
      medicalRecordNumber: '',
      dateOfBirth: '17-04-1985',
      gender: 'X',
      phone: 'abc',
      address: '',
      startDate: 'nope',
    });
    expect(value).toBeNull();
    expect(errors).toEqual(expect.arrayContaining([
      'Nomor Register wajib diisi.',
      'Nama Lengkap wajib diisi.',
      'Nomor Rekam Medis wajib diisi.',
      'Alamat wajib diisi.',
      'Tanggal Lahir harus berformat YYYY-MM-DD.',
      'Jenis Kelamin harus Perempuan atau Laki-laki.',
      'Nomor Telepon tidak valid.',
      'Tanggal Mulai Pengobatan harus berformat YYYY-MM-DD.',
    ]));
  });

  it('accepts a control date with a medication date on or before it', () => {
    const { value, errors } = validateImportRow({
      registerNumber: 'REG-H1',
      fullName: 'Siti',
      medicalRecordNumber: 'RM-H1',
      address: 'Alamat',
      startDate: '2025-01-01',
      lastControlDate: '2025-06-01',
      lastMedicationDate: '2025-05-20',
    });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ lastControlDate: '2025-06-01', lastMedicationDate: '2025-05-20' });
  });

  it('flags a bad history date format', () => {
    const { errors } = validateImportRow({
      registerNumber: 'REG-H2',
      fullName: 'Siti',
      medicalRecordNumber: 'RM-H2',
      address: 'Alamat',
      startDate: '2025-01-01',
      lastControlDate: '01-06-2025',
    });
    expect(errors).toContain('Tanggal Kontrol Terakhir harus berformat YYYY-MM-DD.');
  });

  it('requires a control date when a medication date is provided and rejects medication after control', () => {
    const missingControl = validateImportRow({
      registerNumber: 'REG-H3',
      fullName: 'Siti',
      medicalRecordNumber: 'RM-H3',
      address: 'Alamat',
      startDate: '2025-01-01',
      lastMedicationDate: '2025-05-20',
    });
    expect(missingControl.errors).toContain('Tanggal Kontrol Terakhir wajib diisi bila Tanggal Pemberian Obat Terakhir diisi.');

    const wrongOrder = validateImportRow({
      registerNumber: 'REG-H4',
      fullName: 'Siti',
      medicalRecordNumber: 'RM-H4',
      address: 'Alamat',
      startDate: '2025-01-01',
      lastControlDate: '2025-05-01',
      lastMedicationDate: '2025-05-20',
    });
    expect(wrongOrder.errors).toContain('Tanggal Pemberian Obat Terakhir tidak boleh setelah Tanggal Kontrol Terakhir.');
  });
});

describe('ImportsService.preview', () => {
  it('separates valid, invalid, and duplicate rows and flags existing registers', async () => {
    const buffer = await workbookBuffer([
      ['REG-1', 'Siti', 'RM-1', '1985-04-17', 'Perempuan', '081234567890', 'Alamat 1', '', ''],
      ['REG-2', 'Budi', 'RM-2', '', '', '', 'Alamat 2', '', ''],
      ['', 'Tanpa Register', 'RM-3', '', '', '', 'Alamat 3', '', ''],
      ['REG-1', 'Duplikat di berkas', 'RM-4', '', '', '', 'Alamat 4', '', ''],
    ]);
    const { service } = createService({ existing: ['REG-2'] });

    const preview = await service.preview({ buffer });

    expect(preview.total).toBe(4);
    expect(preview.valid).toBe(1);
    expect(preview.invalid).toBe(1);
    expect(preview.duplicate).toBe(2);
    expect(preview.rows.map((row) => row.status)).toEqual(['valid', 'duplicate', 'invalid', 'duplicate']);
  });

  it('returns the valid rows for confirmation', async () => {
    const buffer = await workbookBuffer([
      ['REG-9', 'Siti', 'RM-9', '1985-04-17', 'Perempuan', '081234567890', 'Alamat', '2026-10-01', 'Bulan ke-1'],
    ]);
    const { service } = createService();

    const preview = await service.preview({ buffer });

    expect(preview.valid).toBe(1);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.validRows[0]).toMatchObject({ registerNumber: 'REG-9', startDate: '2026-10-01' });
  });

  it('rejects a file without the required headers', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').addRow(['Foo', 'Bar']);
    const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const { service } = createService();

    await expect(service.preview({ buffer })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ImportsService.confirm', () => {
  const validRow = {
    registerNumber: 'REG-10',
    fullName: 'Siti',
    medicalRecordNumber: 'RM-10',
    dateOfBirth: '1985-04-17',
    gender: 'Perempuan',
    phone: '081234567890',
    address: 'Alamat',
    startDate: '2026-10-01',
    treatmentStage: 'Bulan ke-1',
  };

  it('imports valid rows in a transaction, creates treatments, and reports per-row results', async () => {
    const { service, manager, treatmentRepo, audit } = createService();

    const result = await service.confirm([validRow], 'staff-1');

    expect(manager.getRepository).toHaveBeenCalled();
    expect(treatmentRepo.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ total: 1, imported: 1, invalid: 0, duplicate: 0, skipped: 0 });
    expect(result.rows[0].status).toBe('imported');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'patient-new', action: 'imported' }));
  });

  it('rejects duplicate registers within the batch and against the database', async () => {
    const { service, manager, patientRepo } = createService();
    manager.query.mockResolvedValue([{ id: 'existing', registerNumber: 'REG-10', medicalRecordNumber: 'RM-OTHER' }]);

    const result = await service.confirm([validRow], 'staff-1');

    expect(result.imported).toBe(0);
    expect(result.duplicate).toBe(1);
    expect(patientRepo.save).not.toHaveBeenCalled();
  });

  it('reports invalid rows without persisting them', async () => {
    const { service, patientRepo } = createService();

    const result = await service.confirm([{ registerNumber: '', fullName: '' }], 'staff-1');

    expect(result.invalid).toBe(1);
    expect(patientRepo.save).not.toHaveBeenCalled();
  });

  it('persists history dates and derives a future schedule without recording a visit', async () => {
    const { service, manager, scheduleRepo, eventEmitter, settings } = createService();
    const today = localTodayJakarta();

    const result = await service.confirm(
      [{ ...validRow, startDate: addCalendarDays(today, -30), lastControlDate: today, lastMedicationDate: today }],
      'staff-1',
    );

    expect(result.imported).toBe(1);
    expect(result.pendingSchedule).toBe(0);
    expect(settings.controlIntervalDays).toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalledWith(ControlSchedule);
    expect(scheduleRepo.save).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('schedule.changed', expect.objectContaining({ newDate: expect.any(String) }));
  });

  it('counts imported courses needing confirmation and stores no past schedule', async () => {
    const { service, scheduleRepo, eventEmitter } = createService();
    const today = localTodayJakarta();

    const result = await service.confirm(
      [{ ...validRow, startDate: addCalendarDays(today, -90), lastControlDate: addCalendarDays(today, -50), lastMedicationDate: addCalendarDays(today, -60) }],
      'staff-1',
    );

    expect(result.imported).toBe(1);
    expect(result.pendingSchedule).toBe(1);
    expect(scheduleRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith('schedule.changed', expect.anything());
  });

  it('does not create a schedule when no medication date is provided', async () => {
    const { service, scheduleRepo } = createService();

    const result = await service.confirm([{ ...validRow, startDate: '2025-01-01', lastControlDate: '2025-06-01' }], 'staff-1');

    expect(result.imported).toBe(1);
    expect(scheduleRepo.save).not.toHaveBeenCalled();
  });

  it('imports at least 50 patients in a single confirmation', async () => {
    const { service } = createService();
    const rows = Array.from({ length: 50 }, (_, index) => ({
      ...validRow,
      registerNumber: `REG-${index}`,
      medicalRecordNumber: `RM-${index}`,
    }));

    const result = await service.confirm(rows, 'staff-1');

    expect(result.total).toBe(50);
    expect(result.imported).toBe(50);
    expect(result.invalid).toBe(0);
    expect(result.duplicate).toBe(0);
  });
});
