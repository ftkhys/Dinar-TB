import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { requiredDate } from '../common/input';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';

@Injectable()
export class ControlScheduleService {
  constructor(
    @InjectRepository(ControlSchedule) private readonly schedules: Repository<ControlSchedule>,
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    private readonly audit: AuditLogService,
  ) {}

  async findByTreatment(treatmentId: string): Promise<ControlSchedule> {
    const schedule = await this.schedules.findOneBy({ treatmentCourseId: treatmentId });
    if (!schedule) throw new NotFoundException('Jadwal kontrol belum tersedia.');
    return schedule;
  }

  async setInitial(treatmentId: string, input: Record<string, unknown>, staffId: string): Promise<ControlSchedule> {
    const existing = await this.schedules.findOneBy({ treatmentCourseId: treatmentId });
    const date = requiredDate(input.scheduledDate, 'Tanggal kontrol');
    if (existing) return this.override(treatmentId, input, staffId);
    await this.rejectIfCompleted(treatmentId);
    const schedule = await this.schedules.save(this.schedules.create({
      treatmentCourseId: treatmentId,
      referenceVisitId: null,
      defaultDate: null,
      scheduledDate: date,
      overriddenByStaffId: null,
      overriddenAt: null,
    }));
    await this.audit.record({ actorStaffId: staffId, objectType: 'control_schedule', objectId: schedule.id, action: 'initial_date_set', details: date });
    return schedule;
  }

  async override(treatmentId: string, input: Record<string, unknown>, staffId: string): Promise<ControlSchedule> {
    const schedule = await this.findByTreatment(treatmentId);
    await this.rejectIfCompleted(treatmentId);
    if (input.version !== undefined && Number(input.version) !== schedule.version) {
      throw new ConflictException({ message: 'Jadwal kontrol sudah berubah di server.', current: schedule });
    }
    const previousDate = schedule.scheduledDate;
    const newDate = requiredDate(input.scheduledDate, 'Tanggal kontrol');
    schedule.scheduledDate = newDate;
    schedule.overriddenByStaffId = staffId;
    schedule.overriddenAt = new Date();
    const saved = await this.schedules.save(schedule);
    await this.audit.record({
      actorStaffId: staffId,
      objectType: 'control_schedule',
      objectId: saved.id,
      action: 'date_overridden',
      details: `${previousDate} -> ${newDate}`,
    });
    return saved;
  }

  private async rejectIfCompleted(treatmentId: string): Promise<void> {
    const treatment = await this.treatments.findOneBy({ id: treatmentId });
    if (!treatment) throw new NotFoundException('Treatment tidak ditemukan.');
    if (treatment?.completedAt) {
      throw new ConflictException('Jadwal kontrol treatment yang sudah selesai tidak dapat diubah.');
    }
  }
}
