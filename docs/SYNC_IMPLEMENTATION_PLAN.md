# Dinar-TB Sync Implementation Plan

**Status:** Phase 1 & 2 SELESAI - Siap Phase 3 (Flutter Local Storage)  
**Tanggal:** 2026-10-14  
**Basis:** Audit sinkronisasi read-only + `docs/FE-BE-CONTRACT.md`  
**Catatan:** Notifikasi adalah fitur utama, bukan fitur tambahan.

---

## 1. Notifikasi Lokal (Flutter)

### 1.1 Pengingat Minum Obat (Dosis Harian)
- **Trigger:** Jam yang dikonfigurasi dari backend (`reminderWindows`: pagi 06:00–07:00, malam 20:00–21:00 WIB).
- **Mekanisme:** `flutter_local_notifications` + `timezone` + `android_alarm_manager_plus` / `workmanager`.
- **Jadwal:** Dibuat ulang setiap hari berdasarkan `treatmentCourse.startDate` dan `reminderWindows`. Hanya untuk treatment aktif (`completedAt == null`).
- **Payload notifikasi:**
  ```json
  {
    "type": "dose_reminder",
    "treatmentCourseId": "uuid",
    "date": "2026-10-14",
    "window": "morning|evening",
    "scheduledAt": "2026-10-14T07:00:00+07:00"
  }
  ```
- **Aksi tap:** Buka halaman Beranda → tampilkan bottom sheet konfirmasi (sudah ada di prototype).

### 1.2 Pengingat Kontrol (H-1 & Hari-H)
- **Trigger:** 1 hari sebelum (08:00) dan hari kontrol (07:00) WIB.
- **Sumber jadwal:** `controlSchedules` dari `GET /patient/me`.
- **Pembaruan:** Saat jadwal berubah (push atau sync), batalkan notifikasi lama, buat yang baru.
- **Payload:**
  ```json
  {
    "type": "control_reminder",
    "treatmentCourseId": "uuid",
    "controlScheduleId": "uuid",
    "scheduledDate": "2026-10-28",
    "trigger": "H-1|HARI_H"
  }
  ```

### 1.3 Penyimpanan ID Notifikasi Lokal
- Simpan mapping: `notificationId` (int) ↔ `key` (string: `dose:{treatmentId}:{date}:{window}` atau `control:{scheduleId}:H-1|HARI_H`).
- Gunakan `shared_preferences` atau `drift`/`hive` untuk persist.

---

## 2. Push Notification FCM (Backend → Patient)

### 2.1 Prasyarat Backend
- **Dependency:** `firebase-admin` (Node.js).
- **Kredensial:** Service Account JSON (simpan di env/secret manager, **jangan commit**).
- **Project Firebase:** Buat project `dinar-tb-prod` (atau dev), aktifkan Cloud Messaging.

### 2.2 Penyimpanan Token Perangkat
- **Entity:** Tambah kolom `fcmToken` (nullable, unique) di `patient_devices` (migrasi terpisah).
- **Endpoint baru:** `POST /patient/device/fcm-token` (DeviceAuthGuard)
  - Body: `{ "token": "fcm-token-string" }`
  - Upsert token ke device yang terautentikasi.
- **Registrasi:** Flutter minta izin → dapatkan token → POST ke endpoint saat pertama kali login/aktivasi.

### 2.2 Pemicu Kirim Push (Event-Driven)
- **Event:** `schedule.changed` (diemit di `ControlScheduleService.override` dan `VisitsService.create` saat obat diberikan → schedule recalculated).
- **Subscriber:** `FcmService` subscribe event → query device token patient terkait → kirim FCM data message.
- **Payload FCM (data message, bukan notification):**
  ```json
  {
    "type": "schedule_changed",
    "treatmentCourseId": "uuid",
    "previousDate": "2026-10-20",
    "newDate": "2026-10-28",
    "version": 3,
    "changedAt": "2026-10-13T14:30:00Z"
  }
  ```
- **Topik alternatif:** Jika token belum ada, gunakan topik `patient_{patientId}` (subscribe di Flutter saat login).

### 2.4 Penanganan Gagal Kirim
- Retry 3x dengan exponential backoff (1s, 2s, 4s).
- Log error ke `audit_logs` (action: `fcm_send_failed`).
- Jika token invalid (NotRegistered) → hapus token dari DB, tunggu registrasi ulang.

---

## 3. Sinkronisasi Data (Patient Flutter)

### 3.1 Endpoint Backend Baru
- **Route:** `GET /patient/me/sync?sinceVersion={version}&sinceTimestamp={iso}`
- **Response:**
  ```json
  {
    "patient": { "id", "fullName", "address", "version" },
    "treatmentCourses": [ { "id", "startDate", "completedAt", "version", "displayMessage" } ],
    "controlSchedules": [ { "treatmentCourseId", "scheduledDate", "version", "overriddenAt" } ],
    "serverTime": "2026-10-13T14:30:00Z",
    "hasMore": false
  }
  ```
- **Filter:** Hanya kembalikan entity yang `version > sinceVersion` ATAU `updatedAt > sinceTimestamp`.

### 3.2 Strategi Sync di Flutter
| Trigger | Aksi |
|---------|------|
| **App dibuka (cold start)** | Full sync (`sinceVersion=0`) |
| **App resume (foreground)** | Incremental sync (`sinceVersion=localMaxVersion`) |
| **Push FCM diterima** | Immediate incremental sync |
| **Koneksi pulih (connectivity_plus)** | Incremental sync dengan debounce 5s |
| **Periodik (foreground)** | Setiap 15 menit incremental |

### 3.3 Algoritma Rekonsiliasi (Client)
```dart
// Pseudocode
for (schedule in serverSchedules) {
  local = localRepo.get(schedule.treatmentCourseId);
  if (!local || schedule.version > local.version) {
    localRepo.upsert(schedule);
    rescheduleLocalNotifications(schedule);
  }
}
// Hapus lokal yang tidak ada di server (treatment selesai)
for (local in localRepo.getAll()) {
  if (!serverSchedules.any(s => s.treatmentCourseId == local.treatmentCourseId)) {
    localRepo.delete(local);
    cancelLocalNotifications(local);
  }
}
```

### 3.4 Idempotensi & Konflik
- Server adalah **source of truth** untuk jadwal (petugas win).
- Client **tidak pernah** mengirim perubahan jadwal ke server.
- Jika local version > server version (tidak mungkin normal) → log warning, pakai server.

---

## 4. Pembaruan & Pembatalan Pengingat Lokal Usang

### 4.2 Saat Jadwal Berubah (Push/ Sync)
1. **Bandingkan** `scheduledDate` lama vs baru.
2. **Jika beda:**
   - Batalkan notifikasi `control_reminder` lama (H-1 & HARI_H) via `notificationId` tersimpan.
   - Buat notifikasi baru untuk tanggal baru.
3. **Jika treatment selesai (`completedAt != null`):**
   - Batalkan SEMUA notifikasi terkait treatment (dosis + kontrol).
   - Hapus dari local repo.

### 4.3 Saat Versi Treatment Berubah (Tanpa Perubahan Tanggal)
- Tetap sync `version` untuk audit.
- Tidak perlu buat ulang notifikasi jika tanggal sama.

---

## 5. Keamanan, Autentikasi, Versi, Audit, Idempotensi

| Aspek | Implementasi |
|-------|--------------|
| **Autentikasi Patient** | JWT `patient_device` (sudah ada), guard `DeviceAuthGuard`. |
| **Autentikasi Admin** | JWT `staff` + `StaffAuthGuard`. |
| **Versioning Jadwal** | `@VersionColumn` di `ControlSchedule` (optimistic lock). Override butuh `version` di body. |
| **Audit Trail** | `AuditLogService` sudah catat `date_overridden` + `default_recalculated` + actor. |
| **Idempotensi Sync** | `SyncReceipt` (device+operationId) untuk adherence. Untuk jadwal: version-based, GET idempoten. |
| **Konflik Admin** | 409 jika version stale → FE tampilkan server state, user konfirmasi override ulang. |
| **Data Pasien** | NIK tidak pernah dikembalikan ke Patient endpoint. |
| **Token FCM** | Simpan hash? Simpan plaintext tapi encrypt at rest (env). Hanya akses service account. |

---

## 6. Urutan Implementasi (Progress Tracking)

| # | Tugas | Status | File Backend (Buat/Ubah) | File Flutter (Buat/Ubah) | Prasyarat | Tes End-to-End | Kriteria Selesai |
|---|-------|--------|--------------------------|--------------------------|-----------|----------------|------------------|
| 1 | **Event Emitter + Invalidation Service** | ✅ **SELESAI** | `control-schedule/control-schedule.service.ts` (emit), **baru:** `schedule-invalidation/` (service, module) | - | Audit selesai | Unit test emit event; integration test subscriber terpanggil | Event `schedule.changed` teremit saat `override` & `create visit dgn obat` |
| 2 | **Sync Endpoint `/patient/me/sync`** | ✅ **SELESAI** | `devices/patient-device-data.service.ts`, `devices/patient-device.controller.ts` | `lib/services/api_client.dart` (dio), `lib/services/sync_service.dart` | Tahap 1 | `GET /patient/me/sync?sinceVersion=0` → full payload; `sinceVersion=X` → delta | Response < 200ms; delta benar; 401 tanpa token |
| 3 | **Local Storage Jadwal (Flutter)** | 🔄 **NEXT** | - | **Baru:** `lib/models/schedule.dart`, `lib/repositories/schedule_repository.dart` (hive/drift), `lib/services/notification_service.dart` (local) | Tahap 2 | Simpan/ambil jadwal; cancel/reschedule notifikasi; persist restart | Offline buka app → jadwal terlihat; notifikasi muncul tepat waktu |
| 4 | **FCM Backend + Token Endpoint** | ⏳ **PENDING** | **Baru:** `fcm/` (service, module, controller), `patient-device.entity.ts` (add `fcmToken`), migrasi | `lib/services/fcm_service.dart` (register token) | Firebase project ready, service account | POST token → tersimpan; emit event → FCM terkirim ke device test | Token tersimpan; push data message diterima Flutter |
| 5 | **Flutter Push Handler + Auto Sync** | ⏳ **PENDING** | - | `lib/main.dart` (init FCM, background handler), `lib/services/sync_service.dart` (trigger dari push) | Tahap 3, 4 | Kill app → kirim push → app buka → jadwal ter-update; foreground → sync langsung | Push diterima → sync incremental → notifikasi lokal diperbarui |
| 6 | **Admin Conflict UX** | ⏳ **PENDING** | `control-api.ts` (handle 409), `control-schedule.service.ts` (return conflict detail) | `lib/screens/jadwal_screen.dart` (toast "Jadwal diperbarui dari server") | Tahap 1, 2 | Admin ubah offline → online → conflict → pilih server/override | 409 response jelas; UI tidak kehilangan input |
| 7 | **Periodic & Connectivity Sync** | ⏳ **PENDING** | - | `lib/services/sync_service.dart` (connectivity_plus listener, periodic timer) | Tahap 3 | Putus jaringan → ubah jadwal server → nyalakan → sync otomatis | Sync berjalan saat resume & connectivity restored |

---

## 7. File yang Perlu Dibuat/Diubah (Ringkas)

**Backend (Baru):**
- `src/schedule-invalidation/schedule-invalidation.service.ts`
- `src/schedule-invalidation/schedule-invalidation.module.ts`
- `src/fcm/fcm.service.ts`, `fcm.controller.ts`, `fcm.module.ts`
- `src/devices/patient-device.entity.ts` (add `fcmToken`)
- Migration: `AddFcmTokenToPatientDevices`

**Backend (Ubah):**
- `src/control-schedule/control-schedule.service.ts` (emit event)
- `src/visits/visits.service.ts` (emit event saat recalculated)
- `src/devices/patient-device-data.service.ts` (add `sinceVersion` param)
- `src/devices/patient-device.controller.ts` (route baru)

**Flutter (Baru):**
- `lib/services/api_client.dart` (Dio + interceptors)
- `lib/services/sync_service.dart`
- `lib/services/notification_service.dart`
- `lib/services/fcm_service.dart`
- `lib/repositories/schedule_repository.dart`
- `lib/models/schedule.dart`, `treatment.dart`, `patient.dart`

**Flutter (Ubah):**
- `pubspec.yaml` (dependency: `dio`, `hive`/`drift`, `flutter_local_notifications`, `timezone`, `android_alarm_manager_plus`/`workmanager`, `firebase_messaging`, `connectivity_plus`, `shared_preferences`)
- `lib/main.dart` (init services, AppLifecycleListener)
- `lib/screens/jadwal_screen.dart` (baca dari repo, tampilkan status sync)
- `lib/screens/beranda_screen.dart` (integrasi konfirmasi → adherence sync nanti)

---

## 8. Tes End-to-End (Manual Otomatis Besok)

| Skenario | Langkah | Expected |
|----------|---------|----------|
| **E2E-1: Admin ubah jadwal → Patient terima push → Sync → Notif lokal update** | 1. Buka Admin, override jadwal pasien A ke 28 Okt<br>2. Tunggu push ke device<br>3. Buka Flutter app | Jadwal di app jadi 28 Okt; notifikasi kontrol H-1/HARI_H pindah ke 28 Okt; notif lama dibatalkan |
| **E2E-2: Offline → Online** | 1. Matikan internet device<br>2. Admin ubah jadwal ke 30 Okt<br>3. Nyalakan internet<br>4. Buka app | Sync incremental → jadwal 30 Okt; notif terupdate |
| **E2E-3: App Resume** | 1. Buka app (sync full)<br>2. Minimize 10 menit<br>3. Admin ubah jadwal<br>4. Buka app kembali | Incremental sync → data terbaru |
| **E2E-4: Treatment Selesai** | 1. Admin final review → Selesai<br>2. Push ke patient<br>3. Buka app | Semua notifikasi (dosis + kontrol) treatment tsb dibatalkan; jadwal hilang dari daftar aktif |
| **E2E-5: Conflict Admin** | 1. Admin A buka jadwal, tidak simpan<br>2. Admin B ubah & simpan<br>3. Admin A simpan | Admin A dapat 409 → tampilkan server state → override ulang |

---

## 9. Persiapan Manual (Sebelum Coding Besok)

| Item | Aksi | PIC |
|------|------|-----|
| **Firebase Project** | Buat project `dinar-tb` (dev), generate service account JSON, simpan di `FIREBASE_SERVICE_ACCOUNT` env (backend) & `google-services.json` (Flutter android/app) | Backend lead |
| **FCM Token Test Device** | Siapkan 1 device fisik/emulator dengan Google Play Services untuk test FCM | QA |
| **Dependency Review** | Tim setuju dependency Flutter baru (hive/drift, firebase_messaging, dll.) | Tech lead |
| **Migration Strategy** | Rencana migrasi `fcmToken` column (nullable, unique index) | Backend lead |
| **Secrets Management** | Tentukan cara inject service account di CI/CD & local dev (direnv/.env.local) | DevOps |

---

## 10. Fakta Terverifikasi vs Asumsi

| Kategori | Terverifikasi (Kode Ada) | Asumsi / Belum Terverifikasi |
|----------|--------------------------|------------------------------|
| **Backend Schedule CRUD** | ✅ `ControlScheduleService` + `ControlScheduleController` + entity + version + audit | - |
| **Device Auth & Activation** | ✅ `ActivationService`, `DeviceAuthGuard`, JWT patient_device | - |
| **Adherence Sync Offline** | ✅ `AdherenceService.sync`, `SyncReceipt`, idempotency | - |
| **Patient Data Endpoint** | ✅ `GET /patient/me` return schedule + treatment | Perlu tambah `sinceVersion` filter |
| **Admin Override API** | ✅ `PATCH /treatments/:id/control-schedule` + version check | - |
| **Provider Notifications Table** | ✅ Schema ada | Belum ada writer/consumer |
| **FCM Integration** | ❌ Tidak ada `firebase-admin`, tidak ada token storage | Perlu setup Firebase project |
| **Flutter Local Notifications** | ❌ Belum ada dependency, belum ada service | Perlu pilih library (hive vs drift, workmanager vs alarm) |
| **Flutter Background Sync** | ❌ Belum ada connectivity listener, AppLifecycleListener | Perlu implementasi |
| **Stale Notification Cancellation** | ❌ Belum ada mapping notificationId ↔ schedule | Perlu desain mapping |
| **Admin Offline Queue** | ❌ Tidak ada IndexedDB, Service Worker, PWA config | Tahap terpisah (bukan besok) |

---

## 11. Lokasi Dokumen Handoff

**File:** `/home/ayash/Teman TBC/docs/SYNC_IMPLEMENTATION_PLAN.md`  
**Versi:** 1.0 (persiapan implementasi)  
**Next:** Mulai coding Tahap 1 besok pukul 00.00.

---

## Ringkasan Kesiapan Besok

✅ **Phase 1 & 2 SELESAI:** Event Emitter + Invalidation Service, Sync Endpoint `/patient/me/sync`  
✅ **Build & Test PASS:** Semua unit test relevant lulus (13/13)  
🔄 **Phase 3 NEXT:** Flutter Local Storage + Notification Service  
⚠️ **Hambatan:** Firebase project & service account belum dibuat (manual, non-code). Dependency Flutter baru perlu disetujui tim.  
🚫 **Bukan tugas malam ini:** Coding Flutter, migrasi, install dependency, commit.

**Besok mulai dari Phase 3: Flutter Local Storage (Hive/Drift) + Notification Service → FCM Backend → Push Handler.**