import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

type Row = {
  id: number;
  puskesmasName: string;
  puskesmasPhone: string | null;
  controlIntervalDays: number;
  reminderMorning: string;
  reminderEvening: string;
  updatedAt: Date;
};

function fullRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    puskesmasName: 'Puskesmas Jatinegara',
    puskesmasPhone: null,
    controlIntervalDays: 14,
    reminderMorning: '06:00',
    reminderEvening: '20:00',
    updatedAt: new Date('2026-10-16T00:00:00.000Z'),
    ...overrides,
  };
}

function repoWith(initial: Row | null) {
  const state = { row: initial };
  const repo = {
    findOne: jest.fn(async () => state.row),
    create: jest.fn((value: Row) => value),
    save: jest.fn(async (value: Row) => {
      state.row = { ...(state.row ?? ({} as Row)), ...value };
      return state.row;
    }),
  };
  type ManagerMock = {
    getRepository: jest.Mock;
    query: jest.Mock;
    transaction: jest.Mock;
  };
  const manager = {} as ManagerMock;
  manager.getRepository = jest.fn(() => repo);
  manager.query = jest.fn(async () => []);
  manager.transaction = jest.fn(
    async (callback: (value: ManagerMock) => unknown) => callback(manager),
  );
  return Object.assign(repo, { manager });
}

function serviceWith(row: Row | null) {
  const repo = repoWith(row);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SettingsService(repo as never, audit as never);
  return { service, repo, audit };
}

describe('SettingsService', () => {
  it('returns the shared settings as a view', async () => {
    const { service } = serviceWith(fullRow({ puskesmasPhone: '021-123' }));

    await expect(service.get()).resolves.toEqual({
      puskesmasName: 'Puskesmas Jatinegara',
      puskesmasPhone: '021-123',
      controlIntervalDays: 14,
      reminderMorning: '06:00',
      reminderEvening: '20:00',
      updatedAt: '2026-10-16T00:00:00.000Z',
    });
  });

  it('creates the singleton row on demand when it is missing', async () => {
    const { service, repo } = serviceWith(null);

    await service.get();

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('maps reminder times to one-hour windows, wrapping past midnight', async () => {
    const { service } = serviceWith(fullRow({ reminderMorning: '07:30', reminderEvening: '23:30' }));

    await expect(service.reminderWindows()).resolves.toEqual([
      { start: '07:30', end: '08:30' },
      { start: '23:30', end: '00:30' },
    ]);
  });

  it('feeds the configured interval to the scheduling rule', async () => {
    const { service } = serviceWith(fullRow({ controlIntervalDays: 21 }));
    await expect(service.controlIntervalDays()).resolves.toBe(21);
  });

  it('rejects an out-of-range or non-integer control interval', async () => {
    const { service } = serviceWith(fullRow());
    await expect(service.update('staff-1', { controlIntervalDays: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('staff-1', { controlIntervalDays: -3 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('staff-1', { controlIntervalDays: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('staff-1', { controlIntervalDays: 400 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed reminder times', async () => {
    const { service } = serviceWith(fullRow());
    await expect(service.update('staff-1', { reminderMorning: '7:00' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('staff-1', { reminderEvening: '25:00' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists valid changes and records one audit event per affected group', async () => {
    const { service, audit } = serviceWith(fullRow());

    const view = await service.update('staff-1', {
      puskesmasName: 'Puskesmas Melati',
      controlIntervalDays: 30,
    });

    expect(view.puskesmasName).toBe('Puskesmas Melati');
    expect(view.controlIntervalDays).toBe(30);
    const actions = audit.record.mock.calls.map((call) => (call[0] as { action: string }).action).sort();
    expect(actions).toEqual(['puskesmas_updated', 'schedule_updated']);
  });

  it('saves settings and audit events in one transaction', async () => {
    const { service, repo, audit } = serviceWith(fullRow());

    await service.update('staff-1', { controlIntervalDays: 30 });

    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][1]).toBe(repo.manager as never);
  });

  it('records settings audit events with a valid uuid object id', async () => {
    const { service, audit } = serviceWith(fullRow());

    await service.update('staff-1', { reminderMorning: '08:00' });

    const [event] = audit.record.mock.calls[0] as [{ objectId: string }];
    expect(event.objectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
