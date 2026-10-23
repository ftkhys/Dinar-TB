# Dinar-TB FE → BE Contract Audit

**Status:** audit and proposed contract only; nothing in this document is implemented by virtue of being written here.  
**Audit scope:** current source in `Dinar-TB Admin Dashboard Design`, `Dinar-TB Patient Dashboard Design`, and the NestJS backend.  
**Safety:** source, database, environment and configuration were not modified. No migration, seed, test, or build was run.

## A. Baseline FE

The two reviewed prototypes are the functional and visual baseline. Their current source is React/Vite in each `src/App.tsx`; there is no API client, `fetch`, Axios, localStorage, or sessionStorage use. Interactions are prototypes, not persisted behavior. The patient project also contains a duplicate Admin view selected by `?view=admin` (`Dinar-TB Patient Dashboard Design/src/App.tsx:452-454`); this is a presentation switch, never an authorization boundary.

### Admin Dashboard

The primary navigation is Beranda, Pasien, Kontrol, Pengingat, Laporan, and Pengaturan (`Dinar-TB Admin Dashboard Design/src/App.tsx:54-58`). The shared shell includes global search, notification/activity panel, account menu, logout and help (`:85-120`).

| Halaman / komponen | Isi dan interaksi yang ada pada source |
|---|---|
| Beranda (`:155-167`) | Cards total pasien, kontrol hari ini, jadwal mendatang, perlu tindak lanjut; grafik pasien baru enam bulan; donut konfirmasi obat hari ini; link menuju Pengingat/Pasien; daftar pasien dengan tombol Tindak Lanjut; Unduh Ringkasan. |
| Pasien (`:169-247`) | Ringkasan jumlah/status; daftar pasien dekat dan direktori; cari nama/register; filter status; pagination; detail pasien dengan riwayat; tambah/edit/hapus; dialog impor Excel tiga tahap (unggah, validasi, konfirmasi), template. |
| Form pasien (`:192-212`) | Register, nama, tanggal lahir, jenis kelamin, telepon, alamat; tanggal mulai, tahap bulan 1–6, jadwal kontrol berikutnya, waktu minum obat. Tombol simpan/cancel. |
| Kontrol (`:249-329`) | Ringkasan jadwal; cari pasien/register; filter tanggal; tab Semua/Hari Ini/Besok/Terlambat/Mendatang/Selesai; tabel jadwal/status; catat kunjungan; lihat riwayat; override tanggal. Form kunjungan memisahkan tanggal kunjungan dan tanggal pemberian obat, Ya/Tidak obat, catatan, dan preview jadwal berikut. |
| Pengingat (`:331-345`) | Tanggal, cards jumlah, status hari ini belum missed sebelum hari berakhir, pencarian, filter Semua/Sudah Konfirmasi/Belum Konfirmasi, tabel waktu konfirmasi, detail riwayat tujuh hari. |
| Laporan (`:347-357`) | Kategori Data Pasien/Riwayat Kontrol/Pemberian Obat/Konfirmasi Minum Obat/Perlu Tindak Lanjut; tanggal awal/akhir; filter pasien; ringkasan, chart, preview, ekspor `.xlsx`; catatan bahwa NIK tidak disertakan. |
| Pengaturan (`:359-373`) | Profil dan Akun; Pengaturan Jadwal; Pengaturan Pengingat; Impor dan Data; Keamanan. Ada tombol ubah foto, input profil, pilihan waktu pengingat dan switch, unduh template, input kata sandi, Simpan Perubahan dan Keluar. Hari Rabu/Sabtu, interval 14 dan dasar tanggal obat tampil read-only. |
| Bantuan/login/activity (`:108-120`, `:375-398`) | Dialog panduan; aktivitas/audit; menu akun/logout. Login prototype meminta email/password lalu kode OTP. Source secara eksplisit menyebut autentikasi/audit belum terhubung. |

### Patient App

Navigasi bawah: Beranda, Jadwal, Perkembangan, Profil (`Dinar-TB Patient Dashboard Design/src/App.tsx:303-310`).

| Halaman / komponen | Isi dan interaksi yang ada pada source |
|---|---|
| Beranda (`:360-378`) | Sapaan, status obat hari ini; konfirmasi obat; pengingat 30 menit; pemberitahuan jadwal berubah; kontrol berikutnya; ringkasan progres; tautan riwayat obat. |
| Sheet konfirmasi (`:324-335`) | Konfirmasi “Ya, Saya Sudah Minum”; batal/ingatkan nanti; menampilkan waktu dan tanggal; teks menyebut hanya untuk hari ini. |
| Riwayat obat (`:338-358`) | Ringkasan dan status konfirmasi 7 hari; waktu atau tanpa konfirmasi; disclaimer. |
| Jadwal (`:380-392`) | Jadwal berikut, countdown, jam/lokasi, hal yang disiapkan, histori kontrol, penjelasan bahwa pasien tidak dapat mengubah jadwal. |
| Perkembangan (`:394-406`) | Tahap/fase, persen, tanggal mulai/rencana, konfirmasi mingguan, hari terkonfirmasi, jumlah kontrol, milestone, disclaimer non-diagnostik. |
| Profil/bantuan (`:408-428`) | Identitas dan data pengobatan; FAQ; Hubungi Petugas; Pengaturan Notifikasi; info kontak, peringatan keamanan obat, versi aplikasi. |

## B. Matriks pemetaan FE → BE

Status berarti dukungan backend **saat ini**, bukan desain kontrak di bagian D:

- **Sebagian:** ada endpoint atau model inti, tetapi belum cukup untuk interaksi/response UI.
- **Belum:** belum ditemukan endpoint/flow yang dibutuhkan.
- Backend yang sudah mendukung tidak berarti sudah terintegrasi ke prototype.

| Halaman/fitur dan sumber | Tindakan pengguna | Data ditampilkan/dikirim; dummy vs backend-derived | API yang dibutuhkan (method/route) | Yang tersedia saat ini | Gap, penyesuaian backend dan dependency | Status UI/loading/error/empty/conflict; kriteria penerimaan yang dapat diuji |
|---|---|---|---|---|---|---|
| Login petugas; Admin `:395-398` | Email/password, lanjut OTP, verifikasi OTP, masuk/keluar | Email, password, challenge/token, profil; semuanya contoh statis | Usulan `POST /auth/login` dengan identifier + password; `POST /auth/otp/verify`; refresh/logout sesuai strategi sesi; `GET /staff/me` | `POST /auth/login` memakai username/password dan mengembalikan token. Tidak ada OTP/email/profile/session-revoke API. | Kontrak identitas/login berbeda; butuh keputusan autentikasi di F. Jangan menganggap input OTP demo sebagai keamanan. Dependensi: seluruh API staff. | Loading saat submit; invalid credential/OTP; expired challenge; disabled account; token kedaluwarsa; logout membersihkan sesi. Uji patient token ditolak di API staff dan OTP tidak dapat dipakai ulang bila OTP disetujui. |
| Beranda; Admin `:155-167` | Buka ringkasan, navigasi ke pengingat/pasien, tindak lanjut, unduh ringkasan | Total, agregat kontrol/adherence, pasien baru bulanan, alert; angka/chart/aktivitas sekarang dummy | Usulan `GET /dashboard/summary?date=YYYY-MM-DD`; `GET /dashboard/activities`; aksi follow-up via API follow-up; unduh ringkasan via ekspor yang disepakati | `GET /patients` terbatas; `GET /control-alerts`; adherence per treatment. Tidak ada agregat dashboard, audit-list, atau ringkasan download. | Tambah query agregasi tanpa tabel cache jika tidak dibutuhkan. Aktivitas gunakan `audit_logs`; jangan menampilkan data sample. Dependensi: pasien, schedule, adherence, audit/follow-up. | Loading skeleton/state; error retry; kosong untuk pasien/alert nol; data tanggal Asia/Jakarta. Uji agregat terhadap fixture pasien/visit/adherence dan pastikan tidak menghitung treatment selesai sebagai aktif. |
| Pasien—daftar/direktori; Admin `:169-181`, `:230-247` | Cari, filter status, pagination, lihat detail, kembali | Nama, register, bulan, jadwal, status; enam pasien/70 total dummy | Usulan `GET /patients?search=&controlStatus=&page=&pageSize=` dengan patient + activeTreatment + activeSchedule projection | `GET /patients?search=` dan `GET /patients/:id`; list cap 500, hanya patient fields. | Query daftar tidak menyediakan treatment/jadwal/status, status filter server, pagination. Pertimbangkan response projection/filter/paging; jangan panggil N+1 endpoint per baris. Dependensi treatment/schedule/alerts. | Loading; no-result state; filter/paging stabil; 404 detail; invalid filter. Uji pencarian register/nama dan status sesuai tanggal server. |
| Detail/edit pasien; Admin `:192-212`, `:225-228` | Buka detail, edit identitas, simpan | FE form: register, nama, DOB, gender, telepon, alamat; treatment/tahap/jadwal/waktu. Detail menampilkan histori. Mock DOB/gender/telepon dan tanggal. | `GET /patients/:id`; `PATCH /patients/:id` dengan fields, `version`; treatment/schedule/visit query terpisah atau projection detail | `GET/PATCH /patients/:id`, patch version optional. Patient entity menyimpan fullName/register/MRN/address/NIK/PMO; response menghilangkan NIK. | FE tidak mengirim MRN yang backend wajibkan saat create; alamat UI tampak opsional padahal aturan mewajibkan. DOB/gender/telepon tidak ada di model. Jadwal/treatment bukan identitas dan sebaiknya tetap pada relasinya. Butuh keputusan persistensi field di F. | Field validation error terpetakan per input; 404; stale version menghasilkan conflict berisi server terbaru; success mengubah tampilan. Uji field wajib dan bahwa NIK tidak muncul di response. |
| Tambah pasien + treatment + initial schedule; Admin `:192-212` | Isi form pasien/pengobatan, simpan | Identitas; tanggal mulai; tahap “Bulan ke-1..6”; jadwal awal; waktu minum | Existing: `POST /patients`, `POST /patients/:patientId/treatments`, `POST /treatments/:id/control-schedule` | Ketiga API ada; treatment target 6 bulan kalender; jadwal initial manual dapat dibuat. Tidak ada operasi komposit. | Contract FE belum mencakup MRN; stage bebas string di BE; perlu mapping/sequence dan pemulihan jika tahap create gagal. Jadwal awal boleh manual menurut aturan. Patient dapat punya hanya satu treatment aktif. Jangan menciptakan tanggal kontrol otomatis sebelum obat pertama. | Success menampilkan patient baru; validasi register/MRN/address/start; 404 patient; 409 treatment aktif; jadwal manual hanya setelah treatment dibuat. Uji create berurutan, rollback/kompensasi sesuai desain yang diputuskan. |
| Hapus pasien; Admin `:169-181`, `:230-247` | Tekan hapus lalu konfirmasi | Patient ID; konfirmasi dan hasil | Tidak ada route saat ini; kandidat `DELETE /patients/:id` **hanya setelah kebijakan diputuskan** | Tidak ada DELETE; FK historis menghalangi penghapusan tertentu. | UI mengklaim hapus permanen, sementara aturan menyatakan histori medis/audit tidak hilang. Perlu keputusan archive/deactivation vs larangan delete. Jangan menambah endpoint destruktif sebelum itu. | Modal cancel tidak mengubah data; jika disetujui, uji patient dengan treatment/history agar histori tetap utuh dan hasil konflik jelas. |
| Import/template Excel; Admin `:214-223`, `:359-371` | Unggah/drag file, validasi, tinjau baris, kembali, konfirmasi, unduh template | Rows, row number, validation errors, suspected duplicate, accepted/rejected summary. Prototype berisi 6 baris/4 valid/2 skipped | Usulan `POST /imports/patients/validate` multipart; `POST /imports/patients/confirm` dengan import token; `GET /imports/patients/template` | Tidak ada import atau template API. Ada helper patient-match, tidak terhubung ke import. | Kolom UI (register/nama/DOB/telepon/start) berbeda dengan backend (register/MRN/address). Aturan duplicate yang disepakati: register+MRN pair; pair collision warning manual; single collision warning; no merge/overwrite. Status-stage mapping belum boleh otomatis. | Loading upload/progress; file invalid/size/format; row errors; warning duplikasi yang tidak menghapus data lama; user dapat kembali; konfirmasi hanya memproses preview valid yang dipilih; idempotent import result. Test no overwrite/merge dan duplicate combinations. |
| Kontrol—jadwal/list/filter; Admin `:274-329` | Cari, filter status/tanggal, paging, detail, pilih catat kontrol, edit jadwal | Patient, current schedule, status, active/completed, date filter; schedule/status dummy | Usulan `GET /control-schedules?search=&status=&from=&to=&page=&pageSize=` | `GET /control-alerts` hanya H-1/Hari-H/overdue; `GET /treatments/:id/control-schedule` hanya satu treatment. | Belum ada daftar lintas pasien, semua status, date filter/pagination. Status “Selesai Hari Ini” dalam UI perlu definisi: kunjungan pada hari itu atau jadwal ditangani? `control-alerts` tidak menggantikan daftar jadwal. | Loading/filter reset; empty result; tanggal tidak valid; jadwal selesai treatment tidak tampil aktif; status mengikuti Asia/Jakarta. Uji H-1/Hari-H/overdue dan jadwal sesuai/mendatang. |
| Catat kunjungan dan pemberian obat; Admin `:294-325` | Pilih pasien; input visit date; Ya/Tidak; medication date; note; simpan | `visitDate`, `medicineGiven`, `medicationGivenOn`, complaint/note. Prototype menampilkan 13 Okt vs obat 14 Okt dan jadwal preview | `POST /treatments/:treatmentId/visits` body visitDate, medicineGiven, medicationGivenOn?, complaintProgress?, additionalNote? | API dan field inti ada. Service menyimpan visit; obat diberi pada active treatment memperbarui schedule. | **Terselesaikan (terverifikasi):** service kini menerima `medicationGivenOn !== visitDate` dan meng-anchor jadwal dari `medicationGivenOn` (`src/visits/visits.service.ts:28-31`, `:49-50`); contoh visit 2026-10-13 + obat 2026-10-14 menghasilkan jadwal 2026-10-28 dan diuji di `src/visits/visits.service.spec.ts`. Validasi hanya menolak `medicationGivenOn` bila obat tidak diberikan. | Loading/success/error field-level; no medicine menyimpan visit tanpa schedule change; medicine response memuat visit + schedule/default change; treatment selesai masih boleh menyimpan histori visit tanpa schedule change. Acceptance: contoh 13/14 Okt tersimpan dan jadwal 28 Okt; no-medication menjaga schedule; manual override reset saat pemberian obat berikutnya. |
| Ubah jadwal/riwayat kontrol; Admin `:326-328`, detail `:225-228` | Pilih tanggal manual apa pun; lihat timeline | scheduledDate, version/override actor/time; semua kunjungan historis | Existing `GET/POST/PATCH /treatments/:id/control-schedule`; `GET /patients/:id/visits` | Manual set/override tersedia; treatment selesai ditolak; visit list staff tersedia. | Tidak ada list detail gabungan. `GET patient visits` route staff-only. Schedule satu row aktif; audit log mencatat perubahan tetapi tidak dikembalikan sebagai histori jadwal. Jangan menghapus histori visit. | Version conflict mengembalikan schedule terbaru; 404 treatment/schedule; 409 completed treatment. Uji override tanggal bebas dan reset ke default pada visit berobat berikutnya. |
| Follow-up/alert; Admin Beranda `:163-165`, Kontrol, Activity `:108-120` | Tindak lanjuti pasien; simpan outcome/alasan; lihat alert | Alert H-1/Hari-H/overdue dan outcome: sudah/belum datang, lupa, transportasi, sakit, tidak terhubung, lainnya | Existing `GET /control-alerts`; `POST/GET /control-schedule/:scheduleId/follow-ups` | Alert rules and follow-up CRUD ada; staff guard. Tombol Tindak Lanjut di prototype belum mengarah ke modal/API. | Belum ada alur UI form outcome. Follow-up terkait row schedule, bukan jadwal-cycle; riwayat dapat melekat ke row yang dipakai ulang. Ini belum diputuskan. Kunjungan tanpa obat tetap bisa meninggalkan alert; pesan harus membedakan no visit dari visit tanpa obat. | Empty alert list; loading/error; alert berulang sesuai due rule; follow-up success/error; uji alert tetap ada untuk no-med visit tetapi teksnya tidak mengklaim belum berkunjung. |
| Pengingat/adherence petugas; Admin `:331-345` | Cari/filter status, lihat konfirmasi dan detail 7 hari | Per pasien/treatment/day: status, confirmedAt; counts; tanggal Asia/Jakarta | **Terselesaikan (terverifikasi):** daftar massal `GET /adherence/reminders?search=` (StaffAuthGuard; `src/adherence/adherence.controller.ts`), detail per treatment tetap `GET /treatments/:id/adherence`. | Summary per treatment dan rule calculations ada; `AdherenceService.listReminders` mengembalikan `stats{active,confirmed,notConfirmed,needsAttention}`, `rows[]`, `reminderMorning/Evening` untuk tanggal WIB hari ini. | UI times vary per patient (06:30, 07:00, 08:00) dan settings allow configured times; business rule defines morning/night windows, not dose deadline. Need distinguish display reminders from status. | Hari berjalan = pending, hari lampau tanpa confirmation = missed; never classify as missed at reminder time; timezone boundary tests. Empty/search/status/error and list refresh after device sync. Diuji di `src/adherence/adherence-reminders.spec.ts`. |
| Pickup obat terpisah; tidak ada UI eksplisit | Tidak ada tombol/form dalam prototype yang ditemukan | Event pickup date/note, treatment, actor staff | No current API; previous requirement would need a staff-only pickup resource, proposed `POST/GET /treatments/:id/medication-pickups` | No pickup entity/controller/service; migration `1791417600000-DropMedicationPickups.ts` drops prior table. | Business requirement says allow separate pickup and it must not mutate active schedule. FE has no surface; decide whether this remains an API-only workflow or should be represented in a future approved FE flow. Do not couple it to `visits`. | If retained: pickup must not create/update schedule; history remains queryable. Test pickup has no side effect on schedule. |
| Final review; Admin UI has no visible action | No matching form/button/route from current UI | Note, decision Selesai/Dilanjutkan, manual continued target | Existing `POST /treatments/:id/final-review` | Backend supports decision and treatment state; UI has no entry point/fields. | UI baseline lacks workflow for required staff clinical decision. Do not let system auto-complete based on target date. Need confirm whether screen is absent from delivered prototype or intended via an existing detail route. | Review before target allowed; only Selesai closes/reminders off; Dilanjutkan retains active status and manual target. Test no automatic decision at target and treatment remains history after completion. |
| Laporan/export; Admin `:347-357` | Pilih category/date/patient, apply filter, preview, download xlsx | Patient/treatment/visit/adherence/follow-up data; report filters; no NIK | **Terselesaikan (terverifikasi):** `GET /reports/preview?category=&from=&to=&patientId=` dan `GET /reports/export.xlsx?...` (StaffAuthGuard; `src/reports/`). | `exceljs` dipakai untuk ekspor 2 sheet (`Informasi Laporan` + kategori); pratinjau dan ekspor memakai baris yang sama; NIK dikecualikan. | Required sheets from prior rule at least Patients, Treatment, Visit, Daily Adherence. UI categories include follow-up and medicine given. NIK explicitly excluded. Need define filters and row/sheet shape; data should come from server, not chart constants. | Validate date range/category/patient; empty report; streamed/download response and filename; no NIK column/value in any sheet. Diuji di `src/reports/reports.service.spec.ts`. |
| Pengaturan profil petugas; Admin `:359-371` | Edit name/email/phone/photo, save | Current staff profile and editable fields | No current API; proposed `GET/PATCH /staff/me`; upload API only if avatar truly persisted | `staff_accounts` has username/hash/disabled only. | Fields/buttons shown but no persistence. Need decide required fields and avatar storage. Single staff role remains; do not introduce role distinctions. | Load existing profile; save changes; field errors; unauthorized; upload size/type if approved. |
| Pengaturan jadwal klinik; Admin `:366` | Lihat Rabu/Sabtu, interval 14, anchor date obat; click save | Rule configuration, but values read-only in source | No route required for read-only constants; backend rules already implement Rabu/Sabtu/14 days | `nextControlDate` implements previous service day. No settings API. | UI labels mention admin confirmation for rule changes but controls are read-only. Keep business rule fixed absent approved change. | Verify displayed values match server behavior; test date examples. |
| Pengaturan pengingat; Admin `:367` and Patient Profile `:423` | Edit reminder times, second reminder switch, save; patient opens notification settings | Reminder configuration/preferences; devices/push permission | No settings or push registration/delivery API. `/patient/me` returns windows 06:00–07:00 and 20:00–21:00. | Frontend's editable 07:00/20:00 settings conflict in scope with agreed windows and those times not being confirmation deadlines. Need decide whether these inputs alter send times or are prototype-only preference controls; preserve screen until approved. | Possible staff/global settings and patient-device notification preferences only if confirmed; no schema change yet. |
| Aktivitas/notifikasi admin; Admin `:97-110` | Open bell/activity, inspect events | Staff actor/action/object/time | No current read endpoint; audit writes exist. Proposed `GET /audit-logs?...` or bounded dashboard activities | `audit_logs` entity/service exist; frontend activity hardcoded. Provider notifications entity has no surfaced flow. | Need choose which audit actions are visible and pagination/filter; do not expose sensitive details. | Staff-only; empty/error; actor/action timestamps; exclude credentials/NIK. Test authorization and redaction. |
| Patient app data/home/profile | Open tabs and see name, register, treatment, schedule/status | `GET /patient/me`, active treatment, schedule, reminder windows; current content dummy | Existing `GET /patient/me` | Partial: returns patient (id/name/address), all treatment history with completion flags/message, active `controlSchedules`, timezone/windows. No phone/contact/visits/adherence in payload. | Use server as source of truth; completed history may appear but completed schedules cannot appear active. Add only projection/endpoint fields needed once form/profile decisions are made. | Existing patient/treatment/schedule entities mostly sufficient. |
| Patient medication confirmation/offline sync; Patient `:324-335`, `:360-378`, `:430-449` | Confirm today, possibly queue offline, see pending/synced result | Operation ID, treatment ID, adherence date, confirmedAt, expected version | Existing `POST /patient/treatments/:id/adherence`; batch `POST /patient/sync`; GET summary endpoint | Backend supports idempotent receipt and conflict response; frontend only sets local boolean and says synced. | Wire offline queue and conflict handling; never show server-synced until response/reconciliation; server is source of truth for synced records. | Online/offline/loading/retry/conflict/server latest; duplicate operation yields same result; confirmed date uses Asia/Jakarta; no confirmation does not imply missed until local day ends. |
| Patient adherence history/progress; Patient `:338-358`, `:394-406` | Review 7 days, weekly rate, totals and streak | `days[{date,status,confirmedAt}]`, totalTaken, totalMissed, missedStreak | Existing `GET /patient/treatments/:id/adherence` | Backend summary already supplies these values based on local dates and completed-date cutoff. UI history dummy. | Replace mock with API output; compute display percentage from returned counts only if definition is fixed and avoid clinical interpretation. | Test day boundary and completed treatment history; empty when treatment absent; progress value consistent with totals. |
| Patient schedule/history; Patient `:380-392` | Lihat control schedule, countdown, visits | Active schedule and historical visit data | `GET /patient/me`; no patient-scoped visit endpoint | Schedule present; visit history endpoint is staff-only. | Add device-authenticated patient data for own visits or include them in `/patient/me`. Location/opening time is hardcoded and no source currently exists. | Device can only read own patient/treatment/visits; completed schedules omitted from active schedule list; empty visits handled; no PII leakage. |
| Patient support, contact, notifications; Patient `:408-428` | FAQ, contact, notification settings, medication disclaimer | Static educational text; facility contact; notification state | No API for contact/config; health/API status not same as push. | FAQ may remain static; contact and settings buttons have no real handler. Need configuration source and notification mechanism decision. | Facility profile/config only if values need to vary; push/device token model only if notification delivery is confirmed. |

### API convention and response-state needs

The current controllers mostly accept untyped `Record<string, unknown>`; there are no request DTO classes or generated OpenAPI contract. Proposed integrations should standardize:

- Dates as `YYYY-MM-DD`, timestamps as ISO-8601, all operational date classification in `Asia/Jakarta`.
- IDs as UUIDs; do not use NIK as key or login.
- Validation `400`, unauthenticated `401`, forbidden `403`, missing resource `404`, stale-version `409`, and server/network `5xx`; form errors should carry stable field/code information.
- List response with `items`, `page`, `pageSize`, `total`; empty list is `items: []`, not an error.
- Mutation response should include persisted resource and relevant computed projection (e.g. visit plus schedule change), so UI only shows success after confirmed server response.
- Loading, disabled submit, field errors, retryable network error, conflict/current server state, empty result, and success states must be wired without changing visual design.

## C. Daftar gap

### Backend sudah mendukung

- Patient create/list/detail/update dengan staff auth; NIK tidak dikembalikan pada patient response.
- Treatment create/list/detail/final-review; satu treatment aktif dicek service-side; enam bulan kalender.
- Visit history and recording, control schedule manual/override, due alerts, follow-up outcomes.
- Adherence calculation, patient device confirmation/sync, idempotency receipts and patient-scoped device guard.
- Activation code once-use/24-hour and one active patient device; patient app data endpoint.
- Completed treatment remains history and its schedules are excluded from active patient schedule output.

### Backend perlu penyesuaian

- ~~Visit service rejects differing visit and medicine dates.~~ **Resolved and verified:** the service accepts differing dates and calculates from `medicationGivenOn` (13 Oct visit / 14 Oct medication → 28 Oct schedule); covered by `src/visits/visits.service.spec.ts`. It still rejects `medicationGivenOn` when `medicineGiven` is false, which matches the rule.
- Patient list/control/adherence queries need UI-shaped filters, aggregates and pagination.
- Patient device payload/endpoint needs visit history for Jadwal and progress screens.
- Patient detail/edit contract must reconcile required MRN/address with the fields in FE form and any approved persisted patient demographics.
- Staff profile/settings need persistence only for fields/controls that are confirmed functional.

### Endpoint atau fitur backend belum tersedia

- Dashboard aggregate/activity read APIs.
- Control schedule list endpoint; bulk adherence-by-day list for staff.
- Excel import validation/confirmation/template and multi-sheet export without NIK.
- Staff profile/email/OTP/password/profile actions.
- Pickup event API/model despite previous explicit business rule; migration currently drops old table.
- Functional patient-side contact/notification preference or delivery services; no visible patient activation UI.
- Final-review UI entry point is absent even though backend endpoint exists.

### Kontrak/aturan ambigu; keputusan diperlukan

- Login identifier and OTP delivery/security lifecycle versus existing username/password rule.
- Whether DOB/gender/telephone are authoritative persisted data; MRN is absent from patient form although required by backend; address is not visibly marked required although prior rule requires it.
- Meaning and persistence of “Bulan ke-1..6” stage versus calculated month; stage mapping from workbook remains disallowed until definition.
- Delete patient semantics versus preservation of medical history/audit.
- Whether separate pickup remains a backend-only workflow or needs a frontend flow.
- Final review workflow location in approved FE.
- Whether reminder time inputs are actual configurable delivery times or only presentation preferences; fixed windows and no-deadline rule remain.
- Source of facility identity, address, service hours and contact data currently hardcoded differently in prototypes.
- Follow-up association across schedule recalculation cycles; this was previously recorded as a separate design decision.
- Whether patient activation, help/contact, patient notification settings and admin avatar/password controls are unfinished prototype interactions or must be delivered in the current product scope.

### Integrasi frontend masih diperlukan

- Every visible mutation/list/detail currently uses hardcoded values, React local state, or toast; no API integration was found.
- Replace sample patient/reminder/activity/chart/report/visit/history/progress and dates with API response while retaining the current layout and navigation.
- Distinguish local/offline pending from server-confirmed; do not say “tersinkron” before server response.
- Wire form validation, empty/loading/error/conflict states and pagination/filter results to the agreed contract.

## D. Rancangan kontrak API (usulan, belum diimplementasikan)

Contoh berikut sintetis dan bukan data pasien nyata. Bentuk final perlu persetujuan kontrak.

### 1. Visit memakai tanggal obat sebagai anchor

`POST /treatments/{treatmentId}/visits` — staff bearer token.

```json
{
  "visitDate": "2026-10-13",
  "medicineGiven": true,
  "medicationGivenOn": "2026-10-14",
  "complaintProgress": "Kondisi stabil",
  "additionalNote": "Catatan sintetis"
}
```

Usulan response `201`:

```json
{
  "visit": {
    "id": "a1f08f9c-1d6e-4b86-9819-9a1bb9bd8d31",
    "treatmentCourseId": "d1f08f9c-1d6e-4b86-9819-9a1bb9bd8d31",
    "visitDate": "2026-10-13",
    "medicineGiven": true,
    "medicationGivenOn": "2026-10-14",
    "complaintProgress": "Kondisi stabil",
    "additionalNote": "Catatan sintetis"
  },
  "scheduleChange": {
    "scheduledDate": "2026-10-28",
    "defaultDate": "2026-10-28",
    "overrideCleared": true,
    "version": 2
  }
}
```

For `medicineGiven: false`, `medicationGivenOn` must be absent/null; `scheduleChange` should be null and the visit still persist. The agreed date pair must be accepted and calculate from 14 Oct, not 13 Oct. Validation should not silently substitute `visitDate` for `medicationGivenOn`.

### 2. Schedule list and dashboard projections

Usulan `GET /control-schedules?status=overdue&from=2026-10-01&to=2026-10-31&page=1&pageSize=20&search=...`:

```json
{
  "items": [{
    "patient": { "id": "p-uuid", "fullName": "Pasien Contoh", "registerNumber": "REG-001" },
    "treatmentCourseId": "t-uuid",
    "scheduledDate": "2026-10-28",
    "status": "Mendatang",
    "version": 2
  }],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "today": "2026-10-14",
  "timeZone": "Asia/Jakarta"
}
```

`GET /dashboard/summary?date=2026-10-14` may return counts and chart series; each count needs a documented definition. Alert statuses remain computed from current active schedules. These are proposed read models, not new database entities by default.

### 3. Adherence staff list and patient summary

Usulan `GET /adherence?date=2026-10-14&status=pending&page=1&pageSize=20` returns patient/treatment identifiers, status, `confirmedAt`, plus pagination. Existing patient summary shape can remain:

```json
{
  "days": [{ "date": "2026-10-14", "status": "Belum dikonfirmasi", "confirmedAt": null }],
  "totalTaken": 0,
  "totalMissed": 0,
  "missedStreak": 0
}
```

Reminder window is metadata, not a missed-dose cutoff. API calculation must use Asia/Jakarta.

### 4. Patient device payload

`GET /patient/me` should continue deriving patient identity from the authenticated device, not a client-supplied patient ID. To support prototype screens, the response or another device-guarded route needs active schedule, treatment history/display state, and visit history. NIK must remain excluded. Illustrative shape:

```json
{
  "patient": { "id": "p-uuid", "fullName": "Pasien Contoh", "registerNumber": "REG-001", "address": "Alamat Contoh" },
  "treatmentCourses": [{ "id": "t-uuid", "startDate": "2026-07-12", "initialTargetEndDate": "2027-01-12", "completedAt": null, "displayMessage": null }],
  "controlSchedules": [{ "treatmentCourseId": "t-uuid", "scheduledDate": "2026-10-28", "version": 2 }],
  "timeZone": "Asia/Jakarta",
  "reminderWindows": [{ "start": "06:00", "end": "07:00" }, { "start": "20:00", "end": "21:00" }],
  "clinic": { "name": "Puskesmas Contoh", "phone": null }
}
```

The exact patient history payload must be limited to the authenticated patient. Completed schedules remain absent from active `controlSchedules`, even when completed treatment history is included. `clinic` mirrors `app_settings` (name/phone) so the patient app can show the real facility without a staff endpoint.

#### 4.1 `GET /patient/me/progress` (device-guarded)

Added to replace the dummy Perkembangan/Riwayat screens. Returns the authenticated patient's control-visit history and adherence summary in one read:

```json
{
  "treatment": { "id": "t-uuid", "startDate": "2026-07-12", "initialTargetEndDate": "2027-01-12", "continuedTargetEndDate": null, "completedAt": null, "finalDecision": null, "finalReviewNote": null, "finalReviewedAt": null },
  "visits": [{ "id": "v-uuid", "visitDate": "2026-09-25", "medicineGiven": true, "medicationGivenOn": "2026-09-25", "complaintProgress": null, "additionalNote": null }],
  "adherence": { "days": [{ "date": "2026-09-25", "status": "Sudah diminum", "confirmedAt": null }], "totalTaken": 1, "totalMissed": 0, "missedStreak": 0 },
  "serverTime": "2026-10-17T00:00:00.000Z"
}
```

`treatment`, `visits`, and `adherence` may be `null`/empty when the patient has no active course. The endpoint uses the device principal's `patientId` (never the device id) and applies the same local-date/adherence rules as `GET /patient/treatments/:id/adherence`. The patient app caches visits and the adherence summary in Hive so Perkembangan/Riwayat work offline.


### 5. Import/export

Proposed import uses a validate-preview-confirm sequence so user sees row-level errors/warnings before persistence. Confirmation must not merge or overwrite existing patients. Duplicate candidate matching uses register+MRN; either-field collision also warns for manual review, per existing decision. The exact workbook columns remain unresolved because the prototype does not ask for MRN while BE requires it.

Proposed export is a staff-only `.xlsx` download with at minimum Patients, Treatment, Visits, Daily Adherence sheets. NIK must not be selected into the export query. Optional report filters should be reflected in all relevant sheets; details remain to be agreed.

## E. Urutan implementasi

Urutan ini adalah rencana untuk ditinjau, bukan pekerjaan yang sudah dimulai.

| Tahap | Ruang lingkup dan kemungkinan file/modul | Prasyarat | Kriteria penerimaan dan pengujian | Risiko/ketergantungan |
|---|---|---|---|---|
| 1. Kunci kontrak alur inti | Dokumen API, DTO/response contracts, visit/patient/schedule/adherence read models | Persetujuan tanggal obat vs tanggal kunjungan dan required fields | Contoh visit 13 Okt + obat 14 Okt menghasilkan 28 Okt; kontrak create/list/detail memuat field yang benar; status/loading/error/conflict terdefinisi | Semua alur frontend bergantung pada kontrak; jangan memulai integrasi dengan bentuk response yang berubah-ubah. |
| 2. Selaraskan data pasien dan treatment | `src/database/entities/patient.entity.ts`, treatment entity/service/migration, patient/treatment DTO/service | Keputusan MRN, address, DOB/gender/phone, treatment stage | Form tersimpan dan detail dapat dibaca; alamat/nomor wajib konsisten; satu active course; treatment target enam bulan kalender; tak ada auto-clinical decision | Perubahan schema memerlukan migration; hindari menyimpan data dummy/tidak disetujui. |
| 3. Staff auth dan profil | `src/auth/*`, `staff_accounts`, guards/controllers | Keputusan username/email/OTP dan profil | Login nyata; validasi token; endpoint me hanya mengembalikan akun sendiri; patient token tidak bisa mengakses staff; uji disabled/expired/OTP | Jangan mengurangi guard untuk mempermudah FE. |
| 4. Alur pasien dan directory | `src/patients/*`, `src/treatments/*`, query services | Tahap 1-2, kebijakan delete/import | Create/edit/list/detail memetakan UI; query filter/pagination; no data leakage; delete belum aktif sampai kebijakan histori diputuskan | Treatment, schedule projection dan patient fields terkait. |
| 5. Alur kontrol end-to-end | `src/visits/*`, `src/control-schedule/*`, alert/follow-up | Kontrak tanggal di tahap 1; follow-up design decision | Ya obat meng-anchor dari medicationGivenOn; no obat hanya menyimpan visit; manual schedule/override tanggal bebas; next medication resets override; complete course tidak dapat schedule baru | Follow-up melekat pada schedule row; harus diselesaikan sesuai keputusan terpisah sebelum mengklaim histori siklus. |
| 6. Adherence petugas + patient sync | `src/adherence/*`, `src/devices/*`, read API | Device auth dan contract | Bulk staff list dan patient history; pending/taken/missed per tanggal lokal; offline replay idempotent; stale op memberi versi server; no clinical auto decision | Integrasi local queue dan versi server memerlukan kontrak eksplisit. |
| 7. Aktivasi/perangkat dan patient data | `src/devices/*`, entities code/device, device routes | Persetujuan aktivasi/onboarding UI and auth | Kode 24 jam sekali pakai; satu device aktif; reactivation same patient; patient can read own data/visits; completed schedule excluded | Frontend activation route belum terlihat; jangan membuka endpoint patient data tanpa DeviceAuthGuard. |
| 8. Alert, follow-up, activity | `src/follow-ups/*`, audit read service | Follow-up cycle decision, outcome form mapping | Alert H-1/Hari-H/overdue and message correct; no-med visit wording; outcomes persist; staff-only activity list | Alert date calculation depends on schedule/current treatment. |
| 9. Import/export | New import/export module, patient/treatment services, dependency and migration only if justified | Workbook columns, duplicate handling, export sheet/filter decisions | Validation preview, duplicate warnings, no merge/overwrite; import produces internal patient ID; xlsx export sheets; NIK absent | PII risk; large file limits; schema fields must match approved workbook. |
| 10. Integrasi frontend tanpa redesign | Both `src/App.tsx`, API client/auth adapter and state/error handling; retain CSS/components | Stable APIs for each completed flow | Replace dummy source flow by flow; preserve DOM/design/nav; server-confirmed success only; offline conflict/loading/error/empty render correctly | FE currently duplicates Admin view in patient project; protect by server auth regardless of client branch. |
| 11. Verifikasi end-to-end | Jest unit/API tests, PostgreSQL integration/e2e, synthetic fixtures | Stages 1-10 and approved migrations | Full user flows for staff and patient; 13/14 Oct → 28 Oct; no-med visit/pickup side effects; completed treatment; import/export privacy; auth boundaries | Do not use real patient exports/credentials in fixtures. |

### Alur pertama yang direkomendasikan

Mulai setelah kontrak tahap 1 disetujui dengan **Alur kunjungan kontrol → pemberian obat → jadwal berikutnya**. Ini adalah tindakan utama pada halaman Kontrol, sudah memiliki entity dan endpoint dasar, dan aturan tanggal obat vs tanggal kunjungan adalah konflik paling konkret antara FE dan backend. Kriteria penerimaan pertama: request visit 13 Oktober 2026 dengan obat pada 14 Oktober diterima, menyimpan kedua tanggal, menghasilkan jadwal 28 Oktober 2026; visit tanpa obat tersimpan tetapi schedule tidak berubah; treatment selesai boleh mencatat visit historis tanpa mengubah schedule. Uji juga reset override pada pemberian obat berikutnya dan error/response UI yang dapat membedakan validasi dari konflik.

## F. Keputusan yang memerlukan persetujuan

Hanya keputusan yang tidak dapat dipastikan secara konsisten dari source, aturan yang ada, atau data model:

1. **Visit dan tanggal obat berbeda:** apakah pasangan contoh 13/14 Oktober harus diterima? UI dan aturan meminta ya; service saat ini menolaknya. **Keputusan diterapkan:** pasangan berbeda kini diterima dan jadwal dihitung dari `medicationGivenOn` (terverifikasi di service dan test).
2. **Kolom identitas final:** apakah DOB, gender, telepon perlu dipersist; apakah MRN tetap wajib meski tidak ada di form; alamat tetap wajib sesuai aturan terdahulu walau UI tidak menandainya wajib?
3. **Arti tahap pengobatan:** apakah “Bulan ke-1..6” pilihan manual, label turunan tanggal mulai, atau kategori berbeda? Jangan memetakan field workbook status/paduan otomatis sebelum definisinya ada.
4. **Akun petugas:** apakah email/password/OTP UI menggantikan username/password yang telah disepakati; kanal dan lifecycle OTP apa yang disetujui? **Keputusan diterapkan (Phase 6):** UI login memakai `POST /auth/login` dengan username/password; langkah OTP/email dihapus karena backend tidak menyediakannya, dan token disimpan hanya di memori (tanpa localStorage) sampai ada kontrak refresh/revoke. Perubahan label/penghapusan OTP adalah keputusan produk yang perlu konfirmasi final.
5. **Penghapusan pasien:** hapus permanen atau arsip/nonaktif agar histori medis/audit tetap utuh?
6. **Pickup obat terpisah:** requirement lama meminta pencatatan pickup, tetapi FE tidak menampilkan flow dan migration menghapus tabel; tetap API-only atau perlu keputusan desain FE di kemudian hari?
7. **Final review:** backend menyediakan keputusan Selesai/Dilanjutkan, tetapi prototype tidak menampilkan entry point; apakah alur belum termasuk prototype yang disetujui atau memang ditunda?
8. **Reminder settings:** apakah jam/switch pada Pengaturan benar-benar mengubah pengiriman, atau hanya tampilan/preferensi? Aturan yang ada menetapkan jendela 06–07 dan 20–21, bukan batas konfirmasi.
9. **Data fasilitas/kontak:** sumber resmi nama, alamat, jam layanan dan kontak Puskesmas; nilai pada dua prototype statis/tidak konsisten.
10. **Follow-up lintas siklus:** histori follow-up saat ini milik satu schedule row yang digunakan ulang; apakah harus dibedakan per siklus/periode?
11. **Interaksi belum berfungsi:** aktivasi pasien, kontak/notifikasi pasien, profil/avatar/password staff, tombol filter tanggal, download ringkasan, dan follow-up dashboard—mana yang wajib untuk scope implementasi awal?

## Bukti source dan cakupan pemeriksaan

- Frontend: `Dinar-TB Admin Dashboard Design/src/App.tsx`, `Dinar-TB Patient Dashboard Design/src/App.tsx`, `src/index.css`, `src/main.tsx`, dan `package.json` pada masing-masing project. Fungsi/halaman serta event handler diperiksa langsung.
- Backend: controllers/services/entities/enums/migrations dan test di `src/` serta `test/`. Routes diverifikasi dari decorator controller; validasi bisnis diverifikasi dari service.
- Visit validation: `src/visits/visits.service.ts:28-34` accepts differing visit/medication dates and rejects `medicationGivenOn` when `medicineGiven` is false; anchor date calculation `:49-50`; date utility `src/common/date-rules.ts:20-34`; tests `src/visits/visits.service.spec.ts`; date tests `src/common/date-rules.spec.ts:7-18`.
- Migration pickup: `src/database/migrations/1780000000000-CreateDinarTbSchema.ts:56-61` creates table; `src/database/migrations/1791417600000-DropMedicationPickups.ts:4-17` drops it and rollback recreates an empty table.
- Backend test files found include auth, date rules, patient matching, schedule, visit, alert rules/service/controller, activation/device, adherence rules, treatment, health. No end-to-end spec source was found beyond `test/jest-e2e.json` configuration.
- Phase 6 Admin integration: staff session uses `POST /auth/login` (`src/api/control-api.ts` `loginStaff`, `src/auth/staff-auth-context.tsx`); token held in memory only; 401 clears the session via `ControlApi.onUnauthorized`. Patient detail history, Control page patient list, visit recording, and schedule override now call `GET /patients/:id/visits`, `GET /patients?search=`, `GET /control-alerts`, `GET /patients/:id/treatments`, `GET/PATCH /treatments/:id/control-schedule`, and `POST /treatments/:id/visits`. Tested via `Dinar-TB Admin Dashboard Design/tests/control-api.spec.ts` (11) and `src/visits/visits.service.spec.ts` (10). Gaps: no cross-patient full schedule/status list (only H-1/Hari-H/Terlambat alerts), so Control filters `Mendatang`/`Selesai` and the `Selesai Hari Ini`/`Jadwal Mendatang` stats cannot be filled from the API; phone/treatment-stage still unavailable. This is automated unit/API testing only, not a live end-to-end run.
- Phase 6.1 live integration (running backend + dev PostgreSQL, isolated `REG-P61-*` test patients): 26/26 endpoint checks passed for login/401, patient create+detail (no `nik`), patient version conflict 409, treatment active-conflict 409, schedule 404-before-first-medicine, no-medicine visit leaving the schedule untouched, medicine visit recalculating to `medicationGivenOn + 14` rolled back to Wed/Sat (Fri 16 Okt -> Wed 28 Okt), history ordering, override + stale-version 409, and auth boundaries (staff token rejected on device endpoint). **Regression found (not fixed, needs decision):** `ControlAlertsService.list` casts `date` columns with `String(schedule.scheduledDate).slice(0, 10)` (`src/follow-ups/control-alerts.service.ts:38-52`). With TypeORM/pg, `dataSource.query` returns `date` as a JavaScript `Date`, so the slice yields `"Fri Oct 23"` instead of `"2026-10-23"` and `controlAlertLevel` never matches. Live result: a schedule due today returned `GET /control-alerts` = `[]`. The unit test passes only because it mocks `dataSource.query` with string dates. Impact: the Admin Control page's schedule/status columns and stats render `—`/`0` for every patient because the alert feed is always empty.
- Test data created by Phase 6.1 (left in place because deletion is out of scope): staff `phase61_audit` (`a97b8538-...`), patients `REG-P61-1792143573`, `REG-P61-1792143609`, `REG-P61-ALERT-<ts>` with their treatments, schedules, and visits. Existing `REG-TEST-001` data was read only and not modified or deleted.
- Phase 6.2 fix: `ControlAlertsService` now returns dates via `to_char(..., 'YYYY-MM-DD')` and normalizes through `toCalendarDate` (`src/common/date-rules.ts`), which is timezone-safe (local-midnight `Date` from pg, ISO strings, and instants resolved in Asia/Jakarta). Regression tests cover string and realistic `Date` results for H-1/Hari-H/Terlambat (`src/follow-ups/control-alerts.service.spec.ts`, `src/common/date-rules.spec.ts`). Live verification: a schedule due today produced a `Hari-H` alert with `scheduledDate` `2026-10-16`; tomorrow -> `H-1`; yesterday -> `Terlambat`; future -> no alert; the no-medicine visit message path also returned `unmedicatedVisitDate` as a clean `YYYY-MM-DD`.

## G. Persiapan launching: database bersih

Tujuan: aplikasi siap menerima **input pasien pertama melalui aplikasi**, tanpa data pasien/treatment/jadwal/kunjungan dummy. Data dummy boleh dibersihkan hanya pada tahap persiapan launching yang disetujui, bukan saat Phase 6.2.

Inventaris (dev/test saat ini, bukan asumsi produksi):

- Data dummy/operasional (dibersihkan): `patients`, `treatment_courses`, `control_schedule`, `control_visits`.
- Data turunan/log (dibersihkan): `schedule_invalidations`, `audit_logs`; tabel pasien terkait lain bila berisi (`daily_adherence`, `follow_ups`, `sync_receipts`, `activation_codes`, `patient_devices`, `provider_notifications`).
- Wajib dipertahankan: `migrations` (status skema), `staff_accounts` (akun petugas nyata untuk login pertama), skema/ekstensi DB (`pgcrypto`/`gen_random_uuid`).
- Akun: `admin` dipertahankan/diganti akun nyata via `npm run staff:create`; akun dummy seperti `phase61_audit` dihapus.

Tidak ada seed otomatis: tidak ditemukan kode seed/fixture/`onModuleInit` yang menyisipkan data pasien; migrasi tidak memuat `INSERT`; `synchronize:false` dan `migrationsRun:false`, sehingga startup tidak menulis data dummy ke lingkungan mana pun.

Urutan dependensi FK (anak -> induk) untuk DELETE terurut:

1. `follow_ups`, `audit_logs`, `schedule_invalidations`
2. `daily_adherence`, `sync_receipts`, `activation_codes`
3. `control_schedule` (harus sebelum `control_visits` karena FK `reference_visit_id` RESTRICT)
4. `control_visits`
5. `provider_notifications`, `patient_devices`
6. `treatment_courses`
7. `patients`
8. `staff_accounts` (hanya akun dummy)

Alternatif `TRUNCATE ... CASCADE` pada tabel di atas (kecuali `staff_accounts`) dalam satu transaksi, lalu `DELETE FROM staff_accounts WHERE username <> '<admin-nyata>'`. Jangan `TRUNCATE staff_accounts`/`migrations`.

Risiko: urutan FK salah -> RESTRICT error; lupa membersihkan `audit_logs`/`schedule_invalidations` -> menyisakan referensi dummy; salah menargetkan DB -> kehilangan data nyata. Wajib backup terverifikasi sebelum eksekusi dan jalankan dalam transaksi.

Dev/test vs produksi: pada DB dev/test bebas dibersihkan lalu buat ulang akun dev; pada produksi lakukan hanya di jendela pemeliharaan dengan backup, rotasi `AUTH_JWT_SECRET` (meng-invalidate token lama), dan pembuatan akun petugas awal lewat `staff:create` (prompt password tersembunyi), bukan seed.

Verifikasi setelah pembersihan (belum dijalankan): semua tabel operasional = 0 kecuali `staff_accounts`/`migrations`; `GET /control-alerts` = `[]`; login akun nyata berhasil; pembuatan pasien pertama lewat aplikasi berhasil; tidak ada `nik`/data dummy tersisa.
- This was a source inspection only. No assertion is made that build, tests, migrations, API integration or UI behavior currently passes. (Superseded in part by Phase 5/6/6.1/6.2 verification recorded above.)

## H. Phase 8.3 (menu Pasien end-to-end, sesi, notifikasi) — implemented

Approved decisions: patient profile columns (`date_of_birth`, `gender`, `phone`), soft-delete via `patients.archived_at`, per-staff notification read-state table, and session persistence via `sessionStorage` + JWT `exp` check with clear-on-401.

Migrations (applied on dev `dinar_tb`): `1791500000000-AddPatientProfileFields`, `1791500000001-AddPatientArchivedAt`, `1791500000002-CreateStaffActivityReads`.

New/changed endpoints (no global prefix; 201 on POST):

- `GET /patients/directory?search=` — active patient + active treatment + control schedule + derived `controlStatus` (`Hari Ini`/`Besok`/`Terlambat`/`Mendatang`) via one raw-SQL projection (no N+1).
- `GET /patients/stats` — `{ total, sesuai, dekat, terlambat }` from active patients and current schedules.
- `GET /patients/archived?search=` — archived patients (restore flow).
- `POST /patients/:id/archive`, `POST /patients/:id/restore` — soft-delete / undo; history (treatments, visits, audits) untouched; archived patients are excluded from `/patients`, `/patients/directory`, `/control-alerts`, dashboard summary, and rejected on new treatment/activation.
- `GET /imports/patients/template` — .xlsx with `Data` + `Petunjuk` sheets (ExcelJS).
- `POST /imports/patients/validate` — multipart (≤10 MB, ≤1000 rows); per-row valid/invalid/duplicate classification; duplicates by `register_number` within the batch and against the DB.
- `POST /imports/patients/confirm` — transactional create of validated rows (optional treatment from `Tanggal Mulai Pengobatan`), audit per created patient.
- `GET /dashboard/notifications` — `{ items, unreadCount, lastSeenAt }` from `audit_logs` vs `staff_activity_reads` for the token subject.
- `POST /dashboard/notifications/read` — upserts `last_seen_at` (clamped to now; invalid → now), returns `{ lastSeenAt }`.

Admin: `src/api/control-api.ts` gained directory/stats/archive/restore/archived list, import template/validate(FormData)/confirm, notifications, and `isTokenExpired`. `src/auth/staff-auth-context.tsx` persists the session in `sessionStorage` and drops expired tokens. `App.tsx` Pasien page uses the directory + stats, real archive/restore (Arsip Pasien), real import flow, notification badge with read-on-open, and no demo identity/facility strings.

Verification (automated): backend `tsc --noEmit` clean, `jest` 22 suites / 164 tests pass (includes Admin `control-api.spec.ts` and `patient-intake.spec.ts`); Admin `tsc --noEmit` and `vite build` pass; backend `nest build` passes.

Verification (live, running backend + dev PostgreSQL, throwaway staff `phase83_smoke_dev`): 22/22 checks passed — login, `/patients/stats` shape, patient create with profile fields, `/patients/directory` returning `dateOfBirth/gender/phone`, profile `PATCH` (gender/phone), treatment + initial schedule creation, directory join (`treatmentStage`/`scheduledDate`/`controlStatus`=`Mendatang`), archive + exclusion from `/patients` and `/patients/directory`, presence in `/patients/archived`, new treatment on archived rejected, restore, notification feed + `mark read` resetting `unreadCount` to 0, template download with `Data Pasien` sheet, import validate (2 valid / 1 invalid / 1 duplicate), import confirm creating 2 patients. **Still unverified:** FCM runtime push. Live smoke artifacts were removed afterwards in a scoped transaction (4 patients `REG-P83-*`/`REG-P83I-*`, 3 treatments, 2 schedules, 14 audit rows, 1 read-state row, and staff `phase83_smoke_dev`); no other rows touched.

## I. Revisi menu Pasien: dropdown profil, pencarian, hapus permanen

1. Dropdown profil petugas (`App.tsx` `AppShell`): ditutup otomatis saat klik di luar (`mousedown` pada `document`) dan saat tombol `Escape`, dengan pembersihan listener pada effect cleanup; klik di dalam dropdown tidak menutup. Trigger diberi `aria-haspopup`/`aria-expanded`.

2. Pencarian pasien: pencarian topbar memakai objek `{ term, nonce }` sehingga istilah yang sama tetap memicu permintaan baru; `PatientsPage` menyinkronkan `initialQuery` ke `query` pada setiap request. Filter tetap dijalankan backend (`GET /patients/directory?search=` → ILIKE pada nama/register/MRN) tanpa data dummy. Ditambahkan tes: `patients.service.spec.ts` (directory search param `%Siti%`/`null`, `archivedOnly`) dan `control-api.spec.ts` (encoding search, purge).

3. Hapus permanen (`DELETE /patients/:id/permanent`, `PatientsService.purge`): hanya untuk pasien yang sudah diarsipkan. Menolak (409) bila pasien masih punya riwayat pengobatan/kunjungan/kepatuhan/tindak lanjut agar rekam medis tidak hilang; pesan penolakan dibuat singkat dan spesifik, mis. `Tidak dapat dihapus permanen: pasien memiliki riwayat pengobatan dan riwayat kunjungan kontrol.` Jika bersih, menghapus patient + `control_visits`, `activation_codes`, `patient_devices`, `provider_notifications`, `treatment_courses` dalam satu transaksi, lalu mencatat audit `permanently_deleted` (audit log append-only tetap disimpan). Delete pada menu Pasien tetap soft-delete/arsip (tidak diubah).

4. UX Arsip Pasien (`App.tsx` `ArchiveDialog`, `index.css`): daftar arsip memakai baris yang dapat diklik untuk memilih pasien; **Pulihkan** tidak lagi per baris, melainkan berada di bagian bawah panel detail pasien yang sedang dipilih (aksi memakai id pasien terpilih dari `rows`, sehingga tidak mungkin diterapkan ke pasien lain). **Hapus permanen** menjadi tombol ikon tempat sampah tanpa label teks, dengan `aria-label`/`title` `"Hapus permanen"` dan ukuran 28x28 (tidak melebarkan baris). Ikon membuka satu dialog konfirmasi singkat: judul **"Hapus permanen pasien ini?"**, subjudul **"Tindakan ini tidak dapat dibatalkan."**, tombol **Batal** dan **Ya, hapus permanen**; riwayat panjang hanya muncul sebagai pesan kegagalan singkat bila backend menolak (409). Baris hanya dihapus dari UI setelah backend mengonfirmasi keberhasilan; Batal tidak mengubah apa pun.

Verifikasi: backend `tsc` bersih; `jest` 22 suite / 171 tes lulus; Admin `tsc` bersih, `vite build` lulus; backend `nest build` lulus. Live (staff sementara `pasien_rev_dev`, sesi sebelumnya): 16/16 pemeriksaan lulus — filter pencarian (nama/register, case-insensitive, tanpa hasil, dikosongkan, ganti kata kunci), purge pasien aktif ditolak 409, purge arsip tanpa riwayat berhasil + hilang dari arsip + 404, purge arsip beriwayat ditolak 409 dan tetap di arsip; artefak smoke dihapus dengan transaksi terarah. FCM runtime masih belum diverifikasi. Dropdown dan tata letak Arsip Pasien diuji lewat `tsc`/build (tanpa React Testing Library di repo); perubahan pesan 409 dicakup `patients.service.spec.ts`.

## J. Redesain "Hapus permanen": hapus bersih vs anonimisasi (retention-safe)

Masalah: setiap pasien terarsip punya riwayat klinis, dan FK `treatment_courses.patient_id` / `control_visits.patient_id` = RESTRICT, sehingga `purge` lama selalu menolak 409 — ikon hapus permanen tidak pernah berhasil.

Keputusan kebijakan (disetujui pemilik produk): identitas pasien dihapus permanen, tetapi rekam medis yang wajib dipertahankan **tidak** dihancurkan. Implementasi dua jalur pada `PatientsService.purge` (`src/patients/patients.service.ts`):
- **Tanpa riwayat klinis** → hard delete transaksional patient + `control_visits`, `activation_codes`, `patient_devices`, `provider_notifications`, `treatment_courses`; audit `permanently_deleted`; balikan `{ id, mode: 'deleted' }`.
- **Dengan riwayat klinis** → anonimisasi transaksional: hapus artifact non-klinis yang dapat mengidentifikasi (`patient_devices` + token/pasangan perangkat, `activation_codes`, `provider_notifications` beserta `message`), lalu `UPDATE patients` menghapus seluruh atribut identitas (`full_name` → `Pasien Dianonimkan`, `register_number`/`medical_record_number` → `ANON-<8 id>`, `address` → `-`, `nik`/`phone`/`date_of_birth`/`gender`/`pmo_name`/`pmo_contact` → NULL) dan mengisi `anonymized_at`; audit `anonymized`; balikan `{ id, mode: 'anonymized' }`. Baris klinis (`treatment_courses`, `control_visits`, `control_schedule`, `daily_adherence`, `follow_ups`) tidak disentuh.

Skema: migrasi `1791500000003-AddPatientAnonymizedAt.ts` menambah `patients.anonymized_at timestamptz NULL` + index `IDX_patients_anonymized_at`. Rollback = `DROP INDEX` + `DROP COLUMN` (tidak menghapus data klinis). Backup dev dibuat sebelum menjalankan: `/tmp/opencode/dinar_tb-backup-*.sql`.

Penyembunyian: `findEntity` memperlakukan pasien `anonymizedAt` sebagai 404 (termasuk saat `includeArchived`), `findAll(archivedOnly)` menambah `anonymized_at IS NULL`, dan `directory` menambah `p.anonymized_at IS NULL`. Pasien anonim tidak dapat dipulihkan/diedit/ditambah treatment. `audit_logs` append-only tanpa FK tetap utuh (deletion tetap tertelusur).

UI `ArchiveDialog`: dialog konfirmasi menyatakan identitas dihapus permanen dan riwayat medis yang wajib disimpan tetap tersimpan tanpa identitas; baris hilang dari daftar hanya setelah backend sukses; tidak ada lagi penolakan riwayat setelah konfirmasi.

Verifikasi: backend `tsc` bersih; `jest` 22 suite / 172 tes lulus (termasuk anonimisasi, hard delete, dan anonymized→404); Admin `tsc` + `vite build` lulus; `nest build` lulus. Live (staff sementara `anon_smoke_dev`, dev `localhost/dinar_tb`): 21/21 pemeriksaan lulus — pasien beriwayat (1 treatment, 1 visit, 1 device, 1 activation code, 1 notification) diarsipkan lalu `DELETE /patients/:id/permanent` → `mode: "anonymized"` tanpa 409; hilang dari GET/active/archive; PII terhapus; rekam medis tetap ada; device/activation/notification terhapus; audit `anonymized`; purge ulang → 404; pasien tanpa riwayat → `mode: "deleted"` dan baris hilang. Artefak smoke dihapus dengan transaksi terarah (0 sisa).

Batasan yang dilaporkan (belum tuntas): kolom catatan bebas klinis (`control_visits.complaint_progress`, `control_visits.additional_note`, `treatment_courses.final_review_note`, `follow_ups.note`) disimpan sebagai rekam medis dan **tidak** dianonimkan; bila petugas mengetik PII (mis. nama/telepon) ke catatan tersebut, sisa PII masih ada. Penyembunyian bebas tersebut memerlukan keputusan retensi terpisah karena berarti mengubah isi rekam medis.

## K. Revisi menu Kontrol: nama pasien pada perubahan jadwal + Daftar Jadwal Kontrol

### K.1 Nama pasien pada notifikasi perubahan jadwal
`DashboardService.activities` kini menyelesaikan pasien untuk `object_type = 'control_schedule'` melalui join `control_schedule → treatment_courses → patients` (server-side), lalu template pesan dipilih dari `ACTIVITY_TEMPLATES` berdasarkan kunci `objectType:action`. Pasien anonim tidak pernah diungkap kembali (`patientAnonymized` → nama `null`, ` {name}` dihapus dari kalimat). Format (contoh `date_overridden`):
- Pelaku = pengguna sendiri: `Jadwal kontrol pasien Budi berhasil diubah.`
- Pelaku petugas lain: `Petugas Dian mengubah jadwal kontrol pasien Budi.`

Detail `sebelum -> sesudah` (mis. `2026-10-24 -> 2026-10-21`) tetap ditampilkan di frontend sebagai `→`. Aksi `initial_date_set` dan `default_recalculated` memakai mekanisme yang sama (dengan nama pasien). Aktivitas historis (baris lama) tetap ditampilkan; baris tanpa nama tetap valid karena ` {name}` opsional. Aktivitas hanya tercatat setelah operasi sukses (audit dipanggil setelah `save`).

### K.2 `GET /control-schedules` (daftar jadwal untuk dikelola)
Endpoint staff-guarded baru (`ControlScheduleListController`, query opsional `?search=` ILIKE pada nama/register/MRN). Mengembalikan satu baris per `control_schedule` (treatment aktif maupun selesai) untuk pasien non-arsip dan non-anonim, dengan `scheduleId, treatmentCourseId, patientId, patientName, registerNumber, address, scheduledDate, completed, status`. Tujuan: Daftar Jadwal Kontrol menampilkan **semua** jadwal, bukan hanya yang punya peringatan H-1/Hari-H/Terlambat (yang tetap dihitung `ControlAlertsService`).

Status dihitung server-side oleh `controlScheduleStatus` (`src/control-schedule/control-schedule.rules.ts`):
- `completed` (treatment `completed_at` terisi) → `Selesai`. Kunjungan tercatat **tidak** menyelesaikan jadwal; hanya penutupan treatment.
- `scheduledDate < today` → `Terlambat`; `= today` → `Hari Ini`.
- `= nextServiceDay(today)` → `Besok`; selain itu (masa depan) → `Mendatang`.
- `nextServiceDay` (`src/common/date-rules.ts`) = Rabu/Sabtu pertama setelah `today` (WIB). Contoh: Selasa → Besok Rabu, Mendatang Sabtu; Kamis → Besok Sabtu, Mendatang Rabu berikutnya. Hari dan perbandingan memakai `localTodayJakarta`.

Frontend `ControlPage` kini memuat dari `api.listControlSchedules` (bukan gabungan `listPatients` + `listControlAlerts`), mengisi kolom Jadwal Kontrol + Status dari data server, dan key baris memakai `scheduleId`. Filter `Semua/Hari Ini/Besok/Terlambat/Mendatang/Selesai` mencocokkan `status` yang sama. Aksi `Ubah Jadwal` disembunyikan untuk baris `Selesai` (treatment sudah ditutup); aksi `Riwayat`/`Catat Kontrol` dipertahankan. Aturan H-1/Hari-H/Terlambat, aturan otomatis 14 hari ke hari layanan sebelumnya, dan riwayat kunjungan tidak diubah. Menu Pengingat/Laporan/Pasien tidak disentuh; statistik kartu di header Kontrol tidak diubah.

Verifikasi: backend `tsc` bersih; `jest` 23 suite / 188 tes lulus (termasuk `control-schedule.rules`, `nextServiceDay`, `listManaged`, dan notifikasi `control_schedule` self/other + anonim); Admin `tsc` + `vite build` lulus; `nest build` lulus. Live (2 staff sementara + 6 pasien uji, dev `localhost/dinar_tb`): 22/22 lulus — tanggal+status terisi (Hari Ini/Terlambat/Besok/Mendatang/Selesai), jadwal `Mendatang` muncul walau tanpa peringatan aktif, perubahan jadwal menyebut nama pasien (self vs petugas lain) lengkap dengan `sebelum -> sesudah`, override versi basi/ treatment selesai ditolak 409 tanpa aktivitas sukses, aturan 14 hari tetap menghasilkan jadwal Rabu/Sabtu, riwayat kunjungan utuh. Semua artefak uji dihapus (0 sisa). Uji interaktif browser belum dilakukan.

## L. Menu Pengaturan: peran staf, pengelolaan akun, dan pengaturan bersama

### L.1 Peran dan bootstrap Admin pertama
`staff_accounts` kini memiliki `role` (`'Admin'` | `'Petugas'`, default `'Petugas'`), `display_name` (opsional), dan `phone` (opsional). Migrasi baru `1791600000000-AddStaffRolesAndAppSettings` menambahkan kolom tersebut + indeks `IDX_staff_accounts_role` + constraint `CHK_staff_accounts_role`, lalu membuat tabel satu-baris `app_settings`. **Semua akun lama di-backfill ke `'Petugas'`** (tidak ada promosi diam-diam). Bootstrap Admin pertama terkontrol:
```
npm run staff:bootstrap-admin -- <username>            # buat Admin baru (password dari TTY)
npm run staff:bootstrap-admin -- <username> --promote  # promosikan akun yang sudah ada (eksplisit)
```
Skrip menolak berjalan bila sudah ada Admin aktif (tanpa duplikat) dan tidak pernah mengekspos password di argv/env/log. `npm run staff:create` tetap ada dan menerima `--role=Admin|Petugas` (default `Petugas`).

### L.2 Otorisasi server-side
`StaffPrincipal` membawa `role`; `AuthService.authenticate` membaca ulang `role`/`disabled_at` dari DB setiap request sehingga perubahan peran/penonaktifan berlaku langsung. `AdminGuard` (setelah `StaffAuthGuard`) hanya mengizinkan `role === 'Admin'`. Menyembunyikan UI saja tidak cukup — setiap endpoint pengelolaan akun & pengaturan hanya-Admin dilindungi guard ini.

### L.3 Endpoint baru
Staff (`StaffAuthGuard`):
- `GET /staff/me` → profil akun saat ini (`id, username, displayName, role, phone, active, createdAt, isSelf`).
- `PATCH /staff/me` → ubah `phone` milik sendiri (dipakai Profil dan Akun).
- `POST /staff/me/password` → ubah kata sandi (`currentPassword, newPassword, confirmPassword`); password lama diverifikasi server, password baru di-hash scrypt. Tidak pernah mengembalikan hash/kredensial.

Admin saja (`StaffAuthGuard` + `AdminGuard`):
- `GET /staff/accounts` → `{ accounts, activeAdminCount, maxAdmins: 3 }` (termasuk akun nonaktif, dengan `isSelf`).
- `POST /staff/accounts` → `{ username, password, role, displayName? }`.
- `PATCH /staff/accounts/:id` → `{ role?, displayName? }`.
- `DELETE /staff/accounts/:id` → nonaktifkan (soft delete).
- `GET /settings` (semua staff) dan `PUT /settings` (Admin) → `{ puskesmasName, puskesmasPhone, controlIntervalDays, reminderMorning, reminderEvening, updatedAt }`.

### L.4 Batas 3 Admin, proteksi, dan pencabutan sesi
Pembuatan/promosi Admin, demosi, dan penghapusan dijalankan di dalam transaksi dengan `pg_advisory_xact_lock(601637)` sehingga pemeriksaan jumlah Admin aktif terserialisasi (aman dari balapan). Aturan: maksimal **3 Admin aktif**; demosi/penghapusan yang akan menyisakan **0 Admin aktif** ditolak 409; akun tidak dapat menghapus dirinya sendiri via pengelolaan akun (gunakan Keluar). Penghapusan akun **aktif** = set `disabled_at` (soft delete, retention-safe; riwayat audit & data klinis utuh). Penghapusan akun **nonaktif** = hapus permanen baris akun, tetapi **ditolak 409 dengan pesan spesifik** bila masih ada relasi ber-`ON DELETE RESTRICT` (`control_visits`, `control_schedule`, `follow_ups`, `activation_codes`); akun nonaktif tanpa relasi benar-benar hilang dari daftar. Akun yang tidak ada dibedakan sebagai 404 `Akun tidak ditemukan.` (bukan lagi menyesatkan akun nonaktif). Karena `authenticate` menolak akun nonaktif, token JWT yang masih berlaku langsung gagal pada request berikutnya (sesi tercabut). Perubahan kata sandi tidak mencabut token lain (JWT stateless) — dicatat sebagai batasan.

### L.5 Pengaturan yang benar-benar dikonsumsi
- Interval jadwal: `VisitsService` membaca `SettingsService.controlIntervalDays()` dan memanggil `nextControlDate(medicationGivenOn, interval)` (default 14 tetap dipakai bila tak diset). Aturan 14 hari → hari layanan Rabu/Sabtu sebelumnya dan jadwal lama tidak diubah otomatis tetap berlaku.
- Pengingat: `PatientDeviceDataService.getSyncData` mengembalikan `reminderWindows` dari `SettingsService.reminderWindows()` (window 1 jam: `{start, end}`), dibaca aplikasi pasien saat sinkronisasi. Default `06:00–07:00` dan `20:00–21:00` sehingga perilaku pasien tidak berubah; semantik "pengingat malam hanya bila belum konfirmasi" dan "dosis terlewat setelah hari berakhir" tidak diubah. Tidak ada scheduler server-side (pengingat dijadwalkan di perangkat).

### L.6 Audit dan format viewer-aware
Aksi baru dicatat: `staff_account:created|role_changed|deleted|profile_updated|password_changed` dan `app_settings:puskesmas_updated|schedule_updated|reminder_updated`. `DashboardService` menyelesaikan `role` pelaku dan `target` akun (dari join + `details`), lalu menyusun kalimat: pelaku sendiri omits nama (`Anda mengubah pengaturan jadwal.`), pelaku lain memuat peran + aktor (`Admin Fatkha mengubah pengaturan jadwal.`, `Petugas Dian menambahkan data pasien Budi.`). Peran/aktor selalu dari server (tidak dipercaya dari klien).

### L.7 Frontend
`SettingsPage` dirombak: tab `Profil dan Akun` (username/peran/nama tampilan dari server, Nomor Telepon editable pemilik, **Email dihapus**), kartu `Data Puskesmas` (Admin edit, Petugas read-only), `Pengaturan Jadwal` (interval), `Pengaturan Pengingat` (waktu pagi/malam), `Kelola Akun` (khusus Admin: tabel akun, tambah akun, ubah peran dengan konfirmasi, hapus dengan konfirmasi, penghitung `n dari 3`), dan `Keamanan` (ganti kata sandi + Keluar). Tab `Impor dan Data` beserta tombol "Simpan Perubahan" dihapus; panduan impor Excel dipindah ke `HelpDialog` ("Butuh bantuan?"). Perubahan role memengaruhi label topbar (Admin/Petugas TB). `control-api.ts` menambah metode `getMe/updateMe/changePassword/listStaffAccounts/createStaffAccount/updateStaffAccount/deleteStaffAccount/getSettings/updateSettings`.

### L.8 Verifikasi
Backend `tsc` bersih, `nest build` lulus, `jest` **26 suite / 222 tes** lulus (termasuk `settings.service.spec`, `staff.service.spec`, `admin.guard.spec`, interval `nextControlDate`, dan format audit peran/target). Admin `tsc` bersih, `vite build` lulus, tes Admin **52 lulus**. Migrasi **belum dijalankan** di DB dev — menunggu persetujuan (rencana rollback: `migration:revert` menjatuhkan `app_settings` lalu kolom `role`/`display_name`/`phone`). Uji interaktif browser dan eksekusi migrasi belum dilakukan.

## M. Pengingat obat: arsitektur offline-first dan perbaikan konsumsi konfigurasi

### M.1 Arsitektur yang berlaku
Pengingat pagi/malam dijadwalkan **secara lokal di perangkat** oleh aplikasi pasien (paket `flutter_local_notifications`, zona `Asia/Jakarta`, `zonedSchedule` dengan `matchDateTimeComponents: time`). Backend **tidak mengirim push per pengingat**; FCM hanya dipakai untuk pemicu sinkronisasi/aktivitas lain. Yang disimpan backend hanyalah konfigurasi waktu (`app_settings.reminder_morning`/`reminder_evening`), dan `PatientDeviceDataService.getSyncData` mengirimnya sebagai `reminderWindows` (dua window 1 jam: `{start, end}`) pada setiap respons `/patient/me/sync`.

### M.2 Alur saat ini (setelah perbaikan)
1. `SyncService.fullSync`/`incrementalSync` menyimpan `reminderWindows` ke box Hive `reminder_windows`.
2. `saveReminderWindows` bersifat **replace**, bukan merge: nilai lama dibuang dulu, lalu set baru disimpan (default dikunci per `start`). Payload kosong = no-op sehingga respons cacat/offline tidak menghapus konfigurasi terakhir.
3. Setelah sync sukses, `SyncService._rescheduleFromLocal()` membaca konfigurasi tersimpan dan memanggil `NotificationService.rescheduleAll(...)`, yang **membatalkan semua notifikasi lalu menjadwalkan ulang** dari data lokal (tidak ada pengingat ganda di jam lama).
4. Saat aplikasi mulai/offline, `_rescheduleFromLocal()` tetap dijalankan dari data Hive terakhir; jatuh ke default `06:00–07:00`/`20:00–21:00` hanya bila belum pernah ada konfigurasi.
5. `rescheduleAll` melewatkan treatment tanpa jadwal lokal dan menangkap error per-treatment, sehingga satu kegagalan tidak mengosongkan seluruh jadwal.

### M.3 Perbaikan yang dilakukan (sebelumnya adalah bug)
- **Konfigurasi lama tidak pernah terhapus** karena `saveReminderWindows` hanya `put` per `start`. Setelah admin mengubah 06:00 → 08:00, window 06:00 lama tetap tersimpan sehingga ada dua pengingat (duplikat) dan Profil menampilkan waktu ganda. → kini replace.
- **Perubahan waktu saja tidak menjadwalkan ulang**: sync inkremental lama hanya menjadwalkan ulang treatment yang ikut berubah; karena perubahan settings tidak menaikkan versi treatment, jadwal notifikasi tidak diperbarui sampai aplikasi di-restart. → kini reschedule selalu dijalankan setelah sync sukses, dari data lokal.
- **`_cancelEveningReminder` mengunci `"window":"20:00"`**: bila waktu malam diubah (mis. 19:00/21:00), konfirmasi obat tidak lagi membatalkan pengingat malam. → kini membatalkan berdasarkan jam window (≥ 12) dari payload, tetap konsisten dengan `isEvening`.
- **`rescheduleAll` melempar exception** bila ada treatment tanpa jadwal, sehingga setelah `cancelAll` semua pengingat hilang. → kini dilewati dengan aman.
- **Manifest Android kurang receiver plugin**: ditambahkan `ScheduledNotificationReceiver` dan `ScheduledNotificationBootReceiver` (BOOT_COMPLETED/MY_PACKAGE_REPLACED/QUICKBOOT) agar notifikasi terjadwal berbunyi dan **terjadwal ulang setelah reboot/aplikasi diperbarui**.

### M.4 Yang tidak diubah
Aturan dosis dipertahankan: pengingat malam dijadwalkan hanya bila dosis hari ini belum dikonfirmasi (`isTodayConfirmed`), dan status dosis terlewat tetap ditetapkan di backend setelah hari berakhir. Pengingat kontrol (H-1 08:00, H 07:00) tidak berubah. Interval kontrol hanya dipakai untuk perhitungan jadwal baru di backend; jadwal tersimpan tidak diubah otomatis.

### M.5 Pengujian
`flutter test` **26 tes lulus** (5 tes baru di `test/reminder_config_test.dart`: replace window tanpa menyisakan 06:00, payload kosong tidak menghapus, persistensi restart, sync menyimpan+reschedule, restart offline memakai konfigurasi terakhir); `flutter analyze` bersih. Belum diuji di perangkat/emulator nyata (bunyi notifikasi aktual, reboot perangkat, power-saving OEM) — memerlukan perangkat Android fisik.

## N. Menu Pengingat, Laporan, dan peran Admin (implementasi)

### N.1 Pengingat (Admin)
- Endpoint baru `GET /adherence/reminders?search=` (`StaffAuthGuard`) di `src/adherence/adherence.controller.ts`, memakai `AdherenceService.listReminders` yang mengekstrak perhitungan yang sudah ada (`summarizeAdherence`) sehingga tidak ada duplikasi logika. `AdherenceModule` mengimpor `SettingsModule` untuk waktu pengingat terkonfigurasi.
- Respons: `{ date, timeZone, generatedAt, reminderMorning, reminderEvening, stats{active,confirmed,notConfirmed,needsAttention}, rows[] }`. `date`/`generatedAt` dihitung pada zona `Asia/Jakarta`; hari berjalan tidak pernah dihitung `Terlewat`; `needsAttention` = `missedStreak >= 2`.
- Frontend `ReminderPage` memuat data nyata (bukan dummy), tanggal/judul WIB, kartu statistik dari `stats`, filter tab klien, dialog detail memakai `GET /treatments/:id/adherence` (7 hari terakhir), serta refresh saat tab kembali aktif dan interval ringan. Konstanta dummy `patients`/`reminders` dihapus dari `App.tsx`.

### N.2 Laporan (Admin)
- Endpoint baru `GET /reports/preview?category=&from=&to=&patientId=` dan `GET /reports/export.xlsx?...` (`StaffAuthGuard`) di `src/reports/`. Lima kategori: Data Pasien, Riwayat Kontrol, Pemberian Obat, Konfirmasi Minum Obat, Perlu Tindak Lanjut.
- Pratinjau dan ekspor memakai baris yang sama; NIK dikecualikan; ekspor `.xlsx` (library `exceljs`) berisi dua sheet: `Informasi Laporan` dan sheet kategori; nama berkas `laporan-<slug>-<from>-<to>.xlsx`.
- Frontend `ReportsPage` menyusun filter (kategori, rentang tanggal, pasien dari `api.listPatients`), tombol Terapkan Filter mengambil pratinjau aktual, kartu ringkasan + bar chart dari `summary[]`, tabel pratinjau dinamis dari `columns`/`rows`, dan ekspor unduhan nyata via blob. Status "Berhasil" hanya ditampilkan bila pembuatan berkas benar-benar sukses; kegagalan API/unduhan ditampilkan sebagai pesan.

### N.3 Peran Admin (backend-enforced)
- Peran dibaca dari `staff_accounts.role` pada **setiap** request (`StaffService.authenticate`); `AdminGuard` mensyaratkan `role === 'Admin'`. Perubahan peran di basis data berlaku pada request berikutnya.
- Akun pengguna `Fatkha` dipromosikan menjadi `Admin` melalui `UPDATE` terarah pada basis data pengembangan (satu akun, `version` dinaikkan); akun lain tidak diubah. `staff:bootstrap-admin` tidak dipakai karena menolak saat sudah ada Admin aktif.

### N.4 Pengujian
- Backend: `src/adherence/adherence-reminders.spec.ts` (5 tes) dan `src/reports/reports.service.spec.ts`; `npm run build` lulus.
- Frontend: `Dinar-TB Admin Dashboard Design/tests/reminders-reports-api.spec.ts` (11 tes: query reminders/reports, encoding, guard sesi, blob/nama berkas ekspor, 401, kegagalan koneksi); `npx tsc --noEmit` dan `vite build` lulus.
