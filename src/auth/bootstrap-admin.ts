import 'dotenv/config';
import { stdout } from 'node:process';
import { dataSource } from '../database/data-source';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { hashPassword } from './auth.service';
import { promptHidden } from './console-prompt';

/**
 * One-time, controlled bootstrap of the first Admin.
 *
 * Refuses to run when an active Admin already exists (no duplicate initial
 * Admin) and never promotes an existing account silently: promotion requires
 * the explicit `--promote` flag. The initial password is read from an
 * interactive terminal only and is never logged or stored in plaintext.
 *
 * Usage:
 *   npm run staff:bootstrap-admin -- <username>
 *   npm run staff:bootstrap-admin -- <username> --promote
 */
async function main(): Promise<void> {
  const username = (process.argv[2] ?? '').trim();
  const promote = process.argv.includes('--promote');
  if (!username || username.length > 80) throw new Error('Username wajib diisi (maksimal 80 karakter).');
  if (/\s/.test(username)) throw new Error('Username tidak boleh mengandung spasi.');

  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(StaffAccount);

    const activeAdmins = await repository
      .createQueryBuilder('staff')
      .where("staff.role = 'Admin'")
      .andWhere('staff.disabledAt IS NULL')
      .getCount();
    if (activeAdmins > 0) {
      throw new Error('Admin aktif sudah ada. Gunakan halaman Pengaturan untuk mengelola akun Admin.');
    }

    const existing = await repository.findOneBy({ username });
    if (existing) {
      if (!promote) {
        throw new Error('Akun sudah ada. Jalankan ulang dengan flag --promote untuk menjadikannya Admin.');
      }
      existing.role = 'Admin';
      existing.disabledAt = null;
      await repository.save(existing);
      stdout.write(`Akun ${username} dipromosikan menjadi Admin.\n`);
      return;
    }

    const password = await promptHidden('Password Admin baru: ');
    const confirmation = await promptHidden('Ulangi password: ');
    if (!password || password !== confirmation) {
      throw new Error('Password wajib diisi dan harus sama pada kedua input.');
    }
    await repository.save(
      repository.create({
        username,
        passwordHash: await hashPassword(password),
        role: 'Admin',
        disabledAt: null,
      }),
    );
    stdout.write(`Akun Admin ${username} berhasil dibuat.\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
