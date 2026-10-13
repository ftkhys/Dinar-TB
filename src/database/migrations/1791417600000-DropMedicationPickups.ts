import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMedicationPickups1791417600000 implements MigrationInterface {
  name = 'DropMedicationPickups1791417600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE medication_pickups`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE medication_pickups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), treatment_course_id uuid NOT NULL REFERENCES treatment_courses(id) ON DELETE RESTRICT,
      pickup_date date NOT NULL, note text, recorded_by_staff_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IDX_medication_pickups_course_date ON medication_pickups(treatment_course_id, pickup_date)`);
  }
}