import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists the patient profile fields the intake form already collects
 * (`dateOfBirth`, `gender`, `phone`). All columns are nullable so existing
 * records stay valid without a backfill.
 */
export class AddPatientProfileFields1791500000000 implements MigrationInterface {
  name = 'AddPatientProfileFields1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patients
      ADD COLUMN date_of_birth date NULL,
      ADD COLUMN gender varchar(20) NULL,
      ADD COLUMN phone varchar(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patients
      DROP COLUMN IF EXISTS phone,
      DROP COLUMN IF EXISTS gender,
      DROP COLUMN IF EXISTS date_of_birth
    `);
  }
}
