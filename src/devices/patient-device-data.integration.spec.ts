import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSource } from '../database/data-source';
import { PatientDeviceDataService } from './patient-device-data.service';
import { SettingsService } from '../settings/settings.service';
import { AppSetting } from '../database/entities/app-setting.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';

/**
 * Integration coverage for the patient sync/progress read models against a real
 * PostgreSQL instance. It creates its own throwaway rows (random UUIDs) and
 * removes them again, so it never touches existing data. Skipped unless
 * RUN_DB_TESTS=1 so the default unit run stays database-free.
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const describeDb = runDb ? describe : describe.skip;

describeDb('patient device data (integration, real PostgreSQL)', () => {
  let ds: DataSource;
  let service: PatientDeviceDataService;
  const patientId = randomUUID();
  const treatmentId = randomUUID();
  const scheduleId = randomUUID();
  const visitId = randomUUID();
  const adherenceId = randomUUID();
  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const targetEnd = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let staffId: string;

  beforeAll(async () => {
    ds = dataSource;
    if (!ds.isInitialized) await ds.initialize();

    const [staff] = await ds.query('SELECT id FROM staff_accounts ORDER BY created_at LIMIT 1');
    if (!staff) throw new Error('Integration test needs at least one staff account (read-only).');
    staffId = staff.id;

    await ds.query(
      `INSERT INTO patients (id, full_name, register_number, medical_record_number, address)
       VALUES ($1, $2, $3, $4, $5)`,
      [patientId, 'Pasien Uji Integrasi', `UJI-${patientId.slice(0, 8)}`, `MRN-${patientId.slice(0, 8)}`, 'Alamat Uji'],
    );
    await ds.query(
      `INSERT INTO treatment_courses (id, patient_id, start_date, initial_target_end_date, version)
       VALUES ($1, $2, $3, $4, 7)`,
      [treatmentId, patientId, start, targetEnd],
    );
    await ds.query(
      `INSERT INTO control_schedule (id, treatment_course_id, scheduled_date, version)
       VALUES ($1, $2, $3, 3)`,
      [scheduleId, treatmentId, targetEnd],
    );
    await ds.query(
      `INSERT INTO control_visits (id, patient_id, treatment_course_id, visit_date, complaint_progress, medicine_given, medication_given_on, recorded_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, true, $4, $6)`,
      [visitId, patientId, treatmentId, start, 'Catatan uji integrasi', staffId],
    );
    await ds.query(
      `INSERT INTO daily_adherence (id, treatment_course_id, adherence_date, status, confirmed_at)
       VALUES ($1, $2, $3, 'Sudah diminum', now())`,
      [adherenceId, treatmentId, start],
    );

    const settings = new SettingsService(ds.getRepository(AppSetting) as never, {} as never);
    service = new PatientDeviceDataService(ds.getRepository(TreatmentCourse), ds, settings);
  });

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    await ds.query('DELETE FROM daily_adherence WHERE id = $1', [adherenceId]);
    await ds.query('DELETE FROM control_visits WHERE id = $1', [visitId]);
    await ds.query('DELETE FROM control_schedule WHERE id = $1', [scheduleId]);
    await ds.query('DELETE FROM treatment_courses WHERE id = $1', [treatmentId]);
    await ds.query('DELETE FROM patients WHERE id = $1', [patientId]);
    await ds.destroy();
  });

  it('returns a full payload for the base case (sinceVersion=0) without SQL errors', async () => {
    const result = await service.getSyncData(patientId, { sinceVersion: 0 });

    expect(result.patient.id).toBe(patientId);
    expect(result.patient.fullName).toBe('Pasien Uji Integrasi');
    expect(result.patient.archivedAt).toBeNull();
    expect(result.treatmentCourses.map((c) => c.id)).toContain(treatmentId);
    expect(result.controlSchedules.map((s) => s.treatmentCourseId)).toContain(treatmentId);
    expect(result.reminderWindows).toHaveLength(2);
    expect(result.clinic.name).toBeTruthy();
    expect(result.maxVersion).toBeGreaterThanOrEqual(7);
  });

  it('filters courses by sinceVersion but keeps active schedules (independent cursor)', async () => {
    const result = await service.getSyncData(patientId, { sinceVersion: 5 });

    expect(result.treatmentCourses.map((c) => c.id)).toContain(treatmentId);
    // Schedules are scoped to the patient's active courses and gated by their own
    // cursor, not by the treatment-course delta, so a schedule-only change is not
    // dropped. Course version 7 > 5 keeps the course; schedule version 3 is still
    // returned because no schedule cursor was supplied.
    expect(result.controlSchedules.map((s) => s.treatmentCourseId)).toContain(treatmentId);
    expect(result.maxScheduleVersion).toBe(3);
  });

  it('excludes schedules below the supplied schedule cursor', async () => {
    const result = await service.getSyncData(patientId, { sinceScheduleVersion: 3 });

    expect(result.controlSchedules.map((s) => s.treatmentCourseId)).not.toContain(treatmentId);
  });

  it('derives progress from stored visits and adherence', async () => {
    const progress = await service.getProgress(patientId);

    expect(progress.treatment?.id).toBe(treatmentId);
    expect(progress.visits.some((v) => v.id === visitId && v.complaintProgress === 'Catatan uji integrasi')).toBe(true);
    expect(progress.adherence?.totalTaken).toBe(1);
  });
});
