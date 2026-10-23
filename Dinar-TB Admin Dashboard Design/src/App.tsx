import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyTextToClipboard } from "./utils/clipboard";
import { PasswordInput, PasswordReveal } from "./components/password-controls";
import {
  historyFieldDefaults,
  identityPatch,
  jakartaToday,
  resolveIntakeSchedule,
  resolveMedicationDecision,
  savePatientIntake,
  validateHistoryDates,
  wizardSteps,
  type IntakeSaveResult,
  type MedicationChoice,
  type PatientIdentity,
  type PatientIntakeInput,
} from "./api/patient-intake";
import {
  PATIENT_CONTROL_STATUS_FILTERS,
  toPatientRow,
  type PatientRow,
} from "./api/patient-directory";
import {
  ApiError,
  formatActivationExpiry,
  type ActivationCode,
  type AdherenceSummary,
  type AppSettings,
  type ControlVisit as ApiVisit,
  type DashboardActivity,
  type DashboardFollowUp,
  type DashboardNotificationFeed,
  type DashboardSummary,
  type ImportPreview,
  type ImportConfirmResult,
  type ImportRowResult,
  type Patient as ApiPatient,
  type PatientStats,
  type ReminderRow,
  type RemindersView,
  type ReportCategory,
  type ReportFilters,
  type ReportPreview,
  type StaffAccountSummary,
  type StaffAccounts,
  type StaffRole,
  type Treatment as ApiTreatment,
} from "./api/control-api";
import { useControlApi, useStaffAuth } from "./auth/staff-auth-context";
import {
  FORGOT_PASSWORD_HELP,
  TEMP_PASSWORD_NOTICE,
  nextFailureCount,
  shouldShowForgotPassword,
} from "./api/login-help";

type Page = "Beranda" | "Pasien" | "Kontrol" | "Pengingat" | "Laporan" | "Pengaturan";
type Activity = { id: string; message: string; detail?: string; time: string; icon: IconName };
type ControlVisit = { date: string; type?: string; medicine: string; medicineDate?: string; note: string; scheduleUpdate?: string };
type IconName =
  | "home" | "users" | "calendar" | "bell" | "chart" | "settings" | "search"
  | "plus" | "chevron" | "edit" | "trash" | "download" | "upload" | "check"
  | "clock" | "alert" | "file" | "filter" | "eye" | "logout" | "lock";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.09V3h4v.09A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9c.16.6.7 1 1.54 1H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m15 18-6-6 6-6" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 21h14" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.3 3.5 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  file: <><path d="M6 2h9l5 5v15H6Z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z" />,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h5v16h-5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Button({ children, variant = "primary", icon, onClick, type = "button", disabled = false }: {
  children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; icon?: IconName;
  onClick?: () => void; type?: "button" | "submit"; disabled?: boolean;
}) {
  return <button className={`btn btn-${variant}`} onClick={onClick} type={type} disabled={disabled}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}

function Search({ value, onChange, placeholder = "Cari data...", onSubmit }: { value: string; onChange: (value: string) => void; placeholder?: string; onSubmit?: (value: string) => void }) {
  return <label className="search"><Icon name="search" size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(value); } }} /></label>;
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const nav: { label: Page; icon: IconName }[] = [
  { label: "Beranda", icon: "home" }, { label: "Pasien", icon: "users" },
  { label: "Kontrol", icon: "calendar" }, { label: "Pengingat", icon: "bell" },
  { label: "Laporan", icon: "chart" }, { label: "Pengaturan", icon: "settings" },
];

const ACTIVITY_ACTIONS: Record<string, string> = {
  "patient:created": "menambahkan data pasien",
  "patient:imported": "mengimpor data pasien",
  "patient:identity_updated": "mengubah identitas pasien",
  "patient:archived": "mengarsipkan data pasien",
  "patient:restored": "memulihkan data pasien",
  "patient:permanently_deleted": "menghapus permanen data pasien",
  "patient:anonymized": "menghapus permanen data pasien",
  "staff_account:login": "berhasil login",
  "staff_account:created": "menambahkan akun petugas",
  "staff_account:role_changed": "mengubah peran akun",
  "staff_account:deleted": "menghapus akun",
  "staff_account:profile_updated": "memperbarui profil akun",
  "staff_account:password_changed": "mengubah kata sandi akun",
  "app_settings:puskesmas_updated": "memperbarui data Puskesmas",
  "app_settings:schedule_updated": "mengubah pengaturan jadwal",
  "app_settings:reminder_updated": "mengubah pengaturan pengingat",
  "treatment_course:created": "memulai pengobatan pasien",
  "treatment_course:final_review": "menyimpan keputusan akhir pengobatan",
  "control_schedule:initial_date_set": "menetapkan jadwal kontrol awal",
  "control_schedule:date_overridden": "mengubah jadwal kontrol",
  "control_schedule:default_recalculated": "menghitung ulang jadwal kontrol",
  "control_visit:created": "mencatat kunjungan kontrol",
  "follow_up:recorded": "mencatat tindak lanjut",
  "activation_code:issued": "menerbitkan kode aktivasi pasien",
  "patient_device:activated": "mengaktifkan perangkat pasien",
};

const ACTIVITY_ICONS: Record<string, IconName> = {
  patient: "users",
  treatment_course: "file",
  control_schedule: "calendar",
  control_visit: "check",
  follow_up: "alert",
  activation_code: "lock",
  patient_device: "lock",
  staff_account: "logout",
  app_settings: "settings",
};

function activityDetail(row: DashboardActivity): string | undefined {
  if (!row.details) return undefined;
  if (row.objectType === "control_visit") {
    return row.details === "medicine_given" ? "Obat diberikan" : row.details === "no_medicine" ? "Tanpa pemberian obat" : undefined;
  }
  if (row.objectType === "follow_up" || row.objectType === "treatment_course") return row.details;
  if (row.objectType === "control_schedule") return row.details.replace(" -> ", " → ");
  return undefined;
}

function toActivity(row: DashboardActivity): Activity {
  const actor = row.actor ?? "Sistem";
  const label = ACTIVITY_ACTIONS[`${row.objectType}:${row.action}`] ?? `${row.objectType} ${row.action}`;
  const fallback = row.isSelf ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : `Petugas ${actor} ${label}`;
  const message = row.message && row.message.trim() ? row.message : `${fallback}.`;
  return {
    id: row.id,
    message,
    detail: activityDetail(row),
    time: formatJakartaDateTime(row.createdAt),
    icon: ACTIVITY_ICONS[row.objectType] ?? "bell",
  };
}

function formatJakartaDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  }).format(date);
  return `${formatted} WIB`;
}

function formatJakartaDate(value: string): string {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(date);
}

/** Today's calendar date in Jakarta (YYYY-MM-DD), independent of the browser zone. */
function todayJakartaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Formats an ISO timestamp as Jakarta clock time, e.g. "07.18 WIB". */
function formatJakartaTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  }).format(date);
  return `${formatted.replace(":", ".")} WIB`;
}

function formatJakartaShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(date);
}

function greetingJakarta(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function initialsFrom(name: string | null): string {
  const source = (name ?? "").trim();
  if (!source) return "TB";
  return source.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "TB";
}

function AppShell({ page, setPage, children, activities, activitiesError, unreadCount, onActivitiesOpen, username, role, puskesmasName, onSearch, onHelp, onLogout }: {
  page: Page; setPage: (p: Page) => void; children: ReactNode; activities: Activity[]; activitiesError: boolean;
  unreadCount: number; onActivitiesOpen: () => void;
  username: string | null; role: StaffRole; puskesmasName: string | null; onSearch: (value: string) => void; onHelp: () => void; onLogout: () => void;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const accountRef = useRef<HTMLDivElement | null>(null);
  const activityRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!activityOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (activityRef.current && !activityRef.current.contains(event.target as Node)) setActivityOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivityOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activityOpen]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><img src="/image/logo2.png" alt="Logo Dinar-TB" /></span><span>Dinar-TB.</span></div>
      <nav>{nav.map((item) => <button key={item.label} className={`nav-item ${page === item.label ? "active" : ""}`} onClick={() => setPage(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <button className="sidebar-help" onClick={onHelp}><span className="help-icon">?</span><div><strong>Butuh bantuan?</strong><small>Panduan Dinar-TB</small></div></button>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><small>Dashboard Admin</small><strong>{page}</strong></div>
        <div className="top-actions"><Search value={search} onChange={setSearch} onSubmit={(value) => { onSearch(value); setSearch(""); }} placeholder="Cari pasien lalu tekan Enter..." /><div className="activity-wrap" ref={activityRef}><button className="icon-btn activity-trigger" aria-label="Notifikasi dan aktivitas" aria-haspopup="dialog" aria-expanded={activityOpen} onClick={() => { if (!activityOpen) onActivitiesOpen(); setActivityOpen(!activityOpen); setAccountOpen(false); }}><Icon name="bell" />{unreadCount > 0 && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}</button>
          {activityOpen && <ActivityPanel activities={activities} error={activitiesError} onClose={() => setActivityOpen(false)} />}</div><div className="account-wrap" ref={accountRef}><button className="account-trigger" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen(value => !value); setActivityOpen(false); }}><div className="avatar">{initialsFrom(username)}</div><div className="staff"><strong>{username ?? "Petugas"}</strong><small>{role === "Admin" ? "Admin" : "Petugas TB"}</small></div></button>
          {accountOpen && <div className="account-menu" role="menu"><div className="account-identity"><strong>{username ?? "Petugas TB"}</strong><Badge tone={role === "Admin" ? "blue" : "navy"}>{role}</Badge></div><span className="account-puskesmas">{puskesmasName ?? "Memuat Puskesmas…"}</span><small>Keluar akan mengakhiri sesi pada tab ini.</small><Button variant="secondary" icon="logout" onClick={onLogout}>Keluar</Button></div>}</div></div>
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}

function ActivityPanel({ activities, error, onClose }: { activities: Activity[]; error: boolean; onClose: () => void }) {
  return <div className="activity-panel"><div className="panel-head"><div><h2>Notifikasi & Aktivitas</h2><p>Riwayat tindakan petugas dari catatan audit server.</p></div><button className="close-btn" onClick={onClose}>×</button></div>{error && <div className="prototype-note"><Icon name="alert" size={15} /><span>Gagal memuat riwayat aktivitas terbaru dari server.</span></div>}{!error && activities.length === 0 && <p className="muted-note">Belum ada aktivitas petugas yang tercatat.</p>}<div className="activity-list">{activities.map(item => <div key={item.id}><span className="activity-icon"><Icon name={item.icon} size={15} /></span><div><p>{item.message}</p><small>{item.time}{item.detail ? ` • ${item.detail}` : ""}</small></div></div>)}</div></div>;
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const guides = [
    ["Mengelola data pasien", "Gunakan menu Pasien untuk menambah, mengimpor, melihat, mengedit, atau menghapus data pasien."],
    ["Mengubah jadwal kontrol", "Pilih Ubah Jadwal pada baris pasien. Perubahan ini hanya memperbarui jadwal mendatang dan tidak mengubah riwayat kunjungan."],
    ["Mencatat kontrol dadakan", "Pilih + Tambah/Catat Kontrol, cari pasien yang sudah terdaftar, lalu catat tanggal kunjungan aktual."],
    ["Mencatat pemberian obat", "Pilih Ya jika obat diberikan dan isi tanggal pemberian. Jadwal berikutnya dihitung dari tanggal tersebut."],
    ["Memahami notifikasi dan riwayat aktivitas", "Ikon lonceng menampilkan riwayat tindakan petugas dari catatan audit server. Angka pada lonceng menunjukkan aktivitas yang belum Anda buka dan akan hilang setelah panel dibuka."],
    ["Mengimpor data pasien dari Excel", "Buka menu Pasien lalu pilih Impor Excel dan unduh template .xlsx di sana. Kolom wajib: Nomor Register, Nama Lengkap, Nomor Rekam Medis, dan Alamat. Kolom opsional: Tanggal Lahir, Jenis Kelamin, Nomor Telepon, Tanggal Mulai Pengobatan, dan Tahap Pengobatan."],
  ];
  return <Dialog title="Panduan Penggunaan Dinar-TB" subtitle="Panduan singkat untuk Admin dan Petugas." onClose={onClose} wide><div className="guide-list">{guides.map(([title, text], i) => <div key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="dialog-actions"><Button onClick={onClose}>Selesai</Button></div></Dialog>;
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function StatCard({ label, value, icon, tone = "blue", note }: { label: string; value: string | number; icon: IconName; tone?: string; note?: string }) {
  return <div className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon name={icon} /></div><div><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div></div>;
}

function statusTone(status: string) {
  if (["Sesuai", "Sudah Konfirmasi", "Selesai", "Valid"].includes(status)) return "green";
  if (["Terlambat", "Belum Konfirmasi", "Tidak Valid"].includes(status)) return "red";
  if (["Hari Ini"].includes(status)) return "navy";
  if (["Besok", "Mendatang", "Perlu Konfirmasi"].includes(status)) return "yellow";
  return "blue";
}

function PatientsChart({ points }: { points: Array<{ label: string; count: number }> }) {
  const left = 38, right = 600, top = 40, bottom = 190;
  const safe = points.length > 0 ? points : [{ label: "—", count: 0 }];
  const max = Math.max(1, ...safe.map(point => point.count));
  const step = safe.length > 1 ? (right - left) / (safe.length - 1) : 0;
  const coords = safe.map((point, index) => ({ x: left + index * step, y: bottom - (point.count / max) * (bottom - top) }));
  const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
  const area = `${line} L${right} ${bottom} L${left} ${bottom} Z`;
  return <div className="chart-wrap">
    <svg viewBox="0 0 620 220" role="img" aria-label="Grafik pasien baru enam bulan terakhir">
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3156ff" stopOpacity=".2" /><stop offset="100%" stopColor="#3156ff" stopOpacity="0" /></linearGradient></defs>
      {[top, top + (bottom - top) / 3, top + ((bottom - top) * 2) / 3, bottom].map((y) => <line key={y} x1={left} x2={right} y1={y} y2={y} stroke="#edf0f7" />)}
      <path d={area} fill="url(#area)" />
      <path d={line} fill="none" stroke="#2447ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((coord, index) => <circle key={index} cx={coord.x} cy={coord.y} r="3.5" fill="#2447ff" />)}
      {safe.map((point, index) => <text key={`${point.label}-${index}`} x={coords[index].x} y="212" fill="#8b94af" fontSize="12" textAnchor="middle">{point.label}</text>)}
    </svg>
  </div>;
}

function MedicationDonut({ medication }: { medication: DashboardSummary["medicationToday"] }) {
  const total = medication.activeTreatments;
  const pct = total > 0 ? Math.min(Math.round((medication.confirmed / total) * 100), 100) : 0;
  return <div className="donut-row"><div className="donut" style={{ background: `conic-gradient(var(--primary) 0 ${pct}%, #dfe5f7 ${pct}% 100%)` }}><div><strong>{total}</strong><span>pasien aktif</span></div></div><div className="legend"><span><i className="dot blue" />Sudah konfirmasi <b>{medication.confirmed}</b></span><span><i className="dot pale" />Belum konfirmasi <b>{medication.notConfirmed}</b></span></div></div>;
}

const FOLLOW_UP_OUTCOMES = [
  "Pasien sudah datang",
  "Pasien belum datang",
  "Pasien lupa jadwal",
  "Pasien terkendala transportasi",
  "Pasien sakit",
  "Pasien tidak dapat dihubungi",
  "Alasan lainnya",
];

function FollowUpDialog({ api, item, notify, onClose, onSaved }: { api: ReturnType<typeof useControlApi>; item: DashboardFollowUp; notify: (message: string) => void; onClose: () => void; onSaved: () => void }) {
  const [outcome, setOutcome] = useState(FOLLOW_UP_OUTCOMES[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api.createFollowUp(item.scheduleId, { outcome, note: note.trim() ? note.trim() : undefined });
      notify("Tindak lanjut berhasil dicatat.");
      onSaved();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  };

  return <Dialog title="Catat Tindak Lanjut" subtitle={`${item.patientName} • ${item.registerNumber || "Nomor register belum tercatat"}`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="notice small"><Icon name="alert" /><span>{item.message}</span></div>
      <Field label="Hasil tindak lanjut" required>
        <select value={outcome} onChange={event => setOutcome(event.target.value)}>{FOLLOW_UP_OUTCOMES.map(option => <option key={option} value={option}>{option}</option>)}</select>
      </Field>
      <Field label="Catatan (opsional)"><textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} placeholder="Tambahkan catatan singkat bila diperlukan" /></Field>
      {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
      <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Tindak Lanjut"}</Button></div>
    </form>
  </Dialog>;
}

function HomePage({ go, username, notify }: { go: (page: Page) => void; username: string | null; notify: (message: string) => void }) {
  const api = useControlApi();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [followUp, setFollowUp] = useState<DashboardFollowUp | null>(null);
  const [now] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const data = await api.getDashboardSummary(signal);
      if (signal?.aborted) return;
      setSummary(data);
      setState("ready");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(errorMessage(loadError));
      setState("error");
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  // Patient confirmations arrive asynchronously. Refresh the summary when the
  // officer returns to the tab and on a light interval so "Status minum obat
  // hari ini" reflects the backend instead of the value captured on mount.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setReloadKey(key => key + 1); };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, []);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await api.downloadSummaryReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify("Ringkasan berhasil diunduh.");
    } catch (downloadError) {
      notify(errorMessage(downloadError));
    } finally {
      setDownloading(false);
    }
  };

  const stats = summary?.stats;
  const medication = summary?.medicationToday;
  const months = summary?.newPatientsByMonth ?? [];
  const monthLabel = months.length > 0 ? `${months[0].label}–${months[months.length - 1].label} ${summary?.today.slice(0, 4)}` : "6 bulan terakhir";
  const updatedLabel = medication?.lastUpdatedAt ? `Pembaruan data hingga ${formatJakartaDateTime(medication.lastUpdatedAt)}` : "Belum ada konfirmasi hari ini";

  return <>
    <PageTitle title={`${greetingJakarta(now)}, ${username ?? "Petugas"}`} subtitle={`Berikut ringkasan pemantauan pasien TB hari ini, ${formatJakartaDate(summary?.today ?? todayIso())}.`} action={<Button variant="secondary" icon="download" onClick={download} disabled={downloading}>{downloading ? "Menyiapkan…" : "Unduh Ringkasan"}</Button>} />
    {state === "error" && <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat ringkasan</strong><span>{error} <button className="text-link" type="button" onClick={() => setReloadKey(key => key + 1)}>Coba lagi</button></span></div></div>}
    <div className="stats-grid"><StatCard label="Total Pasien" value={stats ? stats.totalPatients : "—"} icon="users" /><StatCard label="Kontrol Hari Ini" value={stats ? stats.controlsToday : "—"} icon="calendar" tone="teal" /><StatCard label="Jadwal Mendatang" value={stats ? stats.upcomingControls : "—"} icon="clock" tone="yellow" /><StatCard label="Perlu Tindak Lanjut" value={stats ? stats.needsFollowUp : "—"} icon="alert" tone="red" note={stats && stats.needsFollowUp > 0 ? "Butuh perhatian" : undefined} /></div>
    <div className="dashboard-grid">
      <section className="card chart-card"><div className="card-head"><div><h2>Pasien Baru</h2><p>Jumlah pasien terdaftar dalam 6 bulan terakhir</p></div><Badge>{monthLabel}</Badge></div>{state === "loading" && !summary ? <p className="muted-note">Memuat grafik…</p> : <PatientsChart points={months} />}</section>
      <section className="card"><div className="card-head"><div><h2>Status Minum Obat Hari Ini</h2><p>{updatedLabel}</p></div></div>{state === "loading" && !summary ? <p className="muted-note">Memuat status…</p> : medication ? <MedicationDonut medication={medication} /> : <p className="muted-note">Data belum tersedia.</p>}<button className="text-link" onClick={() => go("Pengingat")}>Lihat pemantauan lengkap →</button></section>
    </div>
    <section className="card follow-card"><div className="card-head"><div><h2>Perlu Tindak Lanjut</h2><p>Pasien dengan jadwal kontrol yang sudah terlewat</p></div><button className="text-link" onClick={() => go("Pasien")}>Lihat semua →</button></div>
      {state === "loading" && !summary ? <p className="muted-note">Memuat daftar…</p> : summary && summary.followUps.length > 0 ? <div className="follow-list">{summary.followUps.map(item => <div key={item.scheduleId}><div className="patient-avatar">{item.patientName.split(" ").map(name => name[0]).slice(0, 2).join("")}</div><div><strong>{item.patientName}</strong><span>{item.registerNumber || "Nomor register belum tercatat"} • Kontrol {formatJakartaShortDate(item.scheduledDate)}</span></div><Badge tone="red">Kontrol terlambat</Badge><Button variant="ghost" onClick={() => setFollowUp(item)}>Tindak Lanjut</Button></div>)}</div> : <p className="muted-note">Tidak ada pasien yang perlu ditindak lanjuti saat ini.</p>}
    </section>
    {followUp && <FollowUpDialog api={api} item={followUp} notify={notify} onClose={() => setFollowUp(null)} onSaved={() => { setFollowUp(null); setReloadKey(key => key + 1); }} />}
  </>;
}

function pageWindow(page: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  return Array.from({ length: Math.min(3, totalPages) }, (_, index) => start + index);
}

function PatientTable({ rows, loading, error, onRetry, query, onQuery, status, onStatus, onDetail, onEdit, onDelete, page, total, totalPages, onPage, expanded = false }: {
  rows: PatientRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  query: string;
  onQuery: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  onDetail: (patient: PatientRow) => void;
  onEdit: (patient: PatientRow) => void;
  onDelete: (patient: PatientRow) => void;
  page: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  expanded?: boolean;
}) {
  const visible = expanded ? rows : rows.slice(0, 6);
  const emptyMessage = query.trim()
    ? "Tidak ada pasien yang cocok dengan pencarian."
    : status !== "Semua"
      ? "Tidak ada pasien dengan status kontrol tersebut."
      : "Belum ada data pasien.";
  return <div className="table-card">
    {expanded && <div className="table-tools"><Search value={query} onChange={onQuery} placeholder="Cari nama atau nomor register..." /><select value={status} onChange={e => onStatus(e.target.value)} aria-label="Filter status">{PATIENT_CONTROL_STATUS_FILTERS.map(option => <option key={option}>{option}</option>)}</select></div>}
    <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Lengkap</th><th>Bulan Pengobatan</th><th>Jadwal Kontrol</th><th>Status Kontrol</th><th>Aksi</th></tr></thead>
      <tbody>
        {loading ? <tr><td colSpan={7} className="table-empty">Memuat data pasien…</td></tr>
          : error ? <tr><td colSpan={7} className="table-empty">{error} <button className="text-link" type="button" onClick={onRetry}>Coba lagi</button></td></tr>
            : visible.length === 0 ? <tr><td colSpan={7} className="table-empty">{emptyMessage}</td></tr>
              : visible.map((p, i) => <tr key={p.id}><td>{String((page - 1) * 20 + i + 1).padStart(2, "0")}.</td><td>{p.reg}</td><td><button className="name-link" onClick={() => onDetail(p)}>{p.name}</button></td><td>{p.treatmentStage || "—"}</td><td>{p.scheduleDate ? formatJakartaShortDate(p.scheduleDate) : "—"}</td><td>{p.status ? <Badge tone={statusTone(p.status)}>{p.status}</Badge> : "—"}</td><td><div className="row-actions"><button onClick={() => onDetail(p)} aria-label="Lihat"><Icon name="eye" size={16} /></button><button onClick={() => onEdit(p)} aria-label="Edit"><Icon name="edit" size={16} /></button><button className="danger-icon" onClick={() => onDelete(p)} aria-label="Nonaktifkan"><Icon name="trash" size={16} /></button></div></td></tr>)}
      </tbody>
    </table></div>
    {expanded && !loading && !error && <div className="pagination"><span>Menampilkan {total ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, total)} dari {total} pasien</span><div><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>{pageWindow(page, totalPages).map(number => <button type="button" className={number === page ? "current" : ""} key={number} onClick={() => onPage(number)}>{number}</button>)}<button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button></div></div>}
  </div>;
}

function Dialog({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="overlay" role="presentation" onMouseDown={onClose}><div className={`dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><div className="dialog-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="close-btn" onClick={onClose}>×</button></div>{children}</div></div>;
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** Merges an edited patient record into an existing directory row. */
function applyPatientUpdate(row: PatientRow, patient: ApiPatient): PatientRow {
  return {
    ...row,
    reg: patient.registerNumber,
    name: patient.fullName,
    medicalRecordNumber: patient.medicalRecordNumber,
    address: patient.address,
    dateOfBirth: patient.dateOfBirth ?? "",
    gender: patient.gender ?? "",
    phone: patient.phone ?? "",
    version: patient.version,
  };
}

type PatientFormEdit = {
  id: string;
  reg: string;
  name: string;
  medicalRecordNumber: string;
  address: string;
  version: number;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
};

type PatientFormProps = {
  onClose: () => void;
  onSave: (intake: PatientIntakeInput) => Promise<IntakeSaveResult>;
  onSaveEdit?: (identity: PatientIdentity) => Promise<{ ok: boolean; error?: unknown }>;
  edit?: PatientFormEdit;
};

const STEP_LABELS: Record<"patient" | "treatment" | "visit", string> = {
  patient: "Data pasien",
  treatment: "Pengobatan",
  visit: "Kunjungan & obat pertama",
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Tindakan gagal diproses server.";
}

function useControlIntervalDays() {
  const api = useControlApi();
  const [days, setDays] = useState(14);
  useEffect(() => {
    const controller = new AbortController();
    api.getSettings(controller.signal)
      .then(settings => { if (!controller.signal.aborted) setDays(settings.controlIntervalDays); })
      .catch(() => { if (!controller.signal.aborted) setDays(14); });
    return () => controller.abort();
  }, [api]);
  return days;
}

function PatientForm({ onClose, onSave, onSaveEdit, edit }: PatientFormProps) {
  const controlIntervalDays = useControlIntervalDays();
  const steps = wizardSteps(edit ? "edit" : "create");
  const [step, setStep] = useState<"basic" | "medication" | "schedule">("basic");
  const [medicationChoice, setMedicationChoice] = useState<MedicationChoice>("start");
  const [oldPatient, setOldPatient] = useState(false);
  const [medicineDate, setMedicineDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<IntakeSaveResult | null>(null);
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    registerNumber: "",
    fullName: "",
    medicalRecordNumber: "",
    dateOfBirth: "",
    gender: "Perempuan",
    phone: "",
    address: "",
    nik: "",
    pmoName: "",
    pmoContact: "",
    startDate: "",
    treatmentStage: "Bulan ke-1",
    lastControlDate: todayIso(),
    lastMedicationDate: "",
    medicineTime: "07:00",
  });

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const nextStep = () => {
    if (step === "basic") {
      setStep("medication");
    } else if (step === "medication") {
      setStep("schedule");
    }
  };

  const prevStep = () => {
    if (step === "medication") {
      setStep("basic");
    } else if (step === "schedule") {
      setStep("medication");
    }
  };

  const medicationDecision = resolveMedicationDecision(
    { choice: medicationChoice, otherDate: medicineDate || null },
    formData.startDate,
  );
  const scheduleResolution = oldPatient
    ? (formData.lastMedicationDate
        ? resolveIntakeSchedule(formData.lastMedicationDate, todayIso(), controlIntervalDays)
        : { status: "perlu_konfirmasi" as const, reason: "data_kurang" as const, derivedDate: null })
    : medicationDecision.medicineGiven
      ? (medicationDecision.medicationGivenOn
          ? resolveIntakeSchedule(medicationDecision.medicationGivenOn, todayIso(), controlIntervalDays)
          : { status: "perlu_konfirmasi" as const, reason: "data_kurang" as const, derivedDate: null })
      : null;
  const scheduleEstimate = scheduleResolution?.status === "scheduled"
    ? scheduleResolution.date
    : scheduleResolution?.derivedDate ?? null;
  const scheduleNeedsConfirmation = scheduleResolution?.status === "perlu_konfirmasi";

  useEffect(() => {
    if (edit) {
      setFormData({
        registerNumber: edit.reg ?? "",
        fullName: edit.name ?? "",
        medicalRecordNumber: edit.medicalRecordNumber ?? "",
        dateOfBirth: edit.dateOfBirth ?? "",
        gender: edit.gender ?? "Perempuan",
        phone: edit.phone ?? "",
        address: edit.address ?? "",
        nik: "",
        pmoName: "",
        pmoContact: "",
        startDate: "",
        treatmentStage: "Bulan ke-1",
        lastControlDate: "",
        lastMedicationDate: "",
        medicineTime: "07:00",
      });
    } else {
      setFormData({
        registerNumber: "",
        fullName: "",
        medicalRecordNumber: "",
        dateOfBirth: "",
        gender: "Perempuan",
        phone: "",
        address: "",
        nik: "",
        pmoName: "",
        pmoContact: "",
        startDate: "",
        treatmentStage: "Bulan ke-1",
        ...historyFieldDefaults(false, todayIso()),
        medicineTime: "07:00",
      });
    }
    setMedicationChoice("start");
    setOldPatient(false);
    setMedicineDate("");
    setResult(null);
    setFormError("");
    setStep("basic");
  }, [edit]);

  const buildIdentity = (): PatientIdentity => ({
    registerNumber: formData.registerNumber,
    fullName: formData.fullName,
    medicalRecordNumber: formData.medicalRecordNumber,
    address: formData.address,
    dateOfBirth: formData.dateOfBirth,
    gender: formData.gender,
    phone: formData.phone,
  });

  const buildIntake = (): PatientIntakeInput => {
    const lastControlDate = formData.lastControlDate || null;
    // An old patient already has a running treatment: their real last
    // medication date is captured directly and no first-dose visit is recorded.
    // A new patient derives the medication date from the first-dose choice.
    const lastMedicationDate = oldPatient
      ? formData.lastMedicationDate || null
      : medicationChoice === "none"
        ? null
        : medicationChoice === "start"
          ? formData.startDate || null
          : medicineDate || null;
    return {
      identity: buildIdentity(),
      treatment: { startDate: formData.startDate, treatmentStage: formData.treatmentStage, lastControlDate, lastMedicationDate },
      medication: { choice: oldPatient ? "none" : medicationChoice, otherDate: !oldPatient && medicationChoice === "other" ? medicineDate : null },
    };
  };

  const effectiveLastMedicationDate = oldPatient
    ? formData.lastMedicationDate || null
    : medicationChoice === "none"
      ? null
      : medicationChoice === "start"
        ? formData.startDate || null
        : medicineDate || null;

  const historyError = formData.startDate
    ? (oldPatient && (!formData.lastControlDate || !formData.lastMedicationDate)
        ? "Pasien lama wajib mengisi tanggal kontrol terakhir dan tanggal pemberian obat terakhir yang sebenarnya."
        : validateHistoryDates(formData.startDate, formData.lastControlDate || null, effectiveLastMedicationDate))
    : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (historyError) { setFormError(historyError); return; }
    setSaving(true);
    setResult(null);
    setFormError("");
    try {
      if (edit) {
        const outcome = await onSaveEdit?.(buildIdentity()) ?? { ok: true };
        if (outcome.ok) {
          onClose();
        } else {
          setFormError(errorMessage(outcome.error));
        }
        return;
      }
      const saved = await onSave(buildIntake());
      setResult(saved);
      if (!saved.failure) onClose();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={edit ? "Edit Data Pasien" : "Tambah Pasien"} subtitle="Lengkapi informasi pasien sesuai data Puskesmas." onClose={onClose} wide>
      <form onSubmit={handleSave}>
        {steps.length > 1 && (
          <div className="steps">
            <span className={step === "basic" ? "active" : ""}><b>1</b>Identitas</span>
            <i />
            <span className={step === "medication" ? "active" : ""}><b>2</b>Pengobatan &amp; Obat Pertama</span>
            <i />
            <span className={step === "schedule" ? "active" : ""}><b>3</b>Jadwal Kontrol</span>
          </div>
        )}

        {step === "basic" && (
          <div className="form-section">
            <h3>Identitas Pasien</h3>
            <div className="form-grid">
              <Field label="Nomor Register" required>
                <input value={formData.registerNumber} onChange={e => handleChange("registerNumber", e.target.value)} placeholder="Contoh: 2026-00005721-0001" required disabled={!!edit} />
              </Field>
              <Field label="Nama Lengkap" required>
                <input value={formData.fullName} onChange={e => handleChange("fullName", e.target.value)} placeholder="Nama sesuai identitas" required />
              </Field>
              <Field label="Nomor Rekam Medis" required>
                <input value={formData.medicalRecordNumber} onChange={e => handleChange("medicalRecordNumber", e.target.value)} placeholder="Nomor rekam medis Puskesmas" required />
              </Field>
              <Field label="Tanggal Lahir">
                <input type="date" value={formData.dateOfBirth} onChange={e => handleChange("dateOfBirth", e.target.value)} />
              </Field>
              <Field label="Jenis Kelamin">
                <select value={formData.gender} onChange={e => handleChange("gender", e.target.value)}>
                  <option value="Perempuan">Perempuan</option>
                  <option value="Laki-laki">Laki-laki</option>
                </select>
              </Field>
              <Field label="Nomor Telepon">
                <input value={formData.phone} onChange={e => handleChange("phone", e.target.value)} placeholder="08xxxxxxxxxx" />
              </Field>
              <Field label="Alamat" required>
                <input value={formData.address} onChange={e => handleChange("address", e.target.value)} placeholder="Alamat tempat tinggal" required />
              </Field>
            </div>
          </div>
        )}

        {step === "medication" && (
          <div className="form-section">
            <h3>Pengobatan &amp; Pemberian Obat Pertama</h3>
            <Field label="Jenis Pasien" hint="Pasien lama (pengobatan sudah berjalan) memakai riwayat kontrol & obat yang sebenarnya, bukan tanggal mulai.">
              <div className="tabs compact">
                <button type="button" className={!oldPatient ? "active" : ""} onClick={() => { setOldPatient(false); setMedicationChoice("start"); setFormData(prev => ({ ...prev, ...historyFieldDefaults(false, todayIso()) })); }}>Pasien baru</button>
                <button type="button" className={oldPatient ? "active" : ""} onClick={() => { setOldPatient(true); setMedicationChoice("none"); setFormData(prev => ({ ...prev, ...historyFieldDefaults(true, todayIso()) })); }}>Pasien lama</button>
              </div>
            </Field>
            <div className="form-grid">
              <Field label="Tanggal Mulai Pengobatan" required>
                <input type="date" value={formData.startDate} onChange={e => handleChange("startDate", e.target.value)} required />
              </Field>
              <Field label="Tahap Pengobatan" required>
                <select value={formData.treatmentStage} onChange={e => handleChange("treatmentStage", e.target.value)} required>
                  <option value="Bulan ke-1">Bulan ke-1</option>
                  <option value="Bulan ke-2">Bulan ke-2</option>
                  <option value="Bulan ke-3">Bulan ke-3</option>
                  <option value="Bulan ke-4">Bulan ke-4</option>
                  <option value="Bulan ke-5">Bulan ke-5</option>
                  <option value="Bulan ke-6">Bulan ke-6</option>
                </select>
              </Field>
              {oldPatient ? (
                <>
                  <Field label="Tanggal Kontrol Terakhir" required hint="Tanggal kontrol terakhir yang sebenarnya. Wajib untuk pasien lama.">
                    <input type="date" value={formData.lastControlDate} onChange={e => handleChange("lastControlDate", e.target.value)} required />
                  </Field>
                  <Field label="Tanggal Pemberian Obat Terakhir" required hint="Tanggal obat terakhir benar-benar diberikan. Jadwal kontrol berikutnya dihitung dari tanggal ini.">
                    <input type="date" value={formData.lastMedicationDate} onChange={e => handleChange("lastMedicationDate", e.target.value)} required />
                  </Field>
                </>
              ) : (
                <Field label="Tanggal Kontrol Terakhir" hint="Pasien baru yang kontrol pertama kali hari ini boleh memakai tanggal hari ini. Boleh dikosongkan bila riwayat belum diketahui.">
                  <input type="date" value={formData.lastControlDate} onChange={e => handleChange("lastControlDate", e.target.value)} />
                </Field>
              )}
            </div>
            {oldPatient ? (
              <div className="notice small">
                <Icon name="alert" />
                <span>Untuk pasien lama tidak ada kunjungan obat pertama yang dibuat. Jadwal kontrol berikutnya dihitung dari tanggal obat terakhir; bila hasilnya sudah lewat, jadwal ditandai "Perlu Konfirmasi" dan harus ditetapkan petugas.</span>
              </div>
            ) : (
              <>
                <Field label="Apakah obat pertama sudah diberikan?" required hint="Catatan: pilihan ini menentukan apakah jadwal kontrol awal dibuat.">
                  <div className="tabs compact">
                    <button type="button" className={medicationChoice === "start" ? "active" : ""} onClick={() => setMedicationChoice("start")}>Ya, pada tanggal mulai</button>
                    <button type="button" className={medicationChoice === "other" ? "active" : ""} onClick={() => setMedicationChoice("other")}>Ya, pada tanggal lain</button>
                    <button type="button" className={medicationChoice === "none" ? "active" : ""} onClick={() => setMedicationChoice("none")}>Belum diberikan</button>
                  </div>
                </Field>
                {medicationChoice === "other" && (
                  <Field label="Tanggal Pemberian Obat" required>
                    <input type="date" value={medicineDate} onChange={e => setMedicineDate(e.target.value)} required />
                  </Field>
                )}
                {medicationChoice === "none" && (
                  <div className="notice small">
                    <Icon name="alert" />
                    <span>Jadwal kontrol awal tidak dibuat karena obat belum diberikan. Jadwal baru dibuat saat obat dicatat melalui menu Kontrol.</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === "schedule" && (
          <div className="form-section">
            <h3>Jadwal Kontrol Awal</h3>
            <div className="form-grid">
              <Field label="Perkiraan Jadwal Kontrol (otomatis)" hint={`Estimasi ${controlIntervalDays} hari setelah obat terakhir, dimundurkan ke Rabu/Sabtu sebelumnya. Tanggal final ditentukan server.`}>
                <input type="date" value={scheduleEstimate ?? ""} readOnly placeholder={scheduleNeedsConfirmation ? "Perlu Konfirmasi" : "—"} />
              </Field>
              <Field label="Waktu Minum Obat">
                <input type="time" value={formData.medicineTime} onChange={e => handleChange("medicineTime", e.target.value)} />
              </Field>
            </div>
            {scheduleNeedsConfirmation && (
              <div className="notice small">
                <Icon name="alert" />
                <span>Data riwayat belum cukup untuk menghitung jadwal yang akan datang. Pasien tetap disimpan, tetapi jadwal ditandai "Perlu Konfirmasi" dan harus ditetapkan petugas melalui menu Jadwal Kontrol.</span>
              </div>
            )}
            {!scheduleNeedsConfirmation && scheduleResolution === null && (
              <div className="notice small">
                <Icon name="alert" />
                <span>Obat pertama belum diberikan, sehingga jadwal kontrol tidak dihitung dan tidak dikirim. Pasien tetap dibuat tanpa jadwal aktif.</span>
              </div>
            )}
          </div>
        )}

        {result?.failure && (
          <div className="notice">
            <Icon name="alert" />
            <div>
              <strong>Penyimpanan belum selesai</strong>
              <span>Berhasil disimpan: {result.savedSteps.length ? result.savedSteps.map(s => STEP_LABELS[s]).join(", ") : "belum ada"}. Gagal pada tahap: {STEP_LABELS[result.failure.step]}. {errorMessage(result.failure.error)} Data yang sudah tersimpan tidak dihapus otomatis; periksa dulu sebelum mencoba ulang.</span>
            </div>
          </div>
        )}

        {formError && (
          <div className="notice">
            <Icon name="alert" />
            <div><strong>Gagal menyimpan</strong><span>{formError}</span></div>
          </div>
        )}

        <div className="dialog-actions">
          {edit ? (
            <>
              <Button variant="secondary" onClick={onClose}>Batal</Button>
              <Button type="submit" icon="check" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
            </>
          ) : step === "basic" ? (
            <>
              <Button variant="secondary" onClick={onClose}>Batal</Button>
              <Button type="button" onClick={nextStep} disabled={!formData.registerNumber || !formData.fullName || !formData.medicalRecordNumber || !formData.address}>Lanjut</Button>
            </>
          ) : step === "medication" ? (
            <>
              <Button variant="secondary" onClick={prevStep}>Kembali</Button>
              <Button type="button" onClick={nextStep} disabled={!formData.startDate || (!oldPatient && medicationChoice === "other" && !medicineDate) || (oldPatient && (!formData.lastControlDate || !formData.lastMedicationDate))}>Lanjut</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={prevStep}>Kembali</Button>
              <Button type="submit" icon="check" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Pasien"}</Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}

const IMPORT_STATUS_LABEL: Record<ImportRowResult["status"], string> = {
  valid: "Valid", invalid: "Tidak Valid", duplicate: "Duplikat", imported: "Terimpor", skipped: "Dilewati",
};
const IMPORT_STATUS_TONE: Record<ImportRowResult["status"], string> = {
  valid: "green", invalid: "red", duplicate: "yellow", imported: "green", skipped: "yellow",
};
const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

function ImportRowList({ rows }: { rows: ImportRowResult[] }) {
  if (rows.length === 0) return <p className="muted-note">Tidak ada baris data pada berkas.</p>;
  return <div className="mini-table">{rows.map(row => <div key={row.rowNumber}><b>Baris {row.rowNumber}</b><span>{row.fullName || row.registerNumber || "—"}{row.errors.length > 0 ? ` • ${row.errors.join("; ")}` : ""}</span><Badge tone={IMPORT_STATUS_TONE[row.status]}>{IMPORT_STATUS_LABEL[row.status]}</Badge></div>)}</div>;
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const api = useControlApi();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportConfirmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pickFile = (selected: File | null) => {
    setPreview(null);
    setResult(null);
    setError("");
    if (selected && !selected.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setError("Berkas harus berformat .xlsx.");
      return;
    }
    if (selected && selected.size > IMPORT_MAX_BYTES) {
      setFile(null);
      setError("Ukuran berkas melebihi 10 MB.");
      return;
    }
    setFile(selected);
    setStep(1);
  };

  const downloadTemplate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { blob, filename } = await api.downloadPatientTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.validatePatientImport(file);
      setPreview(data);
      setStep(2);
    } catch (validateError) {
      setError(errorMessage(validateError));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || busy) return;
    if (preview.validRows.length === 0) { setError("Tidak ada baris valid yang dapat diimpor."); return; }
    setBusy(true);
    setError("");
    try {
      const data = await api.confirmPatientImport(preview.validRows);
      setResult(data);
      setStep(3);
      onDone(data.imported > 0 ? `${data.imported} data pasien berhasil diimpor.` : "Tidak ada data pasien yang diimpor.");
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  };

  return <Dialog title="Impor Data Pasien" subtitle="Tambahkan beberapa pasien sekaligus dari file Excel." onClose={onClose} wide>
    <div className="steps"><span className={step >= 1 ? "active" : ""}><b>1</b>Unggah File</span><i /><span className={step >= 2 ? "active" : ""}><b>2</b>Validasi Data</span><i /><span className={step >= 3 ? "active" : ""}><b>3</b>Konfirmasi</span></div>
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
    {step === 1 && <>
      <div className="upload-zone">
        <div className="upload-icon"><Icon name="upload" /></div>
        <strong>{file ? file.name : "Pilih file Excel data pasien"}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(0)} KB siap divalidasi` : "Format .xlsx, maksimal 10 MB"}</span>
        <label className="btn btn-secondary"><Icon name="upload" size={16} />Pilih File .xlsx<input type="file" accept=".xlsx" hidden onChange={e => pickFile(e.target.files?.[0] ?? null)} /></label>
      </div>
      <div className="info-box"><Icon name="file" /><div><strong>Gunakan format yang sesuai</strong><span>Kolom wajib: Nomor Register, Nama Lengkap, Nomor Rekam Medis, Alamat. Kolom lain bersifat opsional.</span></div><button type="button" className="text-link" onClick={downloadTemplate} disabled={busy}>Unduh template</button></div>
    </>}
    {step === 2 && preview && <>
      <div className="import-summary"><div><strong>{preview.total}</strong><span>Total baris</span></div><div className="valid"><strong>{preview.valid}</strong><span>Data valid</span></div><div className="invalid"><strong>{preview.invalid}</strong><span>Perlu diperbaiki</span></div><div><strong>{preview.duplicate}</strong><span>Duplikat</span></div></div>
      <ImportRowList rows={preview.rows} />
      <p className="muted-note">Hanya {preview.valid} data valid yang akan disimpan. Data tidak valid dan duplikat tidak diimpor.</p>
    </>}
    {step === 3 && result && <div className="confirm-import">
      <div className="success-circle"><Icon name="check" size={28} /></div>
      <h3>{result.imported > 0 ? "Impor selesai" : "Tidak ada data diimpor"}</h3>
      <p>{result.imported} pasien ditambahkan, {result.invalid} tidak valid, {result.duplicate} duplikat, {result.skipped} dilewati.</p>
      <div className="confirm-file"><Icon name="file" /><div><strong>{file?.name ?? "Berkas impor"}</strong><span>{result.total} baris diproses</span></div></div>
      <ImportRowList rows={result.rows} />
    </div>}
    <div className="dialog-actions">
      {step === 1 && <><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={validate} disabled={!file || busy}>{busy ? "Memvalidasi…" : "Unggah & Validasi"}</Button></>}
      {step === 2 && <><Button variant="secondary" onClick={() => setStep(1)}>Kembali</Button><Button onClick={confirm} disabled={busy || (preview?.validRows.length ?? 0) === 0}>{busy ? "Menyimpan…" : "Konfirmasi Impor"}</Button></>}
      {step === 3 && <Button onClick={onClose}>Selesai</Button>}
    </div>
  </Dialog>;
}

function toVisitRow(visit: ApiVisit): ControlVisit {
  const note = [visit.complaintProgress, visit.additionalNote]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" • ") || "—";
  return {
    date: formatDate(visit.visitDate),
    medicine: visit.medicineGiven ? "Obat diberikan" : "Tanpa pemberian obat",
    medicineDate: visit.medicationGivenOn ? formatDate(visit.medicationGivenOn) : undefined,
    note,
  };
}

/** Loads a patient's real visit history from GET /patients/:id/visits. */
function VisitHistory({ patientId }: { patientId: string }) {
  const api = useControlApi();
  const [visits, setVisits] = useState<ControlVisit[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestRef.current;
    setState("loading");
    setError("");
    setVisits([]);
    try {
      const data = await api.listVisits(patientId, signal);
      if (requestId !== requestRef.current) return;
      setVisits(data.map(toVisitRow));
      setState("ready");
    } catch (err) {
      if (signal?.aborted || requestId !== requestRef.current) return;
      setError(errorMessage(err));
      setState("error");
    }
  }, [api, patientId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state === "loading") return <p className="muted-note">Memuat riwayat kunjungan…</p>;
  if (state === "error") return <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat riwayat</strong><span>{error} <button className="text-link" type="button" onClick={() => { void load(); }}>Coba lagi</button></span></div></div>;
  if (visits.length === 0) return <p className="muted-note">Belum ada kunjungan tercatat untuk pasien ini.</p>;
  return <ControlTimeline visits={visits} />;
}

/**
 * Staff-only action to issue a one-time patient activation code.
 *
 * The issued code lives only in this component's state: it is never written to
 * localStorage/sessionStorage, never logged, and disappears when the detail
 * dialog is closed, so a reopened dialog never shows a stale code as if it were
 * still valid. Only the backend can tell whether a code has expired or been used.
 */
function ActivationCodeSection({ patientId, patientName }: { patientId: string; patientName: string }) {
  const api = useControlApi();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [issued, setIssued] = useState<ActivationCode | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const issue = async () => {
    if (state === "loading") return;
    setState("loading");
    setError("");
    setCopyState("idle");
    try {
      const result = await api.issueActivationCode(patientId);
      setIssued(result);
      setState("ready");
    } catch (issueError) {
      setIssued(null);
      setError(errorMessage(issueError));
      setState("error");
    }
  };

  const copy = async () => {
    if (!issued) return;
    const ok = await copyTextToClipboard(issued.activationCode);
    setCopyState(ok ? "copied" : "failed");
  };

  return (
    <section className="history-section activation-section">
      <div className="section-heading">
        <h2>Kode Aktivasi Aplikasi Pasien</h2>
        <p>Terbitkan kode sekali pakai untuk mengaktifkan aplikasi Dinar-TB di ponsel {patientName}.</p>
      </div>
      {state === "ready" && issued ? (
        <div className="activation-result">
          <div className="activation-code-box">
            <span>Kode aktivasi</span>
            <code className="activation-code">{issued.activationCode}</code>
            <small>Berlaku sampai {formatActivationExpiry(issued.expiresAt)}</small>
          </div>
          <div className="activation-actions">
            <Button variant="secondary" onClick={copy}>{copyState === "copied" ? "Kode tersalin" : copyState === "failed" ? "Salin manual" : "Salin kode"}</Button>
            <Button icon="lock" onClick={issue}>Terbitkan Kode Baru</Button>
          </div>
          {copyState === "failed" && <small>Penyalinan otomatis gagal. Salin kode di atas secara manual.</small>}
          <div className="info-box">
            <Icon name="alert" />
            <div>
              <strong>Kode hanya dapat dipakai sekali</strong>
              <span>Kode berlaku 24 jam dan tidak berlaku lagi setelah dipakai. Serahkan hanya kepada pasien. Menerbitkan kode baru akan membatalkan kode ini.</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="info-box">
            <Icon name="lock" />
            <div>
              <strong>Kode aktif 24 jam dan sekali pakai</strong>
              <span>Kode dipakai sekali untuk mengaktifkan aplikasi pada satu ponsel pasien. Kode tidak disimpan dashboard dan tidak ditampilkan lagi setelah dialog ditutup.</span>
            </div>
          </div>
          {state === "error" && (
            <div className="notice">
              <Icon name="alert" />
              <div><strong>Gagal menerbitkan kode</strong><span>{error}</span></div>
            </div>
          )}
          <div className="activation-actions">
            <Button icon="lock" onClick={issue} disabled={state === "loading"}>{state === "loading" ? "Menerbitkan…" : "Terbitkan Kode Aktivasi"}</Button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Authorized staff flow for the final treatment review.
 *
 * The decision (Selesai/Dilanjutkan) is always an explicit staff choice — it is
 * never derived from dates or reminders. Backend enforces the note and, for
 * Dilanjutkan, the continued target date; this form mirrors those rules so the
 * staff get immediate feedback instead of a failed request.
 */
function TreatmentReview({ patientId }: { patientId: string }) {
  const api = useControlApi();
  const [treatments, setTreatments] = useState<ApiTreatment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [target, setTarget] = useState<ApiTreatment | null>(null);
  const [decision, setDecision] = useState<"Selesai" | "Dilanjutkan">("Selesai");
  const [note, setNote] = useState("");
  const [continuedTargetEndDate, setContinuedTargetEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const data = await api.listTreatments(patientId, signal);
      if (signal?.aborted) return;
      setTreatments(data);
      setState("ready");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(errorMessage(loadError));
      setState("error");
    }
  }, [api, patientId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const open = (treatment: ApiTreatment) => {
    setTarget(treatment);
    setDecision("Selesai");
    setNote("");
    setContinuedTargetEndDate("");
    setFormError("");
    setMessage("");
  };

  const close = () => {
    if (!busy) setTarget(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    if (!note.trim()) {
      setFormError("Keterangan tinjauan wajib diisi.");
      return;
    }
    if (decision === "Dilanjutkan" && !continuedTargetEndDate) {
      setFormError("Tanggal target lanjutan wajib diisi untuk keputusan Dilanjutkan.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const updated = await api.reviewTreatment(target.id, {
        decision,
        note: note.trim(),
        ...(decision === "Dilanjutkan" ? { continuedTargetEndDate } : {}),
      });
      setTreatments(prev => prev.map(item => item.id === updated.id ? updated : item));
      setTarget(null);
      setMessage(`Keputusan "${decision}" tersimpan.`);
    } catch (reviewError) {
      setFormError(errorMessage(reviewError));
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return <p className="muted-note">Memuat data pengobatan…</p>;
  if (state === "error") return <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat pengobatan</strong><span>{error} <button className="text-link" type="button" onClick={() => { void load(); }}>Coba lagi</button></span></div></div>;
  if (treatments.length === 0) return <p className="muted-note">Belum ada data pengobatan untuk pasien ini.</p>;

  return (
    <section className="history-section">
      <div className="section-heading"><h2>Tinjauan Akhir Pengobatan</h2><p>Keputusan Selesai/Dilanjutkan ditetapkan oleh petugas berwenang, bukan otomatis dari tanggal.</p></div>
      {message && <div className="notice small"><Icon name="check" /><span>{message}</span></div>}
      {treatments.map(treatment => {
        const due = Boolean(treatment.reviewDue) && !treatment.completedAt;
        const statusLabel = treatment.completedAt ? "Selesai" : due ? "Perlu tinjauan akhir" : "Sedang berjalan";
        return (
          <div key={treatment.id} className="detail-grid">
            <div><span>Mulai Pengobatan</span><strong>{formatJakartaShortDate(treatment.startDate)}</strong></div>
            <div><span>Tahap Pengobatan</span><strong>{treatment.treatmentStage || "—"}</strong></div>
            <div><span>Bulan Pengobatan</span><strong>{treatment.treatmentMonth ? `Bulan ke-${treatment.treatmentMonth}` : "—"}</strong></div>
            <div><span>Status Pengobatan</span><strong>{statusLabel}</strong></div>
            <div><span>Keputusan Akhir</span><strong>{treatment.finalDecision || "Belum ditinjau"}</strong></div>
            {!treatment.completedAt && !treatment.finalDecision && (treatment.finalReviewEligible
              ? <div><span>Tindakan</span><Button icon="check" onClick={() => open(treatment)}>Tinjauan Akhir</Button></div>
              : <div><span>Tindakan</span><strong>Tinjauan tersedia mulai bulan ke-6</strong></div>)}
          </div>
        );
      })}
      {target && (
        <Dialog title="Tinjauan Akhir Pengobatan" subtitle={`Mulai ${formatJakartaShortDate(target.startDate)}`} onClose={close}>
          <form onSubmit={submit}>
            <Field label="Keputusan" required>
              <select value={decision} onChange={event => setDecision(event.target.value as "Selesai" | "Dilanjutkan")}>
                <option value="Selesai">Selesai</option>
                <option value="Dilanjutkan">Dilanjutkan</option>
              </select>
            </Field>
            {decision === "Dilanjutkan" && <Field label="Tanggal Target Lanjutan" required><input type="date" value={continuedTargetEndDate} onChange={event => setContinuedTargetEndDate(event.target.value)} required /></Field>}
            <Field label="Keterangan Tinjauan" required><textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={4000} placeholder="Ringkasan hasil tinjauan pengobatan" /></Field>
            {formError && <div className="notice small"><Icon name="alert" /><span>{formError}</span></div>}
            <div className="dialog-actions"><Button variant="secondary" onClick={close}>Batal</Button><Button type="submit" icon="check" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Keputusan"}</Button></div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function PatientDetail({ patient, onClose, onEdit }: { patient: PatientRow; onClose: () => void; onEdit: () => void }) {
  const details: [string, string][] = [["Nomor Register", patient.reg], ["Nama Lengkap", patient.name], ["Nomor Rekam Medis", patient.medicalRecordNumber], ["Tanggal Lahir", patient.dateOfBirth ? formatJakartaShortDate(patient.dateOfBirth) : "—"], ["Jenis Kelamin", patient.gender || "—"], ["Nomor Telepon", patient.phone || "—"], ["Alamat", patient.address], ["Mulai Pengobatan", patient.startDate ? formatJakartaShortDate(patient.startDate) : "—"], ["Tahap Pengobatan", patient.treatmentStage || "—"], ["Kontrol Berikutnya", patient.scheduleDate ? formatJakartaShortDate(patient.scheduleDate) : "—"]];
  return <Dialog title="Detail Pasien" subtitle={patient.reg} onClose={onClose} wide><div className="profile-head"><div className="large-avatar">{patient.name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><h3>{patient.name}</h3><span>Pasien pengobatan TB</span></div>{patient.status ? <Badge tone={statusTone(patient.status)}>{patient.status}</Badge> : null}</div><div className="detail-grid">{details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><ActivationCodeSection patientId={patient.id} patientName={patient.name} /><TreatmentReview patientId={patient.id} /><div className="history-section"><div className="section-heading"><h2>Riwayat Kontrol</h2><p>Semua kunjungan tetap tercatat pada profil pasien yang sama.</p></div><VisitHistory patientId={patient.id} /></div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Tutup</Button><Button icon="edit" onClick={onEdit}>Edit Data</Button></div></Dialog>;
}

function ArchiveDialog({ onClose, notify, onRestored }: { onClose: () => void; notify: (s: string) => void; onRestored: () => void }) {
  const api = useControlApi();
  const [rows, setRows] = useState<ApiPatient[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ApiPatient | null>(null);
  const [purgeError, setPurgeError] = useState("");
  const [purging, setPurging] = useState(false);
  const selected = selectedId ? rows.find(row => row.id === selectedId) ?? null : null;

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const data = await api.listArchivedPatients("", signal);
      if (signal?.aborted) return;
      setRows(data);
      setState("ready");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(errorMessage(loadError));
      setState("error");
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const restore = async () => {
    if (!selected || busyId) return;
    const target = selected;
    setBusyId(target.id);
    try {
      await api.restorePatient(target.id);
      setSelectedId(null);
      setRows(prev => prev.filter(row => row.id !== target.id));
      notify(`Data ${target.fullName} dipulihkan ke daftar pasien aktif.`);
      onRestored();
    } catch (restoreError) {
      notify(errorMessage(restoreError));
    } finally {
      setBusyId(null);
    }
  };

  const purge = async () => {
    if (!purgeTarget || purging) return;
    const target = purgeTarget;
    setPurging(true);
    setPurgeError("");
    try {
      await api.purgePatient(target.id);
      setRows(prev => prev.filter(row => row.id !== target.id));
      setPurgeTarget(null);
      notify(`Data ${target.fullName} dihapus permanen.`);
      onRestored();
    } catch (purgeFailure) {
      setPurgeError(errorMessage(purgeFailure));
    } finally {
      setPurging(false);
    }
  };

  return <>
    <Dialog title="Arsip Pasien" subtitle="Pilih pasien untuk melihat detail dan memulihkannya. Pasien yang dinonaktifkan tetap menyimpan seluruh riwayat." onClose={onClose} wide>
      {state === "loading" ? <p className="muted-note">Memuat arsip…</p>
        : state === "error" ? <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat arsip</strong><span>{error} <button className="text-link" type="button" onClick={() => { void load(); }}>Coba lagi</button></span></div></div>
          : rows.length === 0 ? <p className="muted-note">Tidak ada pasien dalam arsip.</p>
            : <div className="archive-list">{rows.map(patient => {
              const isSelected = selectedId === patient.id;
              return <div key={patient.id} className={`archive-item ${isSelected ? "selected" : ""}`}>
                <button type="button" className="archive-select" aria-pressed={isSelected} onClick={() => setSelectedId(prev => (prev === patient.id ? null : patient.id))}>
                  <strong>{patient.fullName}</strong>
                  <span>{patient.registerNumber} • {patient.medicalRecordNumber}</span>
                </button>
                <button type="button" className="archive-purge" aria-label={`Hapus permanen ${patient.fullName}`} title="Hapus permanen" onClick={() => { setPurgeError(""); setPurgeTarget(patient); }} disabled={busyId === patient.id || purging}>
                  <Icon name="trash" size={16} />
                </button>
              </div>;
            })}</div>}
      {selected && <div className="archive-detail">
        <div className="profile-head"><div className="large-avatar">{initialsFrom(selected.fullName)}</div><div><h3>{selected.fullName}</h3><span>{selected.registerNumber} • {selected.medicalRecordNumber}</span></div></div>
        <div className="detail-grid">
          <div><span>Tanggal Lahir</span><strong>{selected.dateOfBirth ? formatJakartaShortDate(selected.dateOfBirth) : "—"}</strong></div>
          <div><span>Jenis Kelamin</span><strong>{selected.gender || "—"}</strong></div>
          <div><span>Nomor Telepon</span><strong>{selected.phone || "—"}</strong></div>
          <div><span>Alamat</span><strong>{selected.address || "—"}</strong></div>
        </div>
        <div className="archive-detail-actions"><Button icon="check" onClick={() => { void restore(); }} disabled={busyId === selected.id}>{busyId === selected.id ? "Memulihkan…" : "Pulihkan"}</Button></div>
      </div>}
      <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Tutup</Button></div>
    </Dialog>
    {purgeTarget && <Dialog title="Hapus permanen pasien ini?" subtitle="Tindakan ini tidak dapat dibatalkan." onClose={() => { if (!purging) { setPurgeTarget(null); setPurgeError(""); } }}>
      <div className="confirm-delete"><div className="alert-circle"><Icon name="trash" /></div><p>Data identitas <strong>{purgeTarget.fullName}</strong> ({purgeTarget.registerNumber}) akan dihapus permanen dan tidak dapat dipulihkan. Riwayat medis yang wajib disimpan tetap tersimpan tanpa identitas pasien.</p></div>
      {purgeError && <div className="notice small"><Icon name="alert" /><span>{purgeError}</span></div>}
      <div className="dialog-actions"><Button variant="secondary" onClick={() => { setPurgeTarget(null); setPurgeError(""); }} disabled={purging}>Batal</Button><Button variant="danger" onClick={() => { void purge(); }} disabled={purging}>{purging ? "Menghapus…" : "Ya, hapus permanen"}</Button></div>
    </Dialog>}
  </>;
}

function PatientsPage({ notify, addActivity, initialQuery = "", searchNonce = 0 }: { notify: (s: string) => void; addActivity: () => void; initialQuery?: string; searchNonce?: number }) {
  const api = useControlApi();
  const [viewAll, setViewAll] = useState(false);
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [stats, setStats] = useState<PatientStats | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState("Semua");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [detail, setDetail] = useState<PatientRow | null>(null);
  const [edit, setEdit] = useState<PatientRow | null>(null);
  const [add, setAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<PatientRow | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const latestRequest = useRef(0);

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api.getPatientStats(signal);
      if (!signal?.aborted) setStats(data);
    } catch {
      /* keep the previous stats rather than showing invented numbers */
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStats(controller.signal);
    return () => controller.abort();
  }, [loadStats]);

  const loadPatients = useCallback(async (term: string, signal?: AbortSignal, pageNumber = page, statusFilter = status): Promise<PatientRow[]> => {
    const requestId = ++latestRequest.current;
    setListState("loading");
    setListError("");
    try {
      const data = await api.listPatientDirectory(term, pageNumber, 20, statusFilter, signal);
      if (requestId !== latestRequest.current) return [];
      const mapped = data.items.map(toPatientRow);
      setRows(mapped);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setListState("ready");
      return mapped;
    } catch (error) {
      if (signal?.aborted || requestId !== latestRequest.current) return [];
      setListError(errorMessage(error));
      setListState("error");
      return [];
    }
  }, [api, page, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void loadPatients(query, controller.signal, page, status); }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, status, page, loadPatients]);

  // Applies a topbar search request (even if the term repeats) to the list query.
  useEffect(() => {
    setPage(1);
    setQuery(initialQuery);
  }, [initialQuery, searchNonce]);

  const handleCreate = async (intake: PatientIntakeInput): Promise<IntakeSaveResult> => {
    const result = await savePatientIntake(api, intake);
    if (!result.failure) {
      addActivity();
      notify("Pasien baru berhasil ditambahkan.");
      const mapped = await loadPatients(query);
      void loadStats();
      const row = result.patientId ? mapped.find(item => item.id === result.patientId) : undefined;
      if (row) setDetail(row);
      else if (result.patientId) {
        try {
          const fresh = await api.getPatient(result.patientId);
          setDetail({
            id: fresh.id, reg: fresh.registerNumber, name: fresh.fullName,
            medicalRecordNumber: fresh.medicalRecordNumber, address: fresh.address, version: fresh.version,
            dateOfBirth: fresh.dateOfBirth ?? "", gender: fresh.gender ?? "", phone: fresh.phone ?? "",
            treatmentStage: intake.treatment.treatmentStage, startDate: intake.treatment.startDate,
            scheduleDate: "", status: "",
          });
        } catch {
          /* list refresh already covers the new patient */
        }
      }
    }
    return result;
  };

  const handleSaveEdit = async (identity: PatientIdentity): Promise<{ ok: boolean; error?: unknown }> => {
    if (!edit) return { ok: false, error: new Error("Pasien tidak dipilih.") };
    try {
      const updated = await api.updatePatient(edit.id, identityPatch(identity, edit.version));
      setRows(prev => prev.map(r => (r.id === updated.id ? applyPatientUpdate(r, updated) : r)));
      setDetail(prev => (prev && prev.id === updated.id ? applyPatientUpdate(prev, updated) : prev));
      setEdit(prev => (prev && prev.id === updated.id ? applyPatientUpdate(prev, updated) : prev));
      addActivity();
      notify("Perubahan data pasien berhasil disimpan.");
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await loadPatients(query);
      return { ok: false, error };
    }
  };

  const handleArchive = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await api.archivePatient(target.id);
      setRows(prev => prev.filter(r => r.id !== target.id));
      setDetail(prev => (prev && prev.id === target.id ? null : prev));
      addActivity();
      void loadStats();
      notify(`Data ${target.name} dinonaktifkan. Pulihkan dari menu Arsip Pasien bila diperlukan.`);
    } catch (error) {
      notify(errorMessage(error));
    }
  };

  const handleImportDone = (message: string) => {
    addActivity();
    void loadStats();
    void loadPatients(query);
    notify(message);
  };

  return <>
    <PageTitle title={viewAll ? "Direktori Pasien" : "Data Pasien"} subtitle={viewAll ? "Cari dan kelola seluruh data pasien TBC terdaftar." : "Pantau informasi dan perkembangan pasien dalam satu tempat."} action={<div className="action-group">{viewAll && <Button variant="secondary" onClick={() => setViewAll(false)}>Kembali</Button>}<Button variant="secondary" onClick={() => setArchiveOpen(true)}>Arsip Pasien</Button><Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>Impor Excel</Button><Button icon="plus" onClick={() => setAdd(true)}>Tambah Pasien</Button></div>} />
    {!viewAll && <div className="stats-grid"><StatCard label="Total Pasien" value={stats ? stats.total : "—"} icon="users" /><StatCard label="Kontrol Sesuai" value={stats ? stats.sesuai : "—"} icon="check" tone="teal" /><StatCard label="Jadwal Dekat" value={stats ? stats.dekat : "—"} icon="clock" tone="yellow" /><StatCard label="Terlambat" value={stats ? stats.terlambat : "—"} icon="alert" tone="red" /></div>}
    <section className="card no-pad"><div className="card-head table-title"><div><h2>{viewAll ? "Semua Pasien" : "Data Pasien TBC"}</h2><p>{viewAll ? `${stats ? stats.total : "—"} pasien terdaftar` : "Pasien dengan jadwal kontrol terdekat"}</p></div>{!viewAll && <button className="text-link" onClick={() => setViewAll(true)}>Lihat selengkapnya →</button>}</div><PatientTable expanded={viewAll} rows={rows} loading={listState === "loading"} error={listState === "error" ? listError : ""} onRetry={() => { void loadPatients(query); }} query={query} onQuery={value => { setPage(1); setQuery(value); }} status={status} onStatus={value => { setPage(1); setStatus(value); }} page={page} total={total} totalPages={totalPages} onPage={setPage} onDetail={setDetail} onEdit={setEdit} onDelete={setDeleting} /></section>
    {detail && <PatientDetail key={detail.id} patient={detail} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}
    {edit && <PatientForm edit={edit} onClose={() => setEdit(null)} onSave={() => Promise.reject(new Error("Mode tambah tidak dipakai saat mengedit."))} onSaveEdit={handleSaveEdit} />}
    {add && <PatientForm onClose={() => setAdd(false)} onSave={handleCreate} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onDone={handleImportDone} />}
    {archiveOpen && <ArchiveDialog onClose={() => setArchiveOpen(false)} notify={notify} onRestored={() => { void loadStats(); void loadPatients(query); }} />}
    {deleting && <Dialog title="Nonaktifkan data pasien?" subtitle="Pasien dinonaktifkan, bukan dihapus permanen." onClose={() => setDeleting(null)}><div className="confirm-delete"><div className="alert-circle"><Icon name="trash" /></div><p>Data <strong>{deleting.name}</strong> dengan nomor register <strong>{deleting.reg}</strong> akan dinonaktifkan dari daftar pasien. Seluruh riwayat pengobatan dan kunjungan tetap tersimpan dan data dapat dipulihkan dari menu Arsip Pasien.</p></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>Batal</Button><Button variant="danger" onClick={handleArchive}>Ya, Nonaktifkan Pasien</Button></div></Dialog>}
  </>;
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function nextControlDate(medicineDate: string, intervalDays = 14) {
  if (!medicineDate) return "";
  const date = new Date(`${medicineDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + intervalDays);
  while (![3, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function ControlTimeline({ visits }: { visits: ControlVisit[] }) {
  return <div className="timeline">{visits.map((visit, i) => <div key={`${visit.date}-${i}`}><i className={visit.medicine === "Tanpa pemberian obat" ? "muted" : ""} /><div><div className="timeline-title"><strong>{visit.date}</strong>{visit.type ? <Badge tone={visit.type.includes("Luar") ? "yellow" : "blue"}>{visit.type}</Badge> : null}</div><span>{visit.medicine}{visit.medicineDate ? ` • ${visit.medicineDate}` : ""}{visit.scheduleUpdate ? ` • ${visit.scheduleUpdate}` : ""}</span><p>{visit.note}</p></div></div>)}</div>;
}

type ControlRow = { scheduleId: string | null; treatmentCourseId: string; id: string; reg: string; name: string; address: string; scheduledDate: string; status: string };

function todayIso() {
  return jakartaToday();
}

function patientStripInfo(patient: ControlRow) {
  return `${patient.reg} • ${patient.address || "Alamat belum tercatat"}`;
}

function FindActiveTreatment(api: ReturnType<typeof useControlApi>, patientId: string, signal?: AbortSignal): Promise<ApiTreatment | null> {
  return api.listTreatments(patientId, signal).then(treatments => treatments.find(treatment => !treatment.completedAt) ?? null);
}

function RecordVisitDialog({ api, initialPatient, source, notify, addActivity, onClose, onSaved }: { api: ReturnType<typeof useControlApi>; initialPatient: ControlRow | null; source: "table" | "new"; notify: (s: string) => void; addActivity: () => void; onClose: () => void; onSaved: () => void }) {
  const controlIntervalDays = useControlIntervalDays();
  const [patient, setPatient] = useState<ControlRow | null>(initialPatient);
  const [patientQuery, setPatientQuery] = useState("");
  const [matches, setMatches] = useState<ControlRow[]>([]);
  const [treatment, setTreatment] = useState<ApiTreatment | null>(null);
  const [treatmentState, setTreatmentState] = useState<"idle" | "loading" | "ready" | "none" | "error">(initialPatient ? "loading" : "idle");
  const [scheduleDate, setScheduleDate] = useState("");
  const [medicine, setMedicine] = useState("Ya");
  const [visitDate, setVisitDate] = useState(todayIso());
  const [medicineDate, setMedicineDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"" | "Selesai" | "Dilanjutkan">("");
  const [reviewNote, setReviewNote] = useState("");
  const [continuedTargetEndDate, setContinuedTargetEndDate] = useState("");
  const [visitSaved, setVisitSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reviewEligible = Boolean(treatment?.finalReviewEligible);
  const treatmentMonth = treatment?.treatmentMonth ?? 0;

  useEffect(() => {
    if (!patient) { setTreatmentState("idle"); setTreatment(null); setScheduleDate(""); return; }
    const controller = new AbortController();
    setTreatmentState("loading");
    setError("");
    setVisitSaved(false);
    setDecision("");
    setReviewNote("");
    setContinuedTargetEndDate("");
    (async () => {
      try {
        const active = await FindActiveTreatment(api, patient.id, controller.signal);
        if (controller.signal.aborted) return;
        if (!active) { setTreatment(null); setTreatmentState("none"); return; }
        setTreatment(active);
        try {
          const schedule = await api.getSchedule(active.id, controller.signal);
          if (controller.signal.aborted) return;
          setScheduleDate(schedule.scheduledDate);
        } catch (scheduleError) {
          if (controller.signal.aborted) return;
          if (scheduleError instanceof ApiError && scheduleError.status === 404) setScheduleDate("");
          else throw scheduleError;
        }
        setTreatmentState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError));
        setTreatmentState("error");
      }
    })();
    return () => controller.abort();
  }, [api, patient]);

  useEffect(() => {
    if (patient || source !== "new") { setMatches([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.listPatients(patientQuery, controller.signal)
        .then(list => { if (!controller.signal.aborted) setMatches(list.map(item => ({ scheduleId: null, treatmentCourseId: "", id: item.id, reg: item.registerNumber, name: item.fullName, address: item.address, scheduledDate: "", status: "" }))); })
        .catch(() => { if (!controller.signal.aborted) setMatches([]); });
    }, patientQuery ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, patient, patientQuery, source]);

  const calculatedSchedule = medicine === "Ya" ? nextControlDate(medicineDate, controlIntervalDays) : scheduleDate;
  // A schedule derived from a medication date in the past cannot be stored; the
  // backend flags it as needing confirmation instead of showing it as missed.
  const calculatedInPast = medicine === "Ya" && Boolean(calculatedSchedule) && calculatedSchedule < todayIso();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!treatment) { setError("Pasien belum memiliki pengobatan aktif sehingga kunjungan tidak dapat dicatat."); return; }
    if (reviewEligible && !decision) {
      setError("Pilih keputusan akhir pengobatan: Selesai atau Dilanjutkan.");
      return;
    }
    if (reviewEligible && !reviewNote.trim()) {
      setError("Keterangan tinjauan wajib diisi untuk keputusan akhir pengobatan.");
      return;
    }
    if (reviewEligible && decision === "Dilanjutkan" && !continuedTargetEndDate) {
      setError("Tanggal target lanjutan wajib diisi untuk keputusan Dilanjutkan.");
      return;
    }
    setSaving(true);
    let visitCreated = false;
    try {
      if (!visitSaved) {
        await api.createVisit(treatment.id, medicine === "Ya"
          ? { visitDate, medicineGiven: true, medicationGivenOn: medicineDate, ...(note.trim() ? { additionalNote: note.trim() } : {}) }
          : { visitDate, medicineGiven: false, ...(note.trim() ? { additionalNote: note.trim() } : {}) });
        visitCreated = true;
        setVisitSaved(true);
        // Refresh the control table now, so a failed final-review retry cannot
        // leave officers looking at the pre-visit schedule.
        onSaved();
      }
      if (reviewEligible) {
        await api.reviewTreatment(treatment.id, {
          decision: decision as "Selesai" | "Dilanjutkan",
          note: reviewNote.trim(),
          ...(decision === "Dilanjutkan" ? { continuedTargetEndDate } : {}),
        });
      }
      addActivity();
      const scheduleMessage = medicine === "Ya"
        ? (calculatedInPast
          ? "Kontrol tersimpan. Jadwal berikutnya belum dapat dihitung dari tanggal obat — perlu konfirmasi tanggal kontrol terakhir."
          : `Kontrol tersimpan. Jadwal berikutnya ${formatDate(calculatedSchedule)}.`)
        : "Kontrol tersimpan. Jadwal lama tetap berlaku.";
      const decisionMessage = reviewEligible
        ? (decision === "Selesai"
          ? " Pengobatan ditandai selesai dan pengingat pasien dihentikan."
          : " Pengobatan dilanjutkan tanpa perpanjangan otomatis.")
        : "";
      notify(`${scheduleMessage}${decisionMessage}`);
      onSaved();
      onClose();
    } catch (saveError) {
      setError(visitCreated || visitSaved
        ? `Kunjungan sudah tersimpan, tetapi keputusan akhir belum tersimpan. ${errorMessage(saveError)} Silakan simpan ulang keputusan.`
        : errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return <Dialog title="Tambah/Catat Kontrol" subtitle="Catat kunjungan aktual untuk pasien yang sudah terdaftar. Formulir ini tidak membuat pasien baru." onClose={onClose} wide><form onSubmit={submit}>{!patient && <div className="patient-search"><Field label="Cari pasien dengan nama atau nomor register" required><Search value={patientQuery} onChange={setPatientQuery} placeholder="Ketik nama atau nomor register..." /></Field><div className="patient-results">{matches.map(match => <button type="button" className="" key={match.id} onClick={() => setPatient(match)}><div className="patient-avatar">{match.name.split(" ").map(n => n[0]).slice(0, 2)}</div><span><strong>{match.name}</strong><small>{match.reg}</small></span></button>)}</div></div>}{patient && <div className="patient-strip"><div className="patient-avatar">{patient.name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><strong>{patient.name}</strong><span>{patientStripInfo(patient)}{treatmentMonth > 0 ? ` • Bulan ke-${treatmentMonth} pengobatan` : ""}</span></div></div>}{treatmentState === "none" && <div className="notice small"><Icon name="alert" /><span>Pasien ini belum memiliki pengobatan TB aktif, sehingga kunjungan kontrol tidak dapat dicatat.</span></div>}{treatmentState === "error" && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<div className="form-grid">
      <Field label="Jadwal Kontrol Saat Ini"><input type="date" value={scheduleDate} readOnly /></Field><Field label="Tanggal Kunjungan Aktual" required hint="Tanggal kontrol sebenarnya. Boleh hari ini atau tanggal lampau untuk rekapan; tidak boleh tanggal mendatang."><input type="date" value={visitDate} max={todayIso()} onChange={e => setVisitDate(e.target.value)} disabled={visitSaved} required /></Field>
      <Field label="Obat diberikan?" required><div className="segmented"><button type="button" disabled={visitSaved} onClick={() => setMedicine("Ya")} className={medicine === "Ya" ? "active" : ""}>Ya</button><button type="button" disabled={visitSaved} onClick={() => setMedicine("Tidak")} className={medicine === "Tidak" ? "active" : ""}>Tidak</button></div></Field>
      <Field label="Tanggal Pemberian Obat" required={medicine === "Ya"}><input type="date" value={medicine === "Ya" ? medicineDate : ""} max={todayIso()} onChange={e => setMedicineDate(e.target.value)} disabled={medicine === "Tidak" || visitSaved} required={medicine === "Ya"} /></Field>
      <Field label="Jadwal Kontrol Berikutnya" hint={medicine === "Ya" ? (calculatedInPast ? "Tanggal obat menghasilkan jadwal yang sudah lewat sehingga tidak disimpan. Konfirmasi tanggal kontrol terakhir lalu tetapkan jadwal." : `Otomatis: ${controlIntervalDays} hari dari pemberian obat, dimundurkan ke Rabu/Sabtu sebelumnya.`) : "Jadwal lama tetap berlaku karena obat tidak diberikan."}><input type="date" value={calculatedInPast ? "" : calculatedSchedule} readOnly placeholder={calculatedInPast ? "Perlu Konfirmasi" : ""} /></Field>
      <Field label="Catatan Kunjungan"><textarea value={note} onChange={e => setNote(e.target.value)} disabled={visitSaved} placeholder="Tambahkan catatan petugas..." rows={3} /></Field>
    </div><div className={`rule-box ${medicine === "Tidak" || calculatedInPast ? "unchanged" : ""}`}><Icon name="calendar" /><div><strong>{visitSaved ? "Kunjungan sudah tersimpan" : medicine === "Tidak" ? "Kunjungan dicatat, jadwal tidak berubah" : calculatedInPast ? "Perlu Konfirmasi tanggal kontrol" : `Jadwal diperbarui menjadi ${formatDate(calculatedSchedule)}`}</strong><span>{visitSaved ? "Lengkapi keputusan akhir di bawah, lalu simpan ulang. Kunjungan tidak akan dicatat dua kali." : medicine === "Tidak" ? "Tanpa pemberian obat, jadwal yang sudah ada tetap berlaku sampai petugas menggunakan tindakan Ubah Jadwal." : calculatedInPast ? "Tanggal pemberian obat menghasilkan jadwal yang sudah lewat. Server tidak menyimpan tanggal lampau; periksa dan konfirmasi tanggal kontrol terakhir pasien, lalu tetapkan jadwal baru." : `Perhitungan memakai tanggal pemberian obat ${formatDate(medicineDate)}, bukan tanggal kunjungan, lalu mengikuti hari layanan Rabu/Sabtu.`}</span></div></div>
    {reviewEligible && <div className="rule-box"><Icon name="alert" /><div><strong>Keputusan akhir bulan ke-6 wajib ditentukan</strong><span>Pilih hasil tinjauan petugas. Keputusan ini tidak dihitung otomatis dari tanggal atau pengingat.</span><div className="form-grid"><Field label="Keputusan Akhir" required><select value={decision} onChange={e => setDecision(e.target.value as "" | "Selesai" | "Dilanjutkan")} required><option value="">Pilih keputusan...</option><option value="Selesai">Pengobatan selesai</option><option value="Dilanjutkan">Pengobatan dilanjutkan</option></select></Field>{decision === "Dilanjutkan" && <Field label="Target Akhir Lanjutan" required hint="Diisi manual sesuai evaluasi petugas; tidak diperpanjang otomatis."><input type="date" min={todayIso()} value={continuedTargetEndDate} onChange={e => setContinuedTargetEndDate(e.target.value)} required /></Field>}<Field label="Keterangan Tinjauan" required><textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} maxLength={4000} placeholder="Ringkasan hasil tinjauan bulan ke-6" /></Field></div></div></div>}
    {treatmentState === "loading" && <p className="muted-note">Memuat pengobatan aktif…</p>}<div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" icon="check" disabled={saving || treatmentState !== "ready"}>{saving ? "Menyimpan…" : visitSaved ? "Simpan Keputusan" : "Simpan Catatan Kontrol"}</Button></div></form></Dialog>;
}

function OverrideScheduleDialog({ api, patient, notify, addActivity, onClose, onSaved }: { api: ReturnType<typeof useControlApi>; patient: ControlRow; notify: (s: string) => void; addActivity: () => void; onClose: () => void; onSaved: () => void }) {
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [existing, setExisting] = useState(true);
  const [currentSchedule, setCurrentSchedule] = useState("");
  const [version, setVersion] = useState(0);
  const [newSchedule, setNewSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError("");
    (async () => {
      try {
        const treatment = await FindActiveTreatment(api, patient.id, controller.signal);
        if (controller.signal.aborted) return;
        if (!treatment) { setState("none"); return; }
        setTreatmentId(treatment.id);
        try {
          const schedule = await api.getSchedule(treatment.id, controller.signal);
          if (controller.signal.aborted) return;
          setExisting(true);
          setCurrentSchedule(schedule.scheduledDate); setNewSchedule(schedule.scheduledDate); setVersion(schedule.version);
        } catch (scheduleError) {
          if (controller.signal.aborted) return;
          if (scheduleError instanceof ApiError && scheduleError.status === 404) {
            // No schedule yet (e.g. an old patient whose history is still
            // unresolved): allow staff to set the first one explicitly.
            setExisting(false);
            setCurrentSchedule(""); setNewSchedule(todayIso()); setVersion(0);
          } else {
            throw scheduleError;
          }
        }
        setState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError));
        setState("error");
      }
    })();
    return () => controller.abort();
  }, [api, patient]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!treatmentId) return;
    setError("");
    setSaving(true);
    try {
      if (existing) {
        await api.overrideSchedule(treatmentId, { scheduledDate: newSchedule, version });
      } else {
        await api.createInitialSchedule(treatmentId, { scheduledDate: newSchedule });
      }
      addActivity();
      notify(existing
        ? `Jadwal ${patient.name} berhasil diubah ke ${formatDate(newSchedule)}.`
        : `Jadwal kontrol ${patient.name} berhasil ditetapkan pada ${formatDate(newSchedule)}.`);
      onSaved();
      onClose();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        const current = (saveError.payload as { current?: { scheduledDate?: string; version?: number } } | null)?.current;
        if (current?.scheduledDate) setCurrentSchedule(current.scheduledDate);
        if (typeof current?.version === "number") setVersion(current.version);
        setError("Jadwal sudah diperbarui petugas lain. Data terbaru dimuat ulang, silakan periksa lalu simpan kembali.");
      } else {
        setError(errorMessage(saveError));
      }
      setSaving(false);
    }
  };

  return <Dialog title={existing ? "Ubah Jadwal Kontrol" : "Tetapkan Jadwal Kontrol"} subtitle="Perubahan ini memperbarui jadwal mendatang, bukan riwayat kunjungan pasien." onClose={onClose}><form onSubmit={submit}><div className="patient-strip"><div className="patient-avatar">{patient.name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><strong>{patient.name}</strong><span>{patient.reg}</span></div></div>{state === "loading" ? <p className="muted-note">Memuat jadwal kontrol…</p> : state === "none" ? <div className="notice small"><Icon name="alert" /><span>Pasien ini belum memiliki pengobatan aktif sehingga jadwal tidak dapat ditetapkan.</span></div> : state === "error" ? <div className="notice small"><Icon name="alert" /><span>{error}</span></div> : <div className="schedule-change"><div><span>{existing ? "Jadwal saat ini" : "Jadwal saat ini"}</span><strong>{existing ? formatDate(currentSchedule) : "Belum ada"}</strong></div><Icon name="chevron" /><div><span>{existing ? "Jadwal baru" : "Jadwal kontrol baru"}</span><input type="date" value={newSchedule} onChange={e => setNewSchedule(e.target.value)} required /></div></div>}{error && state === "ready" && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<div className="info-box"><Icon name="alert" /><div><strong>Riwayat kunjungan tetap utuh</strong><span>Hanya tanggal kontrol mendatang yang diubah. Kunjungan sebelumnya tidak diedit atau dihapus.</span></div></div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" icon="check" disabled={saving || state !== "ready" || !newSchedule}>{saving ? "Menyimpan…" : "Simpan Jadwal"}</Button></div></form></Dialog>;
}

function ControlPage({ notify, addActivity }: { notify: (s: string) => void; addActivity: () => void }) {
  const api = useControlApi();
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ControlRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [record, setRecord] = useState<{ patient: ControlRow | null; source: "table" | "new" } | null>(null);
  const [detail, setDetail] = useState<ControlRow | null>(null);
  const [editSchedule, setEditSchedule] = useState<ControlRow | null>(null);
  const requestRef = useRef(0);
  const filters = ["Semua", "Hari Ini", "Besok", "Terlambat", "Mendatang", "Perlu Konfirmasi", "Selesai"];

  const loadRows = useCallback(async (term: string, statusFilter: string, pageNumber: number, signal?: AbortSignal) => {
    const requestId = ++requestRef.current;
    setListState("loading");
    setListError("");
    try {
      const schedules = await api.listControlSchedules(term, pageNumber, 20, statusFilter, signal);
      if (requestId !== requestRef.current) return;
      setRows(schedules.items.map(schedule => ({
        scheduleId: schedule.scheduleId,
        treatmentCourseId: schedule.treatmentCourseId,
        id: schedule.patientId,
        reg: schedule.registerNumber ?? "—",
        name: schedule.patientName,
        address: schedule.address,
        scheduledDate: schedule.scheduledDate ?? "",
        status: schedule.status,
      })));
      setTotal(schedules.total);
      setTotalPages(schedules.totalPages);
      setStatusCounts(schedules.statusCounts);
      setListState("ready");
    } catch (error) {
      if (signal?.aborted || requestId !== requestRef.current) return;
      setListError(errorMessage(error));
      setListState("error");
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadRows(query, filter, page, controller.signal); }, query ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, filter, page, loadRows]);

  const reload = () => { void loadRows(query, filter, page); };
  const visible = rows;
  const count = (status: string) => statusCounts[status] ?? 0;
  return <>
    <PageTitle title="Jadwal Kontrol" subtitle="Kelola jadwal dan catat kunjungan kontrol pasien TB." action={<Button icon="plus" onClick={() => setRecord({ patient: null, source: "new" })}>Tambah/Catat Kontrol</Button>} />
    <div className="stats-grid"><StatCard label="Kontrol Hari Ini" value={count("Hari Ini")} icon="calendar" /><StatCard label="Jadwal Mendatang" value={count("Besok")} icon="clock" tone="yellow" /><StatCard label="Terlambat" value={count("Terlambat")} icon="alert" tone="red" /><StatCard label="Perlu Konfirmasi" value={count("Perlu Konfirmasi")} icon="alert" tone="yellow" /></div>
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Daftar Jadwal Kontrol</h2><p>Seluruh jadwal kontrol pasien aktif dan selesai. Peringatan H-1, hari-H, dan terlambat dihitung terpisah oleh server. Jadwal yang belum dapat dihitung ditandai "Perlu Konfirmasi".</p></div></div><div className="control-tools"><Search value={query} onChange={value => { setPage(1); setQuery(value); }} placeholder="Cari nama / nomor register..." /><button className="filter-button"><Icon name="filter" size={16} />Filter tanggal</button></div><div className="tabs">{filters.map(f => <button key={f} onClick={() => { setPage(1); setFilter(f); }} className={filter === f ? "active" : ""}>{f}</button>)}</div>
      {listState === "loading" ? <p className="table-empty">Memuat daftar kontrol…</p> : listState === "error" ? <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat daftar</strong><span>{listError} <button className="text-link" type="button" onClick={reload}>Coba lagi</button></span></div></div> : visible.length === 0 ? <p className="table-empty">Tidak ada jadwal kontrol yang cocok.</p> : <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Pasien</th><th>Jadwal Kontrol</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{visible.map((row, i) => <tr key={row.treatmentCourseId}><td>{String((page - 1) * 20 + i + 1).padStart(2, "0")}.</td><td>{row.reg}</td><td><button className="name-link" onClick={() => setDetail(row)}>{row.name}</button></td><td>{row.scheduledDate ? formatDate(row.scheduledDate) : "—"}</td><td>{row.status ? <Badge tone={statusTone(row.status)}>{row.status}</Badge> : "—"}</td><td><div className="control-actions">{row.status !== "Selesai" && <button className="edit-link" onClick={() => setEditSchedule(row)}><Icon name="edit" size={14} />{row.scheduleId ? "Ubah Jadwal" : "Tetapkan Jadwal"}</button>}{["Hari Ini", "Terlambat", "Perlu Konfirmasi"].includes(row.status) ? <Button variant="secondary" onClick={() => setRecord({ patient: row, source: "table" })}>Catat Kontrol</Button> : <button className="text-link" onClick={() => setDetail(row)}>Riwayat</button>}</div></td></tr>)}</tbody></table></div>}
      {listState === "ready" && <div className="pagination"><span>Menampilkan {total ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, total)} dari {total} jadwal</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>{pageWindow(page, totalPages).map(number => <button type="button" className={number === page ? "current" : ""} key={number} onClick={() => setPage(number)}>{number}</button>)}<button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button></div></div>}
    </section>
    {record && <RecordVisitDialog api={api} initialPatient={record.patient} source={record.source} notify={notify} addActivity={addActivity} onClose={() => setRecord(null)} onSaved={reload} />}
    {editSchedule && <OverrideScheduleDialog api={api} patient={editSchedule} notify={notify} addActivity={addActivity} onClose={() => setEditSchedule(null)} onSaved={reload} />}
    {detail && <Dialog title="Riwayat Kontrol Pasien" subtitle={`${detail.name} • ${detail.reg}`} onClose={() => setDetail(null)} wide><VisitHistory key={detail.id} patientId={detail.id} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button></div></Dialog>}
  </>;
}

function ReminderPage() {
  const api = useControlApi();
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<RemindersView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<ReminderRow | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const result = await api.listReminders("", signal);
      if (signal?.aborted) return;
      setData(result);
      setState("ready");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(errorMessage(loadError));
      setState("error");
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  // Keep the screen current when the officer returns to the tab and after new
  // patient syncs: reload on visibility and on a light interval.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setReloadKey(key => key + 1); };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, []);

  const stats = data?.stats;
  const rows = data?.rows ?? [];
  const visible = rows.filter(row => (filter === "Semua" || row.status === filter) && `${row.patientName} ${row.registerNumber ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <PageTitle title="Pengingat Obat" subtitle="Pantau konfirmasi minum obat pasien untuk hari ini." action={<div className="date-chip"><Icon name="calendar" size={16} />{formatJakartaDate(data?.date ?? todayJakartaIso())}</div>} />
    <div className="stats-grid">
      <StatCard label="Pengingat Hari Ini" value={stats ? stats.active : "—"} icon="bell" note="Pengobatan aktif" />
      <StatCard label="Sudah Konfirmasi" value={stats ? stats.confirmed : "—"} icon="check" tone="teal" />
      <StatCard label="Belum Konfirmasi" value={stats ? stats.notConfirmed : "—"} icon="clock" tone="yellow" />
      <StatCard label="Perlu Perhatian" value={stats ? stats.needsAttention : "—"} icon="alert" tone="red" note="2 hari berturut terlewat" />
    </div>
    <div className="notice"><Icon name="clock" /><div><strong>Status hari ini masih berjalan</strong><span>Pasien yang belum mengonfirmasi tidak dikategorikan melewatkan obat sampai hari berakhir. Pengingat malam dikirim pukul {data?.reminderEvening ?? "20:00"} WIB.</span></div></div>
    {state === "error" && <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat pengingat</strong><span>{error} <button className="text-link" type="button" onClick={() => setReloadKey(key => key + 1)}>Coba lagi</button></span></div></div>}
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Konfirmasi Minum Obat</h2><p>Pembaruan otomatis dari aplikasi pasien</p></div></div><div className="control-tools"><Search value={query} onChange={setQuery} placeholder="Cari pasien..." /><div className="tabs compact">{["Semua", "Sudah Konfirmasi", "Belum Konfirmasi"].map(f => <button className={filter === f ? "active" : ""} onClick={() => setFilter(f)} key={f}>{f}</button>)}</div></div>
      {state === "loading" && !data ? <p className="table-empty">Memuat pengingat…</p> : visible.length === 0 ? <p className="table-empty">Tidak ada pengingat yang cocok untuk hari ini.</p> : <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Pasien</th><th>Jadwal Pengingat</th><th>Status Konfirmasi</th><th>Waktu Konfirmasi</th><th>Aksi</th></tr></thead><tbody>{visible.map((row, i) => <tr key={row.treatmentCourseId}><td>{String(i + 1).padStart(2, "0")}.</td><td>{row.registerNumber ?? "—"}</td><td>{row.patientName}</td><td>{row.reminderTime.replace(":", ".")} WIB</td><td><Badge tone={row.status === "Sudah Konfirmasi" ? "green" : "yellow"}>{row.status}</Badge></td><td>{row.confirmedAt ? formatJakartaTime(row.confirmedAt) : "—"}</td><td><button className="text-link" onClick={() => setDetail(row)}>Detail</button></td></tr>)}</tbody></table></div>}
    </section>
    {detail && <ReminderDetailDialog api={api} row={detail} onClose={() => setDetail(null)} />}
  </>;
}

const ADHERENCE_DAY_LABELS: Record<string, { label: string; tone: string }> = {
  "Sudah diminum": { label: "Terkonfirmasi", tone: "green" },
  "Terlewat": { label: "Terlewat", tone: "red" },
  "Belum dikonfirmasi": { label: "Belum dikonfirmasi", tone: "yellow" },
};

function ReminderDetailDialog({ api, row, onClose }: { api: ReturnType<typeof useControlApi>; row: ReminderRow; onClose: () => void }) {
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError("");
    api.getAdherenceSummary(row.treatmentCourseId, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setSummary(result); setState("ready"); } })
      .catch(loadError => { if (!controller.signal.aborted) { setError(errorMessage(loadError)); setState("error"); } });
    return () => controller.abort();
  }, [api, row.treatmentCourseId]);

  const days = summary?.days ?? [];
  const totalDays = days.length;
  const taken = summary?.totalTaken ?? 0;
  const pct = totalDays > 0 ? Math.round((taken / totalDays) * 100) : 0;
  const recent = days.slice(-7).reverse();

  return <Dialog title="Riwayat Konfirmasi" subtitle={`${row.patientName} • ${row.registerNumber ?? "Nomor register belum tercatat"}`} onClose={onClose}>
    {state === "loading" ? <p className="muted-note">Memuat riwayat konfirmasi…</p>
      : state === "error" ? <div className="notice small"><Icon name="alert" /><span>{error}</span></div>
        : <><div className="adherence-summary"><div className="progress-ring" style={{ background: `conic-gradient(var(--teal) 0 ${pct}%, #e2e7ef ${pct}%)` }}>{pct}%</div><div><strong>{taken} dari {totalDays} hari terkonfirmasi</strong><span>Riwayat ini hanya mencatat konfirmasi pasien, bukan penilaian klinis.</span></div></div>
          {recent.length === 0 ? <p className="muted-note">Belum ada riwayat konfirmasi untuk pengobatan ini.</p> : <div className="history-list">{recent.map(day => { const meta = ADHERENCE_DAY_LABELS[day.status] ?? { label: day.status, tone: "blue" }; return <div key={day.date}><span>{formatJakartaShortDate(day.date)}</span><b>{day.confirmedAt ? formatJakartaTime(day.confirmedAt) : "—"}</b><Badge tone={meta.tone}>{meta.label}</Badge></div>; })}</div>}
        </>}
    <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Tutup</Button></div>
  </Dialog>;
}

const REPORT_CATEGORIES: ReportCategory[] = ["Data Pasien", "Riwayat Kontrol", "Pemberian Obat", "Konfirmasi Minum Obat", "Perlu Tindak Lanjut"];

function firstDayOfMonthJakarta(): string {
  return `${todayJakartaIso().slice(0, 7)}-01`;
}

function ReportsPage({ notify }: { notify: (s: string) => void }) {
  const api = useControlApi();
  const [category, setCategory] = useState<ReportCategory>("Data Pasien");
  const [from, setFrom] = useState(firstDayOfMonthJakarta);
  const [to, setTo] = useState(todayJakartaIso);
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [applied, setApplied] = useState<ReportFilters>({ category: "Data Pasien", from: firstDayOfMonthJakarta(), to: todayJakartaIso(), patientId: null });
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ kind: "idle" | "success" | "error"; at: string | null; message?: string }>({ kind: "idle", at: null });

  useEffect(() => {
    const controller = new AbortController();
    api.listPatients("", controller.signal).then(setPatients).catch(() => { if (!controller.signal.aborted) setPatients([]); });
    return () => controller.abort();
  }, [api]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const result = await api.getReportPreview(applied, signal);
      if (signal?.aborted) return;
      setPreview(result);
      setState("ready");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(errorMessage(loadError));
      setState("error");
    }
  }, [api, applied]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const applyFilter = () => {
    if (!from || !to) { setError("Tanggal mulai dan tanggal akhir wajib diisi."); setState("error"); return; }
    if (from > to) { setError("Tanggal mulai tidak boleh melebihi tanggal akhir."); setState("error"); return; }
    setApplied({ category, from, to, patientId: patientId || null });
  };

  const exportReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await api.downloadReport(applied);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus({ kind: "success", at: new Date().toISOString() });
      notify("Laporan berhasil diekspor.");
    } catch (exportError) {
      const message = errorMessage(exportError);
      setExportStatus({ kind: "error", at: new Date().toISOString(), message });
      notify(message);
    } finally {
      setExporting(false);
    }
  };

  const maxSummary = Math.max(1, ...(preview?.summary.map(item => item.value) ?? [0]));
  const columns = preview?.columns ?? [];
  const periodLabel = `${formatJakartaShortDate(applied.from)} – ${formatJakartaShortDate(applied.to)}`;

  return <>
    <PageTitle title="Laporan" subtitle="Susun dan ekspor ringkasan data operasional Dinar-TB." action={<Button icon="download" onClick={() => { void exportReport(); }} disabled={exporting || state === "loading"}>{exporting ? "Menyiapkan…" : "Ekspor .xlsx"}</Button>} />
    <section className="card report-filter"><div className="filter-grid">
      <Field label="Jenis Laporan"><select value={category} onChange={e => setCategory(e.target.value as ReportCategory)}>{REPORT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Tanggal Mulai"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="Tanggal Akhir"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Field label="Pasien"><select value={patientId} onChange={e => setPatientId(e.target.value)}><option value="">Semua Pasien</option>{patients.map(p => <option key={p.id} value={p.id}>{p.fullName} • {p.registerNumber}</option>)}</select></Field>
      <Button icon="filter" onClick={applyFilter}>Terapkan Filter</Button>
    </div></section>
    {state === "error" && <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat laporan</strong><span>{error} <button className="text-link" type="button" onClick={() => setReloadKey(key => key + 1)}>Coba lagi</button></span></div></div>}
    <div className="report-summary"><div><span>Periode Laporan</span><strong>{periodLabel}</strong></div><div><span>Jenis Laporan</span><strong>{preview?.category ?? category}</strong></div><div><span>Jumlah Data</span><strong>{preview ? `${preview.total} rekaman` : "—"}</strong></div><div><span>Terakhir Diperbarui</span><strong>{preview ? formatJakartaDateTime(preview.generatedAt) : "—"}</strong></div></div>
    <div className="dashboard-grid report-grid">
      <section className="card"><div className="card-head"><div><h2>Ringkasan Laporan</h2><p>Rekap status pada periode terpilih</p></div></div>{state === "loading" && !preview ? <p className="muted-note">Memuat ringkasan…</p> : preview && preview.summary.length > 0 ? <div className="bar-chart">{preview.summary.map(item => <div key={item.label}><span>{item.label}</span><i><b className="bar-blue" style={{ width: `${(item.value / maxSummary) * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div> : <p className="muted-note">Belum ada data pada periode ini.</p>}</section>
      <section className="card"><div className="card-head"><div><h2>Catatan Privasi</h2><p>Informasi dalam berkas ekspor</p></div></div><div className="privacy-note"><Icon name="lock" /><p>Ekspor hanya memuat informasi yang diperlukan untuk laporan terpilih. <strong>NIK pasien tidak disertakan</strong> dalam berkas .xlsx.</p></div><div className="export-status"><span>Status ekspor terakhir</span>{exportStatus.kind === "success" ? <Badge tone="green">Berhasil</Badge> : exportStatus.kind === "error" ? <Badge tone="red">Gagal</Badge> : <Badge tone="blue">Belum ada</Badge>}{exportStatus.at && <small>{formatJakartaDateTime(exportStatus.at)}{exportStatus.message ? ` • ${exportStatus.message}` : ""}</small>}</div></section>
    </div>
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Pratinjau Laporan</h2><p>{preview ? `${preview.category} • ${preview.total} rekaman ditemukan` : "Memuat pratinjau…"}</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>No.</th>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>
        {state === "loading" && !preview ? <tr><td colSpan={columns.length + 1} className="table-empty">Memuat data laporan…</td></tr>
          : !preview || preview.total === 0 ? <tr><td colSpan={columns.length + 1} className="table-empty">Tidak ada data pada periode dan filter ini.</td></tr>
            : preview.rows.map((row, i) => <tr key={i}><td>{i + 1}</td>{columns.map(column => <td key={column.key}>{row[column.key] ?? "—"}</td>)}</tr>)}
      </tbody></table></div>
    </section>
  </>;
}

function SettingsPage({ notify, me, onMeChange, onLogout }: {
  notify: (s: string) => void;
  me: StaffAccountSummary | null;
  onMeChange: (value: StaffAccountSummary) => void;
  onLogout: () => void;
}) {
  const api = useControlApi();
  const isAdmin = me?.role === "Admin";
  const tabs = useMemo(() => (isAdmin
    ? ["Profil dan Akun", "Pengaturan Jadwal", "Pengaturan Pengingat", "Kelola Akun", "Keamanan"]
    : ["Profil dan Akun", "Pengaturan Jadwal", "Pengaturan Pengingat", "Keamanan"]), [isAdmin]);
  const [tab, setTab] = useState("Profil dan Akun");
  const active = tabs.includes(tab) ? tab : tabs[0];

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.getSettings(controller.signal)
      .then(setSettings)
      .catch(() => { if (!controller.signal.aborted) setSettingsError("Pengaturan belum dapat dimuat."); });
    return () => controller.abort();
  }, [api]);

  return <>
    <PageTitle title="Pengaturan" subtitle="Kelola profil, jadwal layanan, dan preferensi aplikasi." />
    <div className="settings-layout"><aside className="settings-nav">{tabs.map(t => <button className={active === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}</button>)}</aside><section className="card settings-card">
      {active === "Profil dan Akun" && <ProfileSection notify={notify} me={me} onMeChange={onMeChange} settings={settings} settingsError={settingsError} onSettings={setSettings} isAdmin={isAdmin} />}
      {active === "Pengaturan Jadwal" && <ScheduleSection notify={notify} settings={settings} onSettings={setSettings} isAdmin={isAdmin} />}
      {active === "Pengaturan Pengingat" && <ReminderSection notify={notify} settings={settings} onSettings={setSettings} isAdmin={isAdmin} />}
      {active === "Kelola Akun" && isAdmin && <AccountsSection notify={notify} />}
      {active === "Keamanan" && <SecuritySection notify={notify} onLogout={onLogout} />}
    </section></div>
  </>;
}

function ProfileSection({ notify, me, onMeChange, settings, settingsError, onSettings, isAdmin }: {
  notify: (s: string) => void;
  me: StaffAccountSummary | null;
  onMeChange: (value: StaffAccountSummary) => void;
  settings: AppSettings | null;
  settingsError: string;
  onSettings: (value: AppSettings) => void;
  isAdmin: boolean;
}) {
  const api = useControlApi();
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [puskesmasName, setPuskesmasName] = useState("");
  const [puskesmasPhone, setPuskesmasPhone] = useState("");
  const [savingPuskesmas, setSavingPuskesmas] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPhone(me?.phone ?? ""); }, [me]);
  useEffect(() => { setPuskesmasName(settings?.puskesmasName ?? ""); setPuskesmasPhone(settings?.puskesmasPhone ?? ""); }, [settings]);

  const savePhone = async () => {
    setSavingPhone(true); setError("");
    try {
      const updated = await api.updateMe({ phone: phone.trim() ? phone.trim() : null });
      onMeChange(updated);
      notify("Nomor telepon berhasil disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan nomor telepon.");
    } finally { setSavingPhone(false); }
  };
  const savePuskesmas = async () => {
    if (!puskesmasName.trim()) { setError("Nama Puskesmas wajib diisi."); return; }
    setSavingPuskesmas(true); setError("");
    try {
      const updated = await api.updateSettings({ puskesmasName: puskesmasName.trim(), puskesmasPhone: puskesmasPhone.trim() ? puskesmasPhone.trim() : null });
      onSettings(updated);
      notify("Data Puskesmas berhasil disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan data Puskesmas.");
    } finally { setSavingPuskesmas(false); }
  };

  return <>
    <div className="section-heading"><h2>Profil dan Akun</h2><p>Informasi akun yang Anda gunakan untuk masuk.</p></div>
    <div className="profile-setting"><div className="large-avatar">{initialsFrom(me?.displayName ?? me?.username ?? null)}</div></div>
    <div className="form-grid">
      <Field label="Username"><input value={me?.username ?? ""} readOnly /></Field>
      <Field label="Peran"><input value={me?.role ?? ""} readOnly /></Field>
      <Field label="Nama Tampilan"><input value={me?.displayName ?? "Belum diatur"} readOnly /></Field>
      <Field label="Nomor Telepon" hint="Hanya Anda yang dapat mengubah nomor telepon akun Anda."><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Belum diatur" /></Field>
    </div>
    <div className="settings-actions"><Button icon="check" onClick={() => { void savePhone(); }} disabled={savingPhone || !me}>{savingPhone ? "Menyimpan…" : "Simpan Nomor Telepon"}</Button></div>

    <div className="section-heading" style={{ marginTop: 26 }}><h2>Data Puskesmas</h2><p>Nama dan kontak fasilitas yang tampil pada aplikasi.</p></div>
    {settingsError && <div className="notice small"><Icon name="alert" /><span>{settingsError}</span></div>}
    <div className="form-grid">
      <Field label="Nama Puskesmas"><input value={puskesmasName} readOnly={!isAdmin} onChange={e => setPuskesmasName(e.target.value)} /></Field>
      <Field label="Nomor Telepon Puskesmas" hint="Kontak fasilitas, terpisah dari nomor telepon akun."><input value={puskesmasPhone} readOnly={!isAdmin} placeholder="Belum diatur" onChange={e => setPuskesmasPhone(e.target.value)} /></Field>
    </div>
    {!isAdmin && <div className="notice small"><Icon name="lock" /><span>Hanya Admin yang dapat mengubah data Puskesmas.</span></div>}
    {isAdmin && <div className="settings-actions"><Button icon="check" onClick={() => { void savePuskesmas(); }} disabled={savingPuskesmas || !settings}>{savingPuskesmas ? "Menyimpan…" : "Simpan Data Puskesmas"}</Button></div>}
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
  </>;
}

function ScheduleSection({ notify, settings, onSettings, isAdmin }: {
  notify: (s: string) => void;
  settings: AppSettings | null;
  onSettings: (value: AppSettings) => void;
  isAdmin: boolean;
}) {
  const api = useControlApi();
  const [interval, setInterval] = useState("14");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setInterval(String(settings?.controlIntervalDays ?? 14)); }, [settings]);

  const save = async () => {
    const value = Number(interval);
    if (!Number.isInteger(value) || value < 1 || value > 365) { setError("Interval harus bilangan bulat antara 1 dan 365 hari."); return; }
    setSaving(true); setError("");
    try {
      const updated = await api.updateSettings({ controlIntervalDays: value });
      onSettings(updated);
      notify("Pengaturan jadwal berhasil disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pengaturan jadwal.");
    } finally { setSaving(false); }
  };

  return <>
    <div className="section-heading"><h2>Pengaturan Jadwal</h2><p>Aturan dasar penjadwalan kontrol pasien.</p></div>
    <Field label="Hari Layanan Klinik TB" hint="Hari layanan saat ini ditetapkan oleh aturan sistem dan belum dapat diubah."><div className="day-select"><button className="active" type="button" disabled title="Hari layanan tetap">Rabu</button><button className="active" type="button" disabled title="Hari layanan tetap">Sabtu</button></div></Field>
    <div className="form-grid">
      <Field label="Interval Kontrol Standar" hint="Berlaku untuk perhitungan jadwal berikutnya, bukan jadwal yang sudah tersimpan."><div className="input-suffix"><input type="number" min={1} max={365} value={interval} readOnly={!isAdmin} onChange={e => setInterval(e.target.value)} /><span>hari</span></div></Field>
      <Field label="Dasar Perhitungan"><input value="Tanggal pemberian obat" readOnly /></Field>
    </div>
    <div className="notice small"><Icon name="alert" /><div><strong>Dampak pengaturan</strong><span>Tanggal kontrol dihitung dari interval ini lalu dimundurkan ke hari Rabu atau Sabtu sebelumnya. Jadwal yang sudah ada tidak diubah secara otomatis.</span></div></div>
    {!isAdmin && <div className="notice small"><Icon name="lock" /><span>Hanya Admin yang dapat mengubah interval kontrol.</span></div>}
    {isAdmin && <div className="settings-actions"><Button icon="check" onClick={() => { void save(); }} disabled={saving || !settings}>{saving ? "Menyimpan…" : "Simpan Pengaturan Jadwal"}</Button></div>}
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
  </>;
}

function ReminderSection({ notify, settings, onSettings, isAdmin }: {
  notify: (s: string) => void;
  settings: AppSettings | null;
  onSettings: (value: AppSettings) => void;
  isAdmin: boolean;
}) {
  const api = useControlApi();
  const [morning, setMorning] = useState("06:00");
  const [evening, setEvening] = useState("20:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setMorning(settings?.reminderMorning ?? "06:00");
    setEvening(settings?.reminderEvening ?? "20:00");
  }, [settings]);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const updated = await api.updateSettings({ reminderMorning: morning, reminderEvening: evening });
      onSettings(updated);
      notify("Pengaturan pengingat berhasil disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pengaturan pengingat.");
    } finally { setSaving(false); }
  };

  return <>
    <div className="section-heading"><h2>Pengaturan Pengingat</h2><p>Atur waktu notifikasi untuk membantu pasien mengikuti jadwal obat.</p></div>
    <div className="form-grid">
      <Field label="Pengingat Utama" hint="Waktu pengingat pagi hari."><input type="time" value={morning} readOnly={!isAdmin} onChange={e => setMorning(e.target.value)} /></Field>
      <Field label="Pengingat Malam" hint="Dikirim hanya jika pasien belum mengonfirmasi minum obat."><input type="time" value={evening} readOnly={!isAdmin} onChange={e => setEvening(e.target.value)} /></Field>
    </div>
    <div className="notice small"><Icon name="clock" /><div><strong>Klasifikasi dosis terlewat</strong><span>Pasien baru ditandai tidak mengonfirmasi setelah hari berakhir, bukan pada waktu pengingat malam. Waktu ini dipakai aplikasi pasien saat menyinkronkan jadwal pengingat.</span></div></div>
    {!isAdmin && <div className="notice small"><Icon name="lock" /><span>Hanya Admin yang dapat mengubah waktu pengingat.</span></div>}
    {isAdmin && <div className="settings-actions"><Button icon="check" onClick={() => { void save(); }} disabled={saving || !settings}>{saving ? "Menyimpan…" : "Simpan Pengaturan Pengingat"}</Button></div>}
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
  </>;
}

function AccountsSection({ notify }: { notify: (s: string) => void }) {
  const api = useControlApi();
  const [data, setData] = useState<StaffAccounts | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "role" | "reset"; account: StaffAccountSummary; role?: StaffRole } | null>(null);
  const [temporary, setTemporary] = useState<{ username: string; temporaryPassword: string; copyState: "idle" | "copied" | "failed" } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await api.listStaffAccounts());
      setState("ready");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat daftar akun.");
      setState("error");
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const applyRole = async (account: StaffAccountSummary, role: StaffRole) => {
    setBusy(true); setError("");
    try {
      await api.updateStaffAccount(account.id, { role });
      setConfirm(null);
      notify(`Peran akun ${account.username} diperbarui.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengubah peran akun.");
    } finally { setBusy(false); }
  };
  const remove = async (account: StaffAccountSummary) => {
    setBusy(true); setError("");
    try {
      await api.deleteStaffAccount(account.id);
      setConfirm(null);
      notify(`Akun ${account.username} dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus akun.");
    } finally { setBusy(false); }
  };

  const resetPassword = async (account: StaffAccountSummary) => {
    setBusy(true); setError("");
    try {
      const result = await api.resetStaffAccountPassword(account.id);
      setConfirm(null);
      setTemporary({ username: result.username, temporaryPassword: result.temporaryPassword, copyState: "idle" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengatur ulang kata sandi akun.");
    } finally { setBusy(false); }
  };

  const copyTemporary = async () => {
    if (!temporary) return;
    const password = temporary.temporaryPassword;
    const ok = await copyTextToClipboard(password);
    // Functional update avoids a stale render, and the password check makes sure
    // feedback still belongs to the dialog that is currently open.
    setTemporary(current =>
      current && current.temporaryPassword === password
        ? { ...current, copyState: ok ? "copied" : "failed" }
        : current
    );
  };

  const lastAdmin = (account: StaffAccountSummary) => account.role === "Admin" && (data?.activeAdminCount ?? 0) <= 1;

  return <>
    <div className="section-heading"><h2>Kelola Akun</h2><p>Kelola akun Admin dan Petugas, termasuk peran dan aksesnya.</p></div>
    <div className="setting-row"><div><strong>Jumlah Admin aktif</strong><span>{data ? `${data.activeAdminCount} dari ${data.maxAdmins} Admin aktif` : "Memuat…"}</span></div><Button icon="plus" onClick={() => setCreating(true)}>Tambah Akun</Button></div>
    {state === "loading" ? <p className="table-empty">Memuat daftar akun…</p>
      : state === "error" ? <div className="notice"><Icon name="alert" /><div><strong>Gagal memuat akun</strong><span>{error} <button className="text-link" type="button" onClick={() => { void load(); }}>Coba lagi</button></span></div></div>
        : <div className="table-scroll"><table><thead><tr><th>No.</th><th>Username</th><th>Nama</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {(data?.accounts ?? []).map((account, i) => <tr key={account.id}>
            <td>{String(i + 1).padStart(2, "0")}.</td>
            <td>{account.username}{account.isSelf && <span className="muted-note"> (Anda)</span>}</td>
            <td>{account.displayName ?? "—"}</td>
            <td><select value={account.role} disabled={busy} onChange={e => setConfirm({ kind: "role", account, role: e.target.value as StaffRole })}><option value="Petugas">Petugas</option><option value="Admin">Admin</option></select></td>
            <td>{account.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>}</td>
            <td><button className="edit-link" disabled={busy || !account.active} title={account.active ? "Atur ulang kata sandi akun" : "Akun nonaktif"} onClick={() => setConfirm({ kind: "reset", account })}><Icon name="lock" size={14} />Reset Password</button><button className="edit-link" disabled={busy || account.isSelf || lastAdmin(account)} title={account.isSelf ? "Tidak dapat menghapus akun sendiri" : lastAdmin(account) ? "Minimal satu Admin aktif" : "Hapus akun"} onClick={() => setConfirm({ kind: "delete", account })}><Icon name="trash" size={14} />Hapus</button></td>
          </tr>)}
        </tbody></table></div>}
    {error && state === "ready" && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}

    {creating && <CreateAccountDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); notify("Akun baru berhasil dibuat."); void load(); }} />}
    {confirm?.kind === "delete" && <Dialog title={confirm.account.active ? "Nonaktifkan akun?" : "Hapus permanen akun?"} subtitle={confirm.account.active ? "Akun dinonaktifkan dan sesi aktifnya dicabut." : "Akun nonaktif dihapus permanen dari daftar."} onClose={() => { if (!busy) setConfirm(null); }}><div className="confirm-delete"><div className="alert-circle"><Icon name="trash" /></div>{confirm.account.active ? <p>Akun <strong>{confirm.account.username}</strong> akan dinonaktifkan. Riwayat audit akun ini tetap tersimpan dan pasien yang pernah ditangani tidak terpengaruh.</p> : <p>Akun nonaktif <strong>{confirm.account.username}</strong> akan dihapus permanen dari daftar. Tindakan ini tidak dapat dibatalkan. Penghapusan ditolak bila akun masih terkait riwayat (kunjungan, jadwal, tindak lanjut, atau kode aktivasi) yang wajib dipertahankan.</p>}</div>{error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button><Button variant="danger" onClick={() => { void remove(confirm.account); }} disabled={busy}>{busy ? "Menghapus…" : confirm.account.active ? "Ya, Nonaktifkan Akun" : "Ya, Hapus Permanen"}</Button></div></Dialog>}
    {confirm?.kind === "role" && confirm.role && <Dialog title="Ubah peran akun?" subtitle="Peran menentukan akses ke pengaturan dan pengelolaan akun." onClose={() => { if (!busy) setConfirm(null); }}><p>Peran <strong>{confirm.account.username}</strong> akan diubah menjadi <strong>{confirm.role}</strong>.</p>{error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button><Button onClick={() => { void applyRole(confirm.account, confirm.role!); }} disabled={busy}>{busy ? "Menyimpan…" : "Ya, Ubah Peran"}</Button></div></Dialog>}
    {confirm?.kind === "reset" && <Dialog title="Reset kata sandi akun?" subtitle="Verifikasi identitas petugas secara langsung sebelum melanjutkan." onClose={() => { if (!busy) setConfirm(null); }}><p>Akun <strong>{confirm.account.username}</strong> akan mendapat <strong>password sementara</strong> baru. Password sementara ditampilkan satu kali dan wajib diganti petugas saat login berikutnya. Peran dan data akun lain tidak berubah.</p>{error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button><Button onClick={() => { void resetPassword(confirm.account); }} disabled={busy}>{busy ? "Memproses…" : "Ya, Reset Password"}</Button></div></Dialog>}
    {temporary && <Dialog title="Password sementara" subtitle={`Untuk akun ${temporary.username}`} onClose={() => setTemporary(null)}><div className="notice small"><Icon name="alert" /><span>{TEMP_PASSWORD_NOTICE}</span></div><div className="temp-password"><PasswordReveal value={temporary.temporaryPassword} /><Button variant="secondary" onClick={() => { void copyTemporary(); }}>{temporary.copyState === "copied" ? "Tersalin" : temporary.copyState === "failed" ? "Coba lagi" : "Salin"}</Button></div><p className="muted-note" role="status" aria-live="polite">{temporary.copyState === "copied" ? "Password berhasil disalin ke clipboard." : temporary.copyState === "failed" ? "Penyalinan otomatis gagal. Pilih password di atas lalu salin manual, atau tekan Coba lagi." : "Gunakan tombol Salin agar password tidak salah ketik."}</p><p className="muted-note">Catat dan serahkan password ini kepada petugas secara langsung. Password tidak ditampilkan lagi setelah dialog ditutup dan tidak disimpan di sistem.</p><div className="dialog-actions"><Button onClick={() => setTemporary(null)}>Selesai</Button></div></Dialog>}
  </>;
}

function CreateAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const api = useControlApi();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [role, setRole] = useState<StaffRole>("Petugas");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!username.trim()) { setError("Username wajib diisi."); return; }
    if (password.length < 8) { setError("Kata sandi minimal 8 karakter."); return; }
    if (password !== confirmation) { setError("Konfirmasi kata sandi tidak cocok."); return; }
    setSaving(true); setError("");
    try {
      await api.createStaffAccount({ username: username.trim(), password, role, displayName: displayName.trim() ? displayName.trim() : null });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat akun.");
      setSaving(false);
    }
  };

  return <Dialog title="Tambah Akun" subtitle="Buat akun Petugas atau Admin baru." onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid">
      <Field label="Username" required><input value={username} maxLength={80} onChange={e => setUsername(e.target.value)} /></Field>
      <Field label="Nama Tampilan"><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Opsional" /></Field>
      <Field label="Kata Sandi" required hint="Minimal 8 karakter."><PasswordInput value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Field label="Konfirmasi Kata Sandi" required><PasswordInput value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field>
      <Field label="Peran" required><select value={role} onChange={e => setRole(e.target.value as StaffRole)}><option value="Petugas">Petugas</option><option value="Admin">Admin</option></select></Field>
    </div>
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
    <div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" icon="check" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Akun"}</Button></div>
  </form></Dialog>;
}

function SecuritySection({ notify, onLogout }: { notify: (s: string) => void; onLogout: () => void }) {
  const api = useControlApi();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!current || !next) { setError("Lengkapi seluruh kolom kata sandi."); return; }
    if (next.length < 8) { setError("Kata sandi baru minimal 8 karakter."); return; }
    if (next !== confirmation) { setError("Konfirmasi kata sandi baru tidak cocok."); return; }
    setSaving(true); setError("");
    try {
      await api.changePassword({ currentPassword: current, newPassword: next, confirmPassword: confirmation });
      setCurrent(""); setNext(""); setConfirmation("");
      notify("Kata sandi berhasil diubah.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah kata sandi.");
    } finally { setSaving(false); }
  };

  return <form onSubmit={submit}>
    <div className="section-heading"><h2>Keamanan Akun</h2><p>Kelola kata sandi dan sesi akun Anda.</p></div>
    <div className="form-grid">
      <Field label="Kata Sandi Saat Ini" required><PasswordInput value={current} onChange={e => setCurrent(e.target.value)} placeholder="Masukkan kata sandi" /></Field>
      <span />
      <Field label="Kata Sandi Baru" required hint="Minimal 8 karakter."><PasswordInput value={next} onChange={e => setNext(e.target.value)} placeholder="Minimal 8 karakter" /></Field>
      <Field label="Konfirmasi Kata Sandi" required><PasswordInput value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Ulangi kata sandi baru" /></Field>
    </div>
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
    <div className="settings-actions"><Button type="submit" icon="check" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Kata Sandi"}</Button></div>
    <div className="danger-zone"><div><Icon name="logout" /><div><strong>Keluar dari akun</strong><span>Anda perlu masuk kembali untuk mengakses dashboard.</span></div></div><Button variant="danger" onClick={onLogout}>Keluar</Button></div>
  </form>;
}

function ForcePasswordChangeScreen({ username, onChanged, onLogout }: { username: string; onChanged: () => void; onLogout: () => void }) {
  const api = useControlApi();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || !next) { setError("Lengkapi seluruh kolom kata sandi."); return; }
    if (next.length < 8) { setError("Kata sandi baru minimal 8 karakter."); return; }
    if (next !== confirmation) { setError("Konfirmasi kata sandi baru tidak cocok."); return; }
    setSaving(true); setError("");
    try {
      await api.changePassword({ currentPassword: current, newPassword: next, confirmPassword: confirmation });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah kata sandi.");
    } finally { setSaving(false); }
  };

  return <div className="login-screen"><div className="login-brand"><span className="brand-mark"><img src="/image/logo2.png" alt="Logo Dinar-TB" /></span><strong>Dinar-TB.</strong></div><section className="login-card"><form onSubmit={submit}>
    <Badge>Keamanan Akun</Badge>
    <h1>Buat password baru</h1>
    <p>Akun <strong>{username}</strong> memakai password sementara dari Admin. {TEMP_PASSWORD_NOTICE}</p>
    <Field label="Password sementara" required><PasswordInput value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" disabled={saving} required /></Field>
    <Field label="Password baru" required hint="Minimal 8 karakter."><PasswordInput value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" disabled={saving} required /></Field>
    <Field label="Konfirmasi password baru" required><PasswordInput value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" disabled={saving} required /></Field>
    {error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}
    <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Password Baru"}</Button>
    <button type="button" className="text-link" onClick={onLogout}>Keluar</button>
  </form></section></div>;
}

export default function App() {
  const { accessToken, username, logout, mustChangePassword, markPasswordChanged, requirePasswordChange } = useStaffAuth();
  const api = useControlApi();
  const [me, setMe] = useState<StaffAccountSummary | null>(null);
  const [puskesmasName, setPuskesmasName] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("Beranda");
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<DashboardNotificationFeed | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchRequest, setSearchRequest] = useState({ term: "", nonce: 0 });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };

  const loadNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api.getNotifications(signal);
      if (signal?.aborted) return;
      setFeed(data);
      setFeedError(false);
    } catch {
      if (signal?.aborted) return;
      setFeedError(true);
    }
  }, [api]);

  useEffect(() => {
    if (!accessToken) {
      setFeed(null);
      return;
    }
    const controller = new AbortController();
    void loadNotifications(controller.signal);
    return () => controller.abort();
  }, [accessToken, page, loadNotifications]);

  useEffect(() => {
    setSearchRequest(prev => (page === "Pasien" || !prev.term ? prev : { term: "", nonce: prev.nonce }));
  }, [page]);

  useEffect(() => {
    if (!accessToken) { setMe(null); return; }
    const controller = new AbortController();
    api.getMe(controller.signal)
      .then(setMe)
      .catch(() => { if (!controller.signal.aborted) setMe(null); });
    return () => controller.abort();
  }, [accessToken, api]);

  useEffect(() => {
    if (me?.mustChangePassword) requirePasswordChange();
  }, [me, requirePasswordChange]);

  useEffect(() => {
    if (!accessToken) { setPuskesmasName(null); return; }
    const controller = new AbortController();
    api.getSettings(controller.signal)
      .then(settings => { if (!controller.signal.aborted) setPuskesmasName(settings.puskesmasName); })
      .catch(() => { if (!controller.signal.aborted) setPuskesmasName(null); });
    return () => controller.abort();
  }, [accessToken, api]);

  const markActivitiesRead = useCallback(async () => {
    if (!feed || feed.unreadCount === 0) return;
    try {
      const result = await api.markNotificationsRead(feed.items[0]?.createdAt);
      setFeed(prev => (prev ? { ...prev, unreadCount: 0, lastSeenAt: result.lastSeenAt } : prev));
    } catch {
      /* leave the badge as-is; the next load reconciles it with the server */
    }
  }, [api, feed]);

  const addActivity = useCallback(() => { void loadNotifications(); }, [loadNotifications]);

  const content = useMemo(() => {
    if (page === "Beranda") return <HomePage go={setPage} username={username} notify={notify} />;
    if (page === "Pasien") return <PatientsPage notify={notify} addActivity={addActivity} initialQuery={searchRequest.term} searchNonce={searchRequest.nonce} />;
    if (page === "Kontrol") return <ControlPage notify={notify} addActivity={addActivity} />;
    if (page === "Pengingat") return <ReminderPage />;
    if (page === "Laporan") return <ReportsPage notify={notify} />;
    return <SettingsPage notify={notify} me={me} onMeChange={setMe} onLogout={logout} />;
  }, [page, addActivity, username, searchRequest, me, logout]);
  if (!accessToken) return <LoginPrototype />;
  if (mustChangePassword) return <ForcePasswordChangeScreen username={username ?? ""} onChanged={markPasswordChanged} onLogout={logout} />;
  return <AppShell page={page} setPage={setPage} activities={feed?.items.map(toActivity) ?? []} activitiesError={feedError} unreadCount={feed?.unreadCount ?? 0} onActivitiesOpen={() => { void markActivitiesRead(); }} username={username} role={me?.role ?? "Petugas"} puskesmasName={puskesmasName} onSearch={(value) => { const term = value.trim(); if (!term) return; setSearchRequest(prev => ({ term, nonce: prev.nonce + 1 })); setPage("Pasien"); }} onHelp={() => setHelpOpen(true)} onLogout={logout}>{content}{helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}{toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}</AppShell>;
}

function LoginPrototype() {
  const { login, status } = useStaffAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const submitting = status === "authenticating";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) { setError("Username dan password wajib diisi."); return; }
    const result = await login(username.trim(), password);
    setFailedAttempts(prev => nextFailureCount(prev, result.ok));
    if (!result.ok) setError(result.error ?? "Gagal masuk. Coba lagi.");
  };
  const brand = <div className="login-brand"><span className="brand-mark"><img src="/image/logo2.png" alt="Logo Dinar-TB" /></span><strong>Dinar-TB.</strong></div>;
  if (showHelp) {
    return <div className="login-screen">{brand}<section className="login-card">
      <Badge>Bantuan Akses</Badge>
      <h1>{FORGOT_PASSWORD_HELP.title}</h1>
      <p>{FORGOT_PASSWORD_HELP.instruction}</p>
      <ol className="help-steps">
        {FORGOT_PASSWORD_HELP.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <small>Demi keamanan, halaman ini tidak menampilkan, meminta, atau menyimpan password Anda.</small>
      <Button type="button" variant="secondary" onClick={() => setShowHelp(false)}>Kembali ke halaman masuk</Button>
    </section></div>;
  }
  return <div className="login-screen">{brand}<section className="login-card"><form onSubmit={submit}><Badge>Dashboard Admin</Badge><h1>Masuk sebagai petugas</h1><p>Gunakan akun individual Anda untuk mengakses data Pasien TB.</p><Field label="Username petugas" required><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" disabled={submitting} required /></Field><Field label="Kata sandi" required><PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" disabled={submitting} required /></Field>{error && <div className="notice small"><Icon name="alert" /><span>{error}</span></div>}<Button type="submit" disabled={submitting}>{submitting ? "Memproses…" : "Masuk"}</Button>{shouldShowForgotPassword(failedAttempts) && <button type="button" className="text-link forgot-link" onClick={() => setShowHelp(true)}>Lupa Password?</button>}<small>Sesi tersimpan selama tab ini terbuka agar Anda tidak perlu masuk ulang setelah halaman dimuat ulang. Keluar atau masa berlaku token yang habis akan mengakhiri sesi.</small></form></section></div>;
}
