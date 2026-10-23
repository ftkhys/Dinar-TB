import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFcmTokenToPatientDevices1780000000001 implements MigrationInterface {
  name = 'AddFcmTokenToPatientDevices1780000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patient_devices
      ADD COLUMN IF NOT EXISTS fcm_token varchar(512) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE patient_devices
      DROP COLUMN IF EXISTS fcm_token
    `);
  }
}