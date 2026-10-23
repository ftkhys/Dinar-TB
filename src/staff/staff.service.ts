import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { AuditLogService } from '../common/audit-log.service';
import { optionalPhone, optionalString, requiredString } from '../common/input';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { AuthService } from '../auth/auth.service';
import { StaffRole, asStaffRole, isStaffRole } from '../auth/auth.types';

export const MAX_ACTIVE_ADMINS = 3;
const MIN_PASSWORD_LENGTH = 8;
/** Fixed key so concurrent Admin-limit checks serialize within one transaction. */
const ADMIN_LIMIT_LOCK_KEY = 601637;

export type StaffAccountView = {
  id: string;
  username: string;
  displayName: string | null;
  role: StaffRole;
  phone: string | null;
  active: boolean;
  /** True when the account still holds an Admin-issued temporary password. */
  mustChangePassword: boolean;
  createdAt: string;
  isSelf: boolean;
};

export type StaffAccountsView = {
  accounts: StaffAccountView[];
  activeAdminCount: number;
  maxAdmins: number;
};

function toView(account: StaffAccount, viewerId: string): StaffAccountView {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName ?? null,
    role: asStaffRole(account.role),
    phone: account.phone ?? null,
    active: account.disabledAt === null,
    mustChangePassword: account.mustChangePassword === true,
    createdAt: account.createdAt instanceof Date ? account.createdAt.toISOString() : String(account.createdAt),
    isSelf: account.id === viewerId,
  };
}

/** Ambiguous characters (0/O, 1/l/I) are avoided so the temporary password can
 * be read aloud and typed reliably. */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += TEMP_PASSWORD_ALPHABET[bytes[index] % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
}

function normalizePassword(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH || value.length > 128) {
    throw new BadRequestException(`${name} minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }
  return value;
}

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(StaffAccount) private readonly staff: Repository<StaffAccount>,
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  async profile(staffId: string): Promise<StaffAccountView> {
    const account = await this.staff.findOneBy({ id: staffId });
    if (!account) throw new NotFoundException('Akun tidak ditemukan.');
    return toView(account, staffId);
  }

  /** The account owner may only change their own phone number here. */
  async updateProfile(staffId: string, body: Record<string, unknown>): Promise<StaffAccountView> {
    const account = await this.staff.findOneBy({ id: staffId });
    if (!account) throw new NotFoundException('Akun tidak ditemukan.');
    if (body.phone !== undefined) {
      account.phone = optionalPhone(body.phone, 'Nomor telepon');
    }
    const saved = await this.staff.save(account);
    await this.audit.record({
      actorStaffId: staffId,
      objectType: 'staff_account',
      objectId: staffId,
      action: 'profile_updated',
    });
    return toView(saved, staffId);
  }

  async changePassword(staffId: string, body: Record<string, unknown>): Promise<{ ok: true }> {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = normalizePassword(body.newPassword, 'Kata sandi baru');
    const confirmation = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    if (!currentPassword) throw new BadRequestException('Kata sandi saat ini wajib diisi.');
    if (newPassword !== confirmation) throw new BadRequestException('Konfirmasi kata sandi tidak cocok.');

    const account = await this.staff
      .createQueryBuilder('staff')
      .addSelect('staff.passwordHash')
      .where('staff.id = :id', { id: staffId })
      .andWhere('staff.disabledAt IS NULL')
      .getOne();
    if (!account) throw new NotFoundException('Akun tidak ditemukan.');
    if (!(await this.auth.verifyPassword(currentPassword, account.passwordHash))) {
      throw new BadRequestException('Kata sandi saat ini tidak sesuai.');
    }
    account.passwordHash = await this.auth.hashPassword(newPassword);
    // A password change always clears the temporary-password requirement.
    account.mustChangePassword = false;
    await this.staff.save(account);
    await this.audit.record({
      actorStaffId: staffId,
      objectType: 'staff_account',
      objectId: staffId,
      action: 'password_changed',
    });
    return { ok: true };
  }

  /**
   * Admin-initiated password reset. Generates a fresh temporary password, stores
   * only its hash, and flags the account so the temporary password must be
   * replaced at the first login. The account's role and other fields are never
   * touched, the old password is never read, and the plaintext temporary
   * password is returned exactly once — it is never persisted or logged.
   */
  async resetPassword(actorId: string, id: string): Promise<{ id: string; username: string; temporaryPassword: string }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LIMIT_LOCK_KEY]);
      const account = await manager.getRepository(StaffAccount).findOneBy({ id });
      if (!account || account.disabledAt !== null) throw new NotFoundException('Akun tidak ditemukan.');
      const temporaryPassword = generateTemporaryPassword();
      account.passwordHash = await this.auth.hashPassword(temporaryPassword);
      account.mustChangePassword = true;
      const saved = await manager.getRepository(StaffAccount).save(account);
      await this.audit.record({
        actorStaffId: actorId,
        objectType: 'staff_account',
        objectId: saved.id,
        action: 'password_reset',
        details: JSON.stringify({ targetUsername: saved.username, targetRole: asStaffRole(saved.role) }),
      });
      return { id: saved.id, username: saved.username, temporaryPassword };
    });
  }

  async listAccounts(viewerId: string): Promise<StaffAccountsView> {
    const accounts = await this.staff.find({ order: { createdAt: 'ASC' } });
    const activeAdminCount = accounts.filter(
      (account) => asStaffRole(account.role) === 'Admin' && account.disabledAt === null,
    ).length;
    return {
      accounts: accounts.map((account) => toView(account, viewerId)),
      activeAdminCount,
      maxAdmins: MAX_ACTIVE_ADMINS,
    };
  }

  async createAccount(actorId: string, body: Record<string, unknown>): Promise<StaffAccountView> {
    const username = requiredString(body.username, 'Username', 80);
    if (/\s/.test(username)) throw new BadRequestException('Username tidak boleh mengandung spasi.');
    const password = normalizePassword(body.password, 'Kata sandi');
    const displayName = optionalString(body.displayName, 'Nama tampilan', 120);
    const phone = optionalPhone(body.phone, 'Nomor telepon');
    if (!isStaffRole(body.role)) throw new BadRequestException('Peran tidak valid.');
    const role = body.role;

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LIMIT_LOCK_KEY]);
      const [duplicate] = await manager.query('SELECT id FROM staff_accounts WHERE username = $1', [username]);
      if (duplicate) throw new ConflictException('Username sudah digunakan.');
      if (role === 'Admin' && (await this.activeAdminCount(manager)) >= MAX_ACTIVE_ADMINS) {
        throw new ConflictException(`Jumlah Admin aktif sudah mencapai batas ${MAX_ACTIVE_ADMINS}.`);
      }
      const created = await manager.save(
        manager.create(StaffAccount, {
          username,
          passwordHash: await this.auth.hashPassword(password),
          role,
          displayName,
          phone,
          disabledAt: null,
        }),
      );
      await this.audit.record({
        actorStaffId: actorId,
        objectType: 'staff_account',
        objectId: created.id,
        action: 'created',
        details: JSON.stringify({ targetUsername: created.username, targetRole: role }),
      });
      return toView(created, actorId);
    });
  }

  async updateAccount(actorId: string, id: string, body: Record<string, unknown>): Promise<StaffAccountView> {
    const hasRole = body.role !== undefined;
    const hasDisplayName = body.displayName !== undefined;
    if (!hasRole && !hasDisplayName) {
      throw new BadRequestException('Tidak ada perubahan yang diminta.');
    }
    let nextRole: StaffRole | null = null;
    if (hasRole) {
      if (!isStaffRole(body.role)) throw new BadRequestException('Peran tidak valid.');
      nextRole = body.role;
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LIMIT_LOCK_KEY]);
      const account = await manager.getRepository(StaffAccount).findOneBy({ id });
      if (!account || account.disabledAt !== null) throw new NotFoundException('Akun tidak ditemukan.');

      const previousRole = asStaffRole(account.role);
      let roleChanged = false;

      if (nextRole && nextRole !== previousRole) {
        const activeAdmins = await this.activeAdminCount(manager);
        if (nextRole === 'Admin' && activeAdmins >= MAX_ACTIVE_ADMINS) {
          throw new ConflictException(`Jumlah Admin aktif sudah mencapai batas ${MAX_ACTIVE_ADMINS}.`);
        }
        if (previousRole === 'Admin' && activeAdmins <= 1) {
          throw new ConflictException('Minimal harus ada satu Admin aktif. Angkat Admin lain sebelum mengubah peran ini.');
        }
        account.role = nextRole;
        roleChanged = true;
      }
      if (hasDisplayName) {
        account.displayName = optionalString(body.displayName, 'Nama tampilan', 120);
      }

      const saved = await manager.getRepository(StaffAccount).save(account);

      if (roleChanged) {
        await this.audit.record({
          actorStaffId: actorId,
          objectType: 'staff_account',
          objectId: saved.id,
          action: 'role_changed',
          details: JSON.stringify({ targetUsername: saved.username, targetRole: asStaffRole(saved.role) }),
        });
      }
      if (hasDisplayName) {
        await this.audit.record({
          actorStaffId: actorId,
          objectType: 'staff_account',
          objectId: saved.id,
          action: 'profile_updated',
        });
      }
      return toView(saved, actorId);
    });
  }

  /**
   * Active account → soft-deactivate (disable, retention-safe, unchanged).
   * Already non-active account → permanently remove it from the list, but only
   * when no historical row still references it; otherwise the reason is
   * reported instead of a misleading "not found".
   */
  async deleteAccount(actorId: string, id: string): Promise<{ id: string }> {
    if (id === actorId) throw new BadRequestException('Akun sendiri tidak dapat dihapus.');
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LIMIT_LOCK_KEY]);
      const account = await manager.getRepository(StaffAccount).findOneBy({ id });
      if (!account) throw new NotFoundException('Akun tidak ditemukan.');

      if (account.disabledAt === null) {
        if (asStaffRole(account.role) === 'Admin' && (await this.activeAdminCount(manager)) <= 1) {
          throw new ConflictException('Minimal harus ada satu Admin aktif. Angkat Admin lain sebelum menghapus akun ini.');
        }
        account.disabledAt = new Date();
        await manager.getRepository(StaffAccount).save(account);
        await this.audit.record({
          actorStaffId: actorId,
          objectType: 'staff_account',
          objectId: account.id,
          action: 'deleted',
          details: JSON.stringify({ targetUsername: account.username, mode: 'disabled' }),
        });
        return { id: account.id };
      }

      const blockers = await this.accountDeletionBlockers(manager, account.id);
      if (blockers.length > 0) {
        throw new ConflictException(
          `Akun ${account.username} tidak dapat dihapus permanen karena masih terkait ${blockers.join(', ')}. ` +
            'Riwayat ini wajib dipertahankan; akun tetap tersimpan sebagai nonaktif.',
        );
      }

      try {
        await manager.getRepository(StaffAccount).delete({ id: account.id });
      } catch (error) {
        if (error instanceof QueryFailedError && (error as { driverError?: { code?: string } }).driverError?.code === '23503') {
          throw new ConflictException(
            `Akun ${account.username} tidak dapat dihapus permanen karena masih terkait riwayat operasional yang wajib dipertahankan.`,
          );
        }
        throw error;
      }
      await this.audit.record({
        actorStaffId: actorId,
        objectType: 'staff_account',
        objectId: account.id,
        action: 'deleted',
        details: JSON.stringify({ targetUsername: account.username, mode: 'permanently_deleted' }),
      });
      return { id: account.id };
    });
  }

  /**
   * Tables whose foreign key to `staff_accounts` is ON DELETE RESTRICT. If any
   * row exists, a permanent delete would fail, so we report the exact reason.
   */
  private async accountDeletionBlockers(
    manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown[]> },
    staffId: string,
  ): Promise<string[]> {
    const checks: Array<{ label: string; sql: string }> = [
      { label: 'kunjungan kontrol', sql: 'SELECT 1 FROM control_visits WHERE recorded_by_staff_id = $1 LIMIT 1' },
      { label: 'perubahan jadwal kontrol', sql: 'SELECT 1 FROM control_schedule WHERE overridden_by_staff_id = $1 LIMIT 1' },
      { label: 'tindak lanjut', sql: 'SELECT 1 FROM follow_ups WHERE recorded_by_staff_id = $1 LIMIT 1' },
      { label: 'kode aktivasi', sql: 'SELECT 1 FROM activation_codes WHERE issued_by_staff_id = $1 LIMIT 1' },
    ];
    const blockers: string[] = [];
    for (const check of checks) {
      const rows = await manager.query(check.sql, [staffId]);
      if (rows.length > 0) blockers.push(check.label);
    }
    return blockers;
  }

  private async activeAdminCount(manager: { query: (sql: string) => Promise<unknown[]> }): Promise<number> {
    const [row] = (await manager.query(
      `SELECT count(*)::int AS count FROM staff_accounts WHERE role = 'Admin' AND disabled_at IS NULL`,
    )) as Array<{ count?: unknown }>;
    const parsed = Number(row?.count);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
