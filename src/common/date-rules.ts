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

/**
 * Treatment month shown to staff and patients, using the existing app rule:
 * day 1-30 is month 1, day 31-60 is month 2, and so on. Returns 0 before the
 * treatment starts. This is deliberately independent from the six-month target
 * date: entering month 6 is not the same as reaching the end of month 6.
 */
export function treatmentMonth(startDate: string, today: string): number {
  if (!isDateOnly(startDate)) throw new Error('Tanggal mulai pengobatan harus berformat YYYY-MM-DD.');
  if (!isDateOnly(today)) throw new Error('Tanggal hari ini harus berformat YYYY-MM-DD.');
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const current = new Date(`${today}T00:00:00.000Z`).getTime();
  if (current < start) return 0;
  return Math.floor((current - start) / 86_400_000 / 30) + 1;
}

/** The first treatment month in which a final review decision is allowed. */
export const FINAL_REVIEW_MIN_MONTH = 6;

export function previousServiceDay(dateOnly: string): string {
  let date = new Date(`${dateOnly}T00:00:00.000Z`);
  while (date.getUTCDay() !== 3 && date.getUTCDay() !== 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * The first Poli TB service day (Rabu or Sabtu) strictly after `dateOnly`.
 * Used to group upcoming controls by the clinic's service days instead of a
 * plain H+1 offset.
 */
export function nextServiceDay(dateOnly: string): string {
  let date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== 3 && date.getUTCDay() !== 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Default control interval in days used when no configured value is supplied.
 * The active value is stored in `app_settings.control_interval_days` and read
 * by the visit scheduling flow.
 */
export const DEFAULT_CONTROL_INTERVAL_DAYS = 14;

export function nextControlDate(
  medicationGivenDate: string,
  intervalDays: number = DEFAULT_CONTROL_INTERVAL_DAYS,
): string {
  return previousServiceDay(addCalendarDays(medicationGivenDate, intervalDays));
}

export function localTodayJakarta(now = new Date()): string {
  return dateInTimeZone(now, APPLICATION_TIME_ZONE);
}

/**
 * Normalizes a calendar date coming from the database or a raw SQL query into
 * a `YYYY-MM-DD` string without shifting the calendar day across time zones.
 *
 * PostgreSQL `date` columns are returned by `pg` as `Date` objects built at
 * local midnight, so their local components are the intended calendar date
 * (using UTC accessors here would subtract the zone offset and shift the day).
 * A `Date` that carries a time component is treated as an instant and resolved
 * in the application time zone (Asia/Jakarta) instead.
 */
export function toCalendarDate(value: Date | string, timeZone: string = APPLICATION_TIME_ZONE): string {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (!match || !isDateOnly(match[1])) {
      throw new Error(`Tanggal bukan format kalender yang valid: ${value}`);
    }
    return match[1];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const localMidnight =
      value.getHours() === 0 &&
      value.getMinutes() === 0 &&
      value.getSeconds() === 0 &&
      value.getMilliseconds() === 0;
    if (localMidnight) {
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${value.getFullYear()}-${month}-${day}`;
    }
    return dateInTimeZone(value, timeZone);
  }
  throw new Error('Nilai tanggal tidak dikenali.');
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
