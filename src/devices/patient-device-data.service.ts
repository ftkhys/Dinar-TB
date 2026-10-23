import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { dateInTimeZone, localTodayJakarta } from '../common/date-rules';
import { TreatmentDecision } from '../database/enums';
import { SettingsService } from '../settings/settings.service';
import {
  AdherenceSummary,
  summarizeAdherence,
} from '../adherence/adherence-rules';

export interface SyncParams {
  sinceVersion?: number;
  sinceScheduleVersion?: number;
  sinceTimestamp?: string;
  limit?: number;
  offset?: number;
}

export interface SyncResponse {
  patient: {
    id: string;
    fullName: string;
    registerNumber: string;
    address: string;
    version: number;
    archivedAt: Date | null;
  };
  treatmentCourses: Array<{
    id: string;
    patientId: string;
    startDate: string;
    initialTargetEndDate: string;
    finalDecision: string | null;
    finalReviewNote: string | null;
    finalReviewedAt: Date | null;
    continuedTargetEndDate: string | null;
    completedAt: Date | null;
    version: number;
    reviewDue: boolean;
    remindersEnabled: boolean;
    displayMessage: string | null;
  }>;
  controlSchedules: Array<{
    treatmentCourseId: string;
    referenceVisitId: string | null;
    defaultDate: string | null;
    scheduledDate: string;
    version: number;
    overriddenAt: Date | null;
  }>;
  reminderWindows: Array<{ start: string; end: string }>;
  clinic: { name: string; phone: string | null };
  serverTime: string;
  hasMore: boolean;
  maxVersion: number;
  maxScheduleVersion: number;
}

interface TreatmentCourseRow {
  id: string;
  patientId: string;
  startDate: string;
  initialTargetEndDate: string;
  finalDecision: string | null;
  finalReviewNote: string | null;
  finalReviewedAt: Date | null;
  continuedTargetEndDate: string | null;
  completedAt: Date | null;
  version: number;
}

export interface PatientProgress {
  treatment: {
    id: string;
    startDate: string;
    initialTargetEndDate: string;
    continuedTargetEndDate: string | null;
    completedAt: Date | null;
    finalDecision: string | null;
    finalReviewNote: string | null;
    finalReviewedAt: Date | null;
  } | null;
  visits: Array<{
    id: string;
    visitDate: string;
    medicineGiven: boolean;
    medicationGivenOn: string | null;
    complaintProgress: string | null;
    additionalNote: string | null;
  }>;
  adherence: AdherenceSummary | null;
  serverTime: string;
}

@Injectable()
export class PatientDeviceDataService {
  constructor(
    @InjectRepository(TreatmentCourse)
    private readonly treatments: Repository<TreatmentCourse>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async getCurrentData(patientId: string): Promise<SyncResponse> {
    return this.getSyncData(patientId, { sinceVersion: 0 });
  }

  async getSyncData(
    patientId: string,
    params: SyncParams,
  ): Promise<SyncResponse> {
    const [patient] = await this.dataSource.query(
      `SELECT id, full_name AS "fullName", register_number AS "registerNumber",
              address, version, archived_at AS "archivedAt",
              clock_timestamp() AS "syncTime"
         FROM patients WHERE id = $1`,
      [patientId],
    );
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');

    // A timestamp cursor is captured before the course/schedule queries. It
    // avoids the per-row version trap where an old course's high version hides
    // a newer course that starts again at version 1. Keeping the start time
    // (instead of the latest row's updated_at) also means an update that races
    // with this request is picked up by the next incremental sync.
    const serverTime = patient.syncTime
      ? new Date(patient.syncTime).toISOString()
      : new Date().toISOString();

    const limit = Math.max(1, Math.min(params.limit ?? 100, 200));
    const offset = Math.max(0, params.offset ?? 0);
    const sinceVersion =
      params.sinceVersion && params.sinceVersion > 0
        ? params.sinceVersion
        : null;
    const sinceScheduleVersion =
      params.sinceScheduleVersion && params.sinceScheduleVersion > 0
        ? params.sinceScheduleVersion
        : null;
    const sinceTimestamp = params.sinceTimestamp ?? null;

    // All queries use positional `$n` placeholders bound to an ordered array.
    // Mixing positional placeholders with named-parameter objects (the previous
    // implementation) made PostgreSQL throw "there is no parameter $1".
    const courseParams: (string | number)[] = [patientId];
    const courseWhere: string[] = ['patient_id = $1'];
    // Timestamp takes precedence when the client has one. Version cursors are
    // per-row, so an inflated cursor (for example course A v20 completed,
    // course B v1 active) can permanently hide a later B v2 completion. The
    // timestamp filter is scoped to the same patient and catches every change.
    if (sinceTimestamp) {
      courseParams.push(sinceTimestamp);
      courseWhere.push(`updated_at > $${courseParams.length}`);
    } else if (sinceVersion !== null) {
      courseParams.push(sinceVersion);
      courseWhere.push(`version > $${courseParams.length}`);
    }
    courseParams.push(limit + 1);
    const limitParam = courseParams.length;
    courseParams.push(offset);
    const offsetParam = courseParams.length;

    const courseRows = (await this.dataSource.query(
      `SELECT id, patient_id AS "patientId",
                to_char(start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(initial_target_end_date, 'YYYY-MM-DD') AS "initialTargetEndDate",
                final_decision AS "finalDecision",
                final_review_note AS "finalReviewNote",
                final_reviewed_at AS "finalReviewedAt",
                to_char(continued_target_end_date, 'YYYY-MM-DD') AS "continuedTargetEndDate",
                completed_at AS "completedAt",
                version
           FROM treatment_courses
          WHERE ${courseWhere.join(' AND ')}
          ORDER BY start_date DESC
          LIMIT $${limitParam} OFFSET $${offsetParam}`,
      courseParams,
    )) as TreatmentCourseRow[];

    const hasMore = courseRows.length > limit;
    const paginatedCourses = hasMore ? courseRows.slice(0, limit) : courseRows;

    // Control schedules are fetched independently of the treatment-course delta.
    // Overriding a control date only bumps `control_schedule.version`, never
    // `treatment_courses.version`, so deriving the course scope from the
    // version-filtered delta (or from a single shared cursor) could silently
    // drop a schedule-only change. Access stays scoped to this patient's own
    // active courses.
    const activeCourseRows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM treatment_courses WHERE patient_id = $1 AND completed_at IS NULL AND start_date <= $2::date`,
      [patientId, localTodayJakarta()],
    );
    const activeCourseIds = activeCourseRows.map((course) => course.id);

    let controlSchedules: any[] = [];
    if (activeCourseIds.length > 0) {
      const scheduleParams: any[] = [activeCourseIds];
      let scheduleWhere = 'treatment_course_id = ANY($1::uuid[])';
      if (sinceTimestamp) {
        scheduleParams.push(sinceTimestamp);
        scheduleWhere += ` AND updated_at > $${scheduleParams.length}`;
      } else if (sinceScheduleVersion !== null) {
        scheduleParams.push(sinceScheduleVersion);
        scheduleWhere += ` AND version > $${scheduleParams.length}`;
      }

      controlSchedules = await this.dataSource.query(
        `SELECT treatment_course_id AS "treatmentCourseId", reference_visit_id AS "referenceVisitId",
                to_char(default_date, 'YYYY-MM-DD') AS "defaultDate",
                to_char(scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
                version, overridden_at AS "overriddenAt"
           FROM control_schedule WHERE ${scheduleWhere}`,
        scheduleParams,
      );
    }

    const [clinic, reminderWindows] = await Promise.all([
      this.settings.clinicInfo(),
      this.settings.reminderWindows(),
    ]);

    const today = localTodayJakarta();
    const courses = paginatedCourses.map((course) => ({
      ...course,
      reviewDue:
        !course.completedAt &&
        (course.continuedTargetEndDate ?? course.initialTargetEndDate) <= today,
      remindersEnabled: !course.completedAt && course.startDate <= today,
      displayMessage:
        course.finalDecision === TreatmentDecision.COMPLETED
          ? 'Pengobatan selesai'
          : null,
    }));

    const treatmentMaxVersion =
      courses.length > 0 ? Math.max(...courses.map((c) => c.version)) : 0;
    const scheduleMaxVersion =
      controlSchedules.length > 0
        ? Math.max(...controlSchedules.map((s) => s.version))
        : 0;

    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        registerNumber: patient.registerNumber,
        address: patient.address,
        version: patient.version,
        archivedAt: patient.archivedAt ?? null,
      },
      treatmentCourses: courses,
      controlSchedules,
      reminderWindows,
      clinic,
      serverTime,
      hasMore,
      // The treatment-course cursor must not be inflated by schedule versions.
      // Otherwise a schedule change at version 20 would advance the client's
      // course cursor past an unfinished course at version 4, and a later
      // completion decision (version 5) would never be delivered.
      maxVersion: treatmentMaxVersion,
      maxScheduleVersion: scheduleMaxVersion,
    };
  }

  /**
   * Patient-visible treatment progress, derived strictly from records staff
   * already entered (`control_visits` and `daily_adherence`). No clinical
   * status is inferred here; free-text fields are the officer's own notes.
   */
  async getProgress(patientId: string): Promise<PatientProgress> {
    const [patient] = await this.dataSource.query(
      'SELECT id FROM patients WHERE id = $1',
      [patientId],
    );
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');

    const [treatment] = await this.dataSource.query(
      `SELECT id,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(initial_target_end_date, 'YYYY-MM-DD') AS "initialTargetEndDate",
              to_char(continued_target_end_date, 'YYYY-MM-DD') AS "continuedTargetEndDate",
              completed_at AS "completedAt",
              final_decision AS "finalDecision",
              final_review_note AS "finalReviewNote",
              final_reviewed_at AS "finalReviewedAt"
         FROM treatment_courses
        WHERE patient_id = $1
        ORDER BY (completed_at IS NULL) DESC, start_date DESC
        LIMIT 1`,
      [patientId],
    );

    const visits = await this.dataSource.query(
      `SELECT id,
              to_char(visit_date, 'YYYY-MM-DD') AS "visitDate",
              medicine_given AS "medicineGiven",
              to_char(medication_given_on, 'YYYY-MM-DD') AS "medicationGivenOn",
              complaint_progress AS "complaintProgress",
              additional_note AS "additionalNote"
         FROM control_visits
        WHERE patient_id = $1
        ORDER BY visit_date DESC, created_at DESC`,
      [patientId],
    );

    let adherence: AdherenceSummary | null = null;
    if (treatment) {
      const rows = await this.dataSource.query(
        `SELECT to_char(adherence_date, 'YYYY-MM-DD') AS "date", confirmed_at AS "confirmedAt"
           FROM daily_adherence WHERE treatment_course_id = $1`,
        [treatment.id],
      );
      const confirmations = new Map<string, string>(
        rows.map((row: { date: string; confirmedAt: Date }) => [
          row.date,
          new Date(row.confirmedAt).toISOString(),
        ]),
      );
      const completedDate = treatment.completedAt
        ? dateInTimeZone(treatment.completedAt, 'Asia/Jakarta')
        : null;
      adherence = summarizeAdherence(
        treatment.startDate,
        localTodayJakarta(),
        completedDate,
        confirmations,
      );
    }

    return {
      treatment: treatment ?? null,
      visits,
      adherence,
      serverTime: new Date().toISOString(),
    };
  }
}
