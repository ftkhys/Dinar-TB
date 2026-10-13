# Dinar-TB Backend

Backend Dinar-TB (Digital Intervention for Adherence Reminder – Tuberculosis) untuk pemantauan pasien TBC di Poli TBC Puskesmas. Dibangun dengan NestJS, TypeScript, TypeORM, dan PostgreSQL.

## Kebutuhan

- Node.js 20.19 atau lebih baru
- PostgreSQL

## Menjalankan lokal

1. Buat database PostgreSQL lokal bernama `dinar_tb` (atau atur nama lain di environment). Perintah ini hanya untuk database pengembangan baru.
2. Salin `.env.example` menjadi `.env`, isi konfigurasi PostgreSQL lokal, lalu atur `AUTH_JWT_SECRET` ke secret acak minimal 32 byte (`openssl rand -base64 32`). Jangan commit `.env`.
3. Pasang dependency: `npm install`.
4. Jalankan migration: `npm run migration:run`.
5. Buat akun petugas pertama: `npm run staff:create -- nama-pengguna` (password dimasukkan tersembunyi lewat terminal interaktif).
6. Jalankan server: `npm run start:dev`.
7. Cek `GET http://localhost:3000/health`.

Server membuka koneksi PostgreSQL saat bootstrap. Endpoint `/health` adalah pemeriksaan liveness aplikasi.

## API backend

Semua endpoint administrasi memerlukan bearer token dari `POST /auth/login`, kecuali endpoint aktivasi. Semua akun mempunyai akses petugas yang sama.

- Pasien: `GET/POST /patients`, `GET/PATCH /patients/:id`
- Treatment: `POST /patients/:id/treatments`, `GET /patients/:id/treatments`, `POST /treatments/:id/final-review`
- Kunjungan: `POST /treatments/:id/visits`, `GET /patients/:id/visits`
- Jadwal kontrol: `GET/POST/PATCH /treatments/:id/control-schedule`
- Follow-up: `POST/GET /control-schedule/:scheduleId/follow-ups`
- Alert kontrol H-1, Hari-H, dan terlambat: `GET /control-alerts` (dihitung saat dibaca dengan tanggal Asia/Jakarta)
- Kepatuhan: `GET /treatments/:id/adherence`; device memakai `/patient/treatments/:id/adherence` dan `POST /patient/sync`
- Aktivasi: `POST /patients/:id/activation-codes`, `POST /activation/activate`, `POST /activation/refresh`; data offline device tersedia di `GET /patient/me`

ID pasien internal adalah UUID. NIK bukan identifier/login dan tidak dikembalikan oleh endpoint data device. Status adherence dihitung saat dibaca pada zona waktu Asia/Jakarta; database menyimpan konfirmasi yang berhasil.

## Migration

Skema TypeORM tidak menggunakan `synchronize`; perubahan skema harus lewat migration.

- Buat migration kosong: `npm run migration:create -- src/database/migrations/InitialSchema`
- Generate dari perubahan entity: `npm run migration:generate -- src/database/migrations/DescriptiveName`
- Jalankan: `npm run migration:run`
- Lihat status: `npm run migration:show`
- Batalkan terakhir: `npm run migration:revert`

## Pemeriksaan

- Unit test: `npm test`
- Build TypeScript: `npm run build`
