export const MIGRATION_TEST_DATABASE = 'dinar_tb_migration_test';

type MigrationDatabaseOptions = {
  database?: unknown;
  host?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  ssl?: unknown;
};

/** Fail closed before the integration test initializes a connection. */
export function assertMigrationTestConfiguration(
  env: NodeJS.ProcessEnv,
  options: MigrationDatabaseOptions,
): void {
  if (env.RUN_DB_TESTS !== '1') {
    throw new Error('Migration integration test requires explicit RUN_DB_TESTS=1 opt-in.');
  }

  const required = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE', 'DB_SSL'];
  if (required.some((key) => env[key] === undefined || (key !== 'DB_PASSWORD' && !env[key]?.trim()))) {
    throw new Error('Konfigurasi eksplisit database migration test belum lengkap.');
  }

  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || (env.DB_SSL !== 'true' && env.DB_SSL !== 'false')) {
    throw new Error('Konfigurasi koneksi database migration test tidak valid.');
  }

  if (env.DB_DATABASE !== MIGRATION_TEST_DATABASE ||
      options.database !== MIGRATION_TEST_DATABASE ||
      options.host !== env.DB_HOST ||
      options.port !== port ||
      options.username !== env.DB_USERNAME ||
      options.password !== env.DB_PASSWORD ||
      options.ssl !== (env.DB_SSL === 'true')) {
    throw new Error('Konfigurasi DataSource tidak cocok dengan database migration test yang diizinkan.');
  }
}

/** Must be called with the result of SELECT current_database() before any DDL. */
export function assertConnectedMigrationDatabase(actualDatabase: unknown): void {
  if (actualDatabase !== MIGRATION_TEST_DATABASE) {
    throw new Error('Database yang terhubung bukan database migration test yang diizinkan.');
  }
}
