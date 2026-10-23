import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduleInvalidations1728800000000 implements MigrationInterface {
  name = 'CreateScheduleInvalidations1728800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE schedule_invalidations (
        treatment_course_id uuid NOT NULL,
        schedule_id uuid NOT NULL,
        previous_date date,
        new_date date NOT NULL,
        version integer NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT now(),
        overridden_by_staff_id uuid,
        PRIMARY KEY (treatment_course_id, version)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_schedule_invalidations_treatment_course_id
      ON schedule_invalidations (treatment_course_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_schedule_invalidations_treatment_course_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_invalidations;`);
  }
}