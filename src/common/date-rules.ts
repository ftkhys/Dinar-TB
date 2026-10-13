export const APPLICATION_TIME_ZONE = 'Asia/Jakarta';

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarMonths(dateOnly: string, months: number): string {
  if (!isDateOnly(dateOnly)) throw new Error('Tanggal harus berformat YYYY-MM-DD yang valid.');
  const [year, month, day] = dateOnly.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function addCalendarDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function previousServiceDay(dateOnly: string): string {
  let date = new Date(`${dateOnly}T00:00:00.000Z`);
  while (date.getUTCDay() !== 3 && date.getUTCDay() !== 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

export function nextControlDate(medicationGivenDate: string): string {
  return previousServiceDay(addCalendarDays(medicationGivenDate, 14));
}

export function localTodayJakarta(now = new Date()): string {
  return dateInTimeZone(now, APPLICATION_TIME_ZONE);
}

export function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
