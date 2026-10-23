import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, QueryFailedError } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AuditLogService } from '../common/audit-log.service';
import { addCalendarMonths, isDateOnly, localTodayJakarta } from '../common/date-rules';
import { findIdentityConflict, normalizeIdentity } from '../common/patient-match';
import { applyMedicationSchedule, AppliedScheduleChange } from '../control-schedule/schedule-apply';import { Patient } from '../database/entities/patient.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { PATIENT_GENDERS } from '../patients/patients.service';
import { SettingsService } from '../settings/settings.service';

export const IMPORT_MAX_ROWS = 1000;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,32}$/;

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate' | 'imported' | 'skipped';

export type ImportPatientRow = {
  registerNumber: string;
  fullName: string;
  medicalRecordNumber: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string;
  startDate: string | null;
  treatmentStage: string | null;
  lastControlDate: string | null;
  lastMedicationDate: string | null;
};

export type ImportRowResult = {
  rowNumber: number;
  registerNumber: string | null;
  fullName: string | null;
  status: ImportRowStatus;
  errors: string[];
};

export type ImportPreview = {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  rows: ImportRowResult[];
  validRows: ImportPatientRow[];
};

export type ImportConfirmResult = {
  total: number;
  imported: number;
  invalid: number;
  duplicate: number;
  skipped: number;
  /** Imported courses whose computed schedule is in the past: staff must confirm. */
  pendingSchedule: number;
  rows: ImportRowResult[];
};

const HEADER_ALIASES: Record<string, keyof ImportPatientRow> = {
  'nomor register': 'registerNumber',
  'no register': 'registerNumber',
  'register': 'registerNumber',
  'nama lengkap': 'fullName',
  'nama': 'fullName',
  'nama pasien': 'fullName',
  'nomor rekam medis': 'medicalRecordNumber',
  'no rekam medis': 'medicalRecordNumber',
  'rekam medis': 'medicalRecordNumber',
  'tanggal lahir': 'dateOfBirth',
  'jenis kelamin': 'gender',
  'nomor telepon': 'phone',
  'no telepon': 'phone',
  'telepon': 'phone',
  'alamat': 'address',
  'tanggal mulai pengobatan': 'startDate',
  'mulai pengobatan': 'startDate',
  'tahap pengobatan': 'treatmentStage',
  'tanggal kontrol terakhir': 'lastControlDate',
  'kontrol terakhir': 'lastControlDate',
  'tanggal pemberian obat terakhir': 'lastMedicationDate',
  'pemberian obat terakhir': 'lastMedicationDate',
  'obat terakhir': 'lastMedicationDate',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  if (typeof value === 'object') {
    const record = value as { richText?: Array<{ text?: string }>; text?: unknown; result?: unknown; hyperlink?: unknown };
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text ?? '').join('').trim();
    if (record.result !== undefined) return cellText(record.result);
    if (record.text !== undefined) return String(record.text).trim();
    if (record.hyperlink !== undefined) return String(record.hyperlink).trim();
  }
  return String(value).trim();
}

function parseDate(value: unknown, label: string, errors: string[], required = false): string | null {
  const text = cellText(value);
  if (!text) {
    if (required) errors.push(`${label} wajib diisi.`);
    return null;
  }
  if (!isDateOnly(text)) {
    errors.push(`${label} harus berformat YYYY-MM-DD.`);
    return null;
  }
  return text;
}

/** Validates a single normalized row and returns every problem found. */
export function validateImportRow(raw: Record<string, unknown>): { value: ImportPatientRow | null; errors: string[] } {
  const errors: string[] = [];
  const text = (value: unknown, max: number, label: string, required: boolean): string => {
    const value2 = cellText(value);
    if (!value2) {
      if (required) errors.push(`${label} wajib diisi.`);
      return '';
    }
    if (value2.length > max) errors.push(`${label} maksimal ${max} karakter.`);
    return value2;
  };

  const registerNumber = text(raw.registerNumber, 100, 'Nomor Register', true);
  const fullName = text(raw.fullName, 200, 'Nama Lengkap', true);
  const medicalRecordNumber = text(raw.medicalRecordNumber, 100, 'Nomor Rekam Medis', true);
  const address = text(raw.address, 4000, 'Alamat', true);

  const dateOfBirth = parseDate(raw.dateOfBirth, 'Tanggal Lahir', errors);
  if (dateOfBirth && dateOfBirth > localTodayJakarta()) {
    errors.push('Tanggal Lahir tidak boleh di masa depan.');
  }

  const genderRaw = cellText(raw.gender);
  let gender: string | null = null;
  if (genderRaw) {
    const normalized = genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1).toLowerCase();
    if (!(PATIENT_GENDERS as readonly string[]).includes(normalized)) {
      errors.push('Jenis Kelamin harus Perempuan atau Laki-laki.');
    } else {
      gender = normalized;
    }
  }

  const phoneRaw = cellText(raw.phone);
  let phone: string | null = null;
  if (phoneRaw) {
    if (!PHONE_PATTERN.test(phoneRaw)) errors.push('Nomor Telepon tidak valid.');
    else phone = phoneRaw;
  }

  const startDate = parseDate(raw.startDate, 'Tanggal Mulai Pengobatan', errors);
  const treatmentStageRaw = cellText(raw.treatmentStage);
  let treatmentStage: string | null = null;
  if (treatmentStageRaw) {
    if (treatmentStageRaw.length > 120) errors.push('Tahap Pengobatan maksimal 120 karakter.');
    else treatmentStage = treatmentStageRaw;
  }

  const lastControlDate = parseDate(raw.lastControlDate, 'Tanggal Kontrol Terakhir', errors);
  const lastMedicationDate = parseDate(raw.lastMedicationDate, 'Tanggal Pemberian Obat Terakhir', errors);
  const today = localTodayJakarta();
  if (lastControlDate) {
    if (lastControlDate > today) errors.push('Tanggal Kontrol Terakhir tidak boleh di masa depan.');
    if (startDate && lastControlDate < startDate) {
      errors.push('Tanggal Kontrol Terakhir tidak boleh sebelum Tanggal Mulai Pengobatan.');
    }
  }
  if (lastMedicationDate) {
    if (lastMedicationDate > today) errors.push('Tanggal Pemberian Obat Terakhir tidak boleh di masa depan.');
    if (startDate && lastMedicationDate < startDate) {
      errors.push('Tanggal Pemberian Obat Terakhir tidak boleh sebelum Tanggal Mulai Pengobatan.');
    }
    if (!lastControlDate) {
      errors.push('Tanggal Kontrol Terakhir wajib diisi bila Tanggal Pemberian Obat Terakhir diisi.');
    } else if (lastMedicationDate > lastControlDate) {
      errors.push('Tanggal Pemberian Obat Terakhir tidak boleh setelah Tanggal Kontrol Terakhir.');
    }
  }
  if ((lastControlDate || lastMedicationDate) && !startDate) {
    errors.push('Tanggal Mulai Pengobatan wajib diisi bila tanggal riwayat kontrol/obat diisi.');
  }

  if (errors.length) return { value: null, errors };
  return {
    value: {
      registerNumber,
      fullName,
      medicalRecordNumber,
      dateOfBirth,
      gender,
      phone,
      address,
      startDate,
      treatmentStage,
      lastControlDate,
      lastMedicationDate,
    },
    errors: [],
  };
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async buildTemplate(): Promise<{ filename: string; buffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dinar-TB';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Data Pasien');
    sheet.columns = [
      { header: 'Nomor Register', key: 'registerNumber', width: 24 },
      { header: 'Nama Lengkap', key: 'fullName', width: 28 },
      { header: 'Nomor Rekam Medis', key: 'medicalRecordNumber', width: 22 },
      { header: 'Tanggal Lahir', key: 'dateOfBirth', width: 16 },
      { header: 'Jenis Kelamin', key: 'gender', width: 16 },
      { header: 'Nomor Telepon', key: 'phone', width: 18 },
      { header: 'Alamat', key: 'address', width: 36 },
      { header: 'Tanggal Mulai Pengobatan', key: 'startDate', width: 26 },
      { header: 'Tahap Pengobatan', key: 'treatmentStage', width: 20 },
      { header: 'Tanggal Kontrol Terakhir', key: 'lastControlDate', width: 24 },
      { header: 'Tanggal Pemberian Obat Terakhir', key: 'lastMedicationDate', width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn(4).numFmt = '@';
    sheet.getColumn(8).numFmt = '@';
    sheet.getColumn(10).numFmt = '@';
    sheet.getColumn(11).numFmt = '@';

    const guide = workbook.addWorksheet('Petunjuk');
    guide.columns = [
      { header: 'Kolom', key: 'column', width: 28 },
      { header: 'Wajib', key: 'required', width: 10 },
      { header: 'Keterangan', key: 'note', width: 72 },
    ];
    guide.getRow(1).font = { bold: true };
    guide.addRows([
      { column: 'Nomor Register', required: 'Ya', note: 'Nomor register pasien. Harus unik; baris duplikat dilewati.' },
      { column: 'Nama Lengkap', required: 'Ya', note: 'Nama pasien sesuai identitas.' },
      { column: 'Nomor Rekam Medis', required: 'Ya', note: 'Nomor rekam medis Puskesmas.' },
      { column: 'Tanggal Lahir', required: 'Tidak', note: 'Format YYYY-MM-DD, contoh 1985-04-17.' },
      { column: 'Jenis Kelamin', required: 'Tidak', note: 'Isi Perempuan atau Laki-laki.' },
      { column: 'Nomor Telepon', required: 'Tidak', note: 'Contoh 081234567890.' },
      { column: 'Alamat', required: 'Ya', note: 'Alamat tempat tinggal pasien.' },
      { column: 'Tanggal Mulai Pengobatan', required: 'Tidak', note: 'Format YYYY-MM-DD. Bila diisi, pengobatan baru dibuat.' },
      { column: 'Tahap Pengobatan', required: 'Tidak', note: 'Contoh Bulan ke-1. Hanya dikirim bila Tanggal Mulai Pengobatan diisi.' },
      { column: 'Tanggal Kontrol Terakhir', required: 'Tidak', note: 'Format YYYY-MM-DD. Tanggal kontrol pasien yang sebenarnya, bukan tanggal mulai pengobatan. Boleh kosong bila belum diketahui.' },
      { column: 'Tanggal Pemberian Obat Terakhir', required: 'Tidak', note: 'Format YYYY-MM-DD. Hanya bila obat terakhir benar-benar diketahui. Jadwal kontrol berikutnya dihitung 14 hari dari tanggal ini. Boleh kosong.' },
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return { filename: 'template-impor-pasien-dinar-tb.xlsx', buffer: Buffer.from(buffer as ArrayBuffer) };
  }

  async preview(file: { buffer: Buffer; originalname?: string; size?: number }): Promise<ImportPreview> {
    if (!file?.buffer?.length) throw new BadRequestException('Berkas Excel tidak terbaca atau kosong.');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Berkas bukan format .xlsx yang valid.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Berkas Excel tidak memiliki lembar kerja.');

    const headerRow = sheet.getRow(1);
    const columnMap = new Map<number, keyof ImportPatientRow>();
    headerRow.eachCell((cell, colNumber) => {
      const key = HEADER_ALIASES[normalizeHeader(cell.value)];
      if (key) columnMap.set(colNumber, key);
    });
    const requiredHeaders: Array<keyof ImportPatientRow> = ['registerNumber', 'fullName', 'medicalRecordNumber', 'address'];
    const missing = requiredHeaders.filter((key) => ![...columnMap.values()].includes(key));
    if (missing.length) {
      throw new BadRequestException(
        `Kolom wajib tidak ditemukan pada baris pertama: ${missing.map((key) => HEADER_LABELS[key]).join(', ')}.`,
      );
    }

    const results: ImportRowResult[] = [];
    const validRows: ImportPatientRow[] = [];
    const validByRow = new Map<number, ImportPatientRow>();
    const seenRegisters = new Set<string>();
    let dataRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const raw: Record<string, unknown> = {};
      columnMap.forEach((key, colNumber) => {
        raw[key] = row.getCell(colNumber).value;
      });
      const hasContent = Object.values(raw).some((value) => cellText(value) !== '');
      if (!hasContent) return;
      dataRows += 1;
      if (dataRows > IMPORT_MAX_ROWS) return;

      const normalizedRegister = cellText(raw.registerNumber);
      const { value, errors } = validateImportRow(raw);
      if (errors.length || !value) {
        results.push({ rowNumber, registerNumber: normalizedRegister || null, fullName: cellText(raw.fullName) || null, status: 'invalid', errors });
        return;
      }
      if (seenRegisters.has(normalizeIdentity(value.registerNumber))) {
        results.push({ rowNumber, registerNumber: value.registerNumber, fullName: value.fullName, status: 'duplicate', errors: ['Nomor Register duplikat di dalam berkas.'] });
        return;
      }
      seenRegisters.add(normalizeIdentity(value.registerNumber));
      results.push({ rowNumber, registerNumber: value.registerNumber, fullName: value.fullName, status: 'valid', errors: [] });
      validRows.push(value);
      validByRow.set(rowNumber, value);
    });

    if (dataRows === 0) throw new BadRequestException('Berkas tidak berisi baris data pasien.');
    if (dataRows > IMPORT_MAX_ROWS) throw new BadRequestException(`Jumlah baris melebihi batas ${IMPORT_MAX_ROWS}.`);

    const existing = await this.existingIdentities(
      validRows.map((row) => row.registerNumber),
      validRows.map((row) => row.medicalRecordNumber),
    );
    for (const result of results) {
      if (result.status !== 'valid') continue;
      const value = validByRow.get(result.rowNumber);
      if (!value) continue;
      if (existing.registers.has(normalizeIdentity(value.registerNumber)) || existing.medicalRecords.has(normalizeIdentity(value.medicalRecordNumber))) {
        result.status = 'duplicate';
        result.errors.push('Nomor Register Pasien atau Nomor Rekam Medis sudah terdaftar di sistem.');
      }
    }
    const valid = results.filter((result) => result.status === 'valid').length;
    const invalid = results.filter((result) => result.status === 'invalid').length;
    const duplicate = results.filter((result) => result.status === 'duplicate').length;
    return {
      total: results.length,
      valid,
      invalid,
      duplicate,
      rows: results,
      validRows: validRows.filter((row) =>
        !existing.registers.has(normalizeIdentity(row.registerNumber)) &&
        !existing.medicalRecords.has(normalizeIdentity(row.medicalRecordNumber))),
    };
  }

  async confirm(rowsInput: unknown, staffId: string): Promise<ImportConfirmResult> {
    if (!Array.isArray(rowsInput)) throw new BadRequestException('Data impor tidak valid.');
    if (rowsInput.length > IMPORT_MAX_ROWS) throw new BadRequestException(`Jumlah baris melebihi batas ${IMPORT_MAX_ROWS}.`);

    const results = new Map<number, ImportRowResult>();
    const candidates: Array<{ rowNumber: number; value: ImportPatientRow }> = [];
    let index = 0;
    for (const raw of rowsInput) {
      index += 1;
      const record = (raw ?? {}) as Record<string, unknown>;
      const { value, errors } = validateImportRow(record);
      if (errors.length || !value) {
        results.set(index, { rowNumber: index, registerNumber: cellText(record.registerNumber) || null, fullName: cellText(record.fullName) || null, status: 'invalid', errors });
        continue;
      }
      candidates.push({ rowNumber: index, value });
    }

    const createdIds: string[] = [];
    const scheduleChanges: AppliedScheduleChange[] = [];
    let pendingSchedule = 0;
    const intervalDays = candidates.some(({ value }) => value.lastMedicationDate)
      ? await this.settings.controlIntervalDays()
      : null;
    const today = localTodayJakarta();

    await this.dataSource.transaction(async (manager) => {
      const patientRepo = manager.getRepository(Patient);
      const treatmentRepo = manager.getRepository(TreatmentCourse);
      const seenRegisters = new Set<string>();
      for (const { rowNumber, value: row } of candidates) {
        const evaluate = (status: ImportRowStatus, errors: string[] = []): void => {
          results.set(rowNumber, { rowNumber, registerNumber: row.registerNumber, fullName: row.fullName, status, errors });
        };
        const registerKey = normalizeIdentity(row.registerNumber);
        if (seenRegisters.has(registerKey)) {
          evaluate('duplicate', ['Nomor Register duplikat di dalam berkas.']);
          continue;
        }
        const conflict = await findIdentityConflict(
          (sql, params) => manager.query(sql, params),
          row,
        );
        if (conflict) {
          evaluate('duplicate', ['Nomor Register Pasien atau Nomor Rekam Medis sudah terdaftar di sistem.']);
          continue;
        }
        seenRegisters.add(registerKey);
        const patient = patientRepo.create({
          fullName: row.fullName,
          registerNumber: row.registerNumber,
          medicalRecordNumber: row.medicalRecordNumber,
          address: row.address,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          phone: row.phone,
          createdByStaffId: staffId,
        });
        let saved: Patient;
        try {
          saved = await patientRepo.save(patient);
        } catch (error) {
          // Race-safe backstop: a concurrent import/create hit the unique index.
          if (error instanceof QueryFailedError && (error as { driverError?: { code?: string } }).driverError?.code === '23505') {
            evaluate('duplicate', ['Nomor Register Pasien atau Nomor Rekam Medis sudah terdaftar di sistem.']);
            continue;
          }
          throw error;
        }
        createdIds.push(saved.id);
        if (row.startDate) {
          const course = treatmentRepo.create({
            patientId: saved.id,
            startDate: row.startDate,
            initialTargetEndDate: addCalendarMonths(row.startDate, 6),
            treatmentStage: row.treatmentStage,
            lastControlDate: row.lastControlDate,
            lastMedicationDate: row.lastMedicationDate,
          });
          const savedCourse = await treatmentRepo.save(course);
          // History dates are persisted on the course, not as a visit. A
          // schedule is only derived from a real medication date; a computed
          // date in the past is never stored and a staff override is respected.
          if (row.lastMedicationDate && intervalDays !== null) {
            const outcome = await applyMedicationSchedule(manager, savedCourse.id, row.lastMedicationDate, intervalDays, today);
            if (outcome.status === 'scheduled') scheduleChanges.push(outcome.change);
            else if (outcome.status === 'perlu_konfirmasi') pendingSchedule += 1;
          }
        }
        evaluate('imported');
      }
    });

    for (const id of createdIds) {
      await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'imported' });
    }
    for (const change of scheduleChanges) {
      await this.audit.record({
        actorStaffId: staffId,
        objectType: 'control_schedule',
        objectId: change.scheduleId,
        action: 'default_recalculated',
        details: `${change.previousDate ?? 'none'} -> ${change.date}`,
      });
      this.eventEmitter.emit('schedule.changed', {
        treatmentCourseId: change.treatmentCourseId,
        scheduleId: change.scheduleId,
        previousDate: change.previousDate,
        newDate: change.date,
        overriddenByStaffId: null,
        version: change.version,
        changedAt: new Date(),
      });
    }

    const rows = [...results.values()].sort((a, b) => a.rowNumber - b.rowNumber);
    const importedCount = rows.filter((row) => row.status === 'imported').length;
    const invalid = rows.filter((row) => row.status === 'invalid').length;
    const duplicate = rows.filter((row) => row.status === 'duplicate').length;
    return {
      total: rows.length,
      imported: importedCount,
      invalid,
      duplicate,
      skipped: rows.length - importedCount,
      pendingSchedule,
      rows,
    };
  }

  private async existingIdentities(
    registers: string[],
    medicalRecords: string[],
  ): Promise<{ registers: Set<string>; medicalRecords: Set<string> }> {
    const uniqueRegisters = [...new Set(registers.map(normalizeIdentity))].filter(Boolean);
    const uniqueRecords = [...new Set(medicalRecords.map(normalizeIdentity))].filter(Boolean);
    if (!uniqueRegisters.length && !uniqueRecords.length) {
      return { registers: new Set(), medicalRecords: new Set() };
    }
    const rows: Array<{ registerNumber: string | null; medicalRecordNumber: string | null }> = await this.dataSource.query(
      `SELECT register_number AS "registerNumber", medical_record_number AS "medicalRecordNumber"
         FROM patients
        WHERE lower(btrim(register_number)) = ANY($1::text[])
           OR lower(btrim(medical_record_number)) = ANY($2::text[])`,
      [uniqueRegisters, uniqueRecords],
    );
    return {
      registers: new Set(rows.map((row) => normalizeIdentity(row.registerNumber ?? ''))),
      medicalRecords: new Set(rows.map((row) => normalizeIdentity(row.medicalRecordNumber ?? ''))),
    };
  }
}

const HEADER_LABELS: Record<keyof ImportPatientRow, string> = {
  registerNumber: 'Nomor Register',
  fullName: 'Nama Lengkap',
  medicalRecordNumber: 'Nomor Rekam Medis',
  dateOfBirth: 'Tanggal Lahir',
  gender: 'Jenis Kelamin',
  phone: 'Nomor Telepon',
  address: 'Alamat',
  startDate: 'Tanggal Mulai Pengobatan',
  treatmentStage: 'Tahap Pengobatan',
  lastControlDate: 'Tanggal Kontrol Terakhir',
  lastMedicationDate: 'Tanggal Pemberian Obat Terakhir',
};
