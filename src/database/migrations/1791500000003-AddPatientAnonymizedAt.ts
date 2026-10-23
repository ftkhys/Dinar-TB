import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Privacy-erasure marker for archived patients that still carry a protected
 * clinical history (treatment courses, visits, adherence, follow-ups). Those
 * rows cannot be hard-deleted without destroying the medical record, so
 * "Hapus permanen" instead removes every identifying attribute and marks the
 * patient anonymized. Anonymized patients are hidden from active and archive
 * lists while the clinical record is retained, de-identified.
 */
export class AddPatientAnonymizedAt1791500000003 implements MigrationInterface {
  name = 'AddPatientAnonymizedAt1791500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patients
      ADD COLUMN anonymized_at timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_patients_anonymized_at ON patients(anonymized_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_patients_anonymized_at`);
    await queryRunner.query(`
      ALTER TABLE patients
      DROP COLUMN IF EXISTS anonymized_at
    `);
  }
}
