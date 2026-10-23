import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { addCalendarDays, localTodayJakarta } from '../common/date-rules';
import { Paginated, PaginationQuery, paginate, paginationOffset } from '../common/pagination';
import {
  optionalChoice,
  optionalDate,
  optionalPhone,
  optionalString,
  requiredString,
} from '../common/input';
import { findIdentityConflict, identityConflictMessage } from '../common/patient-match';
import { Patient } from '../database/entities/patient.entity';

/** Accepted values for the patient gender field (prototype dropdown). */
export const PATIENT_GENDERS = ['Perempuan', 'Laki-laki'] as const;

export type ControlStatus = 'Hari Ini' | 'Besok' | 'Terlambat' | 'Mendatang' | 'Perlu Konfirmasi';

export type PatientOutput = Omit<Patient, 'nik'>;

export type PatientDirectoryEntry = PatientOutput & {
  treatment: {
    id: string;
    startDate: string;
    treatmentStage: string | null;
    completedAt: string | null;
    lastControlDate: string | null;
    lastMedicationDate: string | null;
  } | null;
  schedule: { scheduledDate: string } | null;
  controlStatus: ControlStatus | null;
};

export type PatientStats = { total: number; sesuai: number; dekat: number; terlambat: number };

function controlStatusOf(scheduledDate: string | null, today: string, tomorrow: string): ControlStatus | null {
  if (!scheduledDate) return null;
  if (scheduledDate < today) return 'Terlambat';
  if (scheduledDate === today) return 'Hari Ini';
  if (scheduledDate === tomorrow) return 'Besok';
  return 'Mendatang';
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: Record<string, unknown>, staffId: string): Promise<PatientOutput> {
    const registerNumber = requiredString(input.registerNumber, 'Nomor Register Pasien', 100);
    const medicalRecordNumber = requiredString(input.medicalRecordNumber, 'Nomor Rekam Medis', 100);
    const patient = this.patients.create({
      fullName: requiredString(input.fullName, 'Nama pasien', 200),
      registerNumber,
      medicalRecordNumber,
      address: requiredString(input.address, 'Alamat', 4000),
      dateOfBirth: this.resolveDateOfBirth(input.dateOfBirth),
      gender: optionalChoice(input.gender, 'Jenis kelamin', PATIENT_GENDERS),
      phone: optionalPhone(input.phone, 'Nomor telepon', 32),
      nik: optionalString(input.nik, 'NIK', 32),
      pmoName: optionalString(input.pmoName, 'Nama PMO', 200),
      pmoContact: optionalString(input.pmoContact, 'Kontak PMO', 100),
      createdByStaffId: staffId,
    });
    await this.assertIdentityAvailable(registerNumber, medicalRecordNumber);
    const saved = await this.saveOrConflict(patient);
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: saved.id, action: 'created' });
    return withoutNik(saved);
  }

  async findAll(
    search?: string,
    options: { includeArchived?: boolean; archivedOnly?: boolean } = {},
  ): Promise<PatientOutput[]> {
    const query = this.patients.createQueryBuilder('patient').orderBy('patient.fullName', 'ASC');
    const hasArchiveFilter = options.archivedOnly || !options.includeArchived;
    if (options.archivedOnly) query.where('patient.archivedAt IS NOT NULL').andWhere('patient.anonymizedAt IS NULL');
    else if (!options.includeArchived) query.where('patient.archivedAt IS NULL');
    if (search?.trim()) {
      const clause =
        '(patient.fullName ILIKE :search OR patient.registerNumber ILIKE :search OR patient.medicalRecordNumber ILIKE :search)';
      if (hasArchiveFilter) query.andWhere(clause, { search: `%${search.trim()}%` });
      else query.where(clause, { search: `%${search.trim()}%` });
    }
    return (await query.take(500).getMany()).map(withoutNik);
  }

  /**
   * Pasien directory projection for the Patients table: every active patient
   * with its current active treatment and control schedule, so the UI can show
   * "Bulan Pengobatan", "Jadwal Kontrol", and a derived control status without
   * inventing values client-side.
   */
  async directory(
    search?: string,
    now = new Date(),
    pagination: PaginationQuery = { page: 1, pageSize: 20 },
    status?: string,
  ): Promise<Paginated<PatientDirectoryEntry>> {
    const term = search?.trim() ? `%${search.trim()}%` : null;
    const today = localTodayJakarta(now);
    const tomorrow = addCalendarDays(today, 1);
    const from = `FROM patients p
         LEFT JOIN LATERAL (
           SELECT t.id, t.start_date, t.treatment_stage, t.completed_at,
                  t.last_control_date, t.last_medication_date
             FROM treatment_courses t
            WHERE t.patient_id = p.id AND t.completed_at IS NULL
            ORDER BY t.start_date DESC
            LIMIT 1
         ) tc ON TRUE
         LEFT JOIN control_schedule cs ON cs.treatment_course_id = tc.id
        WHERE p.archived_at IS NULL AND p.anonymized_at IS NULL
          AND ($1::text IS NULL OR p.full_name ILIKE $1 OR p.register_number ILIKE $1 OR p.medical_record_number ILIKE $1)
          AND ($4::text IS NULL OR CASE
            WHEN tc.id IS NULL OR tc.start_date > $2::date THEN NULL
            WHEN cs.scheduled_date IS NULL THEN 'Perlu Konfirmasi'
            WHEN cs.scheduled_date < $2::date THEN 'Terlambat'
            WHEN cs.scheduled_date = $2::date THEN 'Hari Ini'
            WHEN cs.scheduled_date = $3::date THEN 'Besok'
            ELSE 'Mendatang' END = $4)`;
    const params = [term, today, tomorrow, status ?? null];
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total ${from}`,
      params,
    ) as Array<{ total: number | string }>;
    const total = Number(countRows[0]?.total ?? 0);
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT p.id, p.full_name AS "fullName", p.register_number AS "registerNumber",
              p.medical_record_number AS "medicalRecordNumber", p.address,
              to_char(p.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth", p.gender, p.phone,
              p.pmo_name AS "pmoName", p.pmo_contact AS "pmoContact",
              p.created_by_staff_id AS "createdByStaffId", p.version,
              p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.archived_at AS "archivedAt",
              p.anonymized_at AS "anonymizedAt",
              tc.id AS "treatmentId", to_char(tc.start_date, 'YYYY-MM-DD') AS "startDate",
              tc.treatment_stage AS "treatmentStage", tc.completed_at AS "completedAt",
              to_char(tc.last_control_date, 'YYYY-MM-DD') AS "lastControlDate",
              to_char(tc.last_medication_date, 'YYYY-MM-DD') AS "lastMedicationDate",
              to_char(cs.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate"
         ${from}
        ORDER BY p.full_name ASC, p.id ASC
        LIMIT $5 OFFSET $6`,
      [...params, pagination.pageSize, paginationOffset(pagination)],
    );
    const items = rows.map((row) => {
      const scheduledDate = (row.scheduledDate as string | null) ?? null;
      const completedAt = row.completedAt ? new Date(row.completedAt as string) : null;
      const hasActiveTreatment = Boolean(row.treatmentId) && !completedAt && (row.startDate as string) <= today;
      return {
        id: row.id as string,
        fullName: row.fullName as string,
        registerNumber: row.registerNumber as string,
        medicalRecordNumber: row.medicalRecordNumber as string,
        address: row.address as string,
        dateOfBirth: (row.dateOfBirth as string | null) ?? null,
        gender: (row.gender as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        pmoName: (row.pmoName as string | null) ?? null,
        pmoContact: (row.pmoContact as string | null) ?? null,
        createdByStaffId: (row.createdByStaffId as string | null) ?? null,
        version: Number(row.version),
        createdAt: new Date(row.createdAt as string),
        updatedAt: new Date(row.updatedAt as string),
        archivedAt: row.archivedAt ? new Date(row.archivedAt as string) : null,
        anonymizedAt: row.anonymizedAt ? new Date(row.anonymizedAt as string) : null,
        treatment: row.treatmentId
          ? {
              id: row.treatmentId as string,
              startDate: row.startDate as string,
              treatmentStage: (row.treatmentStage as string | null) ?? null,
              completedAt: completedAt ? completedAt.toISOString() : null,
              lastControlDate: (row.lastControlDate as string | null) ?? null,
              lastMedicationDate: (row.lastMedicationDate as string | null) ?? null,
            }
          : null,
        schedule: hasActiveTreatment && scheduledDate ? { scheduledDate } : null,
        controlStatus: hasActiveTreatment
          ? scheduledDate
            ? controlStatusOf(scheduledDate, today, tomorrow)
            : 'Perlu Konfirmasi'
          : null,
      };
    });
    return paginate(items, total, pagination);
  }

  /**
   * Pasien card stats, all derived from active patients and their current
   * control schedule:
   *  - sesuai    : current schedule is today or later (on track)
   *  - dekat     : current schedule falls within the next 7 days (today..+7)
   *  - terlambat : current schedule is before today
   */
  async stats(now = new Date()): Promise<PatientStats> {
    const today = localTodayJakarta(now);
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM patients WHERE archived_at IS NULL) AS total,
         count(*) FILTER (WHERE s.scheduled_date >= $1::date)::int AS sesuai,
         count(*) FILTER (WHERE s.scheduled_date >= $1::date AND s.scheduled_date <= ($1::date + 7))::int AS dekat,
         count(*) FILTER (WHERE s.scheduled_date < $1::date)::int AS terlambat
       FROM (
         SELECT cs.scheduled_date
           FROM control_schedule cs
           JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
           JOIN patients p ON p.id = tc.patient_id
          WHERE tc.completed_at IS NULL AND p.archived_at IS NULL
       ) s`,
      [today],
    );
    return {
      total: Number(row?.total ?? 0),
      sesuai: Number(row?.sesuai ?? 0),
      dekat: Number(row?.dekat ?? 0),
      terlambat: Number(row?.terlambat ?? 0),
    };
  }

  async findOne(id: string): Promise<PatientOutput> {
    return withoutNik(await this.findEntity(id));
  }

  async update(id: string, input: Record<string, unknown>, staffId: string, expectedVersion?: number): Promise<PatientOutput> {
    const patient = await this.findEntity(id);
    if (expectedVersion !== undefined && patient.version !== expectedVersion) {
      throw new ConflictException({ message: 'Data pasien sudah berubah di server.', current: patient });
    }
    const changed: string[] = [];
    const textFields: Array<[string, keyof Patient, number]> = [
      ['fullName', 'fullName', 200],
      ['registerNumber', 'registerNumber', 100],
      ['medicalRecordNumber', 'medicalRecordNumber', 100],
      ['address', 'address', 4000],
    ];
    for (const [inputKey, property, maxLength] of textFields) {
      if (input[inputKey] !== undefined) {
        (patient[property] as unknown) = requiredString(input[inputKey], inputKey, maxLength);
        changed.push(inputKey);
      }
    }
    for (const [inputKey, property, maxLength] of [
      ['nik', 'nik', 32],
      ['pmoName', 'pmoName', 200],
      ['pmoContact', 'pmoContact', 100],
    ] as Array<[string, keyof Patient, number]>) {
      if (input[inputKey] !== undefined) {
        (patient[property] as unknown) = optionalString(input[inputKey], inputKey, maxLength);
        changed.push(inputKey);
      }
    }
    if (input.dateOfBirth !== undefined) {
      patient.dateOfBirth = this.resolveDateOfBirth(input.dateOfBirth);
      changed.push('dateOfBirth');
    }
    if (input.gender !== undefined) {
      patient.gender = optionalChoice(input.gender, 'Jenis kelamin', PATIENT_GENDERS);
      changed.push('gender');
    }
    if (input.phone !== undefined) {
      patient.phone = optionalPhone(input.phone, 'Nomor telepon', 32);
      changed.push('phone');
    }
    if (!changed.length) return withoutNik(patient);
    if (changed.includes('registerNumber') || changed.includes('medicalRecordNumber')) {
      await this.assertIdentityAvailable(patient.registerNumber, patient.medicalRecordNumber, id);
    }
    const saved = await this.saveOrConflict(patient);
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'identity_updated', details: changed.join(',') });
    return withoutNik(saved);
  }

  /**
   * Soft-deletes a patient without touching treatment/visit/audit history.
   * Active patient devices are deactivated in the same transaction so a token
   * issued before archiving cannot keep syncing data.
   */
  async archive(id: string, staffId: string): Promise<PatientOutput> {
    const patient = await this.findEntity(id, { includeArchived: true });
    const firstArchive = !patient.archivedAt;
    if (firstArchive) patient.archivedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      if (firstArchive) await manager.save(patient);
      await manager.query(
        `UPDATE patient_devices
            SET deactivated_at = now(), updated_at = now(), version = version + 1
          WHERE patient_id = $1 AND deactivated_at IS NULL`,
        [id],
      );
    });
    if (firstArchive) {
      await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'archived' });
    }
    return withoutNik(patient);
  }

  /**
   * Reverses a soft-delete so an archived patient becomes active again.
   * Devices stay deactivated; the patient must activate a device again.
   */
  async restore(id: string, staffId: string): Promise<PatientOutput> {
    const patient = await this.findEntity(id, { includeArchived: true });
    if (!patient.archivedAt) return withoutNik(patient);
    patient.archivedAt = null;
    const saved = await this.patients.save(patient);
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'restored' });
    return withoutNik(saved);
  }

  /**
   * Permanently removes an ARCHIVED patient from every list.
   *
   * Two retention-safe outcomes:
   *  - No clinical history: the patient row and its non-clinical access
   *    artifacts are hard-deleted.
   *  - With clinical history: the medical record (treatment courses, visits,
   *    adherence, follow-ups) is preserved by policy, so every identifying
   *    attribute is erased instead — the patient row is anonymized/hidden,
   *    while device links, activation codes, and notification messages (the
   *    non-clinical artifacts that can identify the person) are deleted.
   *
   * Audit log entries are append-only and carry no FK to the patient, so the
   * erasure stays traceable. Never destroys protected clinical history.
   */
  async purge(id: string, staffId: string): Promise<{ id: string; mode: 'deleted' | 'anonymized' }> {
    const patient = await this.findEntity(id, { includeArchived: true });
    if (!patient.archivedAt) {
      throw new ConflictException('Pasien harus dinonaktifkan ke Arsip Pasien sebelum dapat dihapus permanen.');
    }
    const [counts] = await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM treatment_courses WHERE patient_id = $1) AS treatments,
         (SELECT count(*)::int FROM control_visits WHERE patient_id = $1) AS visits,
         (SELECT count(*)::int FROM daily_adherence da
             JOIN treatment_courses tc ON tc.id = da.treatment_course_id
            WHERE tc.patient_id = $1) AS adherences,
         (SELECT count(*)::int FROM follow_ups fu
             JOIN control_schedule cs ON cs.id = fu.control_schedule_id
             JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
            WHERE tc.patient_id = $1) AS follow_ups`,
      [id],
    );
    const hasClinicalHistory =
      Number(counts?.treatments ?? 0) > 0 ||
      Number(counts?.visits ?? 0) > 0 ||
      Number(counts?.adherences ?? 0) > 0 ||
      Number(counts?.follow_ups ?? 0) > 0;

    if (!hasClinicalHistory) {
      await this.dataSource.transaction(async (manager) => {
        await manager.query('DELETE FROM control_visits WHERE patient_id = $1', [id]);
        await manager.query('DELETE FROM activation_codes WHERE patient_id = $1', [id]);
        await manager.query('DELETE FROM patient_devices WHERE patient_id = $1', [id]);
        await manager.query('DELETE FROM provider_notifications WHERE patient_id = $1', [id]);
        await manager.query('DELETE FROM treatment_courses WHERE patient_id = $1', [id]);
        await manager.query('DELETE FROM patients WHERE id = $1', [id]);
      });
      // No clinical history remains, so the row is truly gone: snapshot the
      // name into the append-only audit record so the deletion stays traceable.
      await this.audit.record({
        actorStaffId: staffId,
        objectType: 'patient',
        objectId: id,
        action: 'permanently_deleted',
        details: JSON.stringify({ patientName: patient.fullName }),
      });
      return { id, mode: 'deleted' };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM patient_devices WHERE patient_id = $1', [id]);
      await manager.query('DELETE FROM activation_codes WHERE patient_id = $1', [id]);
      await manager.query('DELETE FROM provider_notifications WHERE patient_id = $1', [id]);
      await manager.query(
        `UPDATE patients SET
           full_name = $2,
           register_number = $3,
           medical_record_number = $3,
           address = $4,
           nik = NULL,
           pmo_name = NULL,
           pmo_contact = NULL,
           date_of_birth = NULL,
           gender = NULL,
           phone = NULL,
           anonymized_at = now(),
           updated_at = now()
         WHERE id = $1`,
        [id, 'Pasien Dianonimkan', `ANON-${id.slice(0, 8)}`, '-'],
      );
    });
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'anonymized' });
    return { id, mode: 'anonymized' };
  }

  /** Returns the active patient entity or throws 404 (archived counts as gone). */
  async findActiveEntity(id: string): Promise<Patient> {
    return this.findEntity(id);
  }

  private resolveDateOfBirth(value: unknown): string | null {
    const dateOfBirth = optionalDate(value, 'Tanggal lahir');
    if (dateOfBirth && dateOfBirth > localTodayJakarta()) {
      throw new BadRequestException('Tanggal lahir tidak boleh di masa depan.');
    }
    return dateOfBirth;
  }

  /**
   * Friendly pre-check for a duplicate identity (409). Normalizes with
   * `patient-match` so `" rm-1 "` collides with `"RM-1"`. The unique indexes
   * added by the identity migration are the race-safe backstop.
   */
  private async assertIdentityAvailable(
    registerNumber: string,
    medicalRecordNumber: string,
    excludeId?: string | null,
  ): Promise<void> {
    const conflict = await findIdentityConflict(
      (sql, params) => this.dataSource.query(sql, params),
      { registerNumber, medicalRecordNumber },
      excludeId,
    );
    if (conflict) throw new ConflictException(identityConflictMessage(conflict.kind));
  }

  /** Maps a unique-index violation (23505) from the DB back to a clear 409. */
  private async saveOrConflict(patient: Patient): Promise<Patient> {
    try {
      return await this.patients.save(patient);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('Nomor Register Pasien atau Nomor Rekam Medis sudah digunakan pasien lain.');
      }
      throw error;
    }
  }

  private async findEntity(id: string, options: { includeArchived?: boolean } = {}): Promise<Patient> {
    const patient = await this.patients.findOneBy({ id });
    if (!patient || patient.anonymizedAt || (!options.includeArchived && patient.archivedAt)) {
      throw new NotFoundException('Pasien tidak ditemukan.');
    }
    return patient;
  }
}

function withoutNik(patient: Patient): PatientOutput {
  const { nik: _nik, ...safe } = patient;
  return safe;
}
