/**
 * Patient shape returned by GET /patients and GET /patients/:id. The backend
 * never returns `nik`. Profile fields (dateOfBirth/gender/phone) and the soft
 * delete marker (archivedAt) are persisted columns.
 */
export type Patient = {
  id: string;
  fullName: string;
  registerNumber: string;
  medicalRecordNumber: string;
  address: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  archivedAt: string | null;
  pmoName: string | null;
  pmoContact: string | null;
  createdByStaffId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PatientControlStatus = "Hari Ini" | "Besok" | "Terlambat" | "Mendatang" | "Perlu Konfirmasi";

export type PatientTreatmentSummary = {
  id: string;
  startDate: string;
  treatmentStage: string | null;
  completedAt: string | null;
  lastControlDate: string | null;
  lastMedicationDate: string | null;
};

/** Row from GET /patients/directory: patient + active treatment + schedule. */
export type PatientDirectoryEntry = Patient & {
  treatment: PatientTreatmentSummary | null;
  schedule: { scheduledDate: string } | null;
  controlStatus: PatientControlStatus | null;
};

export type PatientStats = { total: number; sesuai: number; dekat: number; terlambat: number };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };
export type ControlScheduleStatusCounts = Record<ControlScheduleStatus, number>;
export type ManagedControlSchedulePage = PageResult<ManagedControlSchedule> & { statusCounts: ControlScheduleStatusCounts };

export type ImportRowStatus = "valid" | "invalid" | "duplicate" | "imported" | "skipped";

export type ImportPatientRow = {
  registerNumber: string;
  fullName: string;
  medicalRecordNumber: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string;
  startDate: string | null;
  treatmentStage: string | null;
  lastControlDate: string | null;
  lastMedicationDate: string | null;
};

export type ImportRowResult = {
  rowNumber: number;
  registerNumber: string | null;
  fullName: string | null;
  status: ImportRowStatus;
  errors: string[];
};

export type ImportPreview = {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  rows: ImportRowResult[];
  validRows: ImportPatientRow[];
};

export type ImportConfirmResult = {
  total: number;
  imported: number;
  invalid: number;
  duplicate: number;
  skipped: number;
  /** Imported courses whose computed schedule is in the past and need confirmation. */
  pendingSchedule: number;
  rows: ImportRowResult[];
};

export type Treatment = {
  id: string;
  patientId: string;
  startDate: string;
  completedAt: string | null;
  treatmentStage?: string | null;
  initialTargetEndDate?: string | null;
  continuedTargetEndDate?: string | null;
  finalDecision?: string | null;
  finalReviewNote?: string | null;
  finalReviewedAt?: string | null;
  lastControlDate?: string | null;
  lastMedicationDate?: string | null;
  reviewDue?: boolean;
  remindersEnabled?: boolean;
  /** Elapsed treatment month using the same day-based rule as the patient app. */
  treatmentMonth?: number;
  /** True when staff may make the month-6 Selesai/Dilanjutkan decision now. */
  finalReviewEligible?: boolean;
  /** True when history dates could not yield a future schedule and require confirmation. */
  schedulePendingConfirmation?: boolean;
};

export type ControlSchedule = {
  id: string;
  treatmentCourseId: string;
  defaultDate: string | null;
  scheduledDate: string;
  version: number;
  overriddenAt: string | null;
};

export type ControlVisit = {
  id: string;
  visitDate: string;
  complaintProgress: string | null;
  additionalNote: string | null;
  medicineGiven: boolean;
  medicationGivenOn: string | null;
};

export type ControlAlert = {
  scheduleId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  scheduledDate: string;
  level: "H-1" | "Hari-H" | "Terlambat";
  status: string;
  message: string;
};

export type ControlScheduleStatus = "Hari Ini" | "Besok" | "Terlambat" | "Mendatang" | "Selesai" | "Perlu Konfirmasi";

/**
 * Row from GET /control-schedules: one treatment course staff have to manage.
 * Unlike the alert feed this includes upcoming schedules without an active
 * warning and completed treatments (status "Selesai"). A course without any
 * stored schedule is shown with a null `scheduleId`/`scheduledDate` and the
 * status "Perlu Konfirmasi".
 */
export type ManagedControlSchedule = {
  scheduleId: string | null;
  treatmentCourseId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  address: string;
  scheduledDate: string | null;
  completed: boolean;
  status: ControlScheduleStatus;
};

export type DashboardFollowUp = {
  scheduleId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  scheduledDate: string;
  level: string;
  message: string;
};

export type DashboardActivity = {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  details: string | null;
  actor: string | null;
  /** True when the acting account is the one viewing the feed. */
  isSelf: boolean;
  /** Resolved patient name, or null when unknown or anonymized. */
  patientName: string | null;
  /** Viewer-aware sentence composed by the server from the audit record. */
  message: string;
  createdAt: string;
};

export type DashboardNotificationFeed = {
  items: DashboardActivity[];
  unreadCount: number;
  lastSeenAt: string | null;
};

export type StaffRole = "Admin" | "Petugas";

/** Shape of GET /staff/me and one row from GET /staff/accounts. */
export type StaffAccountSummary = {
  id: string;
  username: string;
  displayName: string | null;
  role: StaffRole;
  phone: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  isSelf: boolean;
};

export type StaffAccounts = {
  accounts: StaffAccountSummary[];
  activeAdminCount: number;
  maxAdmins: number;
};

/** Shape of GET /settings (shared, read by all staff). */
export type AppSettings = {
  puskesmasName: string;
  puskesmasPhone: string | null;
  controlIntervalDays: number;
  reminderMorning: string;
  reminderEvening: string;
  updatedAt: string;
};

export type AdherenceDayStatus = "Sudah diminum" | "Terlewat" | "Belum dikonfirmasi";

export type AdherenceDay = { date: string; status: AdherenceDayStatus; confirmedAt: string | null };

/** Shape of GET /treatments/:treatmentId/adherence (staff summary). */
export type AdherenceSummary = {
  days: AdherenceDay[];
  totalTaken: number;
  totalMissed: number;
  missedStreak: number;
};

export type ReminderRowStatus = "Sudah Konfirmasi" | "Belum Konfirmasi";

/** One active treatment on the staff Pengingat screen for the current WIB day. */
export type ReminderRow = {
  treatmentCourseId: string;
  patientId: string;
  patientName: string;
  registerNumber: string | null;
  reminderTime: string;
  status: ReminderRowStatus;
  confirmedAt: string | null;
  missedStreak: number;
};

/** Shape of GET /adherence/reminders. */
export type RemindersView = {
  date: string;
  timeZone: string;
  generatedAt: string;
  reminderMorning: string;
  reminderEvening: string;
  stats: { active: number; confirmed: number; notConfirmed: number; needsAttention: number };
  rows: ReminderRow[];
};

export type ReportCategory = "Data Pasien" | "Riwayat Kontrol" | "Pemberian Obat" | "Konfirmasi Minum Obat" | "Perlu Tindak Lanjut";
export type ReportColumn = { key: string; label: string };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export type ReportSummaryItem = { label: string; value: number };
export type ReportFilters = { category: ReportCategory; from: string; to: string; patientId?: string | null };

/** Shape of GET /reports/preview. */
export type ReportPreview = {
  category: ReportCategory;
  from: string;
  to: string;
  patientId: string | null;
  generatedAt: string;
  total: number;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryItem[];
};

function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams({ category: filters.category, from: filters.from, to: filters.to });
  if (filters.patientId) params.set("patientId", filters.patientId);
  return `?${params.toString()}`;
}

export type DashboardSummary = {
  today: string;
  timeZone: string;
  generatedAt: string;
  stats: {
    totalPatients: number;
    controlsToday: number;
    upcomingControls: number;
    needsFollowUp: number;
  };
  newPatientsByMonth: Array<{ month: string; label: string; count: number }>;
  medicationToday: {
    activeTreatments: number;
    confirmed: number;
    notConfirmed: number;
    lastUpdatedAt: string | null;
  };
  followUps: DashboardFollowUp[];
};

export type FollowUp = {
  id: string;
  controlScheduleId: string;
  outcome: string;
  note: string | null;
  recordedByStaffId: string;
  createdAt: string;
};

export type LoginResult = { accessToken: string; mustChangePassword?: boolean };

/**
 * Decodes the JWT payload and reports whether the token is missing, malformed,
 * or past its `exp`. Used only to avoid restoring a session that the server
 * would immediately reject; the backend remains the authority on validity.
 */
export function isTokenExpired(token: string, now = Date.now()): boolean {
  const payload = token.split(".")[1];
  if (!payload) return true;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = JSON.parse(globalThis.atob(padded)) as { exp?: number };
    if (typeof decoded.exp !== "number") return true;
    return decoded.exp * 1000 <= now;
  } catch {
    return true;
  }
}

/** Result of POST /patients/:patientId/activation-codes ({ activationCode, expiresAt }). */
export type ActivationCode = { activationCode: string; expiresAt: string };

export type ControlApiOptions = { onUnauthorized?: (error: ApiError) => void };

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly payload?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export class StaffAuthenticationRequiredError extends Error {
  constructor() {
    super("Sesi petugas belum tersedia.");
    this.name = "StaffAuthenticationRequiredError";
  }
}

/**
 * Authenticates a staff account through the existing POST /auth/login contract
 * ({ username, password } -> { accessToken }). This intentionally does not
 * require a bearer token and never persists the token.
 */
export async function loginStaff(username: string, password: string, signal?: AbortSignal): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Permintaan gagal diproses server.";
    throw new ApiError(response.status, message, body);
  }
  if (!body || typeof body.accessToken !== "string" || !body.accessToken) {
    throw new ApiError(0, "Respons login dari server tidak valid.");
  }
  return { accessToken: body.accessToken, mustChangePassword: body.mustChangePassword === true };
}

/** A request client bound to a staff token supplied by the auth layer. */
export class ControlApi {
  constructor(
    private readonly accessToken: string | null,
    private readonly options: ControlApiOptions = {},
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.accessToken?.trim();
    if (!token) throw new StaffAuthenticationRequiredError();
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        ...init,
        // Monitoring screens must reflect the backend immediately; a cached
        // GET would keep showing yesterday's confirmation counts.
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : "Permintaan gagal diproses server.";
      const error = new ApiError(response.status, message, body);
      if (response.status === 401) this.options.onUnauthorized?.(error);
      throw error;
    }
    return body as T;
  }

  listPatients(search = "", signal?: AbortSignal) {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    return this.request<Patient[]>(`/patients${query}`, { signal });
  }

  listPatientDirectory(search = "", page = 1, pageSize = 20, status = "Semua", signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (status !== "Semua") query.set("status", status);
    return this.request<PageResult<PatientDirectoryEntry>>(`/patients/directory?${query}`, { signal });
  }

  getPatientStats(signal?: AbortSignal) {
    return this.request<PatientStats>(`/patients/stats`, { signal });
  }

  listArchivedPatients(search = "", signal?: AbortSignal) {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    return this.request<Patient[]>(`/patients/archived${query}`, { signal });
  }

  archivePatient(id: string) {
    return this.request<Patient>(`/patients/${encodeURIComponent(id)}/archive`, { method: "POST" });
  }

  restorePatient(id: string) {
    return this.request<Patient>(`/patients/${encodeURIComponent(id)}/restore`, { method: "POST" });
  }

  /**
   * Permanently removes an archived patient from every list. The backend
   * hard-deletes patients without clinical history and anonymizes the rest
   * (identity erased, medical record retained de-identified).
   */
  purgePatient(id: string) {
    return this.request<{ id: string; mode: "deleted" | "anonymized" }>(`/patients/${encodeURIComponent(id)}/permanent`, { method: "DELETE" });
  }

  listControlAlerts(signal?: AbortSignal) {
    return this.request<ControlAlert[]>(`/control-alerts`, { signal });
  }

  listControlSchedules(search = "", page = 1, pageSize = 20, status = "Semua", signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (status !== "Semua") query.set("status", status);
    return this.request<ManagedControlSchedulePage>(`/control-schedules?${query}`, { signal });
  }

  getPatient(id: string, signal?: AbortSignal) {
    return this.request<Patient>(`/patients/${encodeURIComponent(id)}`, { signal });
  }

  listTreatments(patientId: string, signal?: AbortSignal) {
    return this.request<Treatment[]>(`/patients/${encodeURIComponent(patientId)}/treatments`, { signal });
  }

  getSchedule(treatmentId: string, signal?: AbortSignal) {
    return this.request<ControlSchedule>(`/treatments/${encodeURIComponent(treatmentId)}/control-schedule`, { signal });
  }

  /** Today's medication-confirmation monitoring for the Pengingat screen. */
  listReminders(search = "", signal?: AbortSignal) {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    return this.request<RemindersView>(`/adherence/reminders${query}`, { signal });
  }

  /** Seven-day adherence history for one treatment (staff view). */
  getAdherenceSummary(treatmentId: string, signal?: AbortSignal) {
    return this.request<AdherenceSummary>(`/treatments/${encodeURIComponent(treatmentId)}/adherence`, { signal });
  }

  listVisits(patientId: string, signal?: AbortSignal) {
    return this.request<ControlVisit[]>(`/patients/${encodeURIComponent(patientId)}/visits`, { signal });
  }

  createVisit(treatmentId: string, input: {
    visitDate: string;
    medicineGiven: boolean;
    medicationGivenOn?: string;
    additionalNote?: string;
  }) {
    return this.request<ControlVisit>(`/treatments/${encodeURIComponent(treatmentId)}/visits`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  overrideSchedule(treatmentId: string, input: { scheduledDate: string; version: number }) {
    return this.request<ControlSchedule>(`/treatments/${encodeURIComponent(treatmentId)}/control-schedule`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  createPatient(input: Record<string, unknown>) {
    return this.request<Patient>(`/patients`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updatePatient(id: string, input: Record<string, unknown>) {
    return this.request<Patient>(`/patients/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  createTreatment(patientId: string, input: { startDate: string; treatmentStage?: string; lastControlDate?: string; lastMedicationDate?: string }) {
    return this.request<Treatment>(`/patients/${encodeURIComponent(patientId)}/treatments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Records the authorizing staff's final review decision for a treatment. */
  reviewTreatment(treatmentId: string, input: { decision: "Selesai" | "Dilanjutkan"; note: string; continuedTargetEndDate?: string }) {
    return this.request<Treatment>(`/treatments/${encodeURIComponent(treatmentId)}/final-review`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createInitialSchedule(treatmentId: string, input: { scheduledDate: string }) {
    return this.request<ControlSchedule>(`/treatments/${encodeURIComponent(treatmentId)}/control-schedule`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Issues a one-time activation code for a patient through the existing staff
   * endpoint POST /patients/:patientId/activation-codes. The code is returned
   * to the caller and must never be persisted by the UI.
   */
  issueActivationCode(patientId: string) {
    return this.request<ActivationCode>(`/patients/${encodeURIComponent(patientId)}/activation-codes`, {
      method: "POST",
    });
  }

  getDashboardSummary(signal?: AbortSignal) {
    return this.request<DashboardSummary>(`/dashboard/summary`, { signal });
  }

  listActivities(signal?: AbortSignal) {
    return this.request<DashboardActivity[]>(`/dashboard/activities`, { signal });
  }

  getNotifications(signal?: AbortSignal) {
    return this.request<DashboardNotificationFeed>(`/dashboard/notifications`, { signal });
  }

  markNotificationsRead(seenAt?: string) {
    return this.request<{ lastSeenAt: string }>(`/dashboard/notifications/read`, {
      method: "POST",
      body: JSON.stringify(seenAt ? { seenAt } : {}),
    });
  }

  getMe(signal?: AbortSignal) {
    return this.request<StaffAccountSummary>(`/staff/me`, { signal });
  }

  updateMe(input: { phone: string | null }) {
    return this.request<StaffAccountSummary>(`/staff/me`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  changePassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    return this.request<{ ok: true }>(`/staff/me/password`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listStaffAccounts(signal?: AbortSignal) {
    return this.request<StaffAccounts>(`/staff/accounts`, { signal });
  }

  createStaffAccount(input: { username: string; password: string; role: StaffRole; displayName?: string | null }) {
    return this.request<StaffAccountSummary>(`/staff/accounts`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateStaffAccount(id: string, input: { role?: StaffRole; displayName?: string | null }) {
    return this.request<StaffAccountSummary>(`/staff/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  /**
   * Admin-only: resets a staff account to a server-generated temporary password.
   * The response carries the temporary password exactly once so the Admin can
   * hand it over in person; it is never stored by the UI.
   */
  resetStaffAccountPassword(id: string) {
    return this.request<{ id: string; username: string; temporaryPassword: string }>(
      `/staff/accounts/${encodeURIComponent(id)}/reset-password`,
      { method: "POST" },
    );
  }

  deleteStaffAccount(id: string) {
    return this.request<{ id: string }>(`/staff/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  getSettings(signal?: AbortSignal) {
    return this.request<AppSettings>(`/settings`, { signal });
  }

  updateSettings(input: Partial<{
    puskesmasName: string;
    puskesmasPhone: string | null;
    controlIntervalDays: number;
    reminderMorning: string;
    reminderEvening: string;
  }>) {
    return this.request<AppSettings>(`/settings`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  /**
   * Uploads a patient Excel file for server-side validation. Uses multipart
   * form data, so it bypasses the JSON helper (the browser sets the boundary)
   * while keeping the bearer-token guard and 401 handling.
   */
  async validatePatientImport(file: File, signal?: AbortSignal): Promise<ImportPreview> {
    const token = this.accessToken?.trim();
    if (!token) throw new StaffAuthenticationRequiredError();
    const form = new FormData();
    form.append("file", file, file.name);
    let response: Response;
    try {
      response = await fetch("/api/imports/patients/validate", {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: form,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : "Gagal memvalidasi berkas.";
      const error = new ApiError(response.status, message, body);
      if (response.status === 401) this.options.onUnauthorized?.(error);
      throw error;
    }
    return body as ImportPreview;
  }

  confirmPatientImport(rows: ImportPatientRow[]) {
    return this.request<ImportConfirmResult>(`/imports/patients/confirm`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  }

  /** Streams the .xlsx import template (binary, same bearer guard). */
  async downloadPatientTemplate(signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
    const token = this.accessToken?.trim();
    if (!token) throw new StaffAuthenticationRequiredError();
    let response: Response;
    try {
      response = await fetch("/api/imports/patients/template", {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Authorization: `Bearer ${token}`,
        },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = typeof body?.message === "string" ? body.message : "Gagal mengunduh template.";
      const error = new ApiError(response.status, message, body);
      if (response.status === 401) this.options.onUnauthorized?.(error);
      throw error;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "template-impor-pasien-dinar-tb.xlsx";
    return { blob, filename };
  }

  listFollowUps(scheduleId: string, signal?: AbortSignal) {
    return this.request<FollowUp[]>(`/control-schedule/${encodeURIComponent(scheduleId)}/follow-ups`, { signal });
  }

  createFollowUp(scheduleId: string, input: { outcome: string; note?: string }) {
    return this.request<FollowUp>(`/control-schedule/${encodeURIComponent(scheduleId)}/follow-ups`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Streams the staff-only summary workbook from GET /dashboard/export.xlsx.
   * The response is binary, so it bypasses the JSON request helper but keeps the
   * same bearer-token guard and 401 session handling.
   */
  async downloadSummaryReport(signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
    const token = this.accessToken?.trim();
    if (!token) throw new StaffAuthenticationRequiredError();
    let response: Response;
    try {
      response = await fetch("/api/dashboard/export.xlsx", {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Authorization: `Bearer ${token}`,
        },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = typeof body?.message === "string" ? body.message : "Gagal mengunduh ringkasan.";
      const error = new ApiError(response.status, message, body);
      if (response.status === 401) this.options.onUnauthorized?.(error);
      throw error;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "ringkasan-dinar-tb.xlsx";
    return { blob, filename };
  }

  /** Fetches the report preview (summary + rows) for the selected filters. */
  getReportPreview(filters: ReportFilters, signal?: AbortSignal) {
    return this.request<ReportPreview>(`/reports/preview${reportQuery(filters)}`, { signal });
  }

  /**
   * Streams the report workbook from GET /reports/export.xlsx using the active
   * filters. Binary response, same bearer guard and 401 handling.
   */
  async downloadReport(filters: ReportFilters, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
    const token = this.accessToken?.trim();
    if (!token) throw new StaffAuthenticationRequiredError();
    let response: Response;
    try {
      response = await fetch(`/api/reports/export.xlsx${reportQuery(filters)}`, {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Authorization: `Bearer ${token}`,
        },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = typeof body?.message === "string" ? body.message : "Gagal mengekspor laporan.";
      const error = new ApiError(response.status, message, body);
      if (response.status === 401) this.options.onUnauthorized?.(error);
      throw error;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "laporan-dinar-tb.xlsx";
    return { blob, filename };
  }
}

const INDONESIAN_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * Formats an activation code's `expiresAt` (server UTC ISO timestamp) for
 * display in Jakarta time (UTC+7). Uses fixed arithmetic instead of Intl so the
 * output is stable across runtimes. Returns "—" for an unparseable value.
 */
export function formatActivationExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "—";
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const day = wib.getUTCDate();
  const month = INDONESIAN_MONTHS[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hours = String(wib.getUTCHours()).padStart(2, "0");
  const minutes = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}.${minutes} WIB`;
}
