import { addCalendarMonths, dateInTimeZone, nextControlDate } from './date-rules';

describe('calendar and control date rules', () => {
  it('adds calendar months and clamps to the destination month end', () => {
    expect(addCalendarMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addCalendarMonths('2024-08-31', 6)).toBe('2025-02-28');
    expect(addCalendarMonths('2024-08-31', 7)).toBe('2025-03-31');
  });

  it('moves a 14-day control date backward to the prior Rabu or Sabtu service day', () => {
    expect(nextControlDate('2026-10-07')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-08')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-09')).toBe('2026-10-21');
    expect(nextControlDate('2026-10-10')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-11')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-12')).toBe('2026-10-24');
    expect(nextControlDate('2026-10-13')).toBe('2026-10-24');
  });

  it('determines the patient-local date in Asia/Jakarta', () => {
    expect(dateInTimeZone(new Date('2026-10-04T16:59:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-04');
    expect(dateInTimeZone(new Date('2026-10-04T17:00:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-05');
  });
});
