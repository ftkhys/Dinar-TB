import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { localTodayJakarta, toCalendarDate } from '../common/date-rules';
import { controlAlertLevel, controlAlertMessage } from './control-alert.rules';

@Injectable()
export class ControlAlertsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(now = new Date()) {
    const today = localTodayJakarta(now);
    const schedules: Array<{
      scheduleId: string;
      patientId: string;
      patientName: string;
      registerNumber: string | null;
      scheduledDate: string | Date;
      unmedicatedVisitDate: string | Date | null;
    }> =
      await this.dataSource.query(`
        SELECT cs.id AS "scheduleId", p.id AS "patientId", p.full_name AS "patientName",
               p.register_number AS "registerNumber",
               to_char(cs.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
               to_char((SELECT v.visit_date
                  FROM control_visits v
                 WHERE v.treatment_course_id = cs.treatment_course_id
                   AND v.medicine_given = false
                   AND v.created_at > COALESCE(reference_visit.created_at, cs.created_at)
                   AND v.visit_date <= $1
                 ORDER BY v.created_at DESC
                 LIMIT 1), 'YYYY-MM-DD') AS "unmedicatedVisitDate"
        FROM control_schedule cs
        JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
        JOIN patients p ON p.id = tc.patient_id
        LEFT JOIN control_visits reference_visit
          ON reference_visit.id = cs.reference_visit_id
         AND reference_visit.treatment_course_id = cs.treatment_course_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date AND p.archived_at IS NULL
      `, [today]);
    return schedules.flatMap((schedule) => {
      const scheduledDate = toCalendarDate(schedule.scheduledDate);
      const level = controlAlertLevel(scheduledDate, today);
      const unmedicatedVisitDate = schedule.unmedicatedVisitDate
        ? toCalendarDate(schedule.unmedicatedVisitDate)
        : null;
      return level ? [{
        ...schedule,
        scheduledDate,
        level,
        status: 'Belum kontrol',
        message: controlAlertMessage(schedule.patientName, scheduledDate, unmedicatedVisitDate),
      }] : [];
    });
  }
}
