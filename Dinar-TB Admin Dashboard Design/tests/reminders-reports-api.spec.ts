import { ApiError, ControlApi, StaffAuthenticationRequiredError } from "../src/api/control-api";

type FetchCall = { url: string; init: RequestInit };

function mockJsonFetch(response: { ok?: boolean; status?: number; body?: unknown; reject?: Error }) {
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

function mockBinaryFetch(response: { ok?: boolean; status?: number; body?: unknown; filename?: string; reject?: Error }) {
  const calls: FetchCall[] = [];
  const blob = { size: 128, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Blob;
  const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (response.reject) throw response.reject;
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body ?? null,
      blob: async () => blob,
      headers: { get: (name: string) => (name.toLowerCase() === "content-disposition" && response.filename ? `attachment; filename="${response.filename}"` : null) },
    } as unknown as Response;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return { calls, blob };
}

describe("ControlApi reminders", () => {
  afterEach(() => jest.restoreAllMocks());

  it("fetches today's reminders without a search query when the term is blank", async () => {
    const calls = mockJsonFetch({ body: { date: "2026-10-17" } });
    const api = new ControlApi("token-123");

    await api.listReminders();

    expect(calls[0].url).toBe("/api/adherence/reminders");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("encodes the reminder search term", async () => {
    const calls = mockJsonFetch({ body: {} });
    const api = new ControlApi("token-123");

    await api.listReminders("Siti Nur");

    expect(calls[0].url).toBe("/api/adherence/reminders?search=Siti%20Nur");
  });

  it("requires a session token before loading reminders", async () => {
    const calls = mockJsonFetch({ body: [] });
    const api = new ControlApi(null);

    await expect(api.listReminders()).rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });

  it("loads a single treatment's adherence summary with an encoded id", async () => {
    const calls = mockJsonFetch({ body: { days: [], totalTaken: 0, totalMissed: 0, missedStreak: 0 } });
    const api = new ControlApi("token-123");

    await api.getAdherenceSummary("id/with space");

    expect(calls[0].url).toBe("/api/treatments/id%2Fwith%20space/adherence");
  });
});

describe("ControlApi reports", () => {
  afterEach(() => jest.restoreAllMocks());

  it("builds the preview query from the selected filters", async () => {
    const calls = mockJsonFetch({ body: { rows: [] } });
    const api = new ControlApi("token-123");

    await api.getReportPreview({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null });

    expect(calls[0].url).toBe("/api/reports/preview?category=Data+Pasien&from=2026-10-01&to=2026-10-17");
  });

  it("includes the patient filter only when a patient is selected", async () => {
    const calls = mockJsonFetch({ body: {} });
    const api = new ControlApi("token-123");

    await api.getReportPreview({ category: "Riwayat Kontrol", from: "2026-10-01", to: "2026-10-17", patientId: "patient-1" });

    expect(calls[0].url).toBe("/api/reports/preview?category=Riwayat+Kontrol&from=2026-10-01&to=2026-10-17&patientId=patient-1");
  });

  it("streams the workbook and reads the server filename from Content-Disposition", async () => {
    const { calls, blob } = mockBinaryFetch({ filename: "laporan-data-pasien-2026-10-01-2026-10-17.xlsx" });
    const api = new ControlApi("token-123");

    const result = await api.downloadReport({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null });

    expect(calls[0].url).toBe("/api/reports/export.xlsx?category=Data+Pasien&from=2026-10-01&to=2026-10-17");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe("laporan-data-pasien-2026-10-01-2026-10-17.xlsx");
  });

  it("falls back to a default filename when the header is absent", async () => {
    mockBinaryFetch({});
    const api = new ControlApi("token-123");

    const result = await api.downloadReport({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null });

    expect(result.filename).toBe("laporan-dinar-tb.xlsx");
  });

  it("requires a session token before exporting", async () => {
    const { calls } = mockBinaryFetch({});
    const api = new ControlApi(null);

    await expect(api.downloadReport({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null }))
      .rejects.toBeInstanceOf(StaffAuthenticationRequiredError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces the server message and clears the session on a 401 export", async () => {
    mockBinaryFetch({ ok: false, status: 401, body: { message: "Sesi berakhir." } });
    const onUnauthorized = jest.fn();
    const api = new ControlApi("expired", { onUnauthorized });

    const error = await api.downloadReport({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe("Sesi berakhir.");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("reports a connection failure when the export request rejects", async () => {
    mockBinaryFetch({ reject: new TypeError("network down") });
    const api = new ControlApi("token-123");

    const error = await api.downloadReport({ category: "Data Pasien", from: "2026-10-01", to: "2026-10-17", patientId: null })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });
});
