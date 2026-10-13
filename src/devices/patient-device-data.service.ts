import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { localTodayJakarta } from '../common/date-rules';
import { TreatmentDecision } from '../database/enums';

@Injectable()
export class PatientDeviceDataService {
  constructor(
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    private readonly dataSource: DataSource,
  ) {}

  async getCurrentData(patientId: string): Promise<unknown> {
    const [patient] = await this.dataSource.query(
      `SELECT id, full_name AS "fullName", address FROM patients WHERE id = $1`,
      [patientId],
    );
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
    const treatmentCourses = await this.treatments.find({ where: { patientId }, order: { startDate: 'DESC' } });
    const controlSchedules = treatmentCourses.length
      ? await this.dataSource.query(
        `SELECT treatment_course_id AS "treatmentCourseId", reference_visit_id AS "referenceVisitId",
                default_date AS "defaultDate", scheduled_date AS "scheduledDate", version
           FROM control_schedule WHERE treatment_course_id = ANY($1::uuid[])`,
        [treatmentCourses.filter((course) => !course.completedAt).map((course) => course.id)],
      )
      : [];
    const today = localTodayJakarta();
    const courses = treatmentCourses.map((course) => ({
      ...course,
      reviewDue: !course.completedAt && (course.continuedTargetEndDate ?? course.initialTargetEndDate) <= today,
      remindersEnabled: !course.completedAt,
      displayMessage: course.finalDecision === TreatmentDecision.COMPLETED ? 'Pengobatan selesai' : null,
    }));
    return {
      patient,
      treatmentCourses: courses,
      controlSchedules,
      timeZone: 'Asia/Jakarta',
      reminderWindows: [
        { start: '06:00', end: '07:00' },
        { start: '20:00', end: '21:00' },
      ],
      confirmationRule: 'Konfirmasi dapat dilakukan kapan saja pada tanggal obat.',
    };
  }
}
