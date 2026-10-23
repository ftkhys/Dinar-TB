import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { APPLICATION_TIME_ZONE, dateInTimeZone, isDateOnly, localTodayJakarta } from '../common/date-rules';
import { AdherenceStatus } from '../database/enums';
import { summarizeAdherence } from '../adherence/adherence-rules';

export const REPORT_CATEGORIES = [
  'Data Pasien',
  'Riwayat Kontrol',
  'Pemberian Obat',
  'Konfirmasi Minum Obat',
  'Perlu Tindak Lanjut',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportColumn = { key: string; label: string };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export type ReportSummaryItem = { label: string; value: number };

export type ReportFilters = {
  category: string;
  from: string;
  to: string;
  patientId?: string | null;
};

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Formats an instant as a Jakarta (UTC+7) label so preview and export match. */
export function formatWibDateTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const day = wib.getUTCDate();
  const month = MONTHS_ID[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hours = String(wib.getUTCHours()).padStart(2, '0');
  const minutes = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes} WIB`;
}

function cell(value: unknown): ReportCell {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  return typeof value === 'number' ? value : String(value);
}

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource) {}

  private parseFilters(input: ReportFilters): { category: ReportCategory; from: string; to: string; patientId: string | null } {
    const category = input.category as ReportCategory;
    if (!REPORT_CATEGORIES.includes(category)) {
      throw new BadRequestException('Jenis laporan tidak valid.');
    }
    const from = (input.from ?? '').trim();
    const to = (input.to ?? '').trim();
    if (!isDateOnly(from) || !isDateOnly(to)) {
      throw new BadRequestException('Rentang tanggal tidak valid.');
    }
    if (from > to) {
      throw new BadRequestException('Tanggal mulai tidak boleh melebihi tanggal akhir.');
    }
    const rawPatient = (input.patientId ?? '')?.toString().trim();
    if (rawPatient && !UUID_PATTERN.test(rawPatient)) {
      throw new BadRequestException('Filter pasien tidak valid.');
    }
    return { category, from, to, patientId: rawPatient ? rawPatient : null };
  }

  async build(input: ReportFilters, now = new Date()): Promise<ReportPreview> {
    const { category, from, to, patientId } = this.parseFilters(input);
    const params = [from, to, patientId];
    let columns: ReportColumn[];
    let rows: ReportRow[];
    let summary: ReportSummaryItem[];

    switch (category) {
      case 'Data Pasien': {
        const today = localTodayJakarta(now);
        const raw: Array<Record<string, unknown>> = await this.dataSource.query(
          `SELECT p.register_number AS "registerNumber", p.full_name AS "patientName",
                  p.medical_record_number AS "medicalRecordNumber", p.address,
                  to_char(p.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth", p.gender, p.phone,
                  tc.treatment_stage AS "treatmentStage",
                  to_char(tc.start_date, 'YYYY-MM-DD') AS "startDate",
                  to_char(cs.scheduled_date, 'YYYY-MM-DD') AS "nextControlDate",
                  (tc.id IS NOT NULL AND tc.start_date <= $4::date) AS "active"
             FROM patients p
             LEFT JOIN treatment_courses tc ON tc.patient_id = p.id AND tc.completed_at IS NULL
             LEFT JOIN control_schedule cs ON cs.treatment_course_id = tc.id
            WHERE p.archived_at IS NULL AND p.anonymized_at IS NULL
              AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY p.register_number ASC`,
          [...params, today],
        );
        columns = [
          { key: 'registerNumber', label: 'Nomor Register' },
          { key: 'patientName', label: 'Nama Pasien' },
          { key: 'medicalRecordNumber', label: 'Nomor Rekam Medis' },
          { key: 'address', label: 'Alamat' },
          { key: 'dateOfBirth', label: 'Tanggal Lahir' },
          { key: 'gender', label: 'Jenis Kelamin' },
          { key: 'phone', label: 'Nomor Telepon' },
          { key: 'treatmentStage', label: 'Tahap Pengobatan' },
          { key: 'startDate', label: 'Tanggal Mulai' },
          { key: 'nextControlDate', label: 'Kontrol Berikutnya' },
          { key: 'status', label: 'Status' },
        ];
        rows = raw.map((row) => ({
          registerNumber: cell(row.registerNumber),
          patientName: cell(row.patientName),
          medicalRecordNumber: cell(row.medicalRecordNumber),
          address: cell(row.address),
          dateOfBirth: cell(row.dateOfBirth),
          gender: cell(row.gender),
          phone: cell(row.phone),
          treatmentStage: cell(row.treatmentStage),
          startDate: cell(row.startDate),
          nextControlDate: cell(row.nextControlDate),
          status: row.active
            ? 'Aktif'
            : row.startDate && String(row.startDate) > today
              ? 'Belum dimulai'
              : 'Selesai',
        }));
        const aktif = rows.filter((row) => row.status === 'Aktif').length;
        summary = [
          { label: 'Total pasien', value: rows.length },
          { label: 'Pengobatan aktif', value: aktif },
          { label: 'Tanpa pengobatan aktif', value: rows.length - aktif },
        ];
        break;
      }

      case 'Riwayat Kontrol': {
        const raw: Array<Record<string, unknown>> = await this.dataSource.query(
          `SELECT to_char(v.visit_date, 'YYYY-MM-DD') AS "visitDate",
                  p.register_number AS "registerNumber", p.full_name AS "patientName",
                  v.medicine_given AS "medicineGiven",
                  to_char(v.medication_given_on, 'YYYY-MM-DD') AS "medicationGivenOn",
                  v.additional_note AS "additionalNote"
             FROM control_visits v
             JOIN patients p ON p.id = v.patient_id
            WHERE v.visit_date BETWEEN $1 AND $2
              AND p.archived_at IS NULL AND p.anonymized_at IS NULL
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY v.visit_date DESC, p.full_name ASC`,
          params,
        );
        columns = [
          { key: 'visitDate', label: 'Tanggal Kunjungan' },
          { key: 'registerNumber', label: 'Nomor Register' },
          { key: 'patientName', label: 'Nama Pasien' },
          { key: 'medicineGiven', label: 'Obat Diberikan' },
          { key: 'medicationGivenOn', label: 'Tanggal Pemberian Obat' },
          { key: 'additionalNote', label: 'Catatan' },
        ];
        rows = raw.map((row) => ({
          visitDate: cell(row.visitDate),
          registerNumber: cell(row.registerNumber),
          patientName: cell(row.patientName),
          medicineGiven: cell(row.medicineGiven),
          medicationGivenOn: cell(row.medicationGivenOn),
          additionalNote: cell(row.additionalNote),
        }));
        const denganObat = rows.filter((row) => row.medicineGiven === 'Ya').length;
        summary = [
          { label: 'Total kunjungan', value: rows.length },
          { label: 'Dengan obat', value: denganObat },
          { label: 'Tanpa obat', value: rows.length - denganObat },
        ];
        break;
      }

      case 'Pemberian Obat': {
        const raw: Array<Record<string, unknown>> = await this.dataSource.query(
          `SELECT to_char(v.medication_given_on, 'YYYY-MM-DD') AS "medicationGivenOn",
                  p.register_number AS "registerNumber", p.full_name AS "patientName",
                  to_char(v.visit_date, 'YYYY-MM-DD') AS "visitDate",
                  v.additional_note AS "additionalNote"
             FROM control_visits v
             JOIN patients p ON p.id = v.patient_id
            WHERE v.medicine_given = true AND v.medication_given_on BETWEEN $1 AND $2
              AND p.archived_at IS NULL AND p.anonymized_at IS NULL
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY v.medication_given_on DESC, p.full_name ASC`,
          params,
        );
        columns = [
          { key: 'medicationGivenOn', label: 'Tanggal Pemberian Obat' },
          { key: 'registerNumber', label: 'Nomor Register' },
          { key: 'patientName', label: 'Nama Pasien' },
          { key: 'visitDate', label: 'Tanggal Kunjungan' },
          { key: 'additionalNote', label: 'Catatan' },
        ];
        rows = raw.map((row) => ({
          medicationGivenOn: cell(row.medicationGivenOn),
          registerNumber: cell(row.registerNumber),
          patientName: cell(row.patientName),
          visitDate: cell(row.visitDate),
          additionalNote: cell(row.additionalNote),
        }));
        summary = [{ label: 'Total pemberian obat', value: rows.length }];
        break;
      }

      case 'Konfirmasi Minum Obat': {
        const raw: Array<Record<string, unknown>> = await this.dataSource.query(
          `SELECT tc.id AS "treatmentCourseId", to_char(tc.start_date, 'YYYY-MM-DD') AS "startDate", tc.completed_at AS "completedAt",
                  p.register_number AS "registerNumber", p.full_name AS "patientName",
                  to_char(da.adherence_date, 'YYYY-MM-DD') AS "adherenceDate", da.confirmed_at AS "confirmedAt"
             FROM treatment_courses tc
             JOIN patients p ON p.id = tc.patient_id
             LEFT JOIN daily_adherence da
               ON da.treatment_course_id = tc.id AND da.adherence_date BETWEEN $1 AND $2
            WHERE tc.start_date <= $2::date
              AND (tc.completed_at IS NULL OR (tc.completed_at AT TIME ZONE 'Asia/Jakarta')::date >= $1::date)
              AND p.archived_at IS NULL AND p.anonymized_at IS NULL
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY da.adherence_date DESC NULLS LAST, p.full_name ASC`,
          params,
        );
        const courses = new Map<string, {
          startDate: string;
          completedAt: Date | null;
          registerNumber: string | null;
          patientName: string;
          confirmations: Map<string, string>;
        }>();
        for (const row of raw) {
          const treatmentId = String(row.treatmentCourseId);
          let course = courses.get(treatmentId);
          if (!course) {
            course = {
              startDate: String(row.startDate),
              completedAt: row.completedAt ? new Date(row.completedAt as string | Date) : null,
              registerNumber: row.registerNumber as string | null,
              patientName: String(row.patientName),
              confirmations: new Map(),
            };
            courses.set(treatmentId, course);
          }
          if (row.adherenceDate && row.confirmedAt) {
            const date = String(row.adherenceDate);
            course.confirmations.set(date, new Date(row.confirmedAt as string | Date).toISOString());
          }
        }
        const today = localTodayJakarta(now);
        const computed = [...courses.values()].flatMap((course) => {
          const effectiveStart = course.startDate < from ? from : course.startDate;
          const completedDate = course.completedAt ? dateInTimeZone(course.completedAt, APPLICATION_TIME_ZONE) : null;
          return summarizeAdherence(effectiveStart, today, completedDate, course.confirmations).days
            .filter((day) => day.date >= from && day.date <= to)
            .map((day) => ({
              adherenceDate: day.date,
              registerNumber: course.registerNumber,
              patientName: course.patientName,
              status: day.status,
              confirmedAt: day.confirmedAt,
            }));
        }).sort((a, b) => b.adherenceDate.localeCompare(a.adherenceDate) || a.patientName.localeCompare(b.patientName));
        columns = [
          { key: 'adherenceDate', label: 'Tanggal' },
          { key: 'registerNumber', label: 'Nomor Register' },
          { key: 'patientName', label: 'Nama Pasien' },
          { key: 'status', label: 'Status' },
          { key: 'confirmedAt', label: 'Waktu Konfirmasi' },
        ];
        rows = computed.map((row) => ({
          adherenceDate: cell(row.adherenceDate),
          registerNumber: cell(row.registerNumber),
          patientName: cell(row.patientName),
          status: cell(row.status),
          confirmedAt: row.confirmedAt ? formatWibDateTime(row.confirmedAt) : '—',
        }));
        summary = [
          { label: 'Total catatan', value: rows.length },
          { label: 'Sudah diminum', value: rows.filter((row) => row.status === AdherenceStatus.TAKEN).length },
          { label: 'Terlewat', value: rows.filter((row) => row.status === AdherenceStatus.MISSED).length },
          { label: 'Belum dikonfirmasi', value: rows.filter((row) => row.status === AdherenceStatus.NOT_CONFIRMED).length },
        ];
        break;
      }

      default: {
        const raw: Array<Record<string, unknown>> = await this.dataSource.query(
          `SELECT to_char((f.created_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS "followUpDate",
                  p.register_number AS "registerNumber", p.full_name AS "patientName",
                  to_char(cs.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
                  f.outcome, f.note, f.created_at AS "createdAt"
             FROM follow_ups f
             JOIN control_schedule cs ON cs.id = f.control_schedule_id
             JOIN treatment_courses tc ON tc.id = cs.treatment_course_id
             JOIN patients p ON p.id = tc.patient_id
            WHERE (f.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2
              AND p.archived_at IS NULL AND p.anonymized_at IS NULL
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY f.created_at DESC`,
          params,
        );
        columns = [
          { key: 'followUpDate', label: 'Tanggal Tindak Lanjut' },
          { key: 'registerNumber', label: 'Nomor Register' },
          { key: 'patientName', label: 'Nama Pasien' },
          { key: 'scheduledDate', label: 'Jadwal Kontrol' },
          { key: 'outcome', label: 'Hasil' },
          { key: 'note', label: 'Catatan' },
          { key: 'recordedAt', label: 'Waktu Dicatat' },
        ];
        rows = raw.map((row) => ({
          followUpDate: cell(row.followUpDate),
          registerNumber: cell(row.registerNumber),
          patientName: cell(row.patientName),
          scheduledDate: cell(row.scheduledDate),
          outcome: cell(row.outcome),
          note: cell(row.note),
          recordedAt: row.createdAt ? formatWibDateTime(row.createdAt as string) : '—',
        }));
        summary = [{ label: 'Total tindak lanjut', value: rows.length }];
        break;
      }
    }

    return {
      category,
      from,
      to,
      patientId,
      generatedAt: now.toISOString(),
      total: rows.length,
      columns,
      rows,
      summary,
    };
  }

  async export(input: ReportFilters, now = new Date()): Promise<{ filename: string; buffer: Buffer }> {
    const preview = await this.build(input, now);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dinar-TB';
    workbook.created = now;

    const info = workbook.addWorksheet('Informasi Laporan');
    info.columns = [
      { header: 'Keterangan', key: 'label', width: 30 },
      { header: 'Nilai', key: 'value', width: 46 },
    ];
    info.addRows([
      { label: 'Jenis Laporan', value: preview.category },
      { label: 'Tanggal Mulai', value: preview.from },
      { label: 'Tanggal Akhir', value: preview.to },
      { label: 'Jumlah Data', value: preview.total },
      { label: 'Zona Waktu', value: APPLICATION_TIME_ZONE },
      { label: 'Waktu Ekspor', value: formatWibDateTime(preview.generatedAt) },
      ...preview.summary.map((item) => ({ label: item.label, value: item.value })),
      { label: 'Catatan', value: 'NIK pasien tidak disertakan dalam berkas ini.' },
    ]);

    const data = workbook.addWorksheet(preview.category.slice(0, 31));
    data.columns = preview.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: Math.min(Math.max(column.label.length + 4, 14), 48),
    }));
    data.addRows(preview.rows);

    const buffer = await workbook.xlsx.writeBuffer();
    const slug = preview.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      filename: `laporan-${slug}-${preview.from}-${preview.to}.xlsx`,
      buffer: Buffer.from(buffer as ArrayBuffer),
    };
  }

  /** Exposed for callers that only need the current WIB day label. */
  today(now = new Date()): string {
    return localTodayJakarta(now);
  }
}
