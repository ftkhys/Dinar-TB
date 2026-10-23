import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { StaffService } from './staff.service';

type Account = {
  id: string;
  username: string;
  role: string;
  displayName: string | null;
  phone: string | null;
  passwordHash: string;
  disabledAt: Date | null;
  mustChangePassword: boolean;
  createdAt: Date;
};

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id ?? 'staff-1',
    username: overrides.username ?? 'petugas',
    role: overrides.role ?? 'Petugas',
    displayName: overrides.displayName ?? null,
    phone: overrides.phone ?? null,
    passwordHash: overrides.passwordHash ?? 'scrypt$salt$hash',
    disabledAt: overrides.disabledAt ?? null,
    mustChangePassword: overrides.mustChangePassword ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-10-16T00:00:00.000Z'),
  };
}

function topStaffRepo(options: { accounts?: Account[]; passwordAccount?: Account | null } = {}) {
  const accounts = options.accounts ?? [];
  return {
    find: jest.fn(async () => accounts),
    findOneBy: jest.fn(async ({ id }: { id: string }) => accounts.find((item) => item.id === id) ?? null),
    save: jest.fn(async (value: Account) => value),
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => options.passwordAccount ?? null),
    })),
  };
}

function txManager(options: { accounts?: Account[]; activeAdmins?: number; duplicate?: boolean; blockers?: string[]; deleteError?: Error } = {}) {
  const accounts = options.accounts ?? [];
  const staffRepo = {
    findOneBy: jest.fn(async ({ id }: { id: string }) => accounts.find((item) => item.id === id) ?? null),
    save: jest.fn(async (value: Account) => ({
      ...value,
      createdAt: value.createdAt ?? new Date('2026-10-16T00:00:00.000Z'),
      disabledAt: value.disabledAt ?? null,
      id: value.id ?? 'new-id',
    })),
    delete: jest.fn(async () => {
      if (options.deleteError) throw options.deleteError;
      return { affected: 1 };
    }),
  };
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('count(*)::int AS count')) return [{ count: options.activeAdmins ?? 0 }];
    if (sql.includes('SELECT id FROM staff_accounts WHERE username')) return options.duplicate ? [{ id: 'dupe' }] : [];
    if (sql.includes('SELECT 1 FROM')) {
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
      return (options.blockers ?? []).includes(table) ? [{ present: 1 }] : [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const manager = {
    query,
    getRepository: jest.fn(() => staffRepo),
    create: jest.fn((_entity: unknown, value: Account) => value),
    save: jest.fn(async (value: Account) => ({
      ...value,
      createdAt: value.createdAt ?? new Date('2026-10-16T00:00:00.000Z'),
      disabledAt: value.disabledAt ?? null,
      id: value.id ?? 'new-id',
    })),
  };
  return { manager, staffRepo, query };
}

function serviceWith(top: ReturnType<typeof topStaffRepo>, manager: ReturnType<typeof txManager>['manager']) {
  const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
  const auth = { hashPassword: jest.fn(async () => 'hashed'), verifyPassword: jest.fn(async () => true) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new StaffService(top as never, dataSource as never, auth as never, audit as never);
  return { service, auth, audit, dataSource };
}

describe('StaffService account management', () => {
  it('rejects a duplicate username', async () => {
    const top = topStaffRepo();
    const { manager } = txManager({ duplicate: true });
    const { service } = serviceWith(top, manager);

    await expect(
      service.createAccount('admin-1', { username: 'petugas', password: 'rahasia123', role: 'Petugas' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the three-active-Admin limit inside the locked transaction', async () => {
    const top = topStaffRepo();
    const { manager, query } = txManager({ activeAdmins: 3 });
    const { service } = serviceWith(top, manager);

    await expect(
      service.createAccount('admin-1', { username: 'admin.baru', password: 'rahasia123', role: 'Admin' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [expect.any(Number)]);
  });

  it('allows creating an Admin below the limit and records the audit event', async () => {
    const top = topStaffRepo();
    const { manager } = txManager({ activeAdmins: 2 });
    const { service, audit } = serviceWith(top, manager);

    const created = await service.createAccount('admin-1', {
      username: 'admin.baru',
      password: 'rahasia123',
      role: 'Admin',
    });

    expect(created.role).toBe('Admin');
    expect(created.active).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created', objectType: 'staff_account' }),
    );
  });

  it('does not count Petugas against the Admin limit and rejects an invalid role', async () => {
    const top = topStaffRepo();
    const { manager } = txManager({ activeAdmins: 3 });
    const { service } = serviceWith(top, manager);

    await expect(
      service.createAccount('admin-1', { username: 'petugas.baru', password: 'rahasia123', role: 'Petugas' }),
    ).resolves.toMatchObject({ role: 'Petugas' });

    await expect(
      service.createAccount('admin-1', { username: 'x', password: 'rahasia123', role: 'Superuser' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents demoting the only active Admin', async () => {
    const target = account({ id: 'admin-1', username: 'admin', role: 'Admin' });
    const top = topStaffRepo();
    const { manager } = txManager({ accounts: [target], activeAdmins: 1 });
    const { service } = serviceWith(top, manager);

    await expect(
      service.updateAccount('admin-1', 'admin-1', { role: 'Petugas' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('promotes a Petugas to Admin when below the limit', async () => {
    const target = account({ id: 'staff-2', username: 'dian', role: 'Petugas' });
    const top = topStaffRepo();
    const { manager } = txManager({ accounts: [target], activeAdmins: 1 });
    const { service, audit } = serviceWith(top, manager);

    const updated = await service.updateAccount('admin-1', 'staff-2', { role: 'Admin' });

    expect(updated.role).toBe('Admin');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'role_changed' }));
  });

  it('refuses to delete the caller own account', async () => {
    const top = topStaffRepo();
    const { manager } = txManager();
    const { service } = serviceWith(top, manager);

    await expect(service.deleteAccount('admin-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete the last active Admin', async () => {
    const target = account({ id: 'admin-1', username: 'admin', role: 'Admin' });
    const top = topStaffRepo();
    const { manager } = txManager({ accounts: [target], activeAdmins: 1 });
    const { service } = serviceWith(top, manager);

    await expect(service.deleteAccount('admin-2', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deactivates another active account and records the deletion', async () => {
    const target = account({ id: 'staff-2', username: 'dian', role: 'Petugas' });
    const top = topStaffRepo();
    const { manager, staffRepo } = txManager({ accounts: [target] });
    const { service, audit } = serviceWith(top, manager);

    const result = await service.deleteAccount('admin-1', 'staff-2');

    expect(result).toEqual({ id: 'staff-2' });
    expect(target.disabledAt).not.toBeNull();
    expect(staffRepo.delete).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', details: expect.stringContaining('"mode":"disabled"') }),
    );
  });

  it('reports a not-found account distinctly instead of a disabled account', async () => {
    const top = topStaffRepo();
    const { manager } = txManager({ accounts: [] });
    const { service } = serviceWith(top, manager);

    const error = await service.deleteAccount('admin-1', 'ghost').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('Akun tidak ditemukan.');
  });

  it('permanently removes an already non-active account with no history', async () => {
    const target = account({ id: 'staff-3', username: 'lama', role: 'Petugas', disabledAt: new Date('2026-10-01T00:00:00.000Z') });
    const top = topStaffRepo();
    const { manager, staffRepo } = txManager({ accounts: [target] });
    const { service, audit } = serviceWith(top, manager);

    const result = await service.deleteAccount('admin-1', 'staff-3');

    expect(result).toEqual({ id: 'staff-3' });
    expect(staffRepo.delete).toHaveBeenCalledWith({ id: 'staff-3' });
    expect(target.disabledAt).not.toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', details: expect.stringContaining('"mode":"permanently_deleted"') }),
    );
  });

  it('refuses to permanently remove a non-active account that still has operational history', async () => {
    const target = account({ id: 'staff-4', username: 'riwayat', role: 'Petugas', disabledAt: new Date('2026-10-01T00:00:00.000Z') });
    const top = topStaffRepo();
    const { manager, staffRepo } = txManager({ accounts: [target], blockers: ['control_visits', 'activation_codes'] });
    const { service } = serviceWith(top, manager);

    const error = await service.deleteAccount('admin-1', 'staff-4').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toContain('kunjungan kontrol');
    expect((error as Error).message).toContain('kode aktivasi');
    expect((error as Error).message).not.toContain('tidak ditemukan');
    expect(staffRepo.delete).not.toHaveBeenCalled();
  });

  it('maps a foreign-key violation on permanent removal to a specific conflict', async () => {
    const target = account({ id: 'staff-5', username: 'fk', role: 'Petugas', disabledAt: new Date('2026-10-01T00:00:00.000Z') });
    const top = topStaffRepo();
    const { manager } = txManager({
      accounts: [target],
      deleteError: new QueryFailedError('DELETE', [], { code: '23503' } as never),
    });
    const { service } = serviceWith(top, manager);

    const error = await service.deleteAccount('admin-1', 'staff-5').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toContain('tidak dapat dihapus permanen');
    expect((error as Error).message).not.toContain('tidak ditemukan');
  });
});

describe('StaffService profile and password', () => {
  it('lists accounts with the active Admin count and self marker', async () => {
    const accounts = [
      account({ id: 'admin-1', username: 'admin', role: 'Admin' }),
      account({ id: 'staff-2', username: 'dian', role: 'Petugas' }),
      account({ id: 'staff-3', username: 'lama', role: 'Admin', disabledAt: new Date() }),
    ];
    const top = topStaffRepo({ accounts });
    const { manager } = txManager();
    const { service } = serviceWith(top, manager);

    const view = await service.listAccounts('staff-2');

    expect(view.activeAdminCount).toBe(1);
    expect(view.maxAdmins).toBe(3);
    expect(view.accounts.find((item) => item.id === 'staff-2')?.isSelf).toBe(true);
    expect(view.accounts.find((item) => item.id === 'staff-3')?.active).toBe(false);
  });

  it('updates the owner phone number', async () => {
    const me = account({ id: 'staff-2', phone: null });
    const top = topStaffRepo({ accounts: [me] });
    const { manager } = txManager();
    const { service } = serviceWith(top, manager);

    const updated = await service.updateProfile('staff-2', { phone: '0812-3456-7890' });

    expect(updated.phone).toBe('0812-3456-7890');
  });

  it('rejects a password change when the current password is wrong', async () => {
    const me = account({ id: 'staff-2' });
    const top = topStaffRepo({ passwordAccount: me });
    const { manager } = txManager();
    const { service, auth } = serviceWith(top, manager);
    auth.verifyPassword.mockResolvedValueOnce(false);

    await expect(
      service.changePassword('staff-2', {
        currentPassword: 'salah',
        newPassword: 'rahasia-baru',
        confirmPassword: 'rahasia-baru',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a mismatched confirmation and a short new password', async () => {
    const me = account({ id: 'staff-2' });
    const top = topStaffRepo({ passwordAccount: me });
    const { service } = serviceWith(top, txManager().manager);

    await expect(
      service.changePassword('staff-2', {
        currentPassword: 'lama',
        newPassword: 'rahasia-baru',
        confirmPassword: 'beda',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.changePassword('staff-2', {
        currentPassword: 'lama',
        newPassword: 'pendek',
        confirmPassword: 'pendek',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hashes and stores a new password when the current one matches', async () => {
    const me = account({ id: 'staff-2', passwordHash: 'old-hash' });
    const top = topStaffRepo({ passwordAccount: me });
    const { service, auth, audit } = serviceWith(top, txManager().manager);

    await expect(
      service.changePassword('staff-2', {
        currentPassword: 'lama',
        newPassword: 'rahasia-baru',
        confirmPassword: 'rahasia-baru',
      }),
    ).resolves.toEqual({ ok: true });

    expect(auth.verifyPassword).toHaveBeenCalledWith('lama', 'old-hash');
    expect(auth.hashPassword).toHaveBeenCalledWith('rahasia-baru');
    expect(me.passwordHash).toBe('hashed');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'password_changed' }));
  });

  it('clears the temporary-password requirement on a successful change', async () => {
    const me = account({ id: 'staff-2', passwordHash: 'old-hash', mustChangePassword: true });
    const top = topStaffRepo({ passwordAccount: me });
    const { service } = serviceWith(top, txManager().manager);

    await expect(service.changePassword('staff-2', {
      currentPassword: 'lama',
      newPassword: 'rahasia-baru',
      confirmPassword: 'rahasia-baru',
    })).resolves.toEqual({ ok: true });

    expect(me.mustChangePassword).toBe(false);
  });

  it('issues a one-time temporary password, hashes it, flags the account, and never audits the plaintext', async () => {
    const target = account({ id: 'staff-2', username: 'dian', role: 'Petugas', passwordHash: 'old-hash' });
    const top = topStaffRepo({ accounts: [target] });
    const { manager } = txManager({ accounts: [target] });
    const { service, auth, audit } = serviceWith(top, manager);

    const result = await service.resetPassword('admin-1', 'staff-2');

    expect(result).toEqual({ id: 'staff-2', username: 'dian', temporaryPassword: expect.any(String) });
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(auth.hashPassword).toHaveBeenCalledWith(result.temporaryPassword);
    expect(target.passwordHash).toBe('hashed');
    expect(target.mustChangePassword).toBe(true);
    expect(target.role).toBe('Petugas');
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [expect.any(Number)]);

    const reset = audit.record.mock.calls.map((call) => call[0] as { action?: string }).find((entry) => entry.action === 'password_reset');
    expect(reset).toBeDefined();
    expect(JSON.stringify(reset)).not.toContain(result.temporaryPassword);
  });

  it('refuses to reset a missing account', async () => {
    const top = topStaffRepo();
    const { manager } = txManager({ accounts: [] });
    const { service } = serviceWith(top, manager);

    await expect(service.resetPassword('admin-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists whether an account still holds a temporary password', async () => {
    const accounts = [
      account({ id: 'admin-1', username: 'admin', role: 'Admin' }),
      account({ id: 'staff-2', username: 'dian', mustChangePassword: true }),
    ];
    const top = topStaffRepo({ accounts });
    const { service } = serviceWith(top, txManager().manager);

    const view = await service.listAccounts('admin-1');

    expect(view.accounts.find((item) => item.id === 'staff-2')?.mustChangePassword).toBe(true);
    expect(view.accounts.find((item) => item.id === 'admin-1')?.mustChangePassword).toBe(false);
  });
});
