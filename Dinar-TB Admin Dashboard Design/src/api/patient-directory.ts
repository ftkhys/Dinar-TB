import type { PatientControlStatus, PatientDirectoryEntry } from "./control-api";

/**
 * Control-status filter options for the Daftar Pasien table. Mirrors the badge
 * statuses produced by the backend directory (`PatientControlStatus`) and stays
 * consistent with the Jadwal Kontrol filter, minus "Selesai" — the patient
 * directory only lists patients with an active treatment.
 */
export const PATIENT_CONTROL_STATUS_FILTERS = [
  "Semua",
  "Hari Ini",
  "Besok",
  "Terlambat",
  "Mendatang",
  "Perlu Konfirmasi",
] as const satisfies ReadonlyArray<"Semua" | PatientControlStatus>;

export type PatientControlStatusFilter = (typeof PATIENT_CONTROL_STATUS_FILTERS)[number];

/** Filters directory rows by the selected control status, preserving order. */
export function filterByControlStatus<T extends { status: string }>(rows: T[], filter: string): T[] {
  return filter === "Semua" ? rows : rows.filter((row) => row.status === filter);
}

/** Server-backed patient adapted to the table/detail layout. */
export type PatientRow = {
  id: string;
  reg: string;
  name: string;
  medicalRecordNumber: string;
  address: string;
  version: number;
  dateOfBirth: string;
  gender: string;
  phone: string;
  treatmentStage: string;
  startDate: string;
  scheduleDate: string;
  status: string;
};

/** Keeps the backend's current active schedule; absent data stays blank. */
export function toPatientRow(entry: PatientDirectoryEntry): PatientRow {
  return {
    id: entry.id,
    reg: entry.registerNumber,
    name: entry.fullName,
    medicalRecordNumber: entry.medicalRecordNumber,
    address: entry.address,
    version: entry.version,
    dateOfBirth: entry.dateOfBirth ?? "",
    gender: entry.gender ?? "",
    phone: entry.phone ?? "",
    treatmentStage: entry.treatment?.treatmentStage ?? "",
    startDate: entry.treatment?.startDate ?? "",
    scheduleDate: entry.schedule?.scheduledDate ?? "",
    status: entry.controlStatus ?? "",
  };
}
