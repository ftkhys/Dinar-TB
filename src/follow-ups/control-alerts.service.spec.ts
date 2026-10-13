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
});
