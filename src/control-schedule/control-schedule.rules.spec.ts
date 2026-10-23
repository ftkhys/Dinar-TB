import { controlScheduleStatus } from './control-schedule.rules';

describe('control schedule status', () => {
  const todaySelasa = '2026-10-20';
  const todayKamis = '2026-10-22';

  it('marks a completed treatment as Selesai regardless of the date', () => {
    expect(controlScheduleStatus('2026-10-10', todaySelasa, true)).toBe('Selesai');
    expect(controlScheduleStatus('2026-12-01', todaySelasa, true)).toBe('Selesai');
  });

  it('classifies past and today dates', () => {
    expect(controlScheduleStatus('2026-10-18', todaySelasa, false)).toBe('Terlambat');
    expect(controlScheduleStatus(todaySelasa, todaySelasa, false)).toBe('Hari Ini');
  });

  it('groups the next service day as Besok and later service days as Mendatang', () => {
    // Selasa: next service day is Rabu 21, the one after is Sabtu 24.
    expect(controlScheduleStatus('2026-10-21', todaySelasa, false)).toBe('Besok');
    expect(controlScheduleStatus('2026-10-24', todaySelasa, false)).toBe('Mendatang');
    // Kamis: next service day is Sabtu 24, the one after is Rabu 28.
    expect(controlScheduleStatus('2026-10-24', todayKamis, false)).toBe('Besok');
    expect(controlScheduleStatus('2026-10-28', todayKamis, false)).toBe('Mendatang');
  });
});
