import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { APPLICATION_TIME_ZONE, dateInTimeZone, localTodayJakarta } from '../common/date-rules';
import { requiredDate, requiredString } from '../common/input';
import { DailyAdherence } from '../database/entities/daily-adherence.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { SyncReceipt } from '../database/entities/sync-receipt.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AdherenceStatus } from '../database/enums';
import { SettingsService } from '../settings/settings.service';
import { AdherenceSummary, summarizeAdherence } from './adherence-rules';

/** Row status on the staff "Pengingat" screen for the current WIB day. */
export type ReminderRowStatus = 'Sudah Konfirmasi' | 'Belum Konfirmasi';

/**
 * A patient still needs attention when at least two completed days in a row
 * have no confirmation. Today never counts as missed while it is still running,
 * so the streak only covers days that have already ended.
 */
export const NEEDS_ATTENTION_MISSED_STREAK = 2;

export type ReminderRow = {
  treatmentCourseId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  /** Configured morning reminder window start (HH:MM, Asia/Jakarta). */
  reminderTime: string;
  status: ReminderRowStatus;
  /** ISO timestamp of today's confirmation, or null when not confirmed. */
  confirmedAt: string | null;
  missedStreak: number;
};

export type RemindersView = {
  date: string;
  timeZone: string;
  generatedAt: string;
  reminderMorning: string;
  reminderEvening: string;
  stats: { active: number; confirmed: number; notConfirmed: number; needsAttention: number };
  rows: ReminderRow[];
};

export interface AdherenceOperation {
  operationId: string;
  treatmentCourseId: string;
  adherenceDate: string;
  confirmedAt: string;
  expectedTreatmentVersion: number;
}

@Injectable()
export class AdherenceService {
  constructor(
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    @InjectRepository(DailyAdherence) private readonly adherence: Repository<DailyAdherence>,
    @InjectRepository(PatientDevice) private readonly devices: Repository<PatientDevice>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async confirmOnline(deviceId: string, treatmentId: string, input: Record<string, unknown>): Promise<unknown> {
    const now = new Date();
    const operation: AdherenceOperation = {
      operationId: requiredUuid(input.operationId, 'ID operasi'),
      treatmentCourseId: requiredUuid(treatmentId, 'ID treatment'),
      adherenceDate: requiredDate(input.adherenceDate, 'Tanggal obat'),
      confirmedAt: input.confirmedAt === undefined ? now.toISOString() : requiredString(input.confirmedAt, 'Waktu konfirmasi', 50),
      expectedTreatmentVersion: Number(input.expectedTreatmentVersion),
    };
    if (!Number.isInteger(operation.expectedTreatmentVersion)) throw new BadRequestException('Versi treatment wajib disertakan.');
    return this.applyOperation(deviceId, operation);
  }

  async sync(deviceId: string, operations: unknown): Promise<{ results: unknown[] }> {
    if (!Array.isArray(operations) || operations.length > 200) {
      throw new BadRequestException('Sync harus berisi maksimal 200 operasi.');
    }
    const results: unknown[] = [];
    for (const candidate of operations) {
      if (!candidate || typeof candidate !== 'object') throw new BadRequestException('Operasi sync tidak valid.');
      const input = candidate as Record<string, unknown>;
      const expected = Number(input.expectedTreatmentVersion);
      if (!Number.isInteger(expected)) throw new BadRequestException('Versi treatment wajib disertakan.');
      results.push(await this.applyOperation(deviceId, {
        operationId: requiredUuid(input.operationId, 'ID operasi'),
        treatmentCourseId: requiredUuid(input.treatmentCourseId, 'ID treatment'),
        adherenceDate: requiredDate(input.adherenceDate, 'Tanggal obat'),
        confirmedAt: requiredString(input.confirmedAt, 'Waktu konfirmasi', 50),
        expectedTreatmentVersion: expected,
      }));
    }
    return { results };
  }

  /**
   * Confirms today's dose for a browser session. There is no device row or
   * device receipt here: the unique (treatment, date) row is the idempotency
   * boundary, and the caller's patient id is always checked against the course.
   */
  async confirmWeb(
    patientId: string,
    treatmentId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const today = localTodayJakarta();
    const requestedDate = input.adherenceDate === undefined
      ? today
      : requiredDate(input.adherenceDate, 'Tanggal obat');
    if (requestedDate !== today) {
      throw new BadRequestException('Konfirmasi web hanya dapat dilakukan untuk hari ini.');
    }
    const expectedVersion = input.expectedTreatmentVersion === undefined
      ? null
      : Number(input.expectedTreatmentVersion);
    if (expectedVersion !== null && !Number.isInteger(expectedVersion)) {
      throw new BadRequestException('Versi treatment tidak valid.');
    }
    const confirmationTime = new Date();

    return this.dataSource.transaction(async (manager) => {
      const course = await manager.getRepository(TreatmentCourse)
        .createQueryBuilder('course')
        .setLock('pessimistic_write')
        .where('course.id = :id', { id: treatmentId })
        .getOne();
      if (!course || course.patientId !== patientId) {
        throw new NotFoundException('Treatment tidak ditemukan pada pasien ini.');
      }
      if (requestedDate < course.startDate) {
        throw new BadRequestException('Tanggal obat tidak boleh sebelum tanggal mulai pengobatan.');
      }
      if (course.completedAt && requestedDate > dateInTimeZone(course.completedAt, 'Asia/Jakarta')) {
        throw new ConflictException('Pengobatan sudah selesai.');
      }
      const existing = await manager.getRepository(DailyAdherence).findOneBy({
        treatmentCourseId: course.id,
        adherenceDate: requestedDate,
      });
      if (existing) {
        return { code: 'DUPLICATE', adherence: existing };
      }
      if (expectedVersion !== null && course.version !== expectedVersion) {
        return {
          code: 'CONFLICT',
          message: 'Data pengobatan berubah. Muat ulang lalu coba lagi.',
          serverVersion: course.version,
        };
      }
      const row = await manager.getRepository(DailyAdherence).save(
        manager.getRepository(DailyAdherence).create({
          treatmentCourseId: course.id,
          adherenceDate: requestedDate,
          status: AdherenceStatus.TAKEN,
          confirmedAt: confirmationTime,
          sourceDeviceId: null,
          confirmedByStaffId: null,
        }),
      );
      return { code: 'APPLIED', adherence: row };
    });
  }

  async getDeviceSummary(deviceId: string, treatmentId: string): Promise<AdherenceSummary> {
    const device = await this.devices.findOneBy({ id: deviceId });
    if (!device) throw new NotFoundException('Device tidak ditemukan.');
    return this.getSummary(treatmentId, device.patientId);
  }

  async getStaffSummary(treatmentId: string): Promise<AdherenceSummary> {
    return this.getSummary(treatmentId);
  }

  /**
   * Today's medication-confirmation monitoring for the staff "Pengingat"
   * screen. One row per active treatment (a patient has at most one active
   * course), so no patient or dose is counted twice. A patient who has not
   * confirmed today is reported as "Belum Konfirmasi" and is never classified
   * as missed while the day is still running: the missed streak only counts
   * completed days that ended without a confirmation.
   */
  async listReminders(search?: string, now = new Date()): Promise<RemindersView> {
    const today = localTodayJakarta(now);
    const [morningWindow, eveningWindow] = await this.settings.reminderWindows();
    const reminderMorning = morningWindow?.start ?? '06:00';
    const reminderEvening = eveningWindow?.start ?? '20:00';

    const courses: Array<{
      treatmentCourseId: string;
      patientId: string;
      patientName: string;
      registerNumber: string | null;
      startDate: string;
    }> = await this.dataSource.query(
      `SELECT tc.id AS "treatmentCourseId", p.id AS "patientId", p.full_name AS "patientName",
              p.register_number AS "registerNumber", to_char(tc.start_date, 'YYYY-MM-DD') AS "startDate"
         FROM treatment_courses tc
         JOIN patients p ON p.id = tc.patient_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date
          AND p.archived_at IS NULL AND p.anonymized_at IS NULL
        ORDER BY p.full_name ASC`,
      [today],
    );

    const adherenceRows: Array<{
      treatmentCourseId: string;
      adherenceDate: string;
      confirmedAt: string | Date;
    }> = await this.dataSource.query(
      `SELECT da.treatment_course_id AS "treatmentCourseId",
              to_char(da.adherence_date, 'YYYY-MM-DD') AS "adherenceDate",
              da.confirmed_at AS "confirmedAt"
         FROM daily_adherence da
         JOIN treatment_courses tc ON tc.id = da.treatment_course_id
         JOIN patients p ON p.id = tc.patient_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date
          AND p.archived_at IS NULL AND p.anonymized_at IS NULL`,
      [today],
    );

    const confirmationsByCourse = new Map<string, Map<string, string>>();
    for (const row of adherenceRows) {
      const map = confirmationsByCourse.get(row.treatmentCourseId) ?? new Map<string, string>();
      map.set(row.adherenceDate, new Date(row.confirmedAt).toISOString());
      confirmationsByCourse.set(row.treatmentCourseId, map);
    }

    const allRows: ReminderRow[] = courses.map((course) => {
      const confirmations = confirmationsByCourse.get(course.treatmentCourseId) ?? new Map<string, string>();
      const summary = summarizeAdherence(course.startDate, today, null, confirmations);
      const confirmedAt = confirmations.get(today) ?? null;
      return {
        treatmentCourseId: course.treatmentCourseId,
        patientId: course.patientId,
        patientName: course.patientName,
        registerNumber: course.registerNumber ?? null,
        reminderTime: reminderMorning,
        status: confirmedAt ? 'Sudah Konfirmasi' : 'Belum Konfirmasi',
        confirmedAt,
        missedStreak: summary.missedStreak,
      };
    });

    const confirmed = allRows.filter((row) => row.status === 'Sudah Konfirmasi').length;
    const term = search?.trim().toLowerCase();
    const rows = term
      ? allRows.filter((row) => `${row.patientName} ${row.registerNumber ?? ''}`.toLowerCase().includes(term))
      : allRows;

    return {
      date: today,
      timeZone: APPLICATION_TIME_ZONE,
      generatedAt: now.toISOString(),
      reminderMorning,
      reminderEvening,
      stats: {
        active: allRows.length,
        confirmed,
        notConfirmed: allRows.length - confirmed,
        needsAttention: allRows.filter((row) => row.missedStreak >= NEEDS_ATTENTION_MISSED_STREAK).length,
      },
      rows,
    };
  }

  private async getSummary(treatmentId: string, expectedPatientId?: string): Promise<AdherenceSummary> {
    const course = await this.treatments.findOneBy({ id: treatmentId });
    if (!course || (expectedPatientId && course.patientId !== expectedPatientId)) throw new NotFoundException('Treatment tidak ditemukan.');
    const today = localTodayJakarta();
  const completedDate = course.completedAt ? dateInTimeZone(course.completedAt, 'Asia/Jakarta') : null;
    const rows = await this.adherence.find({ where: { treatmentCourseId: course.id }, order: { adherenceDate: 'ASC' } });
    const confirmations = new Map(rows.map((row) => [row.adherenceDate, row.confirmedAt.toISOString()]));
    return summarizeAdherence(course.startDate, today, completedDate, confirmations);
  }

  private async applyOperation(deviceId: string, operation: AdherenceOperation): Promise<unknown> {
    const confirmationTime = new Date(operation.confirmedAt);
    // Accept any parseable ISO-8601 timestamp. The previous check compared the
    // raw string against `toISOString()`, which is millisecond-precision, so a
    // client that sends microsecond precision (Dart's `toIso8601String()`) or
    // no fractional part at all was rejected with 400 and the confirmation was
    // never stored.
    if (Number.isNaN(confirmationTime.getTime())) {
      throw new BadRequestException('Waktu konfirmasi harus berupa timestamp ISO valid.');
    }
    if (dateInTimeZone(confirmationTime, 'Asia/Jakarta') !== operation.adherenceDate) {
      throw new BadRequestException('Tanggal obat harus sesuai tanggal lokal Asia/Jakarta saat konfirmasi.');
    }
    if (confirmationTime.getTime() > Date.now()) throw new BadRequestException('Waktu konfirmasi tidak boleh di masa depan.');
    const requestHash = createHash('sha256').update(JSON.stringify(operation)).digest('hex');

    return this.dataSource.transaction(async (manager) => {
      const device = await manager.getRepository(PatientDevice).createQueryBuilder('device')
        .setLock('pessimistic_write')
        .where('device.id = :deviceId', { deviceId })
        .andWhere('device.deactivatedAt IS NULL')
        .getOne();
      if (!device) throw new NotFoundException('Device tidak aktif.');
      const receiptRepo = manager.getRepository(SyncReceipt);
      const existingReceipt = await receiptRepo.findOneBy({ deviceId, operationId: operation.operationId });
      if (existingReceipt) {
        if (existingReceipt.requestHash !== requestHash) {
          throw new ConflictException({ message: 'ID operasi sudah dipakai untuk perubahan lain.', code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return this.receiptResult(manager, existingReceipt, true);
      }

      const course = await manager.getRepository(TreatmentCourse).createQueryBuilder('course')
        .setLock('pessimistic_write')
        .where('course.id = :id', { id: operation.treatmentCourseId })
        .getOne();
      if (!course || course.patientId !== device.patientId) throw new NotFoundException('Treatment tidak ditemukan pada pasien device ini.');
      if (operation.adherenceDate < course.startDate) {
        throw new BadRequestException('Tanggal obat tidak boleh sebelum tanggal mulai pengobatan.');
      }
      const existing = await manager.getRepository(DailyAdherence).findOneBy({
        treatmentCourseId: course.id,
        adherenceDate: operation.adherenceDate,
      });
      if (existing) {
        const exact = existing.confirmedAt.toISOString() === confirmationTime.toISOString();
        if (!exact) {
          throw new ConflictException({ message: 'Konfirmasi tanggal ini sudah tersimpan dengan waktu berbeda.', server: existing });
        }
        const receipt = await receiptRepo.save(receiptRepo.create({
          deviceId, operationId: operation.operationId, requestHash, resourceId: existing.id,
          serverVersion: course.version, resultCode: 'DUPLICATE',
        }));
        return this.receiptResult(manager, receipt, false);
      }
      if (course.version !== operation.expectedTreatmentVersion) {
        const receipt = await receiptRepo.save(receiptRepo.create({
          deviceId, operationId: operation.operationId, requestHash, resourceId: course.id,
          serverVersion: course.version, resultCode: 'CONFLICT',
        }));
        return { code: 'CONFLICT', message: 'Treatment berubah di server; ambil versi terbaru sebelum mencoba kembali.', server: course, receiptId: receipt.id };
      }
      if (course.completedAt && operation.adherenceDate > dateInTimeZone(course.completedAt, 'Asia/Jakarta')) {
        throw new ConflictException({ message: 'Tanggal konfirmasi setelah treatment selesai.', server: course });
      }
      const row = await manager.getRepository(DailyAdherence).save(manager.getRepository(DailyAdherence).create({
        treatmentCourseId: course.id,
        adherenceDate: operation.adherenceDate,
        status: AdherenceStatus.TAKEN,
        confirmedAt: confirmationTime,
        sourceDeviceId: device.id,
      }));
      const receipt = await receiptRepo.save(receiptRepo.create({
        deviceId, operationId: operation.operationId, requestHash, resourceId: row.id,
        serverVersion: course.version, resultCode: 'APPLIED',
      }));
      return { code: 'APPLIED', adherence: row, receiptId: receipt.id };
    });
  }

  private async receiptResult(manager: import('typeorm').EntityManager, receipt: SyncReceipt, replay: boolean): Promise<unknown> {
    if (receipt.resultCode === 'CONFLICT') {
      const server = receipt.resourceId ? await manager.getRepository(TreatmentCourse).findOneBy({ id: receipt.resourceId }) : null;
      return { code: 'CONFLICT', replay, server, serverVersion: server?.version ?? receipt.serverVersion };
    }
    const adherence = receipt.resourceId ? await manager.getRepository(DailyAdherence).findOneBy({ id: receipt.resourceId }) : null;
    return { code: receipt.resultCode, replay, adherence, serverVersion: receipt.serverVersion };
  }
}

function requiredUuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${name} harus berupa UUID.`);
  }
  return value;
}
