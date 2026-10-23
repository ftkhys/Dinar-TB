# Dinar-TB

**Digital Intervention for Adherence Reminder – Tuberculosis**

Dinar-TB adalah aplikasi pendukung pemantauan pengobatan pasien Tuberkulosis (TBC) di Poli TBC Puskesmas Jatinegara. Sistem ini dirancang untuk membantu petugas memantau kepatuhan pengobatan, mengelola jadwal kontrol, serta mendukung pengingat minum obat bagi pasien.

## Komponen Sistem

Dinar-TB terdiri dari tiga komponen utama:

- **Admin Dashboard** — aplikasi web untuk petugas dalam mengelola data pasien, pengobatan, jadwal kontrol, pengingat, dan laporan sesuai hak akses.
- **Patient App** — aplikasi Android berbasis Flutter untuk pasien, dengan dukungan penyimpanan lokal, pengingat minum obat, dan sinkronisasi data.
- **Backend API** — layanan NestJS yang mengelola autentikasi, aturan bisnis, data, dan komunikasi antara aplikasi dengan database.

## Teknologi

| Komponen | Teknologi |
|---|---|
| Backend | NestJS, TypeScript |
| Database | PostgreSQL |
| ORM dan migrasi | TypeORM |
| Admin Dashboard | React, TypeScript, Vite |
| Patient App | Flutter, Dart |
| Pengujian backend | Jest |

## Struktur Repository

```text
Dinar-TB/
├── src/                              # Backend API
├── test/                             # Pengujian backend
├── Dinar-TB Admin Dashboard Design/  # Aplikasi web petugas
├── Dinar-TB Patient Dashboard Design/# Dashboard pasien
├── dinar_tb_patient/                 # Aplikasi Flutter Android
├── docs/                             # Dokumentasi teknis
├── .env.example                      # Contoh konfigurasi
├── package.json                      # Konfigurasi backend
└── README.md
```

## Fitur Utama

- Pengelolaan pasien dan riwayat pengobatan.
- Pemantauan konfirmasi minum obat dan kepatuhan pengobatan.
- Pengaturan jadwal kontrol dan pengingat.
- Autentikasi serta pembatasan akses berdasarkan peran pengguna.
- Dukungan penyimpanan lokal dan sinkronisasi pada aplikasi pasien.
- Pencatatan aktivitas dan pengelolaan data melalui backend terpusat.

Ketersediaan setiap fitur mengikuti implementasi dan konfigurasi masing-masing komponen.

## Menjalankan Backend secara Lokal

### Prasyarat

- Node.js 20.19 atau lebih baru.
- PostgreSQL.
- npm.

### Instalasi

1. Siapkan database PostgreSQL khusus pengembangan.
2. Salin `.env.example` menjadi `.env`.
3. Isi konfigurasi database lokal dan secret autentikasi yang kuat.
4. Instal dependency:

   ```bash
   npm ci
   ```

5. Jalankan migrasi database:

   ```bash
   npm run migration:run
   ```

6. Buat akun petugas pertama sesuai prosedur proyek:

   ```bash
   npm run staff:create -- nama-pengguna
   ```

7. Jalankan backend:

   ```bash
   npm run start:dev
   ```

Jangan jalankan migrasi menggunakan database produksi saat mengikuti panduan pengembangan lokal.

## Pengujian dan Build

Pengujian backend:

```bash
npm test
```

Build backend:

```bash
npm run build
```

Untuk menjalankan aplikasi Admin dan Flutter, gunakan konfigurasi serta petunjuk pada direktori masing-masing.

## Dokumentasi

Dokumentasi teknis tersedia di direktori [`docs/`](docs/), termasuk:

- [Kontrak Frontend–Backend](docs/FE-BE-CONTRACT.md)
- [Rencana Implementasi Sinkronisasi](docs/SYNC_IMPLEMENTATION_PLAN.md)

## API Backend

Endpoint administrasi menggunakan bearer token yang diperoleh melalui `POST /auth/login`, sesuai aturan autentikasi masing-masing endpoint.

- **Pasien:** `GET/POST /patients`, `GET/PATCH /patients/:id`
- **Pengobatan:** `POST /patients/:id/treatments`, `GET /patients/:id/treatments`, `POST /treatments/:id/final-review`
- **Kunjungan:** `POST /treatments/:id/visits`, `GET /patients/:id/visits`
- **Jadwal kontrol:** `GET/POST/PATCH /treatments/:id/control-schedule`
- **Follow-up kontrol:** `POST/GET /control-schedule/:scheduleId/follow-ups`
- **Peringatan kontrol:** `GET /control-alerts`
- **Kepatuhan:** `GET /treatments/:id/adherence`
- **Sinkronisasi aplikasi pasien:** `POST /patient/sync`
- **Aktivasi perangkat:** `POST /patients/:id/activation-codes`, `POST /activation/activate`, `POST /activation/refresh`
- **Data perangkat pasien:** `GET /patient/me`

ID pasien internal menggunakan UUID. NIK tidak digunakan sebagai identifier atau login aplikasi pasien.

## Migrasi Database

Skema database dikelola melalui migrasi TypeORM. Jangan mengaktifkan sinkronisasi skema otomatis untuk menggantikan migrasi.

Perintah yang tersedia:

- Membuat migrasi kosong: `npm run migration:create -- src/database/migrations/InitialSchema`
- Membuat migrasi dari perubahan entity: `npm run migration:generate -- src/database/migrations/DescriptiveName`
- Menjalankan migrasi lokal: `npm run migration:run`
- Memeriksa status migrasi lokal: `npm run migration:show`
- Membatalkan migrasi lokal terakhir: `npm run migration:revert`

Gunakan database pengembangan khusus saat mengikuti petunjuk lokal. Periksa isi migrasi sebelum menjalankannya. Jangan menjalankan perintah migrasi lokal terhadap database produksi.

## Catatan Deployment Produksi

Migrasi produksi dijalankan secara eksplisit dan tidak otomatis saat aplikasi mulai.

Sebelum memperbarui aplikasi produksi:

1. Pastikan backup database terbaru tersedia dan dapat dipulihkan.
2. Tinjau perubahan kode dan migrasi.
3. Siapkan build aplikasi.
4. Periksa status migrasi menggunakan `npm run migration:show:prod`.
5. Jalankan migrasi tertunda hanya setelah backup, dampak perubahan, dan prosedur pemulihan dipastikan.
6. Periksa kesiapan aplikasi melalui `GET /health/ready` setelah pembaruan.

Perintah `npm run migration:run:prod` dan `npm run migration:revert:prod` hanya boleh digunakan melalui prosedur deployment yang telah diverifikasi. Jangan menjadikan revert sebagai prosedur pemulihan rutin.

Jangan menyimpan secret, kredensial, backup database, atau data pasien nyata di repository. Simpan backup di luar repository dengan izin akses terbatas.

## Keamanan

- Jangan commit file `.env`, kredensial, token, atau konfigurasi rahasia.
- Jangan menyimpan data pasien nyata, cadangan database, atau data pribadi di repository.
- Gunakan database pengembangan terpisah dari database produksi.
- Perubahan skema database harus dilakukan melalui migrasi yang ditinjau dan diuji.
- Simpan konfigurasi deployment dan secret di lingkungan yang sesuai, bukan di source code.

## Status Proyek

Repository ini menyimpan source code dan dokumentasi Dinar-TB. Perubahan aplikasi, pengujian, dan deployment dikelola secara bertahap. Keberadaan kode di repository tidak dengan sendirinya menjamin seluruh fitur sudah siap untuk penggunaan produksi.

---

**Dinar-TB** — Sistem pendukung pemantauan pengobatan TBC di Puskesmas Jatinegara.
