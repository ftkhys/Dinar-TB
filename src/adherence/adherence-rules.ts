import { AdherenceStatus } from '../database/enums';
import { addCalendarDays } from '../common/date-rules';

export interface AdherenceDay {
  date: string;
  status: AdherenceStatus;
  confirmedAt: string | null;
}

export interface AdherenceSummary {
  days: AdherenceDay[];
  totalTaken: number;
  totalMissed: number;
  missedStreak: number;
}

export function summarizeAdherence(
  startDate: string,
  today: string,
  completedDate: string | null,
  confirmations: Map<string, string>,
): AdherenceSummary {
  const endDate = completedDate && completedDate < today ? completedDate : today;
  const days: AdherenceDay[] = [];
  if (startDate <= endDate) {
    for (let date = startDate; date <= endDate; date = addCalendarDays(date, 1)) {
      const confirmedAt = confirmations.get(date) ?? null;
      days.push({
        date,
        status: confirmedAt ? AdherenceStatus.TAKEN : date === today ? AdherenceStatus.NOT_CONFIRMED : AdherenceStatus.MISSED,
        confirmedAt,
      });
    }
  }
  const totalTaken = days.filter((day) => day.status === AdherenceStatus.TAKEN).length;
  const totalMissed = days.filter((day) => day.status === AdherenceStatus.MISSED).length;
  let missedStreak = 0;
  let index = days.length - 1;
  if (index >= 0 && days[index].status === AdherenceStatus.NOT_CONFIRMED) index -= 1;
  for (; index >= 0; index -= 1) {
    if (days[index].status !== AdherenceStatus.MISSED) break;
    missedStreak += 1;
  }
  return { days, totalTaken, totalMissed, missedStreak };
}
