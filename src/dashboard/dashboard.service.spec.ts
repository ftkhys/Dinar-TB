import { DashboardService } from './dashboard.service';
import { ControlAlertsService } from '../follow-ups/control-alerts.service';

const NOW = new Date('2026-10-16T03:00:00.000Z'); // 2026-10-16 in Asia/Jakarta

function dataSourceWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('AS month')) {
        return overrides.months ?? [
          { month: '2026-07', count: 1 },
          { month: '2026-09', count: 3 },
        ];
      }
      if (sql.includes('scheduled_date > $1')) return [{ count: overrides.upcoming ?? 5 }];
      if (sql.includes('count(*)::int AS count FROM patients')) return [{ count: overrides.total ?? 70 }];
      if (sql.includes('DISTINCT da.treatment_course_id')) return [{ count: overrides.confirmed ?? 37 }];
      if (sql.includes('max(da.confirmed_at)')) {
        return [{ updatedAt: overrides.updatedAt === undefined ? '2026-10-16T03:24:00.000Z' : overrides.updatedAt }];
      }
      if (sql.includes('FROM audit_logs')) {
        return overrides.activities ?? [
          {
            id: 'log-1',
            action: 'created',
            objectType: 'patient',
            objectId: 'patient-1',
            details: null,
            actor: 'petugas.demo',
            createdAt: '2026-10-16T02:00:00.000Z',
          },
        ];
      }
      if (sql.includes('FROM treatment_courses tc')) {
        return [{ count: overrides.active ?? 40 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}

function alertsWith(items: Array<Record<string, unknown>>) {
  return { list: jest.fn().mockResolvedValue(items) } as unknown as ControlAlertsService;
}

describe('DashboardService.summary', () => {
  it('derives stats, fills missing months, and separates confirmed from pending adherence', async () => {
    const alerts = alertsWith([
      {
        scheduleId: 's1', patientId: 'p1', patientName: 'Ahmad', registerNumber: 'REG-1',
        scheduledDate: '2026-10-01', level: 'Terlambat', status: 'Belum kontrol', message: 'terlambat',
      },
      {
        scheduleId: 's2', patientId: 'p2', patientName: 'Rina', registerNumber: 'REG-2',
        scheduledDate: '2026-10-16', level: 'Hari-H', status: 'Belum kontrol', message: 'hari ini',
      },
      {
        scheduleId: 's3', patientId: 'p3', patientName: 'Budi', registerNumber: 'REG-3',
        scheduledDate: '2026-10-17', level: 'H-1', status: 'Belum kontrol', message: 'besok',
      },
    ]);
    const service = new DashboardService(dataSourceWith() as never, alerts);

    const summary = await service.summary(NOW);

    expect(summary.today).toBe('2026-10-16');
    expect(summary.timeZone).toBe('Asia/Jakarta');
    expect(summary.stats).toEqual({ totalPatients: 70, controlsToday: 1, upcomingControls: 5, needsFollowUp: 1 });
    expect(summary.newPatientsByMonth).toHaveLength(6);
    expect(summary.newPatientsByMonth.map((row) => row.month)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    expect(summary.newPatientsByMonth.map((row) => row.count)).toEqual([0, 0, 1, 0, 3, 0]);
    expect(summary.newPatientsByMonth[4].label).toBe('Sep');
    expect(summary.medicationToday).toEqual({
      activeTreatments: 40,
      confirmed: 37,
      notConfirmed: 3,
      lastUpdatedAt: '2026-10-16T03:24:00.000Z',
    });
    expect(summary.followUps).toHaveLength(1);
    expect(summary.followUps[0]).toMatchObject({ scheduleId: 's1', patientName: 'Ahmad', registerNumber: 'REG-1' });
  });

  it('never reports more confirmations than active treatments', async () => {
    const service = new DashboardService(dataSourceWith({ active: 2, confirmed: 5 }) as never, alertsWith([]));

    const summary = await service.summary(NOW);

    expect(summary.medicationToday.confirmed).toBe(2);
    expect(summary.medicationToday.notConfirmed).toBe(0);
  });

  it('reports a null last-update timestamp when no adherence was confirmed today', async () => {
    const service = new DashboardService(dataSourceWith({ updatedAt: null }) as never, alertsWith([]));

    const summary = await service.summary(NOW);

    expect(summary.medicationToday.lastUpdatedAt).toBeNull();
  });

  it('limits treatment activity and adherence indicators to courses already started today', async () => {
    const dataSource = dataSourceWith();
    await new DashboardService(dataSource as never, alertsWith([])).summary(NOW);

    const queries = dataSource.query.mock.calls.map(([sql]) => sql);
    expect(queries.find((sql) => sql.includes('FROM treatment_courses tc'))).toContain('tc.start_date <= $1::date');
    expect(queries.find((sql) => sql.includes('DISTINCT da.treatment_course_id'))).toContain('tc.start_date <= $1::date');
    expect(queries.find((sql) => sql.includes('max(da.confirmed_at)'))).toContain('tc.start_date <= $1::date');
  });
});

describe('DashboardService.activities', () => {
  it('maps audit rows and clamps an out-of-range limit', async () => {
    const dataSource = dataSourceWith();
    const service = new DashboardService(dataSource as never, alertsWith([]));

    const activities = await service.activities(9999);

    expect(activities).toHaveLength(1);
    expect(activities[0]).toEqual({
      id: 'log-1',
      action: 'created',
      objectType: 'patient',
      objectId: 'patient-1',
      details: null,
      actor: 'petugas.demo',
      isSelf: false,
      patientName: null,
      message: 'Petugas petugas.demo menambahkan data pasien.',
      createdAt: '2026-10-16T02:00:00.000Z',
    });
    expect((dataSource.query as jest.Mock).mock.calls.at(-1)?.[1]).toEqual([50]);
  });

  function activityDataSource(rows: Array<Record<string, unknown>>) {
    return {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM audit_logs a')) return rows;
        if (sql.includes('count(*)::int AS count FROM audit_logs')) return [{ count: 0 }];
        if (sql.includes('FROM staff_activity_reads')) return [];
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
  }

  it('formats patient actions differently for the viewer vs another staff account', async () => {
    const row = {
      id: 'log-2', action: 'archived', objectType: 'patient', objectId: 'patient-1',
      details: null, actor: 'Fatkha', actorStaffId: 'staff-fatkha',
      patientName: 'Budi', patientAnonymized: false, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    const selfView = await service.activities(50, 'staff-fatkha');
    expect(selfView[0].isSelf).toBe(true);
    expect(selfView[0].message).toBe('Data pasien Budi berhasil diarsipkan.');

    const otherView = await service.activities(50, 'staff-dian');
    expect(otherView[0].isSelf).toBe(false);
    expect(otherView[0].message).toBe('Petugas Fatkha mengarsipkan data pasien Budi.');
  });

  it('never re-exposes the identity of an anonymized patient', async () => {
    const row = {
      id: 'log-3', action: 'anonymized', objectType: 'patient', objectId: 'patient-9',
      details: null, actor: 'Dian', actorStaffId: 'staff-dian',
      patientName: 'Pasien Dianonimkan', patientAnonymized: true, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    const feed = await service.activities(50, 'staff-dian');
    expect(feed[0].patientName).toBeNull();
    expect(feed[0].message).toBe('Data pasien berhasil dihapus permanen.');
  });

  it('uses the deletion record snapshot for a hard-deleted patient', async () => {
    const row = {
      id: 'log-4', action: 'permanently_deleted', objectType: 'patient', objectId: 'patient-7',
      details: JSON.stringify({ patientName: 'Budi' }), actor: 'Dian', actorStaffId: 'staff-dian',
      patientName: null, patientAnonymized: null, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    const feed = await service.activities(50, 'staff-other');
    expect(feed[0].patientName).toBe('Budi');
    expect(feed[0].message).toBe('Petugas Dian menghapus permanen data pasien Budi.');
  });

  it('names the patient when a control schedule is changed', async () => {
    const row = {
      id: 'log-cs-1', action: 'date_overridden', objectType: 'control_schedule', objectId: 'schedule-1',
      details: '2026-10-24 -> 2026-10-21', actor: 'Dian', actorStaffId: 'staff-dian',
      patientName: 'Budi', patientAnonymized: false, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    const selfView = await service.activities(50, 'staff-dian');
    expect(selfView[0].isSelf).toBe(true);
    expect(selfView[0].patientName).toBe('Budi');
    expect(selfView[0].message).toBe('Jadwal kontrol pasien Budi berhasil diubah.');

    const otherView = await service.activities(50, 'staff-fatkha');
    expect(otherView[0].isSelf).toBe(false);
    expect(otherView[0].message).toBe('Petugas Dian mengubah jadwal kontrol pasien Budi.');
  });

  it('does not expose the patient name of an anonymized schedule change', async () => {
    const row = {
      id: 'log-cs-2', action: 'date_overridden', objectType: 'control_schedule', objectId: 'schedule-2',
      details: '2026-10-24 -> 2026-10-21', actor: 'Dian', actorStaffId: 'staff-dian',
      patientName: 'Pasien Dianonimkan', patientAnonymized: true, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    const feed = await service.activities(50, 'staff-dian');
    expect(feed[0].patientName).toBeNull();
    expect(feed[0].message).toBe('Jadwal kontrol pasien berhasil diubah.');
  });

  it('formats login activity per viewer', async () => {
    const row = {
      id: 'log-5', action: 'login', objectType: 'staff_account', objectId: 'staff-dian',
      details: null, actor: 'Dian', actorStaffId: 'staff-dian',
      patientName: null, patientAnonymized: null, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    expect((await service.activities(50, 'staff-dian'))[0].message).toBe('Anda berhasil login.');
    expect((await service.activities(50, 'staff-fatkha'))[0].message).toBe('Petugas Dian berhasil login.');
  });

  it('identifies both role and actor for another account activity', async () => {
    const row = {
      id: 'log-set-1', action: 'schedule_updated', objectType: 'app_settings', objectId: '1',
      details: null, actor: 'Fatkha', actorRole: 'Admin', actorStaffId: 'staff-fatkha',
      patientName: null, patientAnonymized: null, target: null, targetRole: null,
      createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    expect((await service.activities(50, 'staff-fatkha'))[0].message).toBe('Anda mengubah pengaturan jadwal.');
    expect((await service.activities(50, 'staff-dian'))[0].message).toBe('Admin Fatkha mengubah pengaturan jadwal.');
  });

  it('names the target account when an Admin creates one', async () => {
    const row = {
      id: 'log-set-2', action: 'created', objectType: 'staff_account', objectId: 'staff-dian',
      details: JSON.stringify({ targetUsername: 'Dian', targetRole: 'Petugas' }), actor: 'Fatkha',
      actorRole: 'Admin', actorStaffId: 'staff-fatkha', patientName: null, patientAnonymized: null,
      target: 'Dian', targetRole: 'Petugas', createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    expect((await service.activities(50, 'staff-other'))[0].message).toBe(
      'Admin Fatkha menambahkan akun Dian sebagai Petugas.',
    );
  });

  it('uses the recorded role from details for a role change', async () => {
    const row = {
      id: 'log-set-3', action: 'role_changed', objectType: 'staff_account', objectId: 'staff-dian',
      details: JSON.stringify({ targetUsername: 'Dian', targetRole: 'Admin' }), actor: 'Fatkha',
      actorRole: 'Admin', actorStaffId: 'staff-fatkha', patientName: null, patientAnonymized: null,
      target: null, targetRole: null, createdAt: '2026-10-16T02:00:00.000Z',
    };
    const service = new DashboardService(activityDataSource([row]) as never, alertsWith([]));

    expect((await service.activities(50, 'staff-other'))[0].message).toBe(
      'Admin Fatkha mengubah peran akun Dian menjadi Admin.',
    );
  });
});

describe('DashboardService.notifications', () => {
  function notificationDataSource(lastSeenAt: string | null, unread: number) {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM audit_logs a')) {
        return [{
          id: 'log-1', action: 'created', objectType: 'patient', objectId: 'patient-1',
          details: null, actor: 'petugas.demo', createdAt: '2026-10-16T02:00:00.000Z',
        }];
      }
      if (sql.includes('count(*)::int AS count FROM audit_logs')) return [{ count: unread }];
      if (sql.includes('FROM staff_activity_reads')) return lastSeenAt ? [{ lastSeenAt }] : [];
      if (sql.includes('INSERT INTO staff_activity_reads')) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    return { query, queries };
  }

  it('reports the unread count since the staff marker and isolates it per account', async () => {
    const dataSource = notificationDataSource('2026-10-16T01:00:00.000Z', 3);
    const service = new DashboardService(dataSource as never, alertsWith([]));

    const feed = await service.notifications('staff-1');

    expect(feed.unreadCount).toBe(3);
    expect(feed.lastSeenAt).toBe('2026-10-16T01:00:00.000Z');
    expect(feed.items).toHaveLength(1);
    expect((dataSource.query as jest.Mock).mock.calls.at(-1)?.[1]).toEqual(['2026-10-16T01:00:00.000Z']);
  });

  it('marks activities read up to the newest displayed item without deleting history', async () => {
    const dataSource = notificationDataSource(null, 0);
    const service = new DashboardService(dataSource as never, alertsWith([]));

    const result = await service.markActivitiesRead('staff-1', '2026-10-16T02:00:00.000Z', new Date('2026-10-16T05:00:00.000Z'));

    expect(result.lastSeenAt).toBe('2026-10-16T02:00:00.000Z');
    expect(dataSource.queries.some((sql) => sql.includes('INSERT INTO staff_activity_reads'))).toBe(true);
    expect(dataSource.queries.some((sql) => sql.includes('DELETE'))).toBe(false);
  });

  it('keeps microsecond precision so the newest activity can be marked read', async () => {
    const query = jest.fn(async () => [{
      id: 'log-1', action: 'created', objectType: 'patient', objectId: 'patient-1',
      details: null, actor: 'petugas.demo', actorRole: 'Admin', actorStaffId: 'staff-1',
      patientName: 'Budi', patientAnonymized: false, target: null, targetRole: null,
      createdAt: '2026-10-16T02:00:00.123456Z',
    }]);
    const service = new DashboardService({ query } as never, alertsWith([]));

    const items = await service.activities(10, 'staff-1');

    expect(items[0].createdAt).toBe('2026-10-16T02:00:00.123456Z');
    expect((query as jest.Mock).mock.calls[0]?.[0]).toContain('SS.US');
  });

  it('stores the client marker without truncating its microseconds', async () => {
    const marker = '2026-10-16T02:00:00.123456Z';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO staff_activity_reads')) return [{ lastSeenAt: marker }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const service = new DashboardService({ query } as never, alertsWith([]));

    const result = await service.markActivitiesRead(
      'staff-1',
      marker,
      new Date('2026-10-16T05:00:00.000Z'),
    );

    expect(result.lastSeenAt).toBe(marker);
    expect((query as jest.Mock).mock.calls[0]?.[1]).toEqual([
      'staff-1',
      marker,
      '2026-10-16T05:00:00.000Z',
    ]);
  });

  it('keeps the badge cleared after a reload and raises it for a new activity', async () => {
    const auditRow = (createdAt: string) => ({
      id: `log-${createdAt}`, action: 'created', objectType: 'patient', objectId: 'patient-1',
      details: null, actor: 'petugas.demo', actorRole: 'Admin', actorStaffId: 'staff-2',
      patientName: 'Budi', patientAnonymized: false, target: null, targetRole: null,
      createdAt,
    });
    const epochMicros = (value: string) => {
      const fraction = /\.(\d{1,6})Z$/.exec(value)?.[1] ?? '';
      return Date.parse(value) * 1000 + Number(fraction.padEnd(6, '0').slice(3));
    };
    let rows = [auditRow('2026-10-16T02:00:00.123456Z')];
    let marker: string | null = null;
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM audit_logs a')) return rows;
      if (sql.includes('count(*)::int AS count FROM audit_logs')) {
        const since = params?.[0] as string | null;
        const count = since === null
          ? rows.length
          : rows.filter((row) => epochMicros(row.createdAt) > epochMicros(since)).length;
        return [{ count }];
      }
      if (sql.includes('FROM staff_activity_reads')) {
        return marker ? [{ lastSeenAt: marker }] : [];
      }
      if (sql.includes('INSERT INTO staff_activity_reads')) {
        const candidate = String(params?.[1]);
        const now = String(params?.[2]);
        const effective = Date.parse(candidate) > Date.parse(now) ? now : candidate;
        if (marker === null || Date.parse(effective) > Date.parse(marker)) {
          marker = effective;
        }
        return [{ lastSeenAt: marker }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const service = new DashboardService({ query } as never, alertsWith([]));

    const first = await service.notifications('staff-1');
    expect(first.unreadCount).toBe(1);

    await service.markActivitiesRead(
      'staff-1',
      first.items[0].createdAt,
      new Date('2026-10-16T05:00:00.000Z'),
    );

    // The next page navigation reloads the feed from the server.
    const afterNavigation = await service.notifications('staff-1');
    expect(afterNavigation.lastSeenAt).toBe(marker);
    expect(afterNavigation.unreadCount).toBe(0);

    // A genuinely new activity must raise the badge again.
    rows = [...rows, auditRow('2026-10-16T03:00:00.000000Z')];
    const afterNewActivity = await service.notifications('staff-1');
    expect(afterNewActivity.unreadCount).toBe(1);
  });

  it('clamps a future marker to now and falls back to now for an invalid marker', async () => {
    const dataSource = notificationDataSource(null, 0);
    const service = new DashboardService(dataSource as never, alertsWith([]));
    const now = new Date('2026-10-16T05:00:00.000Z');

    await expect(service.markActivitiesRead('staff-1', '2999-01-01T00:00:00.000Z', now)).resolves.toEqual({
      lastSeenAt: now.toISOString(),
    });
    await expect(service.markActivitiesRead('staff-1', 'not-a-date', now)).resolves.toEqual({
      lastSeenAt: now.toISOString(),
    });
  });
});

describe('DashboardService.exportSummary', () => {
  it('returns a real xlsx workbook buffer with a dated filename', async () => {
    const service = new DashboardService(dataSourceWith() as never, alertsWith([]));

    const result = await service.exportSummary(NOW);

    expect(result.filename).toBe('ringkasan-dinar-tb-2026-10-16.xlsx');
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(result.buffer.length).toBeGreaterThan(1000);
  });
});
