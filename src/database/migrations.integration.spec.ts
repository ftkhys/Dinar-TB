import { DataSource } from 'typeorm';
import { dataSource } from './data-source';
import { assertConnectedMigrationDatabase, assertMigrationTestConfiguration } from './migration-test-safety';

const runDb = process.env.RUN_DB_TESTS === '1';
if (runDb) assertMigrationTestConfiguration(process.env, dataSource.options);

const describeDb = runDb ? describe : describe.skip;

describeDb('database migrations (integration, real PostgreSQL)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = dataSource;
    if (!ds.isInitialized) await ds.initialize();
    const [identity] = await ds.query('SELECT current_database() AS "databaseName"');
    assertConnectedMigrationDatabase(identity?.databaseName);
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    const executed = await ds.runMigrations();
    expect(executed.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('applies every migration from an empty database', async () => {
    const columns = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'patient_devices'`,
    );
    expect(columns.map((column: { column_name: string }) => column.column_name)).toContain('fcm_token');

    const tables = await ds.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(tables.map((table: { table_name: string }) => table.table_name)).toEqual(
      expect.arrayContaining(['schedule_invalidations', 'patients', 'patient_devices', 'app_settings']),
    );
  });

  it('records the FCM migration after the base schema migration', async () => {
    const rows = await ds.query(
      `SELECT name FROM migrations ORDER BY timestamp ASC, id ASC`,
    );
    const names = rows.map((row: { name: string }) => row.name);
    expect(names.indexOf('CreateScheduleInvalidations1728800000000')).toBeLessThan(
      names.indexOf('CreateDinarTbSchema1780000000000'),
    );
    expect(names.indexOf('CreateDinarTbSchema1780000000000')).toBeLessThan(
      names.indexOf('AddFcmTokenToPatientDevices1780000000001'),
    );
  });

  it('tolerates a database that recorded the legacy FCM migration', async () => {
    await ds.query(`DELETE FROM migrations WHERE name = $1`, ['AddFcmTokenToPatientDevices1780000000001']);
    await ds.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2)`,
      ['1728800000001', 'AddFcmTokenToPatientDevices1728800000001'],
    );

    const executed = await ds.runMigrations();

    expect(executed.map((migration) => migration.name)).toContain('AddFcmTokenToPatientDevices1780000000001');
    const columns = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'patient_devices' AND column_name = 'fcm_token'`,
    );
    expect(columns).toHaveLength(1);
  });
});
