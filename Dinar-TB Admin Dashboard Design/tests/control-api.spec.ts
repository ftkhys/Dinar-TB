import { ApiError, ControlApi, StaffAuthenticationRequiredError, formatActivationExpiry, isTokenExpired, loginStaff } from "../src/api/control-api";

type FetchCall = { url: string; init: RequestInit };

function mockFetch(response: { ok?: boolean; status?: number; body?: unknown; reject?: Error }) {
  const calls: FetchCall[] = [];
  const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (response.reject) throw response.reject;
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body ?? null,
    } as Response;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return calls;
}

describe("loginStaff", () => {
  afterEach(() => jest.restoreAllMocks());

  it("posts staff credentials to the existing login endpoint and returns the token", async () => {
    const calls = mockFetch({ body: { accessToken: "jwt-token" } });
    const result = await loginStaff("nadia", "rahasia");

    expect(result).toEqual({ accessToken: "jwt-token", mustChangePassword: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/auth/login");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: "nadia", password: "rahasia" });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("surfaces the server message when credentials are rejected", async () => {
    mockFetch({ ok: false, status: 401, body: { message: "Username atau password salah." } });

    await expect(loginStaff("nadia", "wrong")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Username atau password salah.",
    });
  });

  it("rejects a 200 response that does not contain an access token", async () => {
    mockFetch({ body: { token: "not-the-contract" } });

    const error = await loginStaff("nadia", "rahasia").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it("reports a connection failure when fetch rejects", async () => {
    mockFetch({ reject: new TypeError("network down") });

    const error = await loginStaff("nadia", "rahasia").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });
});

describe("ControlApi", () => {
  afterEach(() => jest.restoreAllMocks());

  it("refuses to call protected endpoints without a session token", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi(null);

    await expect(api.listPatients()).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });

  it("sends the bearer token and encodes the patient search term", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listPatients("Siti Nur");

    expect(calls[0].url).toBe("/api/patients?search=Siti%20Nur");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("omits the search query when the term is blank", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listPatients("   ");

    expect(calls[0].url).toBe("/api/patients");
  });

  it("fetches the cross-patient control alerts feed", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listControlAlerts();

    expect(calls[0].url).toBe("/api/control-alerts");
  });

  it("fetches the managed control schedule list with an encoded search term", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listControlSchedules("Budi Santoso");

    const url = new URL(calls[0].url, "http://localhost");
    expect(url.pathname).toBe("/api/control-schedules");
    expect(url.searchParams.get("search")).toBe("Budi Santoso");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
  });

  it("passes pagination and status filters to the control schedule endpoint", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listControlSchedules("Budi", 3, 10, "Terlambat");

    const url = new URL(calls[0].url, "http://localhost");
    expect(url.pathname).toBe("/api/control-schedules");
    expect(url.searchParams.get("search")).toBe("Budi");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(url.searchParams.get("status")).toBe("Terlambat");
  });

  it("omits the control schedule search query when the term is blank", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listControlSchedules("   ");

    const url = new URL(calls[0].url, "http://localhost");
    expect(url.pathname).toBe("/api/control-schedules");
    expect(url.searchParams.has("search")).toBe(false);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(url.searchParams.has("status")).toBe(false);
  });

  it("notifies the session layer on a 401 so the token can be cleared", async () => {
    mockFetch({ ok: false, status: 401, body: { message: "Sesi berakhir." } });
    const onUnauthorized = jest.fn();
    const api = new ControlApi("expired", { onUnauthorized });

    await expect(api.listVisits("patient-1")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("patches a schedule with the optimistic-lock version", async () => {
    const calls = mockFetch({ body: { id: "schedule-1", version: 2 } });
    const api = new ControlApi("token-123");

    await api.overrideSchedule("treatment-1", { scheduledDate: "2026-11-05", version: 1 });

    expect(calls[0].url).toBe("/api/treatments/treatment-1/control-schedule");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ scheduledDate: "2026-11-05", version: 1 });
  });

  it("creates a first schedule via POST when none exists yet", async () => {
    const calls = mockFetch({ body: { id: "schedule-1", version: 1 } });
    const api = new ControlApi("token-123");

    await api.createInitialSchedule("treatment-1", { scheduledDate: "2026-11-05" });

    expect(calls[0].url).toBe("/api/treatments/treatment-1/control-schedule");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ scheduledDate: "2026-11-05" });
  });

  it("exposes the 409 conflict payload so the UI can refresh stale schedule state", async () => {
    mockFetch({ ok: false, status: 409, body: { message: "Konflik", current: { scheduledDate: "2026-11-07", version: 3 } } });
    const api = new ControlApi("token-123");

    const error = await api.overrideSchedule("treatment-1", { scheduledDate: "2026-11-05", version: 1 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).payload).toEqual({ message: "Konflik", current: { scheduledDate: "2026-11-07", version: 3 } });
  });
});

describe("ControlApi.reviewTreatment", () => {
  afterEach(() => jest.restoreAllMocks());

  it("posts the decision and note to the final-review endpoint with the bearer token", async () => {
    const calls = mockFetch({ body: { id: "treatment-1", completedAt: "2026-10-17T00:00:00.000Z" } });
    const api = new ControlApi("token-123");

    await api.reviewTreatment("treatment-1", { decision: "Selesai", note: "Pengobatan tuntas." });

    expect(calls[0].url).toBe("/api/treatments/treatment-1/final-review");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ decision: "Selesai", note: "Pengobatan tuntas." });
  });

  it("includes the continued target date only for the Dilanjutkan decision", async () => {
    const calls = mockFetch({ body: { id: "treatment-2", completedAt: null } });
    const api = new ControlApi("token-123");

    await api.reviewTreatment("treatment-2", { decision: "Dilanjutkan", note: "Lanjut 2 bulan.", continuedTargetEndDate: "2026-12-17" });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({ decision: "Dilanjutkan", note: "Lanjut 2 bulan.", continuedTargetEndDate: "2026-12-17" });
  });

  it("surfaces the 409 message when the treatment is already closed", async () => {
    mockFetch({ ok: false, status: 409, body: { message: "Treatment yang sudah ditutup tidak dapat diubah." } });
    const api = new ControlApi("token-123");

    const error = await api.reviewTreatment("treatment-3", { decision: "Selesai", note: "x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Treatment yang sudah ditutup tidak dapat diubah.");
  });
});

describe("ControlApi.issueActivationCode", () => {
  afterEach(() => jest.restoreAllMocks());

  const expiresAt = "2026-10-17T00:00:00.000Z";

  it("posts to the existing staff activation-code endpoint with the bearer token and no body", async () => {
    const calls = mockFetch({ status: 201, body: { activationCode: "code-abc-123", expiresAt } });
    const api = new ControlApi("token-123");

    const result = await api.issueActivationCode("patient-9");

    expect(result).toEqual({ activationCode: "code-abc-123", expiresAt });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/patients/patient-9/activation-codes");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("encodes the patient id", async () => {
    const calls = mockFetch({ status: 201, body: { activationCode: "x", expiresAt } });
    const api = new ControlApi("token-123");

    await api.issueActivationCode("id/with space");

    expect(calls[0].url).toBe("/api/patients/id%2Fwith%20space/activation-codes");
  });

  it("surfaces the server message when the patient is unknown", async () => {
    mockFetch({ ok: false, status: 404, body: { message: "Pasien tidak ditemukan." } });
    const api = new ControlApi("token-123");

    await expect(api.issueActivationCode("missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Pasien tidak ditemukan.",
    });
  });

  it("requires a staff session token and never calls the server without one", async () => {
    const calls = mockFetch({ body: {} });
    const api = new ControlApi(null);

    await expect(api.issueActivationCode("patient-9")).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });
});

describe("ControlApi patient directory and archiving", () => {
  afterEach(() => jest.restoreAllMocks());

  it("fetches the directory projection with an encoded search term", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listPatientDirectory("Siti Nur");

    const url = new URL(calls[0].url, "http://localhost");
    expect(url.pathname).toBe("/api/patients/directory");
    expect(url.searchParams.get("search")).toBe("Siti Nur");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("20");
  });

  it("passes pagination and status filters to the patient directory endpoint", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listPatientDirectory("Siti", 2, 15, "Terlambat");

    const url = new URL(calls[0].url, "http://localhost");
    expect(url.pathname).toBe("/api/patients/directory");
    expect(url.searchParams.get("search")).toBe("Siti");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("15");
    expect(url.searchParams.get("status")).toBe("Terlambat");
  });

  it("fetches the card stats", async () => {
    const calls = mockFetch({ body: { total: 5, sesuai: 2, dekat: 1, terlambat: 2 } });
    const api = new ControlApi("token-123");

    const stats = await api.getPatientStats();

    expect(calls[0].url).toBe("/api/patients/stats");
    expect(stats).toEqual({ total: 5, sesuai: 2, dekat: 1, terlambat: 2 });
  });

  it("posts archive and restore for the same patient without a body", async () => {
    const calls = mockFetch({ status: 201, body: { id: "patient-1" } });
    const api = new ControlApi("token-123");

    await api.archivePatient("patient-1");
    await api.restorePatient("patient-1");

    expect(calls[0].url).toBe("/api/patients/patient-1/archive");
    expect(calls[1].url).toBe("/api/patients/patient-1/restore");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[1].init.method).toBe("POST");
  });

  it("lists archived patients", async () => {
    const calls = mockFetch({ body: [] });
    const api = new ControlApi("token-123");

    await api.listArchivedPatients();

    expect(calls[0].url).toBe("/api/patients/archived");
  });

  it("permanently deletes an archived patient via DELETE and encodes the id", async () => {
    const calls = mockFetch({ ok: true, status: 200, body: { id: "patient-1" } });
    const api = new ControlApi("token-123");

    const result = await api.purgePatient("patient-1");

    expect(calls[0].url).toBe("/api/patients/patient-1/permanent");
    expect(calls[0].init.method).toBe("DELETE");
    expect(result).toEqual({ id: "patient-1" });
  });

  it("surfaces the 409 message when a patient still has protected history", async () => {
    mockFetch({ ok: false, status: 409, body: { message: "Pasien tidak dapat dihapus permanen karena memiliki riwayat pengobatan." } });
    const api = new ControlApi("token-123");

    await expect(api.purgePatient("patient-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Pasien tidak dapat dihapus permanen karena memiliki riwayat pengobatan.",
    });
  });
});

describe("ControlApi notifications", () => {
  afterEach(() => jest.restoreAllMocks());

  it("fetches the notification feed", async () => {
    const calls = mockFetch({ body: { items: [], unreadCount: 2, lastSeenAt: null } });
    const api = new ControlApi("token-123");

    const feed = await api.getNotifications();

    expect(calls[0].url).toBe("/api/dashboard/notifications");
    expect(feed.unreadCount).toBe(2);
  });

  it("marks notifications read with the newest seen timestamp", async () => {
    const calls = mockFetch({ status: 201, body: { lastSeenAt: "2026-10-16T00:00:00.000Z" } });
    const api = new ControlApi("token-123");

    await api.markNotificationsRead("2026-10-15T00:00:00.000Z");

    expect(calls[0].url).toBe("/api/dashboard/notifications/read");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ seenAt: "2026-10-15T00:00:00.000Z" });
  });

  it("passes a sub-millisecond seen timestamp through unchanged", async () => {
    const calls = mockFetch({ status: 201, body: { lastSeenAt: "2026-10-16T00:00:00.123456Z" } });
    const api = new ControlApi("token-123");

    await api.markNotificationsRead("2026-10-15T00:00:00.123456Z");

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      seenAt: "2026-10-15T00:00:00.123456Z",
    });
  });

  it("sends an empty body when no seen timestamp is provided", async () => {
    const calls = mockFetch({ status: 201, body: { lastSeenAt: "2026-10-16T00:00:00.000Z" } });
    const api = new ControlApi("token-123");

    await api.markNotificationsRead();

    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
  });
});

describe("ControlApi.validatePatientImport", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uploads multipart form data with the bearer token and no JSON content type", async () => {
    const calls = mockFetch({ status: 201, body: { total: 1, valid: 1, invalid: 0, duplicate: 0, rows: [], validRows: [] } });
    const api = new ControlApi("token-123");
    const file = new File(["data"], "pasien.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const preview = await api.validatePatientImport(file);

    expect(calls[0].url).toBe("/api/imports/patients/validate");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeInstanceOf(FormData);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers["Content-Type"]).toBeUndefined();
    expect(preview.total).toBe(1);
  });

  it("requires a session token and never calls the server without one", async () => {
    const calls = mockFetch({ body: {} });
    const api = new ControlApi(null);

    await expect(api.validatePatientImport(new File(["x"], "a.xlsx"))).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });
});

describe("ControlApi staff accounts and settings", () => {
  afterEach(() => jest.restoreAllMocks());

  it("reads the current account and its role", async () => {
    const calls = mockFetch({ body: { id: "s1", username: "fatkha", role: "Admin" } });
    const api = new ControlApi("token-123");

    const me = await api.getMe();

    expect(calls[0].url).toBe("/api/staff/me");
    expect(me.role).toBe("Admin");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("patches the owner phone number", async () => {
    const calls = mockFetch({ body: { id: "s1", phone: "0812" } });
    const api = new ControlApi("token-123");

    await api.updateMe({ phone: null });

    expect(calls[0].url).toBe("/api/staff/me");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: null });
  });

  it("posts a password change to the owner endpoint", async () => {
    const calls = mockFetch({ status: 201, body: { ok: true } });
    const api = new ControlApi("token-123");

    await api.changePassword({ currentPassword: "lama", newPassword: "rahasia-baru", confirmPassword: "rahasia-baru" });

    expect(calls[0].url).toBe("/api/staff/me/password");
    expect(calls[0].init.method).toBe("POST");
  });

  it("lists, creates, updates and deletes accounts", async () => {
    const calls = mockFetch({ status: 201, body: { id: "s2" } });
    const api = new ControlApi("token-123");

    await api.listStaffAccounts();
    await api.createStaffAccount({ username: "dian", password: "rahasia123", role: "Petugas" });
    await api.updateStaffAccount("id/with space", { role: "Admin" });
    await api.deleteStaffAccount("s3");

    expect(calls[0].url).toBe("/api/staff/accounts");
    expect(calls[1].url).toBe("/api/staff/accounts");
    expect(calls[1].init.method).toBe("POST");
    expect(calls[2].url).toBe("/api/staff/accounts/id%2Fwith%20space");
    expect(calls[2].init.method).toBe("PATCH");
    expect(calls[3].url).toBe("/api/staff/accounts/s3");
    expect(calls[3].init.method).toBe("DELETE");
  });

  it("posts an Admin password reset and returns the one-time temporary password", async () => {
    const calls = mockFetch({ status: 201, body: { id: "s2", username: "dian", temporaryPassword: "Temp1234Abcd" } });
    const api = new ControlApi("token-123");

    const result = await api.resetStaffAccountPassword("id/with space");

    expect(calls[0].url).toBe("/api/staff/accounts/id%2Fwith%20space/reset-password");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(result).toEqual({ id: "s2", username: "dian", temporaryPassword: "Temp1234Abcd" });
  });

  it("reads and updates shared settings", async () => {
    const calls = mockFetch({ body: { puskesmasName: "Puskesmas Jatinegara" } });
    const api = new ControlApi("token-123");

    await api.getSettings();
    await api.updateSettings({ controlIntervalDays: 30 });

    expect(calls[0].url).toBe("/api/settings");
    expect(calls[1].url).toBe("/api/settings");
    expect(calls[1].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ controlIntervalDays: 30 });
  });

  it("requires a staff session before calling staff endpoints", async () => {
    const calls = mockFetch({ body: {} });
    const api = new ControlApi(null);

    await expect(api.listStaffAccounts()).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    await expect(api.getSettings()).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });
});

describe("isTokenExpired", () => {
  function tokenWithExp(exp: number): string {
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    return `header.${payload}.signature`;
  }

  it("accepts a token whose exp is still in the future", () => {
    expect(isTokenExpired(tokenWithExp(2_000_000_000), 1_000_000_000 * 1000)).toBe(false);
  });

  it("rejects a token whose exp has passed", () => {
    expect(isTokenExpired(tokenWithExp(1_000), 2_000 * 1000)).toBe(true);
  });

  it("treats malformed or payload-less tokens as expired", () => {
    expect(isTokenExpired("not-a-jwt")).toBe(true);
    expect(isTokenExpired("header.@@@.signature")).toBe(true);
    expect(isTokenExpired("header.cGF5bG9hZA.signature")).toBe(true);
  });
});

describe("formatActivationExpiry", () => {
  it("renders the expiry in Jakarta time (UTC+7)", () => {
    expect(formatActivationExpiry("2026-10-17T00:00:00.000Z")).toBe("17 Oktober 2026, 07.00 WIB");
  });

  it("handles the UTC date boundary", () => {
    expect(formatActivationExpiry("2026-10-16T17:30:00.000Z")).toBe("17 Oktober 2026, 00.30 WIB");
  });

  it("returns a placeholder for an invalid timestamp", () => {
    expect(formatActivationExpiry("not-a-timestamp")).toBe("—");
  });
});
