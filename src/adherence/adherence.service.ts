import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { dateInTimeZone, localTodayJakarta } from '../common/date-rules';
import { requiredDate, requiredString } from '../common/input';
import { DailyAdherence } from '../database/entities/daily-adherence.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { SyncReceipt } from '../database/entities/sync-receipt.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AdherenceStatus } from '../database/enums';
import { AdherenceSummary, summarizeAdherence } from './adherence-rules';

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

  async getDeviceSummary(deviceId: string, treatmentId: string): Promise<AdherenceSummary> {
    const device = await this.devices.findOneBy({ id: deviceId });
    if (!device) throw new NotFoundException('Device tidak ditemukan.');
    return this.getSummary(treatmentId, device.patientId);
  }

  async getStaffSummary(treatmentId: string): Promise<AdherenceSummary> {
    return this.getSummary(treatmentId);
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
    if (Number.isNaN(confirmationTime.getTime()) || confirmationTime.toISOString() !== operation.confirmedAt) {
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
