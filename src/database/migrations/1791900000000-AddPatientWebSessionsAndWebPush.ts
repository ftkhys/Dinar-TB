import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds browser-only patient sessions and standards-based Web Push storage.
 *
 * No patient device row is created or deactivated by this migration. Existing
 * Android activations remain untouched; web activation only consumes the same
 * one-time code and creates a separate hashed browser session.
 */
export class AddPatientWebSessionsAndWebPush1791900000000 implements MigrationInterface {
  name = 'AddPatientWebSessionsAndWebPush1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE patient_web_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL,
        activation_code_id uuid REFERENCES activation_codes(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        user_agent_hash varchar(64),
        ip_hash varchar(64),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IDX_patient_web_sessions_patient ON patient_web_sessions(patient_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX UQ_patient_web_sessions_token_hash ON patient_web_sessions(token_hash)`,
    );

    await queryRunner.query(`
      CREATE TABLE web_push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES patient_web_sessions(id) ON DELETE CASCADE,
        patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        endpoint varchar(2048) NOT NULL,
        p256dh varchar(255) NOT NULL,
        auth varchar(255) NOT NULL,
        expiration_time bigint,
        failure_count integer NOT NULL DEFAULT 0,
        last_success_at timestamptz,
        disabled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX UQ_web_push_subscriptions_endpoint ON web_push_subscriptions(endpoint)`,
    );
    await queryRunner.query(
      `CREATE INDEX IDX_web_push_subscriptions_patient ON web_push_subscriptions(patient_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE web_push_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        local_date date NOT NULL,
        slot varchar(16) NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT UQ_web_push_deliveries_patient_date_slot UNIQUE(patient_id, local_date, slot)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IDX_web_push_deliveries_patient_date ON web_push_deliveries(patient_id, local_date)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS web_push_deliveries`);
    await queryRunner.query(`DROP TABLE IF EXISTS web_push_subscriptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS patient_web_sessions`);
  }
}
