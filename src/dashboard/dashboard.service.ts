import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { APPLICATION_TIME_ZONE, localTodayJakarta } from '../common/date-rules';
import { ControlAlertsService } from '../follow-ups/control-alerts.service';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const FOLLOW_UP_LIMIT = 10;
const ACTIVITY_LIMIT = 50;

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
  /** True when the acting account is the account viewing the feed. */
  isSelf: boolean;
  /** Resolved patient display name, or null when unknown/anonymized. */
  patientName: string | null;
  /** Viewer-aware sentence composed from the authoritative audit record. */
  message: string;
  createdAt: string;
};

export type DashboardNotificationFeed = {
  items: DashboardActivity[];
  unreadCount: number;
  lastSeenAt: string | null;
};

/**
 * Viewer-aware activity sentences keyed by `objectType:action`. `{name}` is the
 * patient display name, `{actor}` the acting account's role and username (e.g.
 * "Admin Fatkha"), `{target}` the affected account username and `{targetRole}`
 * its role. `{name}` is dropped when unknown or the patient has been anonymized
 * (identity is intentionally not re-exposed through the audit feed).
 */
const ACTIVITY_TEMPLATES: Record<string, { self: string; other: string }> = {
  'patient:created': {
    self: 'Data pasien {name} berhasil ditambahkan.',
    other: '{actor} menambahkan data pasien {name}.',
  },
  'patient:imported': {
    self: 'Data pasien {name} berhasil diimpor.',
    other: '{actor} mengimpor data pasien {name}.',
  },
  'patient:identity_updated': {
    self: 'Data pasien {name} berhasil diedit.',
    other: '{actor} mengedit data pasien {name}.',
  },
  'patient:archived': {
    self: 'Data pasien {name} berhasil diarsipkan.',
    other: '{actor} mengarsipkan data pasien {name}.',
  },
  'patient:restored': {
    self: 'Data pasien {name} berhasil dipulihkan.',
    other: '{actor} memulihkan data pasien {name}.',
  },
  'patient:permanently_deleted': {
    self: 'Data pasien {name} berhasil dihapus permanen.',
    other: '{actor} menghapus permanen data pasien {name}.',
  },
  'patient:anonymized': {
    self: 'Data pasien {name} berhasil dihapus permanen.',
    other: '{actor} menghapus permanen data pasien {name}.',
  },
  'control_schedule:initial_date_set': {
    self: 'Jadwal kontrol pasien {name} berhasil ditetapkan.',
    other: '{actor} menetapkan jadwal kontrol pasien {name}.',
  },
  'control_schedule:date_overridden': {
    self: 'Jadwal kontrol pasien {name} berhasil diubah.',
    other: '{actor} mengubah jadwal kontrol pasien {name}.',
  },
  'control_schedule:default_recalculated': {
    self: 'Jadwal kontrol pasien {name} berhasil diperbarui.',
    other: '{actor} memperbarui jadwal kontrol pasien {name}.',
  },
  'staff_account:created': {
    self: 'Anda menambahkan akun {target} sebagai {targetRole}.',
    other: '{actor} menambahkan akun {target} sebagai {targetRole}.',
  },
  'staff_account:role_changed': {
    self: 'Anda mengubah peran akun {target} menjadi {targetRole}.',
    other: '{actor} mengubah peran akun {target} menjadi {targetRole}.',
  },
  'staff_account:deleted': {
    self: 'Anda menghapus akun {target}.',
    other: '{actor} menghapus akun {target}.',
  },
  'staff_account:profile_updated': {
    self: 'Anda memperbarui profil akun Anda.',
    other: '{actor} memperbarui profil akun petugas.',
  },
  'staff_account:password_changed': {
    self: 'Anda mengubah kata sandi akun Anda.',
    other: '{actor} mengubah kata sandi akun.',
  },
  'app_settings:puskesmas_updated': {
    self: 'Anda memperbarui data Puskesmas.',
    other: '{actor} memperbarui data Puskesmas.',
  },
  'app_settings:schedule_updated': {
    self: 'Anda mengubah pengaturan jadwal.',
    other: '{actor} mengubah pengaturan jadwal.',
  },
  'app_settings:reminder_updated': {
    self: 'Anda mengubah pengaturan pengingat.',
    other: '{actor} mengubah pengaturan pengingat.',
  },
};

const ACTION_LABELS: Record<string, string> = {
  'patient:created': 'menambahkan data pasien',
  'patient:identity_updated': 'mengubah identitas pasien',
  'treatment_course:created': 'memulai pengobatan pasien',
  'treatment_course:final_review': 'menyimpan keputusan akhir pengobatan',
  'control_schedule:initial_date_set': 'menetapkan jadwal kontrol awal',
  'control_schedule:date_overridden': 'mengubah jadwal kontrol',
  'control_schedule:default_recalculated': 'menghitung ulang jadwal kontrol',
  'control_visit:created': 'mencatat kunjungan kontrol',
  'follow_up:recorded': 'mencatat tindak lanjut',
  'activation_code:issued': 'menerbitkan kode aktivasi pasien',
  'patient_device:activated': 'mengaktifkan perangkat pasien',
};

function renderActivityTemplate(
  template: string,
  context: { name: string | null; actor: string; target: string; targetRole: string },
): string {
  return template
    .replace(' {name}', context.name ? ` ${context.name}` : '')
    .replace('{name}', context.name ?? '')
    .replace('{targetRole}', context.targetRole)
    .replace('{target}', context.target)
    .replace('{actor}', context.actor);
}

/** Role and username of the acting account, e.g. "Admin Fatkha". */
function actorLabel(role: string | null, actor: string | null): string {
  const name = actor ?? 'Sistem';
  const normalized = role === 'Admin' ? 'Admin' : 'Petugas';
  return `${normalized} ${name}`;
}

function activityMessage(input: {
  objectType: string;
  action: string;
  actor: string | null;
  actorRole: string | null;
  isSelf: boolean;
  patientName: string | null;
  target: string | null;
  targetRole: string | null;
}): string {
  const actor = actorLabel(input.actorRole, input.actor);
  const context = {
    name: input.patientName,
    actor,
    target: input.target ?? 'akun',
    targetRole: input.targetRole ?? 'Petugas',
  };
  if (input.objectType === 'staff_account' && input.action === 'login') {
    return input.isSelf ? 'Anda berhasil login.' : `${actor} berhasil login.`;
  }
  const template = ACTIVITY_TEMPLATES[`${input.objectType}:${input.action}`];
  if (template) {
    return renderActivityTemplate(input.isSelf ? template.self : template.other, context);
  }
  const label = ACTION_LABELS[`${input.objectType}:${input.action}`] ?? `${input.objectType} ${input.action}`;
  const sentence = input.isSelf ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : `${actor} ${label}`;
  return `${sentence}.`;
}

function patientNameFromDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { patientName?: unknown };
    return typeof parsed?.patientName === 'string' && parsed.patientName.trim() ? parsed.patientName : null;
  } catch {
    return null;
  }
}

function staffDetails(details: string | null): { username: string | null; role: string | null } {
  if (!details) return { username: null, role: null };
  try {
    const parsed = JSON.parse(details) as { targetUsername?: unknown; targetRole?: unknown };
    return {
      username: typeof parsed?.targetUsername === 'string' && parsed.targetUsername.trim() ? parsed.targetUsername : null,
      role: typeof parsed?.targetRole === 'string' && parsed.targetRole.trim() ? parsed.targetRole : null,
    };
  } catch {
    return { username: null, role: null };
  }
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

function monthSequence(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number);
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const total = year * 12 + (month - 1) - offset;
    const currentYear = Math.floor(total / 12);
    const currentMonth = (total % 12) + 1;
    months.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
  }
  return months;
}

function countOf(value: unknown): number {
  const parsed = Number((value as { count?: unknown } | null)?.count);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly alerts: ControlAlertsService,
  ) {}

  async summary(now = new Date()): Promise<DashboardSummary> {
    const today = localTodayJakarta(now);
    const alerts = await this.alerts.list(now);
    const overdue = alerts.filter((alert) => alert.level === 'Terlambat');
    const controlsToday = alerts.filter((alert) => alert.level === 'Hari-H').length;

    const [totalRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM patients WHERE archived_at IS NULL`,
    );
    const [upcomingRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count
         FROM control_schedule cs
         JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
         JOIN patients p ON p.id = tc.patient_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date
          AND p.archived_at IS NULL AND cs.scheduled_date > $1`,
      [today],
    );
    const [activeRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count
         FROM treatment_courses tc
         JOIN patients p ON p.id = tc.patient_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date AND p.archived_at IS NULL`,
      [today],
    );
    const [confirmedRow] = await this.dataSource.query(
      `SELECT count(DISTINCT da.treatment_course_id)::int AS count
         FROM daily_adherence da
         JOIN treatment_courses tc ON tc.id = da.treatment_course_id
         JOIN patients p ON p.id = tc.patient_id
        WHERE tc.completed_at IS NULL AND tc.start_date <= $1::date
          AND p.archived_at IS NULL AND da.adherence_date = $1 AND da.status = $2`,
      [today, 'Sudah diminum'],
    );
    const [updatedRow] = await this.dataSource.query(
      `SELECT max(da.confirmed_at) AS "updatedAt"
         FROM daily_adherence da
         JOIN treatment_courses tc ON tc.id = da.treatment_course_id
        WHERE da.adherence_date = $1 AND tc.completed_at IS NULL AND tc.start_date <= $1::date`,
      [today],
    );
    const monthRows: Array<{ month: string; count: number }> = await this.dataSource.query(
      `SELECT to_char(date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM') AS month,
              count(*)::int AS count
         FROM patients p
        WHERE p.archived_at IS NULL
          AND p.created_at >= (date_trunc('month', $1::date) - interval '5 months') AT TIME ZONE 'Asia/Jakarta'
        GROUP BY 1
        ORDER BY 1`,
      [today],
    );

    const monthCounts = new Map(monthRows.map((row) => [row.month, Number(row.count)]));
    const newPatientsByMonth = monthSequence(today, 6).map((month) => ({
      month,
      label: MONTH_LABELS[Number(month.slice(5, 7)) - 1] ?? month,
      count: monthCounts.get(month) ?? 0,
    }));

    const activeTreatments = countOf(activeRow);
    const confirmed = Math.min(countOf(confirmedRow), activeTreatments);

    return {
      today,
      timeZone: APPLICATION_TIME_ZONE,
      generatedAt: now.toISOString(),
      stats: {
        totalPatients: countOf(totalRow),
        controlsToday,
        upcomingControls: countOf(upcomingRow),
        needsFollowUp: overdue.length,
      },
      newPatientsByMonth,
      medicationToday: {
        activeTreatments,
        confirmed,
        notConfirmed: Math.max(activeTreatments - confirmed, 0),
        lastUpdatedAt: isoOrNull((updatedRow as { updatedAt?: unknown } | undefined)?.updatedAt),
      },
      followUps: overdue.slice(0, FOLLOW_UP_LIMIT).map((alert) => ({
        scheduleId: alert.scheduleId,
        patientId: alert.patientId,
        patientName: alert.patientName,
        registerNumber: alert.registerNumber ?? null,
        scheduledDate: alert.scheduledDate,
        level: alert.level,
        message: alert.message,
      })),
    };
  }

  async activities(limit = ACTIVITY_LIMIT, viewerStaffId?: string): Promise<DashboardActivity[]> {
    const requested = Number.isFinite(limit) ? Math.trunc(limit) : ACTIVITY_LIMIT;
    const safeLimit = Math.min(Math.max(requested, 1), ACTIVITY_LIMIT);
    const rows: Array<{
      id: string;
      action: string;
      objectType: string;
      objectId: string;
      details: string | null;
      actor: string | null;
      actorRole: string | null;
      actorStaffId: string | null;
      patientName: string | null;
      patientAnonymized: boolean | null;
      target: string | null;
      targetRole: string | null;
      createdAt: string | Date;
    }> = await this.dataSource.query(
      `SELECT a.id, a.action, a.object_type AS "objectType", a.object_id AS "objectId",
              a.details,
              -- Keep PostgreSQL's microsecond precision. Returning a JS Date
              -- truncates to milliseconds, and a client that echoes that value
              -- back as its read marker would leave the just-seen activity
              -- unread forever (created_at > last_seen_at).
              to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
              a.actor_staff_id AS "actorStaffId", s.username AS "actor", s.role AS "actorRole",
              COALESCE(p.full_name, pcs.full_name) AS "patientName",
              (COALESCE(p.anonymized_at, pcs.anonymized_at) IS NOT NULL) AS "patientAnonymized",
              t.username AS "target", t.role AS "targetRole"
         FROM audit_logs a
         LEFT JOIN staff_accounts s ON s.id = a.actor_staff_id
         LEFT JOIN patients p ON a.object_type = 'patient' AND p.id = a.object_id
         LEFT JOIN control_schedule cs ON a.object_type = 'control_schedule' AND cs.id = a.object_id
         LEFT JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
         LEFT JOIN patients pcs ON pcs.id = tc.patient_id
         LEFT JOIN staff_accounts t ON a.object_type = 'staff_account' AND t.id = a.object_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [safeLimit],
    );
    return rows.map((row) => {
      const isSelf = Boolean(viewerStaffId) && row.actorStaffId === viewerStaffId;
      const resolvesPatient = row.objectType === 'patient' || row.objectType === 'control_schedule';
      // Anonymized patients never re-expose their identity in the feed; a
      // hard-deleted patient's name is available only from the deletion record.
      const patientName =
        resolvesPatient && !row.patientAnonymized
          ? row.patientName ?? patientNameFromDetails(row.details)
          : null;
      const target = row.objectType === 'staff_account' ? staffDetails(row.details) : { username: null, role: null };
      return {
        id: row.id,
        action: row.action,
        objectType: row.objectType,
        objectId: row.objectId,
        details: row.details ?? null,
        actor: row.actor ?? null,
        isSelf,
        patientName,
        message: activityMessage({
          objectType: row.objectType,
          action: row.action,
          actor: row.actor,
          actorRole: row.actorRole ?? null,
          isSelf,
          patientName,
          target: target.username ?? row.target ?? null,
          targetRole: target.role ?? row.targetRole ?? null,
        }),
        // The SQL above already formats an ISO-8601 string with microseconds;
        // never round-trip it through `Date`, which would drop that precision.
        createdAt: typeof row.createdAt === 'string'
          ? row.createdAt
          : new Date(row.createdAt).toISOString(),
      };
    });
  }

  /**
   * Activity feed plus the unread count for one staff account. The badge counts
   * audit activities created after the account's `last_seen_at`, so the history
   * is never mutated and read-state stays isolated per account.
   */
  async notifications(staffId: string, limit = ACTIVITY_LIMIT): Promise<DashboardNotificationFeed> {
    const items = await this.activities(limit, staffId);
    const [row] = await this.dataSource.query(
      `SELECT to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "lastSeenAt"
       FROM staff_activity_reads WHERE staff_id = $1`,
      [staffId],
    );
    // Keep the stored microseconds; `isoOrNull` would round the marker down to
    // milliseconds and count the viewed activity as unread again.
    const lastSeenAt =
      typeof row?.lastSeenAt === 'string' && !Number.isNaN(Date.parse(row.lastSeenAt))
        ? row.lastSeenAt
        : isoOrNull(row?.lastSeenAt);
    const [countRow] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM audit_logs
        WHERE ($1::timestamptz IS NULL OR created_at > $1::timestamptz)`,
      [lastSeenAt],
    );
    return { items, unreadCount: Number(countRow?.count ?? 0), lastSeenAt };
  }

  /**
   * Marks activities up to `seenAt` (the newest displayed item) as read for one
   * staff account. Falls back to `now` when the client does not supply a valid
   * timestamp. Never touches `audit_logs`.
   */
  async markActivitiesRead(staffId: string, seenAt?: unknown, now = new Date()): Promise<{ lastSeenAt: string }> {
    // Do not round-trip the client's marker through `Date`: audit timestamps
    // carry microseconds, and truncating them to milliseconds leaves the very
    // activity the officer just saw as `created_at > last_seen_at`, so the
    // badge reappears on the next load. PostgreSQL clamps future values.
    const candidate =
      typeof seenAt === 'string' && !Number.isNaN(Date.parse(seenAt))
        ? seenAt
        : now.toISOString();
    const fallback = Date.parse(candidate) > now.getTime() ? now.toISOString() : candidate;
    const [row] = await this.dataSource.query(
      `INSERT INTO staff_activity_reads(staff_id, last_seen_at, updated_at)
       VALUES ($1, LEAST($2::timestamptz, $3::timestamptz), now())
       ON CONFLICT (staff_id)
       DO UPDATE SET last_seen_at = GREATEST(staff_activity_reads.last_seen_at, EXCLUDED.last_seen_at),
                     updated_at = now()
       RETURNING to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "lastSeenAt"`,
      [staffId, candidate, now.toISOString()],
    );
    return { lastSeenAt: typeof row?.lastSeenAt === 'string' ? row.lastSeenAt : fallback };
  }

  async exportSummary(now = new Date()): Promise<{ filename: string; buffer: Buffer }> {
    const data = await this.summary(now);
    const activities = await this.activities(ACTIVITY_LIMIT);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dinar-TB';
    workbook.created = now;

    const overview = workbook.addWorksheet('Ringkasan');
    overview.columns = [
      { header: 'Metrik', key: 'label', width: 34 },
      { header: 'Nilai', key: 'value', width: 24 },
    ];
    overview.addRows([
      { label: 'Tanggal', value: data.today },
      { label: 'Zona waktu', value: data.timeZone },
      { label: 'Total pasien terdaftar', value: data.stats.totalPatients },
      { label: 'Kontrol hari ini', value: data.stats.controlsToday },
      { label: 'Jadwal kontrol mendatang', value: data.stats.upcomingControls },
      { label: 'Perlu tindak lanjut', value: data.stats.needsFollowUp },
      { label: 'Pengobatan aktif', value: data.medicationToday.activeTreatments },
      { label: 'Konfirmasi minum obat hari ini', value: data.medicationToday.confirmed },
      { label: 'Belum konfirmasi minum obat hari ini', value: data.medicationToday.notConfirmed },
      { label: 'Pembaruan konfirmasi terakhir', value: data.medicationToday.lastUpdatedAt ?? 'Belum ada' },
      { label: 'Waktu ekspor', value: data.generatedAt },
    ]);

    const monthly = workbook.addWorksheet('Pasien Baru per Bulan');
    monthly.columns = [
      { header: 'Bulan', key: 'month', width: 14 },
      { header: 'Jumlah pasien baru', key: 'count', width: 22 },
    ];
    monthly.addRows(data.newPatientsByMonth.map((row) => ({ month: row.month, count: row.count })));

    const followUps = workbook.addWorksheet('Perlu Tindak Lanjut');
    followUps.columns = [
      { header: 'Nomor Register', key: 'registerNumber', width: 22 },
      { header: 'Nama Pasien', key: 'patientName', width: 28 },
      { header: 'Tanggal Kontrol', key: 'scheduledDate', width: 18 },
      { header: 'Status', key: 'level', width: 14 },
      { header: 'Keterangan', key: 'message', width: 70 },
    ];
    followUps.addRows(
      data.followUps.map((row) => ({
        registerNumber: row.registerNumber ?? '—',
        patientName: row.patientName,
        scheduledDate: row.scheduledDate,
        level: row.level,
        message: row.message,
      })),
    );

    const activitySheet = workbook.addWorksheet('Aktivitas Terbaru');
    activitySheet.columns = [
      { header: 'Waktu', key: 'createdAt', width: 26 },
      { header: 'Petugas', key: 'actor', width: 20 },
      { header: 'Tindakan', key: 'action', width: 22 },
      { header: 'Objek', key: 'objectType', width: 22 },
      { header: 'Detail', key: 'details', width: 40 },
    ];
    activitySheet.addRows(
      activities.map((row) => ({
        createdAt: row.createdAt,
        actor: row.actor ?? 'Sistem',
        action: row.action,
        objectType: row.objectType,
        details: row.details ?? '',
      })),
    );

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `ringkasan-dinar-tb-${data.today}.xlsx`,
      buffer: Buffer.from(buffer as ArrayBuffer),
    };
  }
}
