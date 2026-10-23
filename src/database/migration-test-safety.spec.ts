import {
  assertConnectedMigrationDatabase,
  assertMigrationTestConfiguration,
  MIGRATION_TEST_DATABASE,
} from './migration-test-safety';

function safeEnvironment(): NodeJS.ProcessEnv {
  return {
    RUN_DB_TESTS: '1',
    DB_HOST: '127.0.0.1',
    DB_PORT: '5433',
    DB_USERNAME: 'migration_test_user',
    DB_PASSWORD: '',
    DB_DATABASE: MIGRATION_TEST_DATABASE,
    DB_SSL: 'false',
  };
}

function safeOptions() {
  return {
    type: 'postgres' as const,
    host: '127.0.0.1',
    port: 5433,
    username: 'migration_test_user',
    password: '',
    database: MIGRATION_TEST_DATABASE,
    ssl: false,
  };
}

describe('migration integration test safety', () => {
  it('accepts only the explicit dedicated database configuration', () => {
    expect(() => assertMigrationTestConfiguration(safeEnvironment(), safeOptions())).not.toThrow();
    expect(() => assertConnectedMigrationDatabase(MIGRATION_TEST_DATABASE)).not.toThrow();
  });

  it.each([
    ['missing opt-in', (env: NodeJS.ProcessEnv) => { delete env.RUN_DB_TESTS; }],
    ['wrong opt-in', (env: NodeJS.ProcessEnv) => { env.RUN_DB_TESTS = 'true'; }],
    ['default database', (env: NodeJS.ProcessEnv) => { env.DB_DATABASE = 'dinar_tb'; }],
    ['other test database', (env: NodeJS.ProcessEnv) => { env.DB_DATABASE = 'other_test'; }],
    ['missing host', (env: NodeJS.ProcessEnv) => { delete env.DB_HOST; }],
    ['missing port', (env: NodeJS.ProcessEnv) => { delete env.DB_PORT; }],
    ['missing username', (env: NodeJS.ProcessEnv) => { delete env.DB_USERNAME; }],
    ['missing password configuration', (env: NodeJS.ProcessEnv) => { delete env.DB_PASSWORD; }],
    ['missing SSL configuration', (env: NodeJS.ProcessEnv) => { delete env.DB_SSL; }],
  ])('rejects %s configuration before connecting', (_case, mutate) => {
    const env = safeEnvironment();
    mutate(env);
    expect(() => assertMigrationTestConfiguration(env, safeOptions())).toThrow();
  });

  it('rejects DataSource options that do not exactly match the explicit environment', () => {
    expect(() => assertMigrationTestConfiguration(safeEnvironment(), {
      ...safeOptions(), database: 'dinar_tb',
    })).toThrow();
    expect(() => assertMigrationTestConfiguration(safeEnvironment(), {
      ...safeOptions(), host: 'other-host',
    })).toThrow();
  });

  it('rejects an unverifiable or unexpected connected database identity', () => {
    expect(() => assertConnectedMigrationDatabase(undefined)).toThrow();
    expect(() => assertConnectedMigrationDatabase('dinar_tb')).toThrow();
    expect(() => assertConnectedMigrationDatabase('another_test')).toThrow();
  });
});
