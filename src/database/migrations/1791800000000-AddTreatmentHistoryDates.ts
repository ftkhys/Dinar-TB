import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists the two patient-history dates the intake form and the Excel importer
 * now collect, kept separate from `start_date` (treatment start):
 *   - `last_control_date`    : the real date of the most recent control visit.
 *   - `last_medication_date` : the real date medicine was last dispensed.
 *
 * Both are nullable so existing records stay valid without a backfill, and so a
 * patient whose history is not yet known can be stored with a clear "unknown"
 * state. The next control schedule is derived from `last_medication_date` only;
 * this column never influences `start_date` or the treatment target end date.
 */
export class AddTreatmentHistoryDates1791800000000 implements MigrationInterface {
  name = 'AddTreatmentHistoryDates1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE treatment_courses
      ADD COLUMN last_control_date date NULL,
      ADD COLUMN last_medication_date date NULL
    `);
    await queryRunner.query(`
      ALTER TABLE treatment_courses
      ADD CONSTRAINT chk_treatment_course_history_order
      CHECK (
        last_control_date IS NULL
        OR last_medication_date IS NULL
        OR last_medication_date <= last_control_date
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE treatment_courses
      DROP CONSTRAINT IF EXISTS chk_treatment_course_history_order
    `);
    await queryRunner.query(`
      ALTER TABLE treatment_courses
      DROP COLUMN IF EXISTS last_medication_date,
      DROP COLUMN IF EXISTS last_control_date
    `);
  }
}
