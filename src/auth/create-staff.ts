import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dataSource } from '../database/data-source';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { hashPassword } from './auth.service';
import { promptHidden } from './console-prompt';
import { STAFF_ROLES, isStaffRole } from './auth.types';

async function main(): Promise<void> {
  const input = createInterface({ input: stdin, output: stdout });
  const username = process.argv[2] ?? (await input.question('Username petugas: ')).trim();
  input.close();
  if (!username || username.length > 80) throw new Error('Username wajib diisi (maksimal 80 karakter).');
  if (/\s/.test(username)) throw new Error('Username tidak boleh mengandung spasi.');

  const roleArgument = process.argv.find((value) => value.startsWith('--role='))?.slice('--role='.length);
  const role = roleArgument ?? 'Petugas';
  if (!isStaffRole(role)) throw new Error(`Peran harus salah satu dari: ${STAFF_ROLES.join(', ')}.`);

  const password = await promptHidden('Password: ');
  const confirmation = await promptHidden('Ulangi password: ');
  if (!password || password !== confirmation) {
    throw new Error('Password wajib diisi dan harus sama pada kedua input.');
  }

  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(StaffAccount);
    if (await repository.existsBy({ username })) throw new Error('Username sudah terdaftar.');
    await repository.save(
      repository.create({ username, passwordHash: await hashPassword(password), role, disabledAt: null }),
    );
    stdout.write(`Akun ${role} ${username} berhasil dibuat.\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
