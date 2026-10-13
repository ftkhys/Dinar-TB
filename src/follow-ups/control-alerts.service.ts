import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { localTodayJakarta } from '../common/date-rules';
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
      scheduledDate: string;
      unmedicatedVisitDate: string | null;
    }> =
      await this.dataSource.query(`
        SELECT cs.id AS "scheduleId", p.id AS "patientId", p.full_name AS "patientName", cs.scheduled_date AS "scheduledDate",
               (SELECT v.visit_date
                  FROM control_visits v
                 WHERE v.treatment_course_id = cs.treatment_course_id
                   AND v.medicine_given = false
                   AND v.created_at > COALESCE(reference_visit.created_at, cs.created_at)
                   AND v.visit_date <= $1
                 ORDER BY v.created_at DESC
                 LIMIT 1) AS "unmedicatedVisitDate"
        FROM control_schedule cs
        JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
        JOIN patients p ON p.id = tc.patient_id
        LEFT JOIN control_visits reference_visit
          ON reference_visit.id = cs.reference_visit_id
         AND reference_visit.treatment_course_id = cs.treatment_course_id
        WHERE tc.completed_at IS NULL
      `, [today]);
    return schedules.flatMap((schedule) => {
      const level = controlAlertLevel(String(schedule.scheduledDate).slice(0, 10), today);
      const scheduledDate = String(schedule.scheduledDate).slice(0, 10);
      const unmedicatedVisitDate = schedule.unmedicatedVisitDate
        ? String(schedule.unmedicatedVisitDate).slice(0, 10)
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
