/**
 * Pure helpers for `db:backfill-treatment-history` (see
 * `backfill-treatment-history.ts`). Kept separate from the CLI so the update
 * rules can be unit tested without initializing a database connection.
 */

/**
 * One treatment course selected for backfill, with the visit-derived dates and
 * the values currently stored in the two history columns.
 */
export type TreatmentHistoryCandidate = {
  treatmentId: string;
  startDate: string;
  /** `MAX(control_visits.visit_date)` for the course, or null with no visit. */
  lastControlDate: string | null;
  /** `MAX(control_visits.medication_given_on)` where medicine was given, or null. */
  lastMedicationDate: string | null;
  /** Current stored value; when set it must never be overwritten. */
  existingControlDate: string | null;
  /** Current stored value; when set it must never be overwritten. */
  existingMedicationDate: string | null;
};

/** The columns to update for one course (an empty object means "no change"). */
export type TreatmentHistoryPatch = {
  lastControlDate?: string;
  lastMedicationDate?: string;
};

/**
 * Builds the column patch for a single course.
 *
 * A column is written only when it is still NULL **and** a real visit-derived
 * value exists. A value already stored — including a manual correction — is
 * never overwritten. The medication date is never inferred from the control
 * date or the treatment start date; both dates come solely from recorded
 * visits (`existing*` flags protect manual values, `last*` carry the derived
 * values).
 */
export function buildHistoryPatch(candidate: TreatmentHistoryCandidate): TreatmentHistoryPatch {
  const patch: TreatmentHistoryPatch = {};
  if (candidate.existingControlDate === null && candidate.lastControlDate !== null) {
    patch.lastControlDate = candidate.lastControlDate;
  }
  if (candidate.existingMedicationDate === null && candidate.lastMedicationDate !== null) {
    patch.lastMedicationDate = candidate.lastMedicationDate;
  }
  return patch;
}
