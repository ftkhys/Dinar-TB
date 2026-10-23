import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks staff accounts that were assigned a temporary password by an Admin
 * reset. While the flag is set the account must change its password before it
 * can use any other staff endpoint, so a temporary credential cannot be left in
 * place. New accounts default to `false`.
 */
export class AddStaffMustChangePassword1791800000001 implements MigrationInterface {
  name = 'AddStaffMustChangePassword1791800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      ADD COLUMN must_change_password boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE staff_accounts
      DROP COLUMN IF EXISTS must_change_password
    `);
  }
}
