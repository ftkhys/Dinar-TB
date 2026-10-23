import { addCalendarMonths, dateInTimeZone, FINAL_REVIEW_MIN_MONTH, nextControlDate, nextServiceDay, toCalendarDate, treatmentMonth } from './date-rules';

describe('calendar and control date rules', () => {
  it('adds calendar months and clamps to the destination month end', () => {
    expect(addCalendarMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addCalendarMonths('2024-08-31', 6)).toBe('2025-02-28');
    expect(addCalendarMonths('2024-08-31', 7)).toBe('2025-03-31');
  });

  it('derives treatment month from elapsed days using the existing app rule', () => {
    expect(treatmentMonth('2026-01-01', '2025-12-31')).toBe(0);
    expect(treatmentMonth('2026-01-01', '2026-01-01')).toBe(1);
    expect(treatmentMonth('2026-01-01', '2026-01-30')).toBe(1);
    expect(treatmentMonth('2026-01-01', '2026-01-31')).toBe(2);
    expect(treatmentMonth('2026-01-01', '2026-05-31')).toBe(6);
    expect(treatmentMonth('2026-01-01', '2026-06-01')).toBe(6);
    expect(treatmentMonth('2026-01-01', '2026-06-30')).toBe(7);
    expect(FINAL_REVIEW_MIN_MONTH).toBe(6);
  });

  it('moves a 14-day control date backward to the prior Rabu or Sabtu service day', () => {
    expect(nextControlDate('2026-10-14')).toBe('2026-10-28');
    expect(nextControlDate('2026-10-07')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-08')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-09')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-10')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-11')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-12')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-13')).toBe('2026-10-24');
  });

  it('honours a configured control interval instead of the 14-day default', () => {
    // 2026-10-14 + 21 days = 2026-11-04 (Rabu), already a service day.
    expect(nextControlDate('2026-10-14', 21)).toBe('2026-11-04');
    // 2026-10-14 + 30 days = 2026-11-13 (Jumat) -> prior Rabu 2026-11-11.
    expect(nextControlDate('2026-10-14', 30)).toBe('2026-11-11');
    // The default stays 14 days when omitted.
    expect(nextControlDate('2026-10-14')).toBe('2026-10-28');
  });

  it('finds the first Rabu or Sabtu service day strictly after a date', () => {
    // 2026-10-20 Selasa -> Rabu 21; 2026-10-22 Kamis -> Sabtu 24.
    expect(nextServiceDay('2026-10-20')).toBe('2026-10-21');
    expect(nextServiceDay('2026-10-22')).toBe('2026-10-24');
    // On a service day it advances to the next one (Rabu -> Sabtu, Sabtu -> Rabu).
    expect(nextServiceDay('2026-10-21')).toBe('2026-10-24');
    expect(nextServiceDay('2026-10-24')).toBe('2026-10-28');
  });

  it('determines the patient-local date in Asia/Jakarta', () => {
    expect(dateInTimeZone(new Date('2026-10-04T16:59:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-04');
    expect(dateInTimeZone(new Date('2026-10-04T17:00:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-05');
  });

  it('normalizes plain and ISO date strings without shifting the day', () => {
    expect(toCalendarDate('2026-10-16')).toBe('2026-10-16');
    expect(toCalendarDate('2026-10-16T00:00:00.000Z')).toBe('2026-10-16');
    expect(toCalendarDate('2026-10-16 07:30:00')).toBe('2026-10-16');
  });

  it('normalizes Date objects the way pg returns them (local midnight) without shifting the day', () => {
    // Exactly what node-postgres produces for a `date` column: local midnight.
    expect(toCalendarDate(new Date(2026, 9, 16))).toBe('2026-10-16');
    expect(toCalendarDate(new Date(2026, 9, 1))).toBe('2026-10-01');
  });

  it('resolves Date objects that carry a time component in the application time zone', () => {
    expect(toCalendarDate(new Date('2026-10-04T17:00:00.000Z'))).toBe('2026-10-05');
    expect(toCalendarDate(new Date('2026-10-04T16:59:00.000Z'))).toBe('2026-10-04');
  });

  it('rejects values that are not calendar dates', () => {
    expect(() => toCalendarDate('bukan-tanggal')).toThrow();
    expect(() => toCalendarDate('2026-02-30')).toThrow();
    expect(() => toCalendarDate(new Date('invalid'))).toThrow();
  });
});
