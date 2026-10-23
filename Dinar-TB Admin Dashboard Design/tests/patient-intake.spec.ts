import {
  estimateNextControlDate,
  historyFieldDefaults,
  identityPatch,
  jakartaToday,
  persistedIdentity,
  resolveIntakeSchedule,
  resolveMedicationDecision,
  savePatientIntake,
  validateHistoryDates,
  wizardSteps,
  type PatientIntakeApi,
  type PatientIntakeInput,
} from "../src/api/patient-intake";

function baseIntake(overrides: Partial<PatientIntakeInput> = {}): PatientIntakeInput {
  return {
    identity: {
      registerNumber: "2026-00005721-0001",
      fullName: "Siti Nur Afifah",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
    },
    treatment: { startDate: "2026-10-14", treatmentStage: "Bulan ke-1" },
    medication: { choice: "start", otherDate: null },
    ...overrides,
  };
}

function fakeApi(overrides: Partial<PatientIntakeApi> = {}): Required<PatientIntakeApi> {
  return {
    createPatient: jest.fn(async () => ({ id: "patient-1" })),
    createTreatment: jest.fn(async () => ({ id: "treatment-1" })),
    createVisit: jest.fn(async () => ({ id: "visit-1" })),
    ...overrides,
  } as Required<PatientIntakeApi>;
}

describe("patient intake wizard", () => {
  it("only edits identity in edit mode and does not repeat the first-dose step", () => {
    expect(wizardSteps("edit")).toEqual(["basic"]);
    expect(wizardSteps("create")).toEqual(["basic", "medication", "schedule"]);
  });

  it("maps the first-dose choice to the visit fields", () => {
    expect(resolveMedicationDecision({ choice: "start", otherDate: null }, "2026-10-14"))
      .toEqual({ medicineGiven: true, medicationGivenOn: "2026-10-14" });
    expect(resolveMedicationDecision({ choice: "other", otherDate: "2026-10-20" }, "2026-10-14"))
      .toEqual({ medicineGiven: true, medicationGivenOn: "2026-10-20" });
    expect(resolveMedicationDecision({ choice: "none", otherDate: null }, "2026-10-14"))
      .toEqual({ medicineGiven: false, medicationGivenOn: null });
  });

  it("estimates the control date from the configured interval, moved to the previous service day", () => {
    expect(estimateNextControlDate("2026-10-14")).toBe("2026-10-28");
    expect(estimateNextControlDate("2026-10-13")).toBe("2026-10-24");
    expect(estimateNextControlDate("2026-10-14", 21)).toBe("2026-11-04");
    expect(estimateNextControlDate(null)).toBeNull();
    expect(estimateNextControlDate("2026-02-30")).toBeNull();
  });
});

describe("intake schedule resolution (WIB)", () => {
  it("resolves today's calendar date in Asia/Jakarta", () => {
    // 2026-10-19T17:30:00Z is 2026-10-20 00:30 WIB.
    expect(jakartaToday(new Date("2026-10-19T17:30:00.000Z"))).toBe("2026-10-20");
  });

  it("schedules a future Rabu/Sabtu date derived from the medication date", () => {
    expect(resolveIntakeSchedule("2026-10-15", "2026-10-20")).toEqual({ status: "scheduled", date: "2026-10-28" });
  });

  it("asks for confirmation when the medication date is unknown", () => {
    expect(resolveIntakeSchedule(null, "2026-10-20")).toEqual({
      status: "perlu_konfirmasi", reason: "data_kurang", derivedDate: null,
    });
  });

  it("flags a computed date in the past instead of showing it as a schedule", () => {
    const result = resolveIntakeSchedule("2026-09-01", "2026-10-20");
    expect(result).toMatchObject({ status: "perlu_konfirmasi", reason: "jadwal_lampau" });
    expect(result.status === "perlu_konfirmasi" && result.derivedDate).toBeTruthy();
  });
});

describe("history field defaults per patient type", () => {
  it("does not default the control date to today for an old patient", () => {
    expect(historyFieldDefaults(true, "2026-10-20")).toEqual({ lastControlDate: "", lastMedicationDate: "" });
  });

  it("keeps today as the control default for a new patient", () => {
    expect(historyFieldDefaults(false, "2026-10-20")).toEqual({ lastControlDate: "2026-10-20", lastMedicationDate: "" });
  });
});

describe("validateHistoryDates", () => {
  it("accepts no history and an ordered history", () => {
    expect(validateHistoryDates("2025-01-01", null, null)).toBeNull();
    expect(validateHistoryDates("2025-01-01", "2025-06-01", null)).toBeNull();
    expect(validateHistoryDates("2025-01-01", "2025-06-01", "2025-05-20")).toBeNull();
  });

  it("requires a valid format and a control date before a medication date", () => {
    expect(validateHistoryDates("2025-01-01", "01-06-2025", null)).toBe("Tanggal kontrol terakhir harus berformat YYYY-MM-DD yang valid.");
    expect(validateHistoryDates("2025-01-01", null, "2025-05-20")).toBe("Tanggal kontrol terakhir wajib diisi bila tanggal pemberian obat terakhir diisi.");
  });

  it("rejects dates before the start or medication after control", () => {
    expect(validateHistoryDates("2025-06-01", "2025-01-01", null)).toBe("Tanggal kontrol terakhir tidak boleh sebelum tanggal mulai pengobatan.");
    expect(validateHistoryDates("2025-01-01", "2025-05-01", "2025-05-20")).toBe("Tanggal pemberian obat terakhir tidak boleh setelah tanggal kontrol terakhir.");
  });
});

describe("savePatientIntake", () => {
  it("given on start date: creates patient, treatment, and a visit anchored to the start date", async () => {
    const api = fakeApi();
    const result = await savePatientIntake(api, baseIntake());

    expect(api.createPatient).toHaveBeenCalledTimes(1);
    expect(api.createTreatment).toHaveBeenCalledWith("patient-1", { startDate: "2026-10-14", treatmentStage: "Bulan ke-1" });
    expect(api.createVisit).toHaveBeenCalledWith("treatment-1", {
      visitDate: "2026-10-14",
      medicineGiven: true,
      medicationGivenOn: "2026-10-14",
    });
    expect(result).toMatchObject({ patientId: "patient-1", treatmentId: "treatment-1", visitRecorded: true, failure: null });
    expect(result.savedSteps).toEqual(["patient", "treatment", "visit"]);
  });

  it("given on another date: anchors the visit to the chosen medication date", async () => {
    const api = fakeApi();
    await savePatientIntake(api, baseIntake({ medication: { choice: "other", otherDate: "2026-10-20" } }));

    expect(api.createVisit).toHaveBeenCalledWith("treatment-1", expect.objectContaining({
      medicineGiven: true,
      medicationGivenOn: "2026-10-20",
    }));
  });

  it("not given: records no visit so no control schedule is created", async () => {
    const api = fakeApi();
    const result = await savePatientIntake(api, baseIntake({ medication: { choice: "none", otherDate: null } }));

    expect(api.createVisit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ visitRecorded: false, failure: null });
    expect(result.savedSteps).toEqual(["patient", "treatment"]);
  });

  it("requires a medication date when the officer says medicine was given on another date", async () => {
    const api = fakeApi();
    await expect(savePatientIntake(api, baseIntake({ medication: { choice: "other", otherDate: null } })))
      .rejects.toThrow("Tanggal pemberian obat wajib diisi.");
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it("sends the real control and medication dates without inventing a visit", async () => {
    const api = fakeApi();
    await savePatientIntake(api, baseIntake({
      treatment: {
        startDate: "2025-01-01",
        treatmentStage: "Bulan ke-6",
        lastControlDate: "2025-06-01",
        lastMedicationDate: "2025-05-20",
      },
      medication: { choice: "none", otherDate: null },
    }));

    expect(api.createTreatment).toHaveBeenCalledWith("patient-1", {
      startDate: "2025-01-01",
      treatmentStage: "Bulan ke-6",
      lastControlDate: "2025-06-01",
      lastMedicationDate: "2025-05-20",
    });
    expect(api.createVisit).not.toHaveBeenCalled();
  });

  it("rejects a medication date after the control date before saving anything", async () => {
    const api = fakeApi();
    await expect(savePatientIntake(api, baseIntake({
      treatment: {
        startDate: "2025-01-01",
        treatmentStage: "Bulan ke-1",
        lastControlDate: "2025-05-01",
        lastMedicationDate: "2025-05-20",
      },
    }))).rejects.toThrow("Tanggal pemberian obat terakhir tidak boleh setelah tanggal kontrol terakhir.");
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it("reports the failed step and keeps entities already saved instead of retrying or deleting", async () => {
    const failing = fakeApi({ createTreatment: jest.fn(async () => { throw new Error("treatment down"); }) });
    const partial = await savePatientIntake(failing, baseIntake());
    expect(partial.savedSteps).toEqual(["patient"]);
    expect(partial.patientId).toBe("patient-1");
    expect(partial.treatmentId).toBeNull();
    expect(partial.failure).toMatchObject({ step: "treatment" });

    const visitFailing = fakeApi({ createVisit: jest.fn(async () => { throw new Error("visit down"); }) });
    const visitPartial = await savePatientIntake(visitFailing, baseIntake());
    expect(visitPartial.savedSteps).toEqual(["patient", "treatment"]);
    expect(visitPartial.visitRecorded).toBe(false);
    expect(visitPartial.failure).toMatchObject({ step: "visit" });
  });

  it("stops before creating anything when identity is incomplete", async () => {
    const api = fakeApi();
    const incomplete = baseIntake();
    incomplete.identity.medicalRecordNumber = "";
    await expect(savePatientIntake(api, incomplete)).rejects.toThrow("Nomor Rekam Medis wajib diisi.");
    expect(api.createPatient).not.toHaveBeenCalled();
  });
});

describe("patient identity mapping", () => {
  it("maps the persisted identity fields including profile demographics", () => {
    const mapped = persistedIdentity({
      fullName: "Siti Nur Afifah",
      registerNumber: "2026-00004647-0014",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
      dateOfBirth: "1985-04-17",
      gender: "Perempuan",
      phone: "081234567890",
    });

    expect(mapped).toEqual({
      fullName: "Siti Nur Afifah",
      registerNumber: "2026-00004647-0014",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
      dateOfBirth: "1985-04-17",
      gender: "Perempuan",
      phone: "081234567890",
    });
  });

  it("sends empty strings for omitted optional profile fields so they can be cleared", () => {
    const mapped = persistedIdentity({
      fullName: "Siti Nur Afifah",
      registerNumber: "2026-00004647-0014",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
    });
    expect(mapped.dateOfBirth).toBe("");
    expect(mapped.gender).toBe("");
    expect(mapped.phone).toBe("");
  });

  it("builds an identity-only patch carrying the current row version", () => {
    const patch = identityPatch({
      fullName: "Siti Nur Afifah",
      registerNumber: "2026-00004647-0014",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
      dateOfBirth: "1985-04-17",
      gender: "Perempuan",
      phone: "081234567890",
    }, 7);

    expect(patch).toEqual({
      fullName: "Siti Nur Afifah",
      registerNumber: "2026-00004647-0014",
      medicalRecordNumber: "RM-0001",
      address: "Kec. Cipayung, Jakarta Timur",
      dateOfBirth: "1985-04-17",
      gender: "Perempuan",
      phone: "081234567890",
      version: 7,
    });
    expect(Object.keys(patch).sort()).toEqual([
      "address", "dateOfBirth", "fullName", "gender", "medicalRecordNumber", "phone", "registerNumber", "version",
    ]);
  });
});
