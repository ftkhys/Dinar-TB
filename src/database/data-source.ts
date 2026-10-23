import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

// The same DataSource is used by the ts-node CLI (src) and by compiled
// production scripts (dist). Resolve globs relative to this file so both
// load their own local migrations/entities instead of hard-coded src paths.
const compiled = __filename.endsWith('.js');

export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'dinar_tb',
  ssl: process.env.DB_SSL === 'true',
  synchronize: false,
  migrations: [join(__dirname, 'migrations', compiled ? '*.js' : '*.ts')],
  entities: [join(__dirname, 'entities', compiled ? '*.entity.js' : '*.entity.ts')],
});
