import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDinarTbSchema1780000000000 implements MigrationInterface {
  name = 'CreateDinarTbSchema1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE adherence_status AS ENUM ('Belum dikonfirmasi', 'Sudah diminum', 'Terlewat')`);
    await queryRunner.query(`CREATE TYPE treatment_decision AS ENUM ('Selesai', 'Dilanjutkan')`);
    await queryRunner.query(`CREATE TYPE follow_up_outcome AS ENUM ('Pasien sudah datang', 'Pasien belum datang', 'Pasien lupa jadwal', 'Pasien terkendala transportasi', 'Pasien sakit', 'Pasien tidak dapat dihubungi', 'Alasan lainnya')`);
    await queryRunner.query(`CREATE TYPE provider_notification_type AS ENUM ('CONTROL_H_MINUS_ONE', 'CONTROL_DUE', 'CONTROL_OVERDUE', 'DOSE_REMINDER_MORNING', 'DOSE_REMINDER_EVENING')`);

    await queryRunner.query(`CREATE TABLE staff_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username varchar(80) NOT NULL UNIQUE,
      password_hash varchar(255) NOT NULL, disabled_at timestamptz,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE patients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name varchar(200) NOT NULL,
      register_number varchar(100) NOT NULL, medical_record_number varchar(100) NOT NULL,
      address text NOT NULL, nik varchar(32), pmo_name varchar(200), pmo_contact varchar(100),
      created_by_staff_id uuid REFERENCES staff_accounts(id) ON DELETE SET NULL,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_patients_register ON patients(register_number)`);
    await queryRunner.query(`CREATE INDEX IDX_patients_medical_record ON patients(medical_record_number)`);

    await queryRunner.query(`CREATE TABLE treatment_courses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      treatment_stage varchar(120), start_date date NOT NULL, initial_target_end_date date NOT NULL,
      final_decision treatment_decision, final_review_note text, final_reviewed_at timestamptz,
      continued_target_end_date date, completed_at timestamptz,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_treatment_courses_id_patient UNIQUE(id, patient_id),
      CONSTRAINT CHK_treatment_course_final_review CHECK (
        (final_decision IS NULL AND final_review_note IS NULL AND final_reviewed_at IS NULL AND continued_target_end_date IS NULL AND completed_at IS NULL)
        OR (final_decision = 'Selesai' AND final_review_note IS NOT NULL AND final_reviewed_at IS NOT NULL AND continued_target_end_date IS NULL AND completed_at IS NOT NULL)
        OR (final_decision = 'Dilanjutkan' AND final_review_note IS NOT NULL AND final_reviewed_at IS NOT NULL AND continued_target_end_date IS NOT NULL AND completed_at IS NULL)
      )
    )`);
    await queryRunner.query(`CREATE INDEX IDX_treatment_courses_patient ON treatment_courses(patient_id)`);

    await queryRunner.query(`CREATE TABLE control_visits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL,
      treatment_course_id uuid NOT NULL, visit_date date NOT NULL, complaint_progress text, additional_note text,
      medicine_given boolean NOT NULL, medication_given_on date,
      recorded_by_staff_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT FK_control_visits_patient FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      CONSTRAINT FK_control_visits_course_patient FOREIGN KEY(treatment_course_id, patient_id) REFERENCES treatment_courses(id, patient_id) ON DELETE RESTRICT,
      CONSTRAINT UQ_control_visits_id_treatment UNIQUE(id, treatment_course_id),
      CONSTRAINT CHK_control_visits_medication_date CHECK ((medicine_given AND medication_given_on IS NOT NULL) OR (NOT medicine_given AND medication_given_on IS NULL))
    )`);
    await queryRunner.query(`CREATE INDEX IDX_control_visits_patient_date ON control_visits(patient_id, visit_date)`);
    await queryRunner.query(`CREATE INDEX IDX_control_visits_course_date ON control_visits(treatment_course_id, visit_date)`);

    await queryRunner.query(`CREATE TABLE medication_pickups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), treatment_course_id uuid NOT NULL REFERENCES treatment_courses(id) ON DELETE RESTRICT,
      pickup_date date NOT NULL, note text, recorded_by_staff_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_medication_pickups_course_date ON medication_pickups(treatment_course_id, pickup_date)`);

    await queryRunner.query(`CREATE TABLE control_schedule (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), treatment_course_id uuid NOT NULL UNIQUE REFERENCES treatment_courses(id) ON DELETE CASCADE,
      reference_visit_id uuid,
      default_date date, scheduled_date date NOT NULL,
      overridden_by_staff_id uuid REFERENCES staff_accounts(id) ON DELETE RESTRICT, overridden_at timestamptz,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT FK_control_schedule_reference_visit FOREIGN KEY(reference_visit_id, treatment_course_id) REFERENCES control_visits(id, treatment_course_id) ON DELETE RESTRICT,
      CONSTRAINT CHK_control_schedule_override CHECK ((overridden_by_staff_id IS NULL AND overridden_at IS NULL) OR (overridden_by_staff_id IS NOT NULL AND overridden_at IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE INDEX IDX_control_schedule_scheduled_date ON control_schedule(scheduled_date)`);

    await queryRunner.query(`CREATE TABLE daily_adherence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), treatment_course_id uuid NOT NULL REFERENCES treatment_courses(id) ON DELETE CASCADE,
      adherence_date date NOT NULL, status adherence_status NOT NULL DEFAULT 'Sudah diminum', confirmed_at timestamptz NOT NULL,
      source_device_id uuid, confirmed_by_staff_id uuid REFERENCES staff_accounts(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_daily_adherence_treatment_date UNIQUE(treatment_course_id, adherence_date),
      CONSTRAINT CHK_daily_adherence_confirmation CHECK (status = 'Sudah diminum')
    )`);
    await queryRunner.query(`CREATE INDEX IDX_daily_adherence_date ON daily_adherence(adherence_date)`);

    await queryRunner.query(`CREATE TABLE patient_devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      device_identifier uuid NOT NULL UNIQUE, credential_hash varchar(64) NOT NULL,
      activated_at timestamptz NOT NULL, deactivated_at timestamptz,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX UQ_patient_devices_one_active_per_patient ON patient_devices(patient_id) WHERE deactivated_at IS NULL`);

    await queryRunner.query(`CREATE TABLE activation_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      code_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz,
      issued_by_staff_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_activation_codes_patient_expiry ON activation_codes(patient_id, expires_at)`);

    await queryRunner.query(`ALTER TABLE daily_adherence ADD CONSTRAINT FK_daily_adherence_device FOREIGN KEY(source_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
    await queryRunner.query(`CREATE TABLE follow_ups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), control_schedule_id uuid NOT NULL REFERENCES control_schedule(id) ON DELETE CASCADE,
      outcome follow_up_outcome NOT NULL, note text,
      recorded_by_staff_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_follow_ups_schedule_date ON follow_ups(control_schedule_id, created_at)`);

    await queryRunner.query(`CREATE TABLE provider_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      type provider_notification_type NOT NULL, scheduled_for timestamptz NOT NULL, message text NOT NULL,
      delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_provider_notifications_due ON provider_notifications(scheduled_for) WHERE delivered_at IS NULL`);

    await queryRunner.query(`CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_staff_id uuid, object_type varchar(80) NOT NULL,
      object_id uuid NOT NULL, action varchar(80) NOT NULL, details text, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_audit_logs_object ON audit_logs(object_type, object_id, created_at)`);

    await queryRunner.query(`CREATE TABLE sync_receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
      operation_id uuid NOT NULL, request_hash varchar(64) NOT NULL, resource_id uuid,
      server_version integer, result_code varchar(24) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT UQ_sync_receipts_device_operation UNIQUE(device_id, operation_id)
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE sync_receipts`);
    await queryRunner.query(`DROP TABLE audit_logs`);
    await queryRunner.query(`DROP TABLE provider_notifications`);
    await queryRunner.query(`DROP TABLE follow_ups`);
    await queryRunner.query(`DROP TABLE activation_codes`);
    await queryRunner.query(`DROP TABLE patient_devices`);
    await queryRunner.query(`DROP TABLE daily_adherence`);
    await queryRunner.query(`DROP TABLE control_schedule`);
    await queryRunner.query(`DROP TABLE medication_pickups`);
    await queryRunner.query(`DROP TABLE control_visits`);
    await queryRunner.query(`DROP TABLE treatment_courses`);
    await queryRunner.query(`DROP TABLE patients`);
    await queryRunner.query(`DROP TABLE staff_accounts`);
    await queryRunner.query(`DROP TYPE provider_notification_type`);
    await queryRunner.query(`DROP TYPE follow_up_outcome`);
    await queryRunner.query(`DROP TYPE treatment_decision`);
    await queryRunner.query(`DROP TYPE adherence_status`);
  }
}
