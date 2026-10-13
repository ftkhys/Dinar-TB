import { controlAlertLevel, controlAlertMessage } from './control-alert.rules';

describe('control alert calendar rules', () => {
  it('classifies H-1, Hari-H and overdue alerts', () => {
    expect(controlAlertLevel('2026-10-06', '2026-10-05')).toBe('H-1');
    expect(controlAlertLevel('2026-10-05', '2026-10-05')).toBe('Hari-H');
    expect(controlAlertLevel('2026-10-04', '2026-10-05')).toBe('Terlambat');
    expect(controlAlertLevel('2026-10-07', '2026-10-05')).toBeNull();
  });

  it('uses the agreed alert text', () => {
    expect(controlAlertMessage('Nama Pasien', '2026-10-06')).toBe(
      'Pasien belum melakukan kontrol. Nama Pasien dijadwalkan kontrol pada 2026-10-06, tetapi sampai saat ini belum tercatat melakukan kunjungan.',
    );
  });

  it('keeps the original message when no relevant visit is recorded', () => {
    expect(controlAlertMessage('Nama Pasien', '2026-10-06', null)).toBe(
      'Pasien belum melakukan kontrol. Nama Pasien dijadwalkan kontrol pada 2026-10-06, tetapi sampai saat ini belum tercatat melakukan kunjungan.',
    );
  });

  it('acknowledges a visit without medicine while keeping the due-control alert', () => {
    const message = controlAlertMessage('Nama Pasien', '2026-10-06', '2026-10-05');
    expect(message).toBe(
      'Pasien sudah tercatat melakukan kunjungan pada 2026-10-05 tanpa pemberian obat. Jadwal kontrol Nama Pasien pada 2026-10-06 masih belum terpenuhi.',
    );
    expect(message).not.toContain('belum tercatat melakukan kunjungan');
  });
});
