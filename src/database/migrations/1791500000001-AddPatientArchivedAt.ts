import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-delete marker for patients. Patients with treatment/visit history cannot
 * be hard-deleted (foreign keys use ON DELETE RESTRICT), so "Hapus Pasien"
 * archives the record instead. Archived patients are excluded from operational
 * lists but their history is preserved and can be restored.
 */
export class AddPatientArchivedAt1791500000001 implements MigrationInterface {
  name = 'AddPatientArchivedAt1791500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patients
      ADD COLUMN archived_at timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_patients_archived_at ON patients(archived_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_patients_archived_at`);
    await queryRunner.query(`
      ALTER TABLE patients
      DROP COLUMN IF EXISTS archived_at
    `);
  }
}
