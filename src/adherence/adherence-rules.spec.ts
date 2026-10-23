import { summarizeAdherence } from './adherence-rules';
import { AdherenceStatus } from '../database/enums';

describe('adherence status rules', () => {
  it('computes pending today and missed previous unconfirmed dates', () => {
    const result = summarizeAdherence('2026-10-03', '2026-10-05', null, new Map([
      ['2026-10-03', '2026-10-03T00:00:00.000Z'],
    ]));
    expect(result.days.map((day) => day.status)).toEqual([
      AdherenceStatus.TAKEN,
      AdherenceStatus.MISSED,
      AdherenceStatus.NOT_CONFIRMED,
    ]);
    expect(result.totalTaken).toBe(1);
    expect(result.totalMissed).toBe(1);
    expect(result.missedStreak).toBe(1);
  });

  it('uses the completed date as the end of tracking after treatment closure', () => {
    const result = summarizeAdherence('2026-10-01', '2026-10-10', '2026-10-03', new Map());
    expect(result.days.map((day) => day.status)).toEqual([
      AdherenceStatus.MISSED,
      AdherenceStatus.MISSED,
      AdherenceStatus.MISSED,
    ]);
  });

  it('does not create adherence days before a future treatment start date', () => {
    const result = summarizeAdherence('2026-10-22', '2026-10-21', null, new Map());
    expect(result).toEqual({ days: [], totalTaken: 0, totalMissed: 0, missedStreak: 0 });
  });
});
