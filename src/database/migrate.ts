import 'dotenv/config';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const command = process.argv[2] ?? 'run';
const migrationsDir = join(__dirname, 'migrations');

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'dinar_tb',
  ssl: process.env.DB_SSL === 'true',
  synchronize: false,
  logging: false,
  migrations: [join(migrationsDir, '*.js')],
  entities: [],
});

async function main(): Promise<void> {
  if (!existsSync(migrationsDir) || readdirSync(migrationsDir).every((file) => !file.endsWith('.js'))) {
    throw new Error('Migration terkompilasi tidak ditemukan. Jalankan build terlebih dahulu.');
  }

  await dataSource.initialize();
  try {
    if (command === 'show') {
      const pending = await dataSource.showMigrations();
      console.log(pending ? 'Masih ada migration yang belum dijalankan.' : 'Semua migration sudah dijalankan.');
      return;
    }
    if (command === 'run') {
      const executed = await dataSource.runMigrations({ transaction: 'all' });
      console.log(`${executed.length} migration dijalankan.`);
      return;
    }
    if (command === 'revert') {
      await dataSource.undoLastMigration({ transaction: 'all' });
      console.log('Migration terakhir dibatalkan.');
      return;
    }
    throw new Error(`Perintah tidak dikenal: ${command}. Gunakan show, run, atau revert.`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Migration gagal.';
  console.error(message);
  process.exitCode = 1;
});
