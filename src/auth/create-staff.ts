import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dataSource } from '../database/data-source';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { hashPassword } from './auth.service';

async function promptHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Buat akun petugas dari terminal interaktif agar password tidak diekspos.');
  }
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (buffer: Buffer) => {
      const key = buffer.toString('utf8');
      if (key === '\u0003') {
        stdin.setRawMode(false);
        stdin.off('data', onData);
        reject(new Error('Dibatalkan.'));
      } else if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (key.length === 1) {
        value += key;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const input = createInterface({ input: stdin, output: stdout });
  const username = process.argv[2] ?? (await input.question('Username petugas: ')).trim();
  input.close();
  if (!username || username.length > 80) throw new Error('Username wajib diisi (maksimal 80 karakter).');
  const password = await promptHidden('Password: ');
  const confirmation = await promptHidden('Ulangi password: ');
  if (!password || password !== confirmation) {
    throw new Error('Password wajib diisi dan harus sama pada kedua input.');
  }
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(StaffAccount);
    if (await repository.existsBy({ username })) throw new Error('Username sudah terdaftar.');
    await repository.save(repository.create({ username, passwordHash: await hashPassword(password), disabledAt: null }));
    stdout.write(`Akun petugas ${username} berhasil dibuat.\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
