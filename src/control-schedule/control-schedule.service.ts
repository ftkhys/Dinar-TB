import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { localTodayJakarta, nextServiceDay } from '../common/date-rules';
import { requiredDate } from '../common/input';
import { Paginated, PaginationQuery, paginate, paginationOffset } from '../common/pagination';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { ControlScheduleStatus } from './control-schedule.rules';

export interface ManagedControlSchedule {
  scheduleId: string | null;
  treatmentCourseId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  address: string;
  scheduledDate: string | null;
  completed: boolean;
  status: ControlScheduleStatus;
}

export type ControlScheduleStatusCounts = Record<ControlScheduleStatus, number>;
export type ManagedControlSchedulePage = Paginated<ManagedControlSchedule> & { statusCounts: ControlScheduleStatusCounts };

export interface ScheduleChangedEvent {
  treatmentCourseId: string;
  scheduleId: string;
  previousDate: string | null;
  newDate: string;
  overriddenByStaffId: string | null;
  version: number;
  changedAt: Date;
}

@Injectable()
export class ControlScheduleService {
  constructor(
    @InjectRepository(ControlSchedule) private readonly schedules: Repository<ControlSchedule>,
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Every treatment course staff have to manage: one row per treatment course
   * (active or completed) whose patient is still visible. A course with no
   * stored schedule is shown as "Perlu Konfirmasi" — never as "Terlambat" —
   * so an unknown or overdue history is confirmed by staff instead of being
   * presented as a missed appointment. Status is otherwise derived from the
   * schedule's own date and the treatment completion flag.
   */
  async listManaged(
    search?: string,
    now = new Date(),
    pagination: PaginationQuery = { page: 1, pageSize: 20 },
    statusFilter?: ControlScheduleStatus,
  ): Promise<ManagedControlSchedulePage> {
    const today = localTodayJakarta(now);
    const tomorrow = nextServiceDay(today);
    const term = search?.trim() ? `%${search.trim()}%` : null;
    const base = `WITH managed AS (
      SELECT cs.id AS "scheduleId", tc.id AS "treatmentCourseId",
             p.id AS "patientId", p.full_name AS "patientName", p.register_number AS "registerNumber",
             p.address, to_char(cs.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
             (tc.completed_at IS NOT NULL) AS completed,
             CASE WHEN tc.completed_at IS NOT NULL THEN 'Selesai'
                  WHEN cs.scheduled_date IS NULL THEN 'Perlu Konfirmasi'
                  WHEN cs.scheduled_date < $1::date THEN 'Terlambat'
                  WHEN cs.scheduled_date = $1::date THEN 'Hari Ini'
                  WHEN cs.scheduled_date = $2::date THEN 'Besok'
                  ELSE 'Mendatang' END AS status
        FROM treatment_courses tc
        JOIN patients p ON p.id = tc.patient_id
        LEFT JOIN control_schedule cs ON cs.treatment_course_id = tc.id
       WHERE p.archived_at IS NULL AND p.anonymized_at IS NULL
         AND ($3::text IS NULL OR p.full_name ILIKE $3 OR p.register_number ILIKE $3 OR p.medical_record_number ILIKE $3)
    )`;
    const params = [today, tomorrow, term, statusFilter ?? null];
    const [meta] = await this.dataSource.query(
      `${base}
       SELECT COUNT(*) FILTER (WHERE ($4::text IS NULL OR status = $4))::int AS total,
              COUNT(*) FILTER (WHERE status = 'Hari Ini')::int AS "hariIni",
              COUNT(*) FILTER (WHERE status = 'Besok')::int AS besok,
              COUNT(*) FILTER (WHERE status = 'Terlambat')::int AS terlambat,
              COUNT(*) FILTER (WHERE status = 'Mendatang')::int AS mendatang,
              COUNT(*) FILTER (WHERE status = 'Perlu Konfirmasi')::int AS "perluKonfirmasi",
              COUNT(*) FILTER (WHERE status = 'Selesai')::int AS selesai
         FROM managed`,
      params,
    ) as Array<Record<string, number | string>>;
    const rows: ManagedControlSchedule[] = await this.dataSource.query(
      `${base}
       SELECT * FROM managed
        WHERE ($4::text IS NULL OR status = $4)
        ORDER BY "scheduledDate" ASC NULLS FIRST, "patientName" ASC, "treatmentCourseId" ASC
        LIMIT $5 OFFSET $6`,
      [...params, pagination.pageSize, paginationOffset(pagination)],
    );
    const total = Number(meta?.total ?? 0);
    const statusCounts: ControlScheduleStatusCounts = {
      'Hari Ini': Number(meta?.hariIni ?? 0),
      Besok: Number(meta?.besok ?? 0),
      Terlambat: Number(meta?.terlambat ?? 0),
      Mendatang: Number(meta?.mendatang ?? 0),
      'Perlu Konfirmasi': Number(meta?.perluKonfirmasi ?? 0),
      Selesai: Number(meta?.selesai ?? 0),
    };
    return { ...paginate(rows, total, pagination), statusCounts };
  }

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

    this.eventEmitter.emit('schedule.changed', {
      treatmentCourseId: treatmentId,
      scheduleId: schedule.id,
      previousDate: null,
      newDate: date,
      // The row stores no override for an initial date, so the event must not
      // attribute it to a staff override either (kept in sync with the DB).
      overriddenByStaffId: null,
      version: schedule.version,
      changedAt: new Date(),
    } satisfies ScheduleChangedEvent);

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

    this.eventEmitter.emit('schedule.changed', {
      treatmentCourseId: treatmentId,
      scheduleId: saved.id,
      previousDate,
      newDate,
      overriddenByStaffId: staffId,
      version: saved.version,
      changedAt: new Date(),
    } satisfies ScheduleChangedEvent);

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
