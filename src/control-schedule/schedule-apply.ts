import { EntityManager } from 'typeorm';
import { nextControlDate } from '../common/date-rules';
import { ControlSchedule } from '../database/entities/control-schedule.entity';

/**
 * A schedule row that was created or recalculated from a real medication date.
 * `previousDate` is null when the row was created.
 */
export type AppliedScheduleChange = {
  scheduleId: string;
  treatmentCourseId: string;
  previousDate: string | null;
  date: string;
  version: number;
};

/**
 * The outcome of resolving the next control date from a real medication date.
 * `perlu_konfirmasi` means no valid future schedule can be stored yet: either
 * the medication date is unknown or the computed date is already in the past,
 * which requires staff to confirm the real last control date first.
 */
export type NextScheduleResolution =
  | { status: 'scheduled'; date: string }
  | { status: 'perlu_konfirmasi'; reason: 'data_kurang' | 'jadwal_lampau'; derivedDate: string | null };

/**
 * The result of applying a medication-derived schedule inside a transaction.
 *  - `scheduled`            : a future (Rabu/Sabtu) date was written.
 *  - `perlu_konfirmasi`     : nothing was written; staff must confirm dates.
 *  - `override_dipertahankan`: a staff override already exists and was kept.
 */
export type ScheduleApplyOutcome =
  | { status: 'scheduled'; change: AppliedScheduleChange }
  | { status: 'perlu_konfirmasi'; reason: 'data_kurang' | 'jadwal_lampau'; derivedDate: string | null }
  | { status: 'override_dipertahankan' };

/**
 * Resolves the next control date from the last medication date: `+interval`
 * days, then back to the previous Wednesday/Saturday. A medication date that
 * would put the control on or before `today` is not a valid next schedule, so
 * it is reported as needing confirmation instead of being stored in the past.
 * `today` is always the Asia/Jakarta calendar date.
 */
export function resolveNextSchedule(
  lastMedicationDate: string | null,
  today: string,
  intervalDays: number,
): NextScheduleResolution {
  if (!lastMedicationDate) {
    return { status: 'perlu_konfirmasi', reason: 'data_kurang', derivedDate: null };
  }
  const derived = nextControlDate(lastMedicationDate, intervalDays);
  if (derived < today) {
    return { status: 'perlu_konfirmasi', reason: 'jadwal_lampau', derivedDate: derived };
  }
  return { status: 'scheduled', date: derived };
}

/**
 * Derives the next control schedule from a real medication date and persists it
 * **without creating any control visit or adherence row**.
 *
 * Rules encoded here:
 *  - the date comes only from `lastMedicationDate` (never `startDate` or the
 *    last control date), via `nextControlDate` (+interval, shifted back to the
 *    previous Wednesday/Saturday);
 *  - a computed date before `today` is never stored; the outcome is
 *    `perlu_konfirmasi` so staff confirm/correct the real dates first;
 *  - a schedule already overridden by staff is authoritative and is left as-is.
 *
 * The caller owns the transaction and is responsible for the audit row and the
 * `schedule.changed` event so those are only emitted after a successful commit.
 */
export async function applyMedicationSchedule(
  manager: EntityManager,
  treatmentId: string,
  lastMedicationDate: string | null,
  intervalDays: number,
  today: string,
): Promise<ScheduleApplyOutcome> {
  const repository = manager.getRepository(ControlSchedule);
  let schedule = await repository.findOneBy({ treatmentCourseId: treatmentId });

  // A staff override is a deliberate clinical decision: never overwrite it.
  if (schedule && schedule.overriddenByStaffId !== null) {
    return { status: 'override_dipertahankan' };
  }

  const resolution = resolveNextSchedule(lastMedicationDate, today, intervalDays);
  if (resolution.status === 'perlu_konfirmasi') {
    // Never persist a past date as the next schedule. Any existing row is left
    // untouched so a confirmed future date is only written after staff review.
    return resolution;
  }

  const previousDate = schedule?.scheduledDate ?? null;
  if (!schedule) {
    schedule = repository.create({
      treatmentCourseId: treatmentId,
      referenceVisitId: null,
      defaultDate: resolution.date,
      scheduledDate: resolution.date,
    });
  } else {
    schedule.defaultDate = resolution.date;
    schedule.scheduledDate = resolution.date;
  }
  const saved = await repository.save(schedule);
  return {
    status: 'scheduled',
    change: {
      scheduleId: saved.id,
      treatmentCourseId: treatmentId,
      previousDate,
      date: resolution.date,
      version: saved.version,
    },
  };
}
