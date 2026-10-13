import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { nextControlDate } from '../common/date-rules';
import { optionalString, requiredDate } from '../common/input';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { ControlVisit } from '../database/entities/control-visit.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(ControlVisit) private readonly visits: Repository<ControlVisit>,
    @InjectRepository(ControlSchedule) private readonly schedules: Repository<ControlSchedule>,
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async create(treatmentId: string, input: Record<string, unknown>, staffId: string): Promise<ControlVisit> {
    const course = await this.treatments.findOneBy({ id: treatmentId });
    if (!course) throw new NotFoundException('Treatment tidak ditemukan.');
    if (typeof input.medicineGiven !== 'boolean') throw new BadRequestException('Obat diberikan harus bernilai Ya/Tidak.');
    const visitDate = requiredDate(input.visitDate, 'Tanggal kunjungan');
    const medicationGivenOn = input.medicineGiven
      ? requiredDate(input.medicationGivenOn, 'Tanggal pemberian obat')
      : null;
    if (input.medicineGiven && medicationGivenOn !== visitDate) {
      throw new BadRequestException('Tanggal pemberian obat harus sama dengan tanggal kunjungan.');
    }
    if (!input.medicineGiven && input.medicationGivenOn !== undefined && input.medicationGivenOn !== null && input.medicationGivenOn !== '') {
      throw new BadRequestException('Tanggal pemberian obat hanya berlaku jika obat diberikan.');
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

    const transactionResult = await this.dataSource.transaction(async (manager) => {
      const savedVisit = await manager.save(visit);
      let scheduleChange: { id: string; previousDate: string | null; date: string } | null = null;
      if (savedVisit.medicineGiven && !course.completedAt) {
        const defaultDate = nextControlDate(savedVisit.medicationGivenOn!);
        const repository = manager.getRepository(ControlSchedule);
        let schedule = await repository.findOneBy({ treatmentCourseId: treatmentId });
        const previousDate = schedule?.scheduledDate ?? null;
        if (!schedule) {
          schedule = repository.create({
            treatmentCourseId: treatmentId,
            referenceVisitId: savedVisit.id,
            defaultDate,
            scheduledDate: defaultDate,
          });
        } else {
          schedule.referenceVisitId = savedVisit.id;
          schedule.defaultDate = defaultDate;
          schedule.scheduledDate = defaultDate;
          schedule.overriddenByStaffId = null;
          schedule.overriddenAt = null;
        }
        const savedSchedule = await repository.save(schedule);
        scheduleChange = { id: savedSchedule.id, previousDate, date: defaultDate };
      }
      return { savedVisit, scheduleChange };
    });
    const saved = transactionResult.savedVisit;
    await this.audit.record({ actorStaffId: staffId, objectType: 'control_visit', objectId: saved.id, action: 'created', details: saved.medicineGiven ? 'medicine_given' : 'no_medicine' });
    if (transactionResult.scheduleChange) {
      const change = transactionResult.scheduleChange;
      await this.audit.record({ actorStaffId: staffId, objectType: 'control_schedule', objectId: change.id, action: 'default_recalculated', details: `${change.previousDate ?? 'none'} -> ${change.date}` });
    }
    return saved;
  }

  async listByPatient(patientId: string): Promise<ControlVisit[]> {
    return this.visits.find({ where: { patientId }, order: { visitDate: 'DESC', createdAt: 'DESC' } });
  }
}
