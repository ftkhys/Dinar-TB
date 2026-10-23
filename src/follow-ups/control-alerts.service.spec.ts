import { ControlAlertsService } from './control-alerts.service';

describe('ControlAlertsService messages', () => {
  const dueSchedule = {
    scheduleId: 'schedule-1', patientId: 'patient-1', patientName: 'Nama Pasien', scheduledDate: '2026-10-05',
  };
  const now = new Date('2026-10-04T17:00:00.000Z');

  it('keeps the original alert message when there is no relevant visit', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ ...dueSchedule, unmedicatedVisitDate: null }]) };
    const service = new ControlAlertsService(dataSource as never);

    const alerts = await service.list(now);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe(
      'Pasien belum melakukan kontrol. Nama Pasien dijadwalkan kontrol pada 2026-10-05, tetapi sampai saat ini belum tercatat melakukan kunjungan.',
    );
  });

  it('keeps the alert but acknowledges a relevant visit without medicine', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ ...dueSchedule, unmedicatedVisitDate: '2026-10-04' }]),
    };
    const service = new ControlAlertsService(dataSource as never);

    const alerts = await service.list(now);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe(
      'Pasien sudah tercatat melakukan kunjungan pada 2026-10-04 tanpa pemberian obat. Jadwal kontrol Nama Pasien pada 2026-10-05 masih belum terpenuhi.',
    );
  });

  it('limits control alerts to treatments that have started', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new ControlAlertsService(dataSource as never);

    await service.list(now);

    expect(dataSource.query.mock.calls[0][0]).toContain('tc.start_date <= $1::date');
    expect(dataSource.query.mock.calls[0][1]).toEqual(['2026-10-05']);
  });
});

describe('ControlAlertsService date normalization (regression)', () => {
  const now = new Date('2026-10-04T17:00:00.000Z'); // today in Asia/Jakarta = 2026-10-05

  function alertsFor(scheduledDate: string | Date) {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        { scheduleId: 's', patientId: 'p', patientName: 'Nama Pasien', scheduledDate, unmedicatedVisitDate: null },
      ]),
    };
    return new ControlAlertsService(dataSource as never).list(now);
  }

  it('detects hari-H when the query returns an ISO date string', async () => {
    const alerts = await alertsFor('2026-10-05');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'Hari-H', scheduledDate: '2026-10-05' });
  });

  it('detects H-1 and Terlambat from string results', async () => {
    expect((await alertsFor('2026-10-06'))[0]).toMatchObject({ level: 'H-1', scheduledDate: '2026-10-06' });
    expect((await alertsFor('2026-10-04'))[0]).toMatchObject({ level: 'Terlambat', scheduledDate: '2026-10-04' });
  });

  it('ignores schedules that are further in the future', async () => {
    expect(await alertsFor('2026-10-07')).toEqual([]);
  });

  it('detects hari-H when pg returns a real Date object (local midnight)', async () => {
    const alerts = await alertsFor(new Date(2026, 9, 5));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'Hari-H', scheduledDate: '2026-10-05' });
    expect(alerts[0].message).toContain('2026-10-05');
  });

  it('detects H-1 and Terlambat from Date objects without shifting the day', async () => {
    expect((await alertsFor(new Date(2026, 9, 6)))[0]).toMatchObject({ level: 'H-1', scheduledDate: '2026-10-06' });
    expect((await alertsFor(new Date(2026, 9, 4)))[0]).toMatchObject({ level: 'Terlambat', scheduledDate: '2026-10-04' });
  });

  it('normalizes a Date visit date in the message', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        { scheduleId: 's', patientId: 'p', patientName: 'Nama Pasien', scheduledDate: new Date(2026, 9, 5), unmedicatedVisitDate: new Date(2026, 9, 4) },
      ]),
    };
    const alerts = await new ControlAlertsService(dataSource as never).list(now);
    expect(alerts[0].message).toContain('2026-10-04');
    expect(alerts[0].message).toContain('2026-10-05');
  });
});
