import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { localTodayJakarta, nextControlDate } from '../common/date-rules';
import { optionalString, requiredDate } from '../common/input';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { ControlVisit } from '../database/entities/control-visit.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { ControlScheduleService, ScheduleChangedEvent } from '../control-schedule/control-schedule.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(ControlVisit) private readonly visits: Repository<ControlVisit>,
    @InjectRepository(ControlSchedule) private readonly schedules: Repository<ControlSchedule>,
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  async create(treatmentId: string, input: Record<string, unknown>, staffId: string): Promise<ControlVisit> {
    const course = await this.treatments.findOneBy({ id: treatmentId });
    if (!course) throw new NotFoundException('Treatment tidak ditemukan.');
    if (typeof input.medicineGiven !== 'boolean') throw new BadRequestException('Obat diberikan harus bernilai Ya/Tidak.');
    const visitDate = requiredDate(input.visitDate, 'Tanggal kunjungan');
    const medicationGivenOn = input.medicineGiven
      ? requiredDate(input.medicationGivenOn, 'Tanggal pemberian obat')
      : null;
    if (!input.medicineGiven && input.medicationGivenOn !== undefined && input.medicationGivenOn !== null && input.medicationGivenOn !== '') {
      throw new BadRequestException('Tanggal pemberian obat hanya berlaku jika obat diberikan.');
    }
    // Server-side guard: a control visit cannot be dated in the future (WIB).
    // Without this the frontend was the only thing stopping impossible dates.
    const today = localTodayJakarta();
    if (visitDate > today) {
      throw new BadRequestException('Tanggal kunjungan tidak boleh di masa depan.');
    }
    if (medicationGivenOn && medicationGivenOn > today) {
      throw new BadRequestException('Tanggal pemberian obat tidak boleh di masa depan.');
    }
    const visit = this.visits.create({
      patientId: course.patientId,
      treatmentCourseId: treatmentId,
      visitDate,
      complaintProgress: optionalString(input.complaintProgress, 'Keluhan/perkembangan', 4000),
      additionalNote: optionalString(input.additionalNote, 'Catatan tambahan', 4000),
      medicineGiven: input.medicineGiven,
      medicationGivenOn,
      recordedByStaffId: staffId,
    });

    const intervalDays = await this.settings.controlIntervalDays();
    const transactionResult = await this.dataSource.transaction(async (manager) => {
      const savedVisit = await manager.save(visit);
      let scheduleChange: { id: string; previousDate: string | null; date: string; version: number; overriddenByStaffId: string | null } | null = null;
      if (savedVisit.medicineGiven && !course.completedAt) {
        const defaultDate = nextControlDate(savedVisit.medicationGivenOn!, intervalDays);
        const repository = manager.getRepository(ControlSchedule);
        const schedule = await repository.findOneBy({ treatmentCourseId: treatmentId });
        // A staff override is authoritative: never overwrite it with the
        // medication-derived default.
        const overridden = schedule ? schedule.overriddenByStaffId !== null : false;
        // Never store a control date that is already in the past; staff must
        // confirm the real dates first.
        const inPast = defaultDate < today;
        if (!overridden && !inPast) {
          const previousDate = schedule?.scheduledDate ?? null;
          if (!schedule) {
            const created = repository.create({
              treatmentCourseId: treatmentId,
              referenceVisitId: savedVisit.id,
              defaultDate,
              scheduledDate: defaultDate,
            });
            const savedSchedule = await repository.save(created);
            scheduleChange = { id: savedSchedule.id, previousDate, date: defaultDate, version: savedSchedule.version, overriddenByStaffId: null };
          } else {
            schedule.referenceVisitId = savedVisit.id;
            schedule.defaultDate = defaultDate;
            schedule.scheduledDate = defaultDate;
            const savedSchedule = await repository.save(schedule);
            scheduleChange = { id: savedSchedule.id, previousDate, date: defaultDate, version: savedSchedule.version, overriddenByStaffId: null };
          }
        }
      }
      return { savedVisit, scheduleChange };
    });
    const saved = transactionResult.savedVisit;
    await this.audit.record({ actorStaffId: staffId, objectType: 'control_visit', objectId: saved.id, action: 'created', details: saved.medicineGiven ? 'medicine_given' : 'no_medicine' });
    if (transactionResult.scheduleChange) {
      const change = transactionResult.scheduleChange;
      await this.audit.record({ actorStaffId: staffId, objectType: 'control_schedule', objectId: change.id, action: 'default_recalculated', details: `${change.previousDate ?? 'none'} -> ${change.date}` });

      this.eventEmitter.emit('schedule.changed', {
        treatmentCourseId: treatmentId,
        scheduleId: change.id,
        previousDate: change.previousDate,
        newDate: change.date,
        overriddenByStaffId: change.overriddenByStaffId,
        version: change.version,
        changedAt: new Date(),
      } satisfies ScheduleChangedEvent);
    }
    return saved;
  }

  async listByPatient(patientId: string): Promise<ControlVisit[]> {
    return this.visits.find({ where: { patientId }, order: { visitDate: 'DESC', createdAt: 'DESC' } });
  }
}
