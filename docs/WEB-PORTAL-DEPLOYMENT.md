# Deployment Portal Pasien Web

Dokumen ini menyiapkan peluncuran portal pasien berbasis browser dan Web Push. Kode sudah tersedia, tetapi belum ada deployment produksi yang diverifikasi. Jangan menyatakan peluncuran berhasil sebelum domain, TLS, migration, dan pengiriman notifikasi ke perangkat nyata diperiksa.

## Arsitektur

- Portal statis berada di direktori `web/` dan dibuka melalui `/portal.html`.
- Backend tetap NestJS di `127.0.0.1:3000` dan hanya diakses melalui reverse proxy lokal.
- Portal memakai origin yang sama dengan API. Konfigurasi default `web/config.js` mengirim request ke `/web/...` tanpa hardcoded host.
- Sesi browser memakai cookie `dinar_web_session` (`HttpOnly`, `SameSite=Lax`, `Secure` di produksi).
- Aktivasi web memakai kode aktivasi sekali pakai yang sama, tetapi tidak membuat atau menonaktifkan baris `patient_devices`. Android yang sudah aktif tetap aktif. Kode yang dipakai web menjadi terpakai; terbitkan kode baru bila pasien perlu mengaktifkan perangkat lain.
- Web Push memakai VAPID dan subscription yang terikat pada sesi browser.
- Endpoint subscription dibatasi ke penyedia push umum (FCM, Mozilla, Apple, Microsoft) untuk mengurangi risiko SSRF.

## Environment

Tambahkan konfigurasi berikut pada environment backend produksi:

```dotenv
NODE_ENV=production
WEB_SESSION_TTL_DAYS=7
WEB_COOKIE_SECURE=true
CORS_ALLOWED_ORIGINS=https://dinartb.my.id,https://admin.dinartb.my.id

WEB_PUSH_SUBJECT=mailto:admin@dinartb.my.id
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
```

- `WEB_SESSION_TTL_DAYS` dibatasi 1–30 hari.
- `WEB_COOKIE_SECURE=true` wajib untuk HTTPS. Kode memaksa cookie `Secure` saat `NODE_ENV=production`; jangan set `false` di produksi.
- `CORS_ALLOWED_ORIGINS` harus berisi origin portal dan admin yang masih memakai API lintas origin (`https://dinartb.my.id,https://admin.dinartb.my.id`). Wildcard ditolak.
- `WEB_PUSH_SUBJECT` harus memakai alamat email yang benar-benar dipantau; ganti contoh `admin@dinartb.my.id` bila alamat itu tidak aktif.
- Jangan menyimpan private key VAPID, `.env`, atau backup database di repository.

## Konteks Domain Produksi

Pemeriksaan 25 Oktober 2026 menemukan:

- `dinartb.my.id`, `admin.dinartb.my.id`, dan `api.dinartb.my.id` mengarah ke server yang sama.
- Sertifikat Let's Encrypt yang aktif mencakup ketiga nama tersebut; belum ada subdomain portal khusus.
- `www.dinartb.my.id` mengarah ke server yang sama, tetapi sertifikat saat ini tidak mencakup `www`; gunakan apex `dinartb.my.id`.
- `https://dinartb.my.id/` masih menyajikan halaman lama, dan `/portal.html` belum tersedia.
- `https://admin.dinartb.my.id/portal.html` saat ini jatuh ke SPA admin, bukan portal pasien.

Origin portal yang dipilih: `https://dinartb.my.id`. Domain ini saat ini melayani landing page. Deployment portal harus menjadikan isi `web/` sebagai root static domain tersebut dan menambahkan proxy `/web/` ke backend. Jangan membuat server block duplikat dengan `server_name dinartb.my.id`; rekonsiliasi dengan server landing yang ada di `/etc/nginx/nginx.conf` secara terkontrol. Fallback SPA admin bukan portal pasien.

Artifact rilis `20261025T053603Z` adalah artifact pertama yang memuat portal, service worker, PWA, APK, migration, dan deploy draft. Artifact ini belum diverifikasi di produksi. Artifact lama `20261022T140128Z` tidak memuat portal, konfigurasi Web Push, atau Nginx portal; jangan deploy portal dari artifact lama.

### Membuat kunci VAPID

```bash
npm run webpush:generate-keys
```

Simpan public key dan private key di secret manager. Public key boleh dikirim ke browser; private key tidak boleh. Mengganti pasangan kunci VAPID membuat subscription lama tidak dapat dipakai dan pasien perlu mengaktifkan notifikasi lagi.

## Reverse Proxy

Contoh Nginx untuk `dinartb.my.id`. Server landing yang ada di `/etc/nginx/nginx.conf` harus direkonsiliasi; jangan membuat dua server block dengan `server_name` yang sama. Backup konfigurasi, ubah root/landing secara terkontrol, lalu jalankan `nginx -t` sebelum reload.

```nginx
server {
    listen 443 ssl http2;
    server_name dinartb.my.id;

    root /var/www/dinar-tb/portal;
    index index.html;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location = /portal.html {
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    location = /portal-sw.js {
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    location = /config.js {
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    location = /portal-manifest.webmanifest {
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    location /web/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Catatan:

- Deploy seluruh isi `web/` ke root portal, bukan hanya `portal.html`; `portal.css`, `portal.js`, `portal-sw.js`, ikon, dan `logo2.png` memakai path absolut dari root domain.
- `proxy_pass http://127.0.0.1:3000;` tanpa trailing slash mempertahankan path `/web/...`.
- Backend hanya listen di `127.0.0.1` dan mempercayai proxy lokal untuk header forwarded.
- Gunakan `X-Forwarded-For $remote_addr`, bukan `$proxy_add_x_forwarded_for`, karena backend hanya mempercayai proxy loopback dan tidak boleh menerima rantai forwarded dari klien.
- Service worker harus disajikan dari root `/portal-sw.js` agar scope-nya mencakup `/portal.html`.
- Jangan cache `portal-sw.js`, `config.js`, `portal.html`, atau manifest secara agresif. Naikkan `CACHE_NAME` di `web/portal-sw.js` setiap kali aset publik berubah.
- Nginx tidak mewariskan `add_header` dari level server ke location yang memiliki `add_header` sendiri. Ulangi header keamanan di location tersebut atau gunakan `include`.
- Web Push dan cookie `Secure` memerlukan HTTPS yang valid.

## Prosedur Migration

Migration baru: `AddPatientWebSessionsAndWebPush1791900000000`.

Migration ini hanya membuat tabel:

- `patient_web_sessions`
- `web_push_subscriptions`
- `web_push_deliveries`

Migration tidak mengubah, menonaktifkan, atau menghapus baris `patient_devices`.

Audit 25 Oktober 2026: migration diuji pada salinan schema dan data dump produksi 22 Oktober 2026 di database terisolasi. Hasil: 12 migration produksi dikenali, migration baru berhasil, ketiga tabel dan foreign key terbentuk, dan tidak ada data pasien yang diubah. Riwayat produksi mencatat nama legacy `AddFcmTokenToPatientDevices1728800000001`; runner akan mencatat ulang migrasi FCM yang idempoten sebagai `AddFcmTokenToPatientDevices1780000000001`, sehingga total baris migration bertambah dua. Ini tidak mengubah skema `patient_devices`.

Jangan menjalankan migration produksi tanpa persetujuan dan backup yang dapat dipulihkan.

1. Buat backup:

   ```bash
   pg_dump -Fc -h HOST -U USER -d DATABASE -f /secure/path/dinar_tb_pre_web_portal_$(date +%Y%m%d_%H%M%S).dump
   ```

2. Uji restore backup ke database sementara, lalu jalankan migration di sana:

   ```bash
   npm run build
   DOTENV_CONFIG_PATH=.env.staging npm run migration:run:prod
   ```

3. Periksa status migration produksi:

   ```bash
   npm run migration:show:prod
   ```

4. Setelah backup, hasil uji, dan prosedur pemulihan disetujui, jalankan migration produksi secara eksplisit:

   ```bash
   npm run migration:run:prod
   ```

5. Jalankan build yang sama dan periksa kesiapan API serta aset portal:

   ```bash
   curl -fsS https://api.dinartb.my.id/health/ready
   curl -fsS https://dinartb.my.id/portal.html | grep -F 'Portal Pasien'
   ```

Jangan menjalankan `migration:revert:prod` sebagai prosedur pemulihan rutin. Jika terjadi masalah data, pulihkan backup yang sudah diuji atau gunakan prosedur rollback yang disetujui.

## Pemeriksaan Setelah Deploy

Gunakan akun dan kode aktivasi uji, bukan data pasien nyata.

1. Buka `/portal.html?app=1`, masukkan kode aktivasi, lalu pastikan dashboard memuat nama pasien, jadwal pengingat, jadwal kontrol, dan riwayat.
2. Pastikan cookie sesi tidak dapat dibaca JavaScript dan bertahan setelah halaman dimuat ulang.
3. Lakukan konfirmasi obat hari ini, lalu pastikan status berubah menjadi terkonfirmasi dan data muncul di dashboard petugas.
4. Keluar dari portal, lalu pastikan sesi tidak dapat dipakai lagi dan kode aktivasi tidak dapat digunakan ulang.
5. Periksa database: baris `patient_devices` pasien uji tidak berubah sebelum dan sesudah aktivasi web.
6. Periksa `/web/push/key`; jika Web Push dikonfigurasi, status harus `enabled: true`.
7. Aktifkan notifikasi dari halaman Profil pada perangkat nyata. Kirim notifikasi uji dan pastikan muncul.
8. Untuk iPhone, pasang portal ke Layar Utama melalui Safari, gunakan iOS 16.4+, lalu aktifkan notifikasi dari halaman Profil.
9. Periksa log backend untuk scheduler `Web Push pengingat obat` dan pastikan tidak ada error berulang.

Pada pengujian lokal, subscription dan permintaan notifikasi uji berhasil diterima FCM (`last_success_at` terisi) melalui Chrome headless. Ini belum membuktikan notifikasi benar-benar tampil di perangkat. Verifikasi akhir harus dilakukan pada browser/perangkat nyata dengan HTTPS.

## Pemeriksaan Keamanan Rilis

Jalankan sebelum peluncuran:

```bash
npm audit --omit=dev
npm run build
npx tsc --noEmit -p tsconfig.json
npm test -- --runInBand
```

Per 25 Oktober 2026, setelah pembaruan non-breaking, `npm audit --omit=dev` melaporkan 10 temuan produksi: 8 moderate dan 2 high, 0 critical. `body-parser` sudah 2.4.0, `multer` dipaksa 2.5.0 melalui `overrides`, dan temuan critical dev-only `handlebars` sudah diperbaiki. Dua high tersisa berasal dari `firebase-admin` 12.7.0/`node-forge` dan memerlukan upgrade major ke `firebase-admin` 13.10.0; temuan moderate terutama dari `uuid` transitif. Jangan rilis tanpa keputusan tertulis untuk sisa temuan.

`node-forge` 1.4.0 terkena CVE-2026-85393 (CVSS 8.7, belum ada versi patch) pada verifikasi signature RSA PKCS#1 v1.5. Di source `firebase-admin` 12.7.0, pemakaian langsung `node-forge` yang terlihat adalah parsing private key service account, bukan verifikasi signature dari pihak tidak tepercaya. Dampaknya diperkecil, tetapi temuan tetap high dan tidak boleh disebut sudah diperbaiki. Rekomendasi: terima risiko secara tertulis untuk rilis ini, batasi akses file service account, lalu jadwalkan upgrade `firebase-admin` 13.10.0 dengan regression test FCM. Rincian ada di `SECURITY-RESIDUAL-RISK.md` dalam artifact.

Rilis memakai `npm ci`; `package-lock.json` adalah lockfile acuan. `pnpm-lock.yaml` sudah disinkronkan dengan override `body-parser` 2.4.0, `fast-uri` 3.1.9, dan `multer` 2.5.0 melalui `pnpm-workspace.yaml`. Verifikasi dengan `pnpm install --frozen-lockfile --lockfile-only` sebelum memakai pnpm.

## Checklist Rilis Rocky Linux 8.10

- [ ] Origin portal `https://dinartb.my.id` dan sertifikat TLS mencakup domain tersebut; landing root direkonsiliasi tanpa duplikasi `server_name`.
- [ ] Backup `pg_dump -Fc` terbaru lulus `pg_restore --list`, checksum, dan uji restore ke database terisolasi.
- [ ] `npm run migration:show:prod` menunjukkan hanya migration yang diharapkan; backup diambil ulang tepat sebelum migration.
- [ ] `npm ci --omit=dev` lulus dan menghasilkan `multer` 2.5.0 serta `body-parser` 2.4.0.
- [ ] Checksum artifact lulus: `sha256sum -c SHA256SUMS`, `deploy/SHA256SUMS`, dan `web/SHA256SUMS`.
- [ ] Jika memakai pnpm: `pnpm install --frozen-lockfile --lockfile-only` lulus.
- [ ] Environment produksi berisi `NODE_ENV=production`, `WEB_COOKIE_SECURE=true`, origin portal dan admin di `CORS_ALLOWED_ORIGINS`, pasangan VAPID permanen, dan path Firebase bila FCM dipakai.
- [ ] Nginx menyajikan portal dan `/web/` dari origin yang sama, memakai `X-Forwarded-For $remote_addr`, dan tidak meng-cache `portal.html`, `portal-sw.js`, atau `config.js`.
- [ ] Header keamanan portal (HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`) aktif; pertimbangkan header yang sama untuk admin/API.
- [ ] Backend tetap `127.0.0.1:3000`; SELinux `httpd_can_network_connect` aktif; port 3000 tidak terbuka.
- [ ] `systemctl status dinar-tb-backend`, `/health`, dan `/health/ready` lulus.
- [ ] Smoke test aktivasi, konfirmasi, logout, dan `patient_devices` tidak berubah.
- [ ] Web Push diuji pada perangkat nyata; notifikasi benar-benar tampil.
- [ ] Prosedur rollback dan pemantauan log scheduler disiapkan.

## Operasional

- Scheduler berjalan setiap menit dan mengirim pengingat hanya dalam jendela 15 menit setelah jam pengingat Admin.
- Pasien yang sudah mengonfirmasi tanggal tersebut tidak menerima pengingat lagi.
- Pengiriman diklaim per pasien, tanggal, dan slot (`morning`/`evening`) agar tidak dobel.
- Logout/revocation menghapus subscription sesi tersebut.
- Sesi kedaluwarsa dan pasien yang diarsipkan/dianonimkan tidak menerima push.
- Jika backend dijalankan lebih dari satu instance, scheduler dapat berjalan di beberapa instance. Klaim unik mencegah pengiriman ganda, tetapi tetap gunakan satu instance scheduler atau mekanisme distributed lock.
- Pantau ukuran tabel `patient_web_sessions`, `web_push_subscriptions`, dan `web_push_deliveries`; pembersihan sesi kedaluwarsa berjalan setiap pukul 03.00.
