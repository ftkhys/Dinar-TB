import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { addCalendarMonths, FINAL_REVIEW_MIN_MONTH, treatmentMonth } from '../common/date-rules';
import { localTodayJakarta } from '../common/date-rules';
import { optionalDate, optionalString, requiredDate } from '../common/input';
import { applyMedicationSchedule, AppliedScheduleChange } from '../control-schedule/schedule-apply';
import { ScheduleApplyOutcome } from '../control-schedule/schedule-apply';
import { Patient } from '../database/entities/patient.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { TreatmentDecision } from '../database/enums';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class TreatmentsService {
  constructor(
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  async create(patientId: string, input: Record<string, unknown>, staffId: string): Promise<TreatmentView> {
    const patient = await this.patients.findOneBy({ id: patientId });
    if (!patient || patient.archivedAt) throw new NotFoundException('Pasien tidak ditemukan.');
    if (await this.treatments.existsBy({ patientId, completedAt: IsNull() })) {
      throw new ConflictException('Pasien sudah memiliki treatment yang masih aktif.');
    }
    const startDate = requiredDate(input.startDate, 'Tanggal mulai pengobatan');
    const lastControlDate = optionalDate(input.lastControlDate, 'Tanggal kontrol terakhir');
    const lastMedicationDate = optionalDate(input.lastMedicationDate, 'Tanggal pemberian obat terakhir');
    this.assertHistoryDates(startDate, lastControlDate, lastMedicationDate);

    const course = this.treatments.create({
      patientId,
      startDate,
      initialTargetEndDate: addCalendarMonths(startDate, 6),
      treatmentStage: optionalString(input.treatmentStage, 'Tahap pengobatan', 120),
      lastControlDate,
      lastMedicationDate,
    });

    const intervalDays = lastMedicationDate ? await this.settings.controlIntervalDays() : null;
    const today = localTodayJakarta();
    const { saved, outcome } = await this.dataSource.transaction(async (manager) => {
      const savedCourse = await manager.save(course);
      const result = intervalDays !== null
        ? await applyMedicationSchedule(manager, savedCourse.id, lastMedicationDate, intervalDays, today)
        : null;
      return { saved: savedCourse, outcome: result };
    });

    await this.audit.record({ actorStaffId: staffId, objectType: 'treatment_course', objectId: saved.id, action: 'created' });
    if (outcome?.status === 'scheduled') {
      await this.recordScheduleChange(outcome.change, staffId);
    }
    return this.present(saved, outcome?.status === 'perlu_konfirmasi');
  }

  /**
   * Validates the two history dates against the treatment start and each other.
   * The dates are informational history: an unknown medication date must never
   * be inferred from the control date, so both are validated independently and
   * only their ordering (control on/after medication, both on/after start) is
   * enforced.
   */
  private assertHistoryDates(startDate: string, lastControlDate: string | null, lastMedicationDate: string | null): void {
    const today = localTodayJakarta();
    if (lastControlDate) {
      if (lastControlDate > today) throw new BadRequestException('Tanggal kontrol terakhir tidak boleh di masa depan.');
      if (lastControlDate < startDate) {
        throw new BadRequestException('Tanggal kontrol terakhir tidak boleh sebelum tanggal mulai pengobatan.');
      }
    }
    if (lastMedicationDate) {
      if (lastMedicationDate > today) throw new BadRequestException('Tanggal pemberian obat terakhir tidak boleh di masa depan.');
      if (lastMedicationDate < startDate) {
        throw new BadRequestException('Tanggal pemberian obat terakhir tidak boleh sebelum tanggal mulai pengobatan.');
      }
      if (!lastControlDate) {
        throw new BadRequestException('Tanggal kontrol terakhir wajib diisi bila tanggal pemberian obat terakhir diisi.');
      }
      if (lastMedicationDate > lastControlDate) {
        throw new BadRequestException('Tanggal pemberian obat terakhir tidak boleh setelah tanggal kontrol terakhir.');
      }
    }
  }

  private async recordScheduleChange(change: AppliedScheduleChange, staffId: string): Promise<void> {
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

  async listByPatient(patientId: string): Promise<TreatmentView[]> {
    const courses = await this.treatments.find({ where: { patientId }, order: { startDate: 'ASC' } });
    return courses.map((course) => this.present(course));
  }

  async findOne(id: string): Promise<TreatmentView> {
    const course = await this.treatments.findOneBy({ id });
    if (!course) throw new NotFoundException('Treatment tidak ditemukan.');
    return this.present(course);
  }

  async review(id: string, input: Record<string, unknown>, staffId: string): Promise<TreatmentView> {
    const course = await this.findOne(id);
    if (course.finalDecision === TreatmentDecision.COMPLETED) {
      throw new ConflictException('Treatment yang sudah ditutup tidak dapat diubah.');
    }
    if (course.treatmentMonth < FINAL_REVIEW_MIN_MONTH) {
      throw new ConflictException(
        `Tinjauan akhir baru dapat dilakukan mulai bulan ke-${FINAL_REVIEW_MIN_MONTH} pengobatan.`,
      );
    }
    const decision = input.decision as TreatmentDecision;
    if (![TreatmentDecision.COMPLETED, TreatmentDecision.CONTINUED].includes(decision)) {
      throw new ConflictException('Keputusan harus Selesai atau Dilanjutkan.');
    }
    const note = optionalString(input.note, 'Keterangan tinjauan', 4000);
    if (!note) throw new ConflictException('Keterangan tinjauan wajib diisi.');
    const target = decision === TreatmentDecision.CONTINUED
      ? requiredDate(input.continuedTargetEndDate, 'Tanggal target lanjutan')
      : null;
    const now = new Date();
    course.finalDecision = decision;
    course.finalReviewNote = note;
    course.finalReviewedAt = now;
    course.continuedTargetEndDate = target;
    course.completedAt = decision === TreatmentDecision.COMPLETED ? now : null;
    const saved = await this.treatments.save(course);
    await this.audit.record({ actorStaffId: staffId, objectType: 'treatment_course', objectId: id, action: 'final_review', details: decision });
    return this.present(saved);
  }

  private present(course: TreatmentCourse, schedulePendingConfirmation = false): TreatmentView {
    const target = course.continuedTargetEndDate ?? course.initialTargetEndDate;
    const today = localTodayJakarta();
    const month = treatmentMonth(course.startDate, today);
    return Object.assign(course, {
      reviewDue: !course.completedAt && target <= today,
      remindersEnabled: !course.completedAt && course.startDate <= today,
      schedulePendingConfirmation,
      treatmentMonth: month,
      finalReviewEligible:
        !course.completedAt && !course.finalDecision && month >= FINAL_REVIEW_MIN_MONTH,
    });
  }
}

export type TreatmentView = TreatmentCourse & {
  reviewDue: boolean;
  remindersEnabled: boolean;
  schedulePendingConfirmation: boolean;
  treatmentMonth: number;
  finalReviewEligible: boolean;
};
