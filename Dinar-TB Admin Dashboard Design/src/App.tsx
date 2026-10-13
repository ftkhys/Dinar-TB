import { useMemo, useState, type ReactNode } from "react";

type Page = "Beranda" | "Pasien" | "Kontrol" | "Pengingat" | "Laporan" | "Pengaturan";
type Activity = { id: number; actor: string; action: string; subject?: string; time: string; icon: IconName };
type ControlVisit = { date: string; type: string; medicine: string; medicineDate?: string; note: string; scheduleUpdate: string };
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

function Search({ value, onChange, placeholder = "Cari data..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search"><Icon name="search" size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const nav: { label: Page; icon: IconName }[] = [
  { label: "Beranda", icon: "home" }, { label: "Pasien", icon: "users" },
  { label: "Kontrol", icon: "calendar" }, { label: "Pengingat", icon: "bell" },
  { label: "Laporan", icon: "chart" }, { label: "Pengaturan", icon: "settings" },
];

const patients = [
  { reg: "2026-00004647-0014", name: "Siti Nur Afifah", month: "Bulan ke-3", date: "25 Sep 2026", status: "Sesuai", phone: "0812 8846 2014", address: "Kec. Cipayung, Jakarta Timur" },
  { reg: "2026-00005112-0021", name: "Ahmad Fauzan", month: "Bulan ke-5", date: "24 Sep 2026", status: "Terlambat", phone: "0813 7734 1190", address: "Kec. Ciracas, Jakarta Timur" },
  { reg: "2026-00005289-0008", name: "Rina Marlina", month: "Bulan ke-2", date: "25 Sep 2026", status: "Hari Ini", phone: "0857 1192 8450", address: "Kec. Cipayung, Jakarta Timur" },
  { reg: "2026-00005301-0016", name: "Budi Santoso", month: "Bulan ke-4", date: "26 Sep 2026", status: "Besok", phone: "0812 2217 6651", address: "Kec. Makasar, Jakarta Timur" },
  { reg: "2026-00005433-0003", name: "Nur Aisyah", month: "Bulan ke-1", date: "30 Sep 2026", status: "Mendatang", phone: "0819 3310 2844", address: "Kec. Ciracas, Jakarta Timur" },
  { reg: "2026-00004820-0011", name: "Dedi Supriyadi", month: "Bulan ke-6", date: "25 Sep 2026", status: "Hari Ini", phone: "0878 2104 9921", address: "Kec. Cipayung, Jakarta Timur" },
];

const reminders = [
  { reg: patients[0].reg, name: patients[0].name, schedule: "07.00 WIB", status: "Sudah Konfirmasi", time: "07.18 WIB" },
  { reg: patients[1].reg, name: patients[1].name, schedule: "07.00 WIB", status: "Belum Konfirmasi", time: "—" },
  { reg: patients[2].reg, name: patients[2].name, schedule: "06.30 WIB", status: "Sudah Konfirmasi", time: "06.42 WIB" },
  { reg: patients[3].reg, name: patients[3].name, schedule: "08.00 WIB", status: "Belum Konfirmasi", time: "—" },
  { reg: patients[4].reg, name: patients[4].name, schedule: "07.30 WIB", status: "Sudah Konfirmasi", time: "07.31 WIB" },
];

const initialActivities: Activity[] = [
  { id: 1, actor: "Bidan Rina", action: "mengubah jadwal kontrol", subject: "Siti Nur Afifah", time: "15 Okt 2026, 09.15", icon: "calendar" },
  { id: 2, actor: "Nadia Sari", action: "mencatat kontrol dan pemberian obat", subject: "Rina Marlina", time: "15 Okt 2026, 08.42", icon: "check" },
  { id: 3, actor: "dr. Andi Pratama", action: "mengedit informasi pasien", subject: "Ahmad Fauzan", time: "14 Okt 2026, 16.20", icon: "edit" },
  { id: 4, actor: "Nadia Sari", action: "menambahkan pasien", subject: "Nur Aisyah", time: "14 Okt 2026, 11.05", icon: "users" },
  { id: 5, actor: "Bidan Rina", action: "masuk ke workspace Puskesmas Cipayung", time: "14 Okt 2026, 07.34 • Chrome di Windows", icon: "lock" },
];

function AppShell({ page, setPage, children, activities, onHelp, onLogout }: {
  page: Page; setPage: (p: Page) => void; children: ReactNode; activities: Activity[]; onHelp: () => void; onLogout: () => void;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><img src="/image/logo.svg" alt="Logo Dinar-TB" /></span><span>Dinar-TB.</span></div>
      <nav>{nav.map((item) => <button key={item.label} className={`nav-item ${page === item.label ? "active" : ""}`} onClick={() => setPage(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <button className="sidebar-help" onClick={onHelp}><span className="help-icon">?</span><div><strong>Butuh bantuan?</strong><small>Panduan Dinar-TB</small></div></button>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><small>Dashboard Admin</small><strong>{page}</strong></div>
        <div className="top-actions"><Search value="" onChange={() => {}} placeholder="Cari sesuatu..." /><button className="icon-btn activity-trigger" aria-label="Notifikasi dan aktivitas" onClick={() => setActivityOpen(!activityOpen)}><Icon name="bell" /><i>{activities.length}</i></button><button className="account-trigger" onClick={() => setAccountOpen(!accountOpen)}><div className="avatar">NS</div><div className="staff"><strong>Nadia Sari</strong><small>Petugas TB</small></div></button></div>
        {activityOpen && <ActivityPanel activities={activities} onClose={() => setActivityOpen(false)} />}
        {accountOpen && <div className="account-menu"><strong>Nadia Sari</strong><span>nadia.sari@puskesmas.id</span><small>Puskesmas Cipayung • Workspace bersama</small><Button variant="secondary" icon="logout" onClick={onLogout}>Keluar</Button></div>}
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}

function ActivityPanel({ activities, onClose }: { activities: Activity[]; onClose: () => void }) {
  return <div className="activity-panel"><div className="panel-head"><div><h2>Notifikasi & Aktivitas</h2><p>Riwayat tindakan petugas di workspace yang sama.</p></div><button className="close-btn" onClick={onClose}>×</button></div><div className="prototype-note"><Icon name="alert" size={15} /><span>Contoh riwayat audit untuk prototipe; belum tersinkron dengan backend.</span></div><div className="activity-list">{activities.map(item => <div key={item.id}><span className="activity-icon"><Icon name={item.icon} size={15} /></span><div><p><strong>{item.actor}</strong> {item.action}{item.subject && <> <b>{item.subject}</b></>}</p><small>{item.time}</small></div></div>)}</div></div>;
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const guides = [
    ["Mengelola data pasien", "Gunakan menu Pasien untuk menambah, mengimpor, melihat, mengedit, atau menghapus data pasien."],
    ["Mengubah jadwal kontrol", "Pilih Ubah Jadwal pada baris pasien. Perubahan ini hanya memperbarui jadwal mendatang dan tidak mengubah riwayat kunjungan."],
    ["Mencatat kontrol dadakan", "Pilih + Tambah/Catat Kontrol, cari pasien yang sudah terdaftar, lalu catat tanggal kunjungan aktual."],
    ["Mencatat pemberian obat", "Pilih Ya jika obat diberikan dan isi tanggal pemberian. Jadwal berikutnya dihitung dari tanggal tersebut."],
    ["Memahami notifikasi dan riwayat aktivitas", "Ikon lonceng menampilkan contoh aktivitas seluruh petugas dalam workspace Puskesmas yang sama."],
  ];
  return <Dialog title="Panduan Penggunaan Dinar-TB" subtitle="Panduan singkat untuk Admin dan Bidan." onClose={onClose} wide><div className="guide-list">{guides.map(([title, text], i) => <div key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="prototype-note"><Icon name="alert" size={15} /><span>Dinar-TB pada layar ini adalah prototipe antarmuka. Sinkronisasi dan pencatatan audit belum terhubung ke layanan backend.</span></div><div className="dialog-actions"><Button onClick={onClose}>Selesai</Button></div></Dialog>;
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
  if (["Besok", "Mendatang"].includes(status)) return "yellow";
  return "blue";
}

function LineChart() {
  return <div className="chart-wrap">
    <svg viewBox="0 0 620 220" role="img" aria-label="Grafik pasien baru enam bulan">
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3156ff" stopOpacity=".2" /><stop offset="100%" stopColor="#3156ff" stopOpacity="0" /></linearGradient></defs>
      {[40, 85, 130, 175].map((y) => <line key={y} x1="38" x2="600" y1={y} y2={y} stroke="#edf0f7" />)}
      <path d="M38 170 C85 105 120 165 155 120 S220 120 255 55 S325 165 365 130 S430 70 470 125 S535 100 600 74 L600 190 L38 190Z" fill="url(#area)" />
      <path d="M38 170 C85 105 120 165 155 120 S220 120 255 55 S325 165 365 130 S430 70 470 125 S535 100 600 74" fill="none" stroke="#2447ff" strokeWidth="3" strokeLinecap="round" />
      {["Apr", "Mei", "Jun", "Jul", "Agu", "Sep"].map((m, i) => <text key={m} x={50 + i * 108} y="212" fill="#8b94af" fontSize="12">{m}</text>)}
    </svg>
  </div>;
}

function Donut() {
  return <div className="donut-row"><div className="donut"><div><strong>70</strong><span>pasien</span></div></div><div className="legend"><span><i className="dot blue" />Sudah konfirmasi <b>47</b></span><span><i className="dot pale" />Belum konfirmasi <b>23</b></span></div></div>;
}

function HomePage({ go }: { go: (page: Page) => void }) {
  return <>
    <PageTitle title="Selamat pagi, Nadia" subtitle="Berikut ringkasan pemantauan pasien TB hari ini, Jumat 25 September 2026." action={<Button variant="secondary" icon="download">Unduh Ringkasan</Button>} />
    <div className="stats-grid"><StatCard label="Total Pasien" value={70} icon="users" /><StatCard label="Kontrol Hari Ini" value={10} icon="calendar" tone="teal" /><StatCard label="Jadwal Mendatang" value={5} icon="clock" tone="yellow" /><StatCard label="Perlu Tindak Lanjut" value={3} icon="alert" tone="red" note="Butuh perhatian" /></div>
    <div className="dashboard-grid">
      <section className="card chart-card"><div className="card-head"><div><h2>Pasien Baru</h2><p>Jumlah pasien terdaftar dalam 6 bulan terakhir</p></div><Badge>Apr–Sep 2026</Badge></div><LineChart /></section>
      <section className="card"><div className="card-head"><div><h2>Status Minum Obat Hari Ini</h2><p>Pembaruan hingga 10.24 WIB</p></div></div><Donut /><button className="text-link" onClick={() => go("Pengingat")}>Lihat pemantauan lengkap →</button></section>
    </div>
    <section className="card follow-card"><div className="card-head"><div><h2>Perlu Tindak Lanjut</h2><p>Pasien yang membutuhkan perhatian petugas</p></div><button className="text-link" onClick={() => go("Pasien")}>Lihat semua →</button></div>
      <div className="follow-list">{patients.slice(1, 4).map((p, i) => <div key={p.reg}><div className="patient-avatar">{p.name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><strong>{p.name}</strong><span>{p.reg}</span></div><Badge tone={i === 0 ? "red" : "yellow"}>{i === 0 ? "Kontrol terlambat" : "Belum konfirmasi"}</Badge><Button variant="ghost">Tindak Lanjut</Button></div>)}</div>
    </section>
  </>;
}

function PatientTable({ onDetail, onEdit, onDelete, expanded = false }: {
  onDetail: (index: number) => void; onEdit: (index: number) => void; onDelete: (index: number) => void; expanded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Semua");
  const data = patients.filter(p => (p.name + p.reg).toLowerCase().includes(query.toLowerCase()) && (status === "Semua" || p.status === status));
  return <div className="table-card">
    {expanded && <div className="table-tools"><Search value={query} onChange={setQuery} placeholder="Cari nama atau nomor register..." /><select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter status"><option>Semua</option><option>Sesuai</option><option>Hari Ini</option><option>Besok</option><option>Terlambat</option></select></div>}
    <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Lengkap</th><th>Bulan Pengobatan</th><th>Jadwal Kontrol</th><th>Status Kontrol</th><th>Aksi</th></tr></thead>
      <tbody>{data.map((p, i) => <tr key={p.reg}><td>{String(i + 1).padStart(2, "0")}.</td><td>{p.reg}</td><td><button className="name-link" onClick={() => onDetail(i)}>{p.name}</button></td><td>{p.month}</td><td>{p.date}</td><td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td><td><div className="row-actions"><button onClick={() => onDetail(i)} aria-label="Lihat"><Icon name="eye" size={16} /></button><button onClick={() => onEdit(i)} aria-label="Edit"><Icon name="edit" size={16} /></button><button className="danger-icon" onClick={() => onDelete(i)} aria-label="Hapus"><Icon name="trash" size={16} /></button></div></td></tr>)}</tbody>
    </table></div>
    {expanded && <div className="pagination"><span>Menampilkan 1–6 dari 70 pasien</span><div><button disabled>‹</button><button className="current">1</button><button>2</button><button>3</button><button>›</button></div></div>}
  </div>;
}

function Dialog({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="overlay" role="presentation" onMouseDown={onClose}><div className={`dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><div className="dialog-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="close-btn" onClick={onClose}>×</button></div>{children}</div></div>;
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PatientForm({ onClose, onSave, edit }: { onClose: () => void; onSave: () => void; edit?: typeof patients[number] }) {
  return <Dialog title={edit ? "Edit Data Pasien" : "Tambah Pasien"} subtitle="Lengkapi informasi pasien sesuai data Puskesmas." onClose={onClose} wide>
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div className="form-section"><h3>Identitas Pasien</h3><div className="form-grid">
        <Field label="Nomor Register" required><input defaultValue={edit?.reg} placeholder="Contoh: 2026-00005721-0001" required /></Field>
        <Field label="Nama Lengkap" required><input defaultValue={edit?.name} placeholder="Nama sesuai identitas" required /></Field>
        <Field label="Tanggal Lahir" required><input type="date" defaultValue="1990-04-16" required /></Field>
        <Field label="Jenis Kelamin" required><select defaultValue="Perempuan"><option>Perempuan</option><option>Laki-laki</option></select></Field>
        <Field label="Nomor Telepon" required><input defaultValue={edit?.phone} placeholder="08xxxxxxxxxx" required /></Field>
        <Field label="Alamat"><input defaultValue={edit?.address} placeholder="Alamat tempat tinggal" /></Field>
      </div></div>
      <div className="form-section"><h3>Informasi Pengobatan</h3><div className="form-grid">
        <Field label="Tanggal Mulai Pengobatan" required><input type="date" defaultValue="2026-07-12" required /></Field>
        <Field label="Tahap Pengobatan" required><select defaultValue={edit?.month || "Bulan ke-1"}><option>Bulan ke-1</option><option>Bulan ke-2</option><option>Bulan ke-3</option><option>Bulan ke-4</option><option>Bulan ke-5</option><option>Bulan ke-6</option></select></Field>
        <Field label="Jadwal Kontrol Berikutnya" required hint="Dapat diperbarui melalui menu Kontrol."><input type="date" defaultValue="2026-09-25" required /></Field>
        <Field label="Waktu Minum Obat"><input type="time" defaultValue="07:00" /></Field>
      </div></div>
      <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" icon="check">{edit ? "Simpan Perubahan" : "Simpan Pasien"}</Button></div>
    </form>
  </Dialog>;
}

function ImportDialog({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [step, setStep] = useState(1);
  return <Dialog title="Impor Data Pasien" subtitle="Tambahkan beberapa pasien sekaligus dari file Excel." onClose={onClose} wide>
    <div className="steps"><span className={step >= 1 ? "active" : ""}><b>1</b>Unggah File</span><i /><span className={step >= 2 ? "active" : ""}><b>2</b>Validasi Data</span><i /><span className={step >= 3 ? "active" : ""}><b>3</b>Konfirmasi</span></div>
    {step === 1 && <><div className="upload-zone"><div className="upload-icon"><Icon name="upload" /></div><strong>Tarik file Excel ke sini</strong><span>atau pilih file dari komputer Anda</span><Button variant="secondary">Pilih File .xlsx</Button><small>Format .xlsx, maksimal 10 MB</small></div><div className="info-box"><Icon name="file" /><div><strong>Gunakan format yang sesuai</strong><span>Kolom wajib: Nomor Register, Nama Lengkap, Tanggal Lahir, Nomor Telepon, dan Tanggal Mulai Pengobatan.</span></div><button>Unduh template</button></div></>}
    {step === 2 && <><div className="import-summary"><div><strong>6</strong><span>Total baris</span></div><div className="valid"><strong>4</strong><span>Data valid</span></div><div className="invalid"><strong>2</strong><span>Perlu diperbaiki</span></div></div><div className="mini-table"><div><b>Baris 2</b><span>Siti Rahmawati</span><Badge tone="green">Valid</Badge></div><div><b>Baris 3</b><span>Agus Setiawan</span><Badge tone="green">Valid</Badge></div><div><b>Baris 5</b><span>Nomor telepon tidak valid</span><Badge tone="red">Tidak Valid</Badge></div><div><b>Baris 6</b><span>Potensi duplikat nomor register</span><Badge tone="red">Tidak Valid</Badge></div></div><p className="muted-note">Hanya 4 data valid yang akan disimpan. Data tidak valid tidak akan diimpor.</p></>}
    {step === 3 && <div className="confirm-import"><div className="success-circle"><Icon name="check" size={28} /></div><h3>Data siap diimpor</h3><p>4 data pasien valid akan ditambahkan. Periksa kembali sebelum menyimpan.</p><div className="confirm-file"><Icon name="file" /><div><strong>Data_Pasien_September.xlsx</strong><span>4 data valid • 2 dilewati</span></div></div></div>}
    <div className="dialog-actions">{step > 1 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>Kembali</Button> : <Button variant="secondary" onClick={onClose}>Batal</Button>}<Button onClick={() => step < 3 ? setStep(step + 1) : onSave()}>{step === 1 ? "Unggah & Validasi" : step === 2 ? "Lanjutkan" : "Konfirmasi Impor"}</Button></div>
  </Dialog>;
}

function PatientDetail({ patient, onClose, onEdit }: { patient: typeof patients[number]; onClose: () => void; onEdit: () => void }) {
  const details = [["Nomor Register", patient.reg], ["Nama Lengkap", patient.name], ["Tanggal Lahir", "16 April 1990 (36 tahun)"], ["Jenis Kelamin", "Perempuan"], ["Nomor Telepon", patient.phone], ["Alamat", patient.address], ["Mulai Pengobatan", "12 Juli 2026"], ["Tahap Pengobatan", patient.month], ["Kontrol Berikutnya", patient.date], ["Waktu Minum Obat", "07.00 WIB"]];
  return <Dialog title="Detail Pasien" subtitle={patient.reg} onClose={onClose} wide><div className="profile-head"><div className="large-avatar">{patient.name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><h3>{patient.name}</h3><span>Pasien pengobatan TB • {patient.month}</span></div><Badge tone={statusTone(patient.status)}>{patient.status}</Badge></div><div className="detail-grid">{details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="history-section"><div className="section-heading"><h2>Riwayat Kontrol</h2><p>Semua kunjungan tetap tercatat pada profil pasien yang sama.</p></div><ControlTimeline visits={sampleVisits} /></div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Tutup</Button><Button icon="edit" onClick={onEdit}>Edit Data</Button></div></Dialog>;
}

function PatientsPage({ notify, addActivity }: { notify: (s: string) => void; addActivity: (activity: Omit<Activity, "id">) => void }) {
  const [viewAll, setViewAll] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [add, setAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  return <>
    <PageTitle title={viewAll ? "Direktori Pasien" : "Data Pasien"} subtitle={viewAll ? "Cari dan kelola seluruh data pasien TBC terdaftar." : "Pantau informasi dan perkembangan pasien dalam satu tempat."} action={<div className="action-group">{viewAll && <Button variant="secondary" onClick={() => setViewAll(false)}>Kembali</Button>}<Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>Impor Excel</Button><Button icon="plus" onClick={() => setAdd(true)}>Tambah Pasien</Button></div>} />
    {!viewAll && <div className="stats-grid"><StatCard label="Total Pasien" value={70} icon="users" /><StatCard label="Kontrol Sesuai" value={52} icon="check" tone="teal" /><StatCard label="Jadwal Dekat" value={5} icon="clock" tone="yellow" /><StatCard label="Terlambat" value={3} icon="alert" tone="red" /></div>}
    <section className="card no-pad"><div className="card-head table-title"><div><h2>{viewAll ? "Semua Pasien" : "Data Pasien TBC"}</h2><p>{viewAll ? "70 pasien terdaftar" : "Pasien dengan jadwal kontrol terdekat"}</p></div>{!viewAll && <button className="text-link" onClick={() => setViewAll(true)}>Lihat selengkapnya →</button>}</div><PatientTable expanded={viewAll} onDetail={setDetail} onEdit={setEdit} onDelete={setDeleting} /></section>
    {detail !== null && <PatientDetail patient={patients[detail]} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}
    {edit !== null && <PatientForm edit={patients[edit]} onClose={() => setEdit(null)} onSave={() => { addActivity({ actor: "Nadia Sari", action: "mengedit informasi pasien", subject: patients[edit].name, time: "Hari ini, 10.18", icon: "edit" }); setEdit(null); notify("Perubahan data pasien berhasil disimpan."); }} />}
    {add && <PatientForm onClose={() => setAdd(false)} onSave={() => { addActivity({ actor: "Nadia Sari", action: "menambahkan pasien", subject: "Pasien baru", time: "Hari ini, 10.20", icon: "users" }); setAdd(false); notify("Pasien baru berhasil ditambahkan."); }} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onSave={() => { setImporting(false); notify("4 data pasien berhasil diimpor."); }} />}
    {deleting !== null && <Dialog title="Hapus data pasien?" subtitle="Tindakan ini tidak dapat dibatalkan." onClose={() => setDeleting(null)}><div className="confirm-delete"><div className="alert-circle"><Icon name="trash" /></div><p>Data <strong>{patients[deleting].name}</strong> dengan nomor register <strong>{patients[deleting].reg}</strong> akan dihapus dari daftar pasien.</p></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>Batal</Button><Button variant="danger" onClick={() => { addActivity({ actor: "Nadia Sari", action: "menghapus data pasien", subject: patients[deleting].name, time: "Hari ini, 10.24", icon: "trash" }); setDeleting(null); notify(`Data ${patients[deleting].name} berhasil dihapus dan dicatat di aktivitas.`); }}>Ya, Hapus Pasien</Button></div></Dialog>}
  </>;
}

const sampleVisits: ControlVisit[] = [
  { date: "11 Sep 2026", type: "Kontrol Terjadwal", medicine: "Obat diberikan", medicineDate: "11 Sep 2026", note: "Pasien hadir sesuai jadwal.", scheduleUpdate: "Jadwal berikutnya 25 Sep 2026" },
  { date: "28 Agu 2026", type: "Kontrol Terjadwal", medicine: "Obat diberikan", medicineDate: "28 Agu 2026", note: "Tidak ada keluhan.", scheduleUpdate: "Jadwal berikutnya 11 Sep 2026" },
  { date: "14 Agu 2026", type: "Kontrol di Luar Jadwal", medicine: "Tanpa pemberian obat", note: "Kunjungan konsultasi.", scheduleUpdate: "Jadwal tidak berubah" },
];

const scheduleDates = ["2026-09-25", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-30", "2026-09-25"];

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function nextControlDate(medicineDate: string) {
  if (!medicineDate) return "";
  const date = new Date(`${medicineDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 14);
  while (![3, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function ControlTimeline({ visits }: { visits: ControlVisit[] }) {
  return <div className="timeline">{visits.map((visit, i) => <div key={`${visit.date}-${i}`}><i className={visit.medicine === "Tanpa pemberian obat" ? "muted" : ""} /><div><div className="timeline-title"><strong>{visit.date}</strong><Badge tone={visit.type.includes("Luar") ? "yellow" : "blue"}>{visit.type}</Badge></div><span>{visit.medicine}{visit.medicineDate ? ` • ${visit.medicineDate}` : ""} • {visit.scheduleUpdate}</span><p>{visit.note}</p></div></div>)}</div>;
}

function ControlPage({ notify, addActivity }: { notify: (s: string) => void; addActivity: (activity: Omit<Activity, "id">) => void }) {
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSource, setRecordSource] = useState<"table" | "new">("new");
  const [selectedPatient, setSelectedPatient] = useState(0);
  const [patientQuery, setPatientQuery] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const [medicine, setMedicine] = useState("Ya");
  const [visitDate, setVisitDate] = useState("2026-10-13");
  const [medicineDate, setMedicineDate] = useState("2026-10-14");
  const [editSchedule, setEditSchedule] = useState<number | null>(null);
  const [newSchedule, setNewSchedule] = useState("2026-10-19");
  const [schedules, setSchedules] = useState(scheduleDates);
  const [visits, setVisits] = useState<Record<string, ControlVisit[]>>({});
  const filters = ["Semua", "Hari Ini", "Besok", "Terlambat", "Mendatang", "Selesai"];
  const filtered = patients.filter(p => (filter === "Semua" || p.status === filter) && (p.name + p.reg).toLowerCase().includes(query.toLowerCase()));
  const patientMatches = patients.filter(p => (p.name + p.reg).toLowerCase().includes(patientQuery.toLowerCase()));
  const calculatedSchedule = medicine === "Ya" ? nextControlDate(medicineDate) : schedules[selectedPatient];
  const openRecord = (index: number, source: "table" | "new") => { setSelectedPatient(index); setRecordSource(source); setRecordOpen(true); setPatientQuery(""); };
  const saveVisit = () => {
    const patient = patients[selectedPatient];
    const outside = recordSource === "new" || visitDate !== schedules[selectedPatient];
    const visit: ControlVisit = {
      date: formatDate(visitDate), type: outside ? "Kontrol di Luar Jadwal" : "Kontrol Terjadwal",
      medicine: medicine === "Ya" ? "Obat diberikan" : "Tanpa pemberian obat",
      medicineDate: medicine === "Ya" ? formatDate(medicineDate) : undefined,
      note: outside ? "Kunjungan aktual dicatat tanpa membuat profil pasien baru." : "Pasien hadir sesuai jadwal.",
      scheduleUpdate: medicine === "Ya" ? `Jadwal berikutnya ${formatDate(calculatedSchedule)}` : `Jadwal tetap ${formatDate(schedules[selectedPatient])}`,
    };
    setVisits(current => ({ ...current, [patient.reg]: [visit, ...(current[patient.reg] || sampleVisits)] }));
    if (medicine === "Ya") {
      setSchedules(current => current.map((date, index) => index === selectedPatient ? calculatedSchedule : date));
      addActivity({ actor: "Nadia Sari", action: "mencatat kontrol dan pemberian obat", subject: patient.name, time: "Hari ini, 10.32", icon: "check" });
    } else addActivity({ actor: "Nadia Sari", action: "mencatat kunjungan kontrol tanpa pemberian obat", subject: patient.name, time: "Hari ini, 10.32", icon: "calendar" });
    setRecordOpen(false);
    notify(medicine === "Ya" ? `Kontrol tersimpan. Jadwal berikutnya ${formatDate(calculatedSchedule)}.` : "Kontrol tersimpan. Jadwal lama tetap berlaku.");
  };
  return <>
    <PageTitle title="Jadwal Kontrol" subtitle="Kelola jadwal dan catat kunjungan kontrol pasien TB." action={<Button icon="plus" onClick={() => openRecord(0, "new")}>Tambah/Catat Kontrol</Button>} />
    <div className="stats-grid"><StatCard label="Kontrol Hari Ini" value={10} icon="calendar" /><StatCard label="Jadwal Mendatang" value={10} icon="clock" tone="yellow" /><StatCard label="Terlambat" value={3} icon="alert" tone="red" /><StatCard label="Selesai Hari Ini" value={7} icon="check" tone="teal" /></div>
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Daftar Jadwal Kontrol</h2><p>Jadwal tetap terlihat hingga ditangani petugas</p></div></div><div className="control-tools"><Search value={query} onChange={setQuery} placeholder="Cari nama / nomor register..." /><button className="filter-button"><Icon name="filter" size={16} />Filter tanggal</button></div><div className="tabs">{filters.map(f => <button key={f} onClick={() => setFilter(f)} className={filter === f ? "active" : ""}>{f}</button>)}</div>
      <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Pasien</th><th>Jadwal Kontrol</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filtered.map((p, i) => { const patientIndex = patients.indexOf(p); return <tr key={p.reg}><td>{String(i + 1).padStart(2, "0")}.</td><td>{p.reg}</td><td><button className="name-link" onClick={() => setDetail(patientIndex)}>{p.name}</button></td><td>{formatDate(schedules[patientIndex])}</td><td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td><td><div className="control-actions"><button className="edit-link" onClick={() => { setEditSchedule(patientIndex); setNewSchedule(schedules[patientIndex]); }}><Icon name="edit" size={14} />Ubah Jadwal</button>{["Hari Ini", "Terlambat"].includes(p.status) ? <Button variant="secondary" onClick={() => openRecord(patientIndex, "table")}>Catat Kontrol</Button> : <button className="text-link" onClick={() => setDetail(patientIndex)}>Riwayat</button>}</div></td></tr>; })}</tbody></table></div>
      <div className="pagination"><span>Menampilkan {filtered.length} jadwal</span><div><button className="current">1</button><button>2</button><button>›</button></div></div>
    </section>
    {recordOpen && <Dialog title="Tambah/Catat Kontrol" subtitle="Catat kunjungan aktual untuk pasien yang sudah terdaftar. Formulir ini tidak membuat pasien baru." onClose={() => setRecordOpen(false)} wide><form onSubmit={e => { e.preventDefault(); saveVisit(); }}>{recordSource === "new" && <div className="patient-search"><Field label="Cari pasien dengan nama atau nomor register" required><Search value={patientQuery} onChange={setPatientQuery} placeholder="Ketik nama atau nomor register..." /></Field><div className="patient-results">{patientMatches.map(patient => { const index = patients.indexOf(patient); return <button type="button" className={selectedPatient === index ? "active" : ""} key={patient.reg} onClick={() => setSelectedPatient(index)}><div className="patient-avatar">{patient.name.split(" ").map(n => n[0]).slice(0, 2)}</div><span><strong>{patient.name}</strong><small>{patient.reg}</small></span>{selectedPatient === index && <Icon name="check" size={16} />}</button>; })}</div></div>}<div className="patient-strip"><div className="patient-avatar">{patients[selectedPatient].name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><strong>{patients[selectedPatient].name}</strong><span>{patients[selectedPatient].reg} • {patients[selectedPatient].phone} • {patients[selectedPatient].address}</span></div><Badge tone="navy">{patients[selectedPatient].month}</Badge></div><div className="form-grid">
      <Field label="Jadwal Kontrol Saat Ini"><input type="date" value={schedules[selectedPatient]} readOnly /></Field><Field label="Tanggal Kunjungan Aktual" required><input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} required /></Field>
      <Field label="Obat diberikan?" required><div className="segmented"><button type="button" onClick={() => setMedicine("Ya")} className={medicine === "Ya" ? "active" : ""}>Ya</button><button type="button" onClick={() => setMedicine("Tidak")} className={medicine === "Tidak" ? "active" : ""}>Tidak</button></div></Field>
      <Field label="Tanggal Pemberian Obat" required={medicine === "Ya"}><input type="date" value={medicine === "Ya" ? medicineDate : ""} onChange={e => setMedicineDate(e.target.value)} disabled={medicine === "Tidak"} required={medicine === "Ya"} /></Field>
      <Field label="Jadwal Kontrol Berikutnya" hint={medicine === "Ya" ? "Otomatis: 14 hari dari pemberian obat, dimundurkan ke Rabu/Sabtu sebelumnya." : "Jadwal lama tetap berlaku karena obat tidak diberikan."}><input type="date" value={calculatedSchedule} readOnly /></Field>
      <Field label="Catatan Kunjungan"><textarea placeholder="Tambahkan catatan petugas..." rows={3} /></Field>
    </div><div className={`rule-box ${medicine === "Tidak" ? "unchanged" : ""}`}><Icon name="calendar" /><div><strong>{medicine === "Ya" ? `Jadwal diperbarui menjadi ${formatDate(calculatedSchedule)}` : "Kunjungan dicatat, jadwal tidak berubah"}</strong><span>{medicine === "Ya" ? `Perhitungan memakai tanggal pemberian obat ${formatDate(medicineDate)}, bukan tanggal kunjungan, lalu mengikuti hari layanan Rabu/Sabtu.` : "Tanpa pemberian obat, jadwal yang sudah ada tetap berlaku sampai petugas menggunakan tindakan Ubah Jadwal."}</span></div></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setRecordOpen(false)}>Batal</Button><Button type="submit" icon="check">Simpan Catatan Kontrol</Button></div></form></Dialog>}
    {editSchedule !== null && <Dialog title="Ubah Jadwal Kontrol" subtitle="Perubahan ini memperbarui jadwal mendatang, bukan riwayat kunjungan pasien." onClose={() => setEditSchedule(null)}><form onSubmit={e => { e.preventDefault(); const patient = patients[editSchedule]; setSchedules(current => current.map((date, index) => index === editSchedule ? newSchedule : date)); addActivity({ actor: "Nadia Sari", action: "mengubah jadwal kontrol", subject: patient.name, time: "Hari ini, 10.28", icon: "calendar" }); setEditSchedule(null); notify(`Jadwal ${patient.name} berhasil diubah ke ${formatDate(newSchedule)}.`); }}><div className="patient-strip"><div className="patient-avatar">{patients[editSchedule].name.split(" ").map(n => n[0]).slice(0, 2)}</div><div><strong>{patients[editSchedule].name}</strong><span>{patients[editSchedule].reg}</span></div></div><div className="schedule-change"><div><span>Jadwal saat ini</span><strong>{formatDate(schedules[editSchedule])}</strong></div><Icon name="chevron" /><div><span>Jadwal baru</span><input type="date" value={newSchedule} onChange={e => setNewSchedule(e.target.value)} required /></div></div><div className="info-box"><Icon name="alert" /><div><strong>Riwayat kunjungan tetap utuh</strong><span>Hanya tanggal kontrol mendatang yang diubah. Kunjungan sebelumnya tidak diedit atau dihapus.</span></div></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setEditSchedule(null)}>Batal</Button><Button type="submit" icon="check">Simpan Jadwal Baru</Button></div></form></Dialog>}
    {detail !== null && <Dialog title="Riwayat Kontrol Pasien" subtitle={`${patients[detail].name} • ${patients[detail].reg}`} onClose={() => setDetail(null)} wide><ControlTimeline visits={visits[patients[detail].reg] || sampleVisits} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button></div></Dialog>}
  </>;
}

function ReminderPage() {
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const data = reminders.filter(r => (filter === "Semua" || r.status === filter) && (r.name + r.reg).toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageTitle title="Pengingat Obat" subtitle="Pantau konfirmasi minum obat pasien untuk hari ini." action={<div className="date-chip"><Icon name="calendar" size={16} />25 September 2026</div>} />
    <div className="stats-grid"><StatCard label="Pengingat Hari Ini" value={70} icon="bell" /><StatCard label="Sudah Konfirmasi" value={47} icon="check" tone="teal" /><StatCard label="Belum Konfirmasi" value={23} icon="clock" tone="yellow" /><StatCard label="Perlu Perhatian" value={4} icon="alert" tone="red" /></div>
    <div className="notice"><Icon name="clock" /><div><strong>Status hari ini masih berjalan</strong><span>Pasien yang belum mengonfirmasi tidak dikategorikan melewatkan obat sampai hari berakhir. Pengingat malam dikirim pukul 20.00 WIB.</span></div></div>
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Konfirmasi Minum Obat</h2><p>Pembaruan otomatis dari aplikasi pasien</p></div></div><div className="control-tools"><Search value={query} onChange={setQuery} placeholder="Cari pasien..." /><div className="tabs compact">{["Semua", "Sudah Konfirmasi", "Belum Konfirmasi"].map(f => <button className={filter === f ? "active" : ""} onClick={() => setFilter(f)} key={f}>{f}</button>)}</div></div>
      <div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Pasien</th><th>Jadwal Pengingat</th><th>Status Konfirmasi</th><th>Waktu Konfirmasi</th><th>Aksi</th></tr></thead><tbody>{data.map((r, i) => <tr key={r.reg}><td>{String(i + 1).padStart(2, "0")}.</td><td>{r.reg}</td><td>{r.name}</td><td>{r.schedule}</td><td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td><td>{r.time}</td><td><button className="text-link" onClick={() => setDetail(i)}>Detail</button></td></tr>)}</tbody></table></div>
    </section>
    {detail !== null && <Dialog title="Riwayat Konfirmasi" subtitle={`${reminders[detail].name} • 7 hari terakhir`} onClose={() => setDetail(null)}><div className="adherence-summary"><div className="progress-ring">86%</div><div><strong>6 dari 7 hari terkonfirmasi</strong><span>Riwayat ini hanya mencatat konfirmasi pasien, bukan penilaian klinis.</span></div></div><div className="history-list">{["25 Sep|07.18 WIB|Terkonfirmasi", "24 Sep|07.05 WIB|Terkonfirmasi", "23 Sep|—|Tidak ada konfirmasi", "22 Sep|07.14 WIB|Terkonfirmasi"].map((d, i) => { const [date, time, status] = d.split("|"); return <div key={date}><span>{date}</span><b>{time}</b><Badge tone={i === 2 ? "red" : "green"}>{status}</Badge></div>; })}</div><div className="dialog-actions"><Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button></div></Dialog>}
  </>;
}

function ReportsPage({ notify }: { notify: (s: string) => void }) {
  const [category, setCategory] = useState("Data Pasien");
  const categories = ["Data Pasien", "Riwayat Kontrol", "Pemberian Obat", "Konfirmasi Minum Obat", "Perlu Tindak Lanjut"];
  return <>
    <PageTitle title="Laporan" subtitle="Susun dan ekspor ringkasan data operasional Dinar-TB." action={<Button icon="download" onClick={() => notify("Ekspor Excel sedang disiapkan.")}>Ekspor .xlsx</Button>} />
    <section className="card report-filter"><div className="filter-grid"><Field label="Jenis Laporan"><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Tanggal Mulai"><input type="date" defaultValue="2026-09-01" /></Field><Field label="Tanggal Akhir"><input type="date" defaultValue="2026-09-25" /></Field><Field label="Pasien"><select><option>Semua Pasien</option>{patients.map(p => <option key={p.reg}>{p.name}</option>)}</select></Field><Button icon="filter">Terapkan Filter</Button></div></section>
    <div className="report-summary"><div><span>Periode Laporan</span><strong>1–25 September 2026</strong></div><div><span>Jenis Laporan</span><strong>{category}</strong></div><div><span>Jumlah Data</span><strong>70 rekaman</strong></div><div><span>Terakhir Diperbarui</span><strong>Hari ini, 10.24 WIB</strong></div></div>
    <div className="dashboard-grid report-grid"><section className="card"><div className="card-head"><div><h2>Ringkasan Kontrol</h2><p>Distribusi status pada periode terpilih</p></div></div><div className="bar-chart">{[["Sesuai", 52, "blue"], ["Terlambat", 8, "red"], ["Mendatang", 10, "yellow"]].map(([label, n, tone]) => <div key={label}><span>{label}</span><i><b className={`bar-${tone}`} style={{ width: `${Number(n) * 1.7}%` }} /></i><strong>{n}</strong></div>)}</div></section><section className="card"><div className="card-head"><div><h2>Catatan Privasi</h2><p>Informasi dalam berkas ekspor</p></div></div><div className="privacy-note"><Icon name="lock" /><p>Ekspor hanya memuat informasi yang diperlukan untuk laporan terpilih. <strong>NIK pasien tidak disertakan</strong> dalam berkas .xlsx.</p></div><div className="export-status"><span>Status ekspor terakhir</span><Badge tone="green">Berhasil</Badge><small>24 Sep 2026, 15.42 WIB</small></div></section></div>
    <section className="card no-pad"><div className="card-head table-title"><div><h2>Pratinjau Laporan</h2><p>{category} • 70 rekaman ditemukan</p></div></div><div className="table-scroll"><table><thead><tr><th>No.</th><th>Nomor Register</th><th>Nama Pasien</th><th>Tahap Pengobatan</th><th>Kontrol Berikutnya</th><th>Status</th></tr></thead><tbody>{patients.slice(0, 5).map((p, i) => <tr key={p.reg}><td>{i + 1}</td><td>{p.reg}</td><td>{p.name}</td><td>{p.month}</td><td>{p.date}</td><td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td></tr>)}</tbody></table></div></section>
  </>;
}

function SettingsPage({ notify }: { notify: (s: string) => void }) {
  const [tab, setTab] = useState("Profil dan Akun");
  const tabs = ["Profil dan Akun", "Pengaturan Jadwal", "Pengaturan Pengingat", "Impor dan Data", "Keamanan"];
  return <>
    <PageTitle title="Pengaturan" subtitle="Kelola profil, jadwal layanan, dan preferensi aplikasi." />
    <div className="settings-layout"><aside className="settings-nav">{tabs.map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}</button>)}</aside><section className="card settings-card">
      {tab === "Profil dan Akun" && <><div className="section-heading"><h2>Profil dan Akun</h2><p>Informasi ini ditampilkan pada akun petugas.</p></div><div className="profile-setting"><div className="large-avatar">NS</div><Button variant="secondary">Ubah Foto</Button></div><div className="form-grid"><Field label="Nama Tampilan"><input defaultValue="Nadia Sari" /></Field><Field label="Peran"><input value="Petugas TB" readOnly /></Field><Field label="Email"><input type="email" defaultValue="nadia.sari@puskesmas.id" /></Field><Field label="Nomor Telepon"><input defaultValue="0812 3388 2014" /></Field></div></>}
      {tab === "Pengaturan Jadwal" && <><div className="section-heading"><h2>Pengaturan Jadwal</h2><p>Aturan dasar penjadwalan kontrol pasien.</p></div><Field label="Hari Layanan Klinik TB"><div className="day-select"><button className="active">Rabu</button><button className="active">Sabtu</button></div></Field><div className="form-grid"><Field label="Interval Kontrol Standar"><div className="input-suffix"><input type="number" value="14" readOnly /><span>hari</span></div></Field><Field label="Dasar Perhitungan"><input value="Tanggal pemberian obat" readOnly /></Field></div><div className="notice small"><Icon name="alert" /><div><strong>Dampak pengaturan</strong><span>Tanggal 14 hari setelah pemberian obat akan dimundurkan ke hari Rabu atau Sabtu sebelumnya. Perubahan aturan harus dikonfirmasi oleh administrator.</span></div></div></>}
      {tab === "Pengaturan Pengingat" && <><div className="section-heading"><h2>Pengaturan Pengingat</h2><p>Atur waktu notifikasi untuk membantu pasien mengikuti jadwal obat.</p></div><div className="form-grid"><Field label="Pengingat Utama"><input type="time" defaultValue="07:00" /></Field><Field label="Pengingat Malam"><input type="time" defaultValue="20:00" /></Field></div><div className="setting-row"><div><strong>Kirim pengingat jika belum konfirmasi</strong><span>Notifikasi kedua dikirim pada waktu pengingat malam.</span></div><label className="switch"><input type="checkbox" defaultChecked /><i /></label></div><div className="notice small"><Icon name="clock" /><div><strong>Klasifikasi dosis terlewat</strong><span>Pasien baru ditandai tidak mengonfirmasi setelah hari berakhir, bukan pada waktu pengingat malam.</span></div></div></>}
      {tab === "Impor dan Data" && <><div className="section-heading"><h2>Impor dan Data</h2><p>Panduan format data pasien dari Excel.</p></div><div className="download-template"><div><Icon name="file" /><div><strong>Template Data Pasien Dinar-TB</strong><span>Format .xlsx • Diperbarui September 2026</span></div></div><Button variant="secondary" icon="download">Unduh Template</Button></div><div className="columns-info"><div><h3>Kolom wajib</h3><p>Nomor Register, Nama Lengkap, Tanggal Lahir, Nomor Telepon, Tanggal Mulai Pengobatan</p></div><div><h3>Kolom opsional</h3><p>Alamat, Jenis Kelamin, Tahap Pengobatan, Waktu Minum Obat, Catatan</p></div></div></>}
      {tab === "Keamanan" && <><div className="section-heading"><h2>Keamanan Akun</h2><p>Kelola kata sandi dan sesi akun Anda.</p></div><div className="form-grid"><Field label="Kata Sandi Saat Ini"><input type="password" placeholder="Masukkan kata sandi" /></Field><span /><Field label="Kata Sandi Baru"><input type="password" placeholder="Minimal 8 karakter" /></Field><Field label="Konfirmasi Kata Sandi"><input type="password" placeholder="Ulangi kata sandi baru" /></Field></div><div className="danger-zone"><div><Icon name="logout" /><div><strong>Keluar dari akun</strong><span>Anda perlu masuk kembali untuk mengakses dashboard.</span></div></div><Button variant="danger">Keluar</Button></div></>}
      <div className="settings-actions"><Button onClick={() => notify("Pengaturan berhasil disimpan.")} icon="check">Simpan Perubahan</Button></div>
    </section></div>
  </>;
}

export default function App() {
  const [page, setPage] = useState<Page>("Beranda");
  const [toast, setToast] = useState("");
  const [activities, setActivities] = useState(initialActivities);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const addActivity = (activity: Omit<Activity, "id">) => setActivities(current => [{ ...activity, id: Date.now() }, ...current]);
  const content = useMemo(() => {
    if (page === "Beranda") return <HomePage go={setPage} />;
    if (page === "Pasien") return <PatientsPage notify={notify} addActivity={addActivity} />;
    if (page === "Kontrol") return <ControlPage notify={notify} addActivity={addActivity} />;
    if (page === "Pengingat") return <ReminderPage />;
    if (page === "Laporan") return <ReportsPage notify={notify} />;
    return <SettingsPage notify={notify} />;
  }, [page, activities]);
  if (!loggedIn) return <LoginPrototype onLogin={() => { setLoggedIn(true); addActivity({ actor: "Nadia Sari", action: "masuk ke workspace Puskesmas Cipayung", time: "Hari ini, 10.40 • Chrome di Windows", icon: "lock" }); }} />;
  return <AppShell page={page} setPage={setPage} activities={activities} onHelp={() => setHelpOpen(true)} onLogout={() => setLoggedIn(false)}>{content}{helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}{toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}</AppShell>;
}

function LoginPrototype({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  return <div className="login-screen"><div className="login-brand"><span className="brand-mark"><img src="/image/logo.svg" alt="Logo Dinar-TB" /></span><strong>Dinar-TB.</strong></div><section className="login-card">{step === "email" ? <form onSubmit={e => { e.preventDefault(); setStep("otp"); }}><Badge>Workspace Puskesmas Cipayung</Badge><h1>Masuk sebagai petugas</h1><p>Gunakan akun individual Anda untuk mengakses data bersama Puskesmas.</p><Field label="Email petugas" required><input type="email" defaultValue="nadia.sari@puskesmas.id" required /></Field><Field label="Kata sandi" required><input type="password" defaultValue="dinar-tb-demo" required /></Field><Button type="submit">Lanjutkan</Button><small>Layar ini merupakan konsep prototipe. Autentikasi email belum terhubung ke layanan nyata.</small></form> : <form onSubmit={e => { e.preventDefault(); onLogin(); }}><button className="back-link" type="button" onClick={() => setStep("email")}>← Kembali</button><div className="otp-icon"><Icon name="lock" /></div><h1>Verifikasi email</h1><p>Kode contoh dikirim ke nadia.sari@puskesmas.id</p><Field label="Kode verifikasi 6 digit" required><input className="otp-input" inputMode="numeric" defaultValue="246810" maxLength={6} required /></Field><Button type="submit">Masuk ke Workspace</Button><small>OTP ini hanya simulasi interaksi dan tidak mengirim email sebenarnya.</small></form>}</section><div className="workspace-users"><span>Petugas lain di workspace:</span><div><div className="avatar">BR</div><p><strong>Bidan Rina</strong><small>Aktif 8 menit lalu</small></p><div className="avatar">AP</div><p><strong>dr. Andi Pratama</strong><small>Aktif kemarin</small></p></div></div></div>;
}
