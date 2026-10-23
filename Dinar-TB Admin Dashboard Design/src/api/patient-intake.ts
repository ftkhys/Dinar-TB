/**
 * Patient intake business logic for the three-step "Tambah Pasien" wizard.
 *
 * This module encodes the agreed FE -> BE contract only. It does not invent
 * endpoints or payloads; the orchestration calls exactly:
 *   - POST /patients
 *   - POST /patients/:patientId/treatments
 *   - POST /treatments/:treatmentId/visits
 *
 * The visit endpoint is the only backend surface that records the first
 * medication decision. When medicine is given the visit is anchored to the
 * medication date and the backend recalculates the control schedule. When
 * medicine is not given, no visit is sent, so no schedule is created.
 */

export type MedicationChoice = "start" | "other" | "none";

export type PatientIdentity = {
  registerNumber: string;
  fullName: string;
  medicalRecordNumber: string;
  address: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  nik?: string;
  pmoName?: string;
  pmoContact?: string;
};

export type PatientTreatment = {
  startDate: string;
  treatmentStage: string;
  /**
   * Real most-recent control date (distinct from `startDate`). Optional: an
   * unknown history is allowed and must not be inferred from the start date.
   */
  lastControlDate?: string | null;
  /**
   * Real last dispensing date, only used to derive the next control schedule.
   * Optional and never inferred from the last control date.
   */
  lastMedicationDate?: string | null;
};

export type PatientMedication = {
  choice: MedicationChoice;
  /** Required only when `choice === "other"`. */
  otherDate: string | null;
};

export type PatientIntakeInput = {
  identity: PatientIdentity;
  treatment: PatientTreatment;
  medication: PatientMedication;
};

/**
 * The patient fields the backend stores. `dateOfBirth`, `gender` and `phone`
 * are persisted columns; an empty string clears the optional column server-side.
 */
export type PersistedPatientIdentity = Pick<
  PatientIdentity,
  "registerNumber" | "fullName" | "medicalRecordNumber" | "address" | "dateOfBirth" | "gender" | "phone"
>;

/** Builds the identity fields sent to POST /patients and PATCH /patients/:id. */
export function persistedIdentity(patient: {
  fullName: string;
  registerNumber: string;
  medicalRecordNumber: string;
  address: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
}): PersistedPatientIdentity {
  return {
    fullName: patient.fullName,
    registerNumber: patient.registerNumber,
    medicalRecordNumber: patient.medicalRecordNumber,
    address: patient.address,
    dateOfBirth: patient.dateOfBirth ?? "",
    gender: patient.gender ?? "",
    phone: patient.phone ?? "",
  };
}

/** PATCH body for an identity-only edit; requires the current row version. */
export function identityPatch(identity: PatientIdentity, version: number): Record<string, unknown> {
  return { ...persistedIdentity(identity), version };
}

export type MedicationDecision = {
  medicineGiven: boolean;
  medicationGivenOn: string | null;
};

export type WizardStep = "basic" | "medication" | "schedule";

/** Edit mode only ever edits identity; it never repeats the first-dose step. */
export function wizardSteps(mode: "create" | "edit"): WizardStep[] {
  return mode === "edit" ? ["basic"] : ["basic", "medication", "schedule"];
}

/**
 * Defaults for the two history fields when the officer (re)selects a patient
 * type in Step 2.
 *
 * A **new** patient may use today as the last control date (first control is
 * happening now), matching the pre-existing default. An **old** patient must
 * never inherit that "today" value: both real dates start empty and the
 * officer has to enter the actual last control and last medication dates.
 */
export function historyFieldDefaults(
  oldPatient: boolean,
  today: string,
): { lastControlDate: string; lastMedicationDate: string } {
  return oldPatient
    ? { lastControlDate: "", lastMedicationDate: "" }
    : { lastControlDate: today, lastMedicationDate: "" };
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validates the two history dates against the treatment start and each other.
 * Only ordering is enforced; the medication date is never inferred from the
 * control date. Returns an officer-facing message or null when valid.
 */
export function validateHistoryDates(
  startDate: string,
  lastControlDate: string | null,
  lastMedicationDate: string | null,
): string | null {
  if (lastControlDate && !isValidDateOnly(lastControlDate)) {
    return "Tanggal kontrol terakhir harus berformat YYYY-MM-DD yang valid.";
  }
  if (lastMedicationDate && !isValidDateOnly(lastMedicationDate)) {
    return "Tanggal pemberian obat terakhir harus berformat YYYY-MM-DD yang valid.";
  }
  if (lastControlDate && lastControlDate < startDate) {
    return "Tanggal kontrol terakhir tidak boleh sebelum tanggal mulai pengobatan.";
  }
  if (lastMedicationDate) {
    if (!lastControlDate) {
      return "Tanggal kontrol terakhir wajib diisi bila tanggal pemberian obat terakhir diisi.";
    }
    if (lastMedicationDate < startDate) {
      return "Tanggal pemberian obat terakhir tidak boleh sebelum tanggal mulai pengobatan.";
    }
    if (lastMedicationDate > lastControlDate) {
      return "Tanggal pemberian obat terakhir tidak boleh setelah tanggal kontrol terakhir.";
    }
  }
  return null;
}

/**
 * Maps the officer's Step 2 choice into the visit payload fields. The date of
 * the first dose is only used once the officer explicitly confirms that
 * medicine was given on that date.
 */
export function resolveMedicationDecision(
  medication: PatientMedication,
  startDate: string,
): MedicationDecision {
  if (medication.choice === "start") {
    return { medicineGiven: true, medicationGivenOn: startDate };
  }
  if (medication.choice === "other") {
    return { medicineGiven: true, medicationGivenOn: medication.otherDate };
  }
  return { medicineGiven: false, medicationGivenOn: null };
}

/**
 * Read-only estimate that mirrors the backend rule (configured interval after
 * the medication date, moved back to the previous Wednesday/Saturday). This is
 * for display only; the backend remains the source of truth and this value is
 * never sent as proof that medicine was given.
 */
export function estimateNextControlDate(
  medicationGivenOn: string | null,
  intervalDays = 14,
): string | null {
  if (!medicationGivenOn || !isValidDateOnly(medicationGivenOn)) return null;
  const date = new Date(`${medicationGivenOn}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + intervalDays);
  while (date.getUTCDay() !== 3 && date.getUTCDay() !== 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in Asia/Jakarta (WIB), mirroring the backend. */
export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Mirrors the backend `resolveNextSchedule`: a schedule derived from a real
 * medication date must land on a future Rabu/Sabtu. A computed date on or
 * before `today` cannot be stored, so the officer is asked to confirm the real
 * last control date instead of silently presenting a "Terlambat" schedule.
 */
export type IntakeSchedule =
  | { status: "scheduled"; date: string }
  | { status: "perlu_konfirmasi"; reason: "data_kurang" | "jadwal_lampau"; derivedDate: string | null };

export function resolveIntakeSchedule(
  lastMedicationDate: string | null,
  today: string,
  intervalDays = 14,
): IntakeSchedule {
  if (!lastMedicationDate) {
    return { status: "perlu_konfirmasi", reason: "data_kurang", derivedDate: null };
  }
  const date = new Date(`${lastMedicationDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + intervalDays);
  while (date.getUTCDay() !== 3 && date.getUTCDay() !== 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const derived = date.toISOString().slice(0, 10);
  if (derived < today) {
    return { status: "perlu_konfirmasi", reason: "jadwal_lampau", derivedDate: derived };
  }
  return { status: "scheduled", date: derived };
}


export type IntakeStep = "patient" | "treatment" | "visit";

export type IntakeSaveResult = {
  patientId: string | null;
  treatmentId: string | null;
  visitRecorded: boolean;
  savedSteps: IntakeStep[];
  failure: { step: IntakeStep; error: unknown } | null;
};

/** Minimal surface of ControlApi needed by the orchestration (test-friendly). */
export interface PatientIntakeApi {
  createPatient(input: Record<string, unknown>): Promise<{ id: string }>;
  createTreatment(
    patientId: string,
    input: { startDate: string; treatmentStage?: string; lastControlDate?: string; lastMedicationDate?: string },
  ): Promise<{ id: string }>;
  createVisit(
    treatmentId: string,
    input: { visitDate: string; medicineGiven: boolean; medicationGivenOn?: string; additionalNote?: string },
  ): Promise<unknown>;
}

function requireText(value: string | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} wajib diisi.`);
  return value.trim();
}

function requireDate(value: string, name: string): string {
  if (!isValidDateOnly(value)) throw new Error(`${name} harus berformat YYYY-MM-DD yang valid.`);
  return value;
}

/**
 * Runs the create sequence step by step. It intentionally does not retry and
 * does not delete data already saved: on failure it returns which entities were
 * persisted and which step failed so the officer can decide what to do next.
 */
export async function savePatientIntake(
  api: PatientIntakeApi,
  input: PatientIntakeInput,
): Promise<IntakeSaveResult> {
  const fullName = requireText(input.identity.fullName, "Nama pasien");
  const registerNumber = requireText(input.identity.registerNumber, "Nomor Register");
  const medicalRecordNumber = requireText(input.identity.medicalRecordNumber, "Nomor Rekam Medis");
  const address = requireText(input.identity.address, "Alamat");
  const startDate = requireDate(input.treatment.startDate, "Tanggal mulai pengobatan");
  const lastControlDate = input.treatment.lastControlDate ?? null;
  const lastMedicationDate = input.treatment.lastMedicationDate ?? null;
  const historyError = validateHistoryDates(startDate, lastControlDate, lastMedicationDate);
  if (historyError) throw new Error(historyError);

  const decision = resolveMedicationDecision(input.medication, startDate);
  if (decision.medicineGiven && !decision.medicationGivenOn) {
    throw new Error("Tanggal pemberian obat wajib diisi.");
  }

  const savedSteps: IntakeStep[] = [];
  let patientId: string | null = null;
  let treatmentId: string | null = null;
  let visitRecorded = false;
  const base = () => ({ patientId, treatmentId, visitRecorded, savedSteps });

  try {
    const patient = await api.createPatient({
      fullName,
      registerNumber,
      medicalRecordNumber,
      address,
      ...(input.identity.dateOfBirth ? { dateOfBirth: input.identity.dateOfBirth } : {}),
      ...(input.identity.gender ? { gender: input.identity.gender } : {}),
      ...(input.identity.phone ? { phone: input.identity.phone } : {}),
      ...(input.identity.nik ? { nik: input.identity.nik } : {}),
      ...(input.identity.pmoName ? { pmoName: input.identity.pmoName } : {}),
      ...(input.identity.pmoContact ? { pmoContact: input.identity.pmoContact } : {}),
    });
    patientId = patient.id;
    savedSteps.push("patient");
  } catch (error) {
    return { ...base(), failure: { step: "patient", error } };
  }

  try {
    const treatment = await api.createTreatment(patientId, {
      startDate,
      treatmentStage: input.treatment.treatmentStage || undefined,
      ...(lastControlDate ? { lastControlDate } : {}),
      ...(lastMedicationDate ? { lastMedicationDate } : {}),
    });
    treatmentId = treatment.id;
    savedSteps.push("treatment");
  } catch (error) {
    return { ...base(), failure: { step: "treatment", error } };
  }

  if (decision.medicineGiven) {
    try {
      await api.createVisit(treatmentId, {
        // The control visit is dated to the real last control date, never the
        // treatment start date.
        visitDate: lastControlDate ?? startDate,
        medicineGiven: true,
        medicationGivenOn: decision.medicationGivenOn!,
      });
      visitRecorded = true;
      savedSteps.push("visit");
    } catch (error) {
      return { ...base(), failure: { step: "visit", error } };
    }
  }

  return { ...base(), failure: null };
}
