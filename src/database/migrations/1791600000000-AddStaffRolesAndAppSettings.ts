import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces staff roles and shared application settings.
 *
 * `staff_accounts` gains a `role` ('Admin' | 'Petugas'), an optional
 * `display_name` and an optional `phone`. Existing accounts are intentionally
 * backfilled to the least-privileged role ('Petugas'); no account is silently
 * promoted to Admin. A controlled bootstrap script promotes/creates the first
 * Admin explicitly (see `npm run staff:bootstrap-admin`).
 *
 * `app_settings` is a single-row table holding values that are shared by all
 * staff: the Puskesmas identity, the standard control interval (days) and the
 * morning/evening reminder times. The row is seeded with the facility name so
 * the rest of the application always has a value to read.
 */
export class AddStaffRolesAndAppSettings1791600000000 implements MigrationInterface {
  name = 'AddStaffRolesAndAppSettings1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      ADD COLUMN role varchar(20) NOT NULL DEFAULT 'Petugas'
    `);
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      ADD COLUMN display_name varchar(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      ADD COLUMN phone varchar(32) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      ADD CONSTRAINT CHK_staff_accounts_role CHECK (role IN ('Admin', 'Petugas'))
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_staff_accounts_role ON staff_accounts(role)
    `);

    await queryRunner.query(`
      CREATE TABLE app_settings (
        id smallint PRIMARY KEY DEFAULT 1,
        puskesmas_name varchar(160) NOT NULL,
        puskesmas_phone varchar(32) NULL,
        control_interval_days int NOT NULL DEFAULT 14,
        reminder_morning varchar(5) NOT NULL DEFAULT '06:00',
        reminder_evening varchar(5) NOT NULL DEFAULT '20:00',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO app_settings(id, puskesmas_name)
      VALUES (1, 'Puskesmas Jatinegara')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app_settings`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_staff_accounts_role`);
    await queryRunner.query(`ALTER TABLE staff_accounts DROP CONSTRAINT IF EXISTS CHK_staff_accounts_role`);
    await queryRunner.query(`ALTER TABLE staff_accounts DROP COLUMN IF EXISTS phone`);
    await queryRunner.query(`ALTER TABLE staff_accounts DROP COLUMN IF EXISTS display_name`);
    await queryRunner.query(`ALTER TABLE staff_accounts DROP COLUMN IF EXISTS role`);
  }
}
