import {
  filterByControlStatus,
  PATIENT_CONTROL_STATUS_FILTERS,
  toPatientRow,
} from "../src/api/patient-directory";
import type { PatientControlStatus, PatientDirectoryEntry } from "../src/api/control-api";

type Row = { name: string; status: PatientControlStatus | "" };

const rows: Row[] = [
  { name: "Budi", status: "Hari Ini" },
  { name: "Ani", status: "Mendatang" },
  { name: "Cici", status: "Perlu Konfirmasi" },
  { name: "Dedi", status: "" },
];

describe("patient directory control-status filter", () => {
  it("offers Perlu Konfirmasi, consistent with the badge and the Jadwal Kontrol filter", () => {
    expect(PATIENT_CONTROL_STATUS_FILTERS).toContain("Perlu Konfirmasi");
    expect(PATIENT_CONTROL_STATUS_FILTERS).not.toContain("Selesai");
  });

  it("returns every row for Semua", () => {
    expect(filterByControlStatus(rows, "Semua")).toEqual(rows);
  });

  it("keeps only rows matching the selected status", () => {
    expect(filterByControlStatus(rows, "Perlu Konfirmasi")).toEqual([{ name: "Cici", status: "Perlu Konfirmasi" }]);
    expect(filterByControlStatus(rows, "Hari Ini")).toEqual([{ name: "Budi", status: "Hari Ini" }]);
  });

  it("returns no rows when the status is absent", () => {
    expect(filterByControlStatus(rows, "Besok")).toEqual([]);
  });
});

describe("patient directory table mapping", () => {
  const entry = (overrides: Partial<PatientDirectoryEntry> = {}): PatientDirectoryEntry => ({
    id: "patient-1",
    fullName: "Siti Nur Afifah",
    registerNumber: "2026-00004647-0014",
    medicalRecordNumber: "RM-0001",
    address: "Kec. Cipayung, Jakarta Timur",
    dateOfBirth: "1985-04-17",
    gender: "Perempuan",
    phone: "081234567890",
    archivedAt: null,
    pmoName: null,
    pmoContact: null,
    createdByStaffId: "staff-1",
    version: 2,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    treatment: {
      id: "treatment-1",
      startDate: "2026-07-01",
      treatmentStage: "Bulan ke-4",
      completedAt: null,
      lastControlDate: "2026-09-27",
      lastMedicationDate: "2026-09-27",
    },
    schedule: { scheduledDate: "2026-10-10" },
    controlStatus: "Mendatang",
    ...overrides,
  });

  it("maps the active schedule date returned by the backend into the table row", () => {
    const row = toPatientRow(entry());

    expect(row.scheduleDate).toBe("2026-10-10");
    expect(row.status).toBe("Mendatang");
    expect(row.treatmentStage).toBe("Bulan ke-4");
  });

  it("keeps the date blank when the backend has no active schedule", () => {
    const row = toPatientRow(entry({ schedule: null, controlStatus: "Perlu Konfirmasi" }));

    expect(row.scheduleDate).toBe("");
    expect(row.status).toBe("Perlu Konfirmasi");
  });
});
