import 'dotenv/config';
import { DataSource } from 'typeorm';

export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'dinar_tb',
  ssl: process.env.DB_SSL === 'true',
  synchronize: false,
  migrations: ['src/database/migrations/*.ts'],
  entities: ['src/database/entities/*.entity.ts'],
});
