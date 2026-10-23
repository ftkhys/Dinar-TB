import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-staff read-state for the activity/notification feed. The feed itself is
 * the immutable `audit_logs` history; this table only stores the last time a
 * staff account opened the panel. The unread badge is the count of audit
 * activities created after `last_seen_at`, so marking as read never deletes
 * history and stays isolated per account.
 */
export class CreateStaffActivityReads1791500000002 implements MigrationInterface {
  name = 'CreateStaffActivityReads1791500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_activity_reads (
        staff_id uuid PRIMARY KEY REFERENCES staff_accounts(id) ON DELETE CASCADE,
        last_seen_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staff_activity_reads`);
  }
}
