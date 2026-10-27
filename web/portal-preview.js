(function () {
  'use strict';

  var state = { tab: 'beranda', confirmed: false, reminderWindows: [] };
  var REMINDER_LABELS = ['Pengingat utama', 'Pengingat malam'];
  var TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

  function icon(name, className) {
    return '<svg class="icon ' + (className || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  /**
   * The backend sends exactly two windows in the order used by the Admin
   * settings: reminderMorning first, reminderEvening second. Keep that order
   * so "utama" and "malam" never get swapped, even when a time wraps midnight.
   */
  function normalizeReminderWindows(windows) {
    var normalized = [];
    for (var index = 0; index < 2; index += 1) {
      var item = Array.isArray(windows) ? windows[index] : null;
      if (!item || typeof item.start !== 'string' || !TIME_PATTERN.test(item.start)) {
        normalized.push(null);
      } else {
        normalized.push({
          start: item.start,
          end: typeof item.end === 'string' && TIME_PATTERN.test(item.end) ? item.end : null
        });
      }
    }
    return normalized;
  }

  function hasReminderWindows() {
    return state.reminderWindows.some(function (window) { return window !== null; });
  }

  function formatReminderTime(value) {
    return value.replace(':', '.');
  }

  function reminderSlot(index) {
    var window = state.reminderWindows[index];
    return '<div class="medicine-time' + (window ? '' : ' is-empty') + '">' +
      '<span>' + REMINDER_LABELS[index] + '</span>' +
      '<strong>' + (window ? formatReminderTime(window.start) + ' <small>WIB</small>' : '—') + '</strong>' +
      '</div>';
  }

  function medicineTimes() {
    return '<div class="medicine-times" aria-label="Jadwal pengingat minum obat dari petugas">' +
      reminderSlot(0) + reminderSlot(1) +
      '</div>';
  }

  function medicineSourceNote() {
    return '<p class="medicine-source">' +
      (hasReminderWindows()
        ? 'Waktu mengikuti pengaturan petugas.'
        : 'Pratinjau lokal belum terhubung ke pengaturan petugas. Waktu aktual dimuat dari backend setelah sesi aman tersedia.') +
      '</p>';
  }

  function profileReminderValue(index) {
    var window = state.reminderWindows[index];
    return window ? formatReminderTime(window.start) + ' WIB' : 'Belum tersedia';
  }

  function brand() {
    return '<a class="demo-brand" href="/pasien.html" aria-label="Dinar-TB">' +
      '<img src="/logo2.png" alt="" width="38" height="38">' +
      '<span>Dinar-TB<span aria-hidden="true">.</span></span>' +
      '</a>';
  }

  function nav() {
    return '<nav class="demo-nav" aria-label="Navigasi pratinjau">' +
      navButton('beranda', 'home', 'Beranda') +
      navButton('jadwal', 'calendar', 'Jadwal') +
      navButton('perkembangan', 'chart', 'Perkembangan') +
      navButton('profil', 'user', 'Profil') +
      '</nav>';
  }

  function bottomNav() {
    return '<nav class="demo-bottom-nav" aria-label="Navigasi pratinjau">' +
      navButton('beranda', 'home', 'Beranda') +
      navButton('jadwal', 'calendar', 'Jadwal') +
      navButton('perkembangan', 'chart', 'Perkembangan') +
      navButton('profil', 'user', 'Profil') +
      '</nav>';
  }

  function navButton(tab, iconName, label) {
    return '<button type="button" data-preview-tab="' + tab + '" class="' + (state.tab === tab ? 'active' : '') + '">' +
      '<span>' + icon(iconName) + '</span>' + label +
      '</button>';
  }

  function banner() {
    return '<div class="demo-banner">' +
      '<span>' + icon('info') + 'Pratinjau lokal · data contoh, bukan data pasien</span>' +
      '<a href="/pasien.html">Keluar pratinjau</a>' +
      '</div>';
  }

  function topbar() {
    return '<div class="demo-topbar">' +
      brand() +
      '<span class="demo-chip">' + icon('lock') + 'Mode pratinjau</span>' +
      '<a class="demo-exit" href="/pasien.html">' + icon('arrow-left') + 'Portal</a>' +
      '</div>';
  }

  function greeting(name, initials, copy) {
    return '<div class="demo-greeting">' +
      '<div><p>' + copy + '</p><h1>' + name + '</h1></div>' +
      '<div class="demo-avatar" aria-hidden="true">' + initials + '</div>' +
      '</div>';
  }

  function medicineCard() {
    var confirmed = state.confirmed;
    return '<section class="medicine-card ' + (confirmed ? 'confirmed' : '') + '" aria-labelledby="medicine-title">' +
      '<div class="medicine-status">' +
      '<span class="medicine-pill">' + icon(confirmed ? 'check' : 'clock') + (confirmed ? 'Sudah dikonfirmasi' : 'Belum dikonfirmasi') + '</span>' +
      '<small>Hari ini</small>' +
      '</div>' +
      '<div class="medicine-main">' +
      '<span class="medicine-icon">' + icon('pill') + '</span>' +
      '<div class="medicine-main-copy"><p id="medicine-title">Jadwal minum obat</p>' + medicineTimes() + '</div>' +
      '</div>' +
      '<p class="medicine-copy">' +
      (confirmed
        ? 'Terima kasih. Konfirmasi contoh ini tersimpan di pratinjau lokal dan tidak dikirim ke server.'
        : 'Minum obat sesuai petunjuk petugas kesehatan, lalu lakukan konfirmasi.') +
      '</p>' +
      medicineSourceNote() +
      '<button class="demo-primary" type="button" data-preview-action="confirm"' + (confirmed ? ' disabled' : '') + '>' +
      icon('check') + (confirmed ? 'Sudah minum obat' : 'Saya sudah minum obat') +
      '</button>' +
      (confirmed ? '' : '<button class="demo-secondary" type="button" data-preview-action="remind">' + icon('bell') + 'Ingatkan saya 30 menit lagi</button>') +
      '</section>';
  }

  function nextControlCard() {
    return '<section class="demo-card" aria-labelledby="next-control-title">' +
      '<div class="demo-card-head">' +
      '<div><h2 id="next-control-title">Kontrol berikutnya</h2><p>Jangan lupa membawa kartu berobat</p></div>' +
      '<button class="demo-link" type="button" data-preview-go="jadwal">Detail ' + icon('chevron') + '</button>' +
      '</div>' +
      '<div class="next-control">' +
      '<div class="date-block"><span>OKT</span><strong>10</strong></div>' +
      '<div><h3>Sabtu, 10 Oktober 2026</h3><p>08.00–11.00 WIB</p><div class="next-meta"><span>' + icon('map-pin') + 'Puskesmas Contoh</span></div></div>' +
      '</div>' +
      '<div class="countdown">' + icon('clock') + '15 hari lagi</div>' +
      '</section>';
  }

  function progressCard() {
    return '<section class="demo-card" aria-labelledby="progress-title">' +
      '<div class="demo-card-head"><div><h2 id="progress-title">Perkembangan pengobatan</h2><p>Berdasarkan catatan terverifikasi</p></div></div>' +
      '<div class="progress-label"><strong>Bulan ke-3 dari 6</strong><span>50%</span></div>' +
      '<div class="progress-track" role="img" aria-label="Kemajuan pengobatan 50 persen"><i></i></div>' +
      '<div class="progress-stats"><div><strong>26</strong><span>Konfirmasi bulan ini</span></div><div><strong>3</strong><span>Kontrol selesai</span></div></div>' +
      '</section>';
  }

  function historyCard() {
    return '<section class="demo-card" aria-labelledby="history-title">' +
      '<div class="demo-card-head"><div><h2 id="history-title">Riwayat minum obat</h2><p>3 hari terakhir</p></div>' +
      '<button class="demo-link" type="button" data-preview-go="perkembangan">Lihat semua ' + icon('chevron') + '</button></div>' +
      '<div class="history-list">' +
      historyRow('check', 'Hari ini', '07.12 WIB', 'Terkonfirmasi', '') +
      historyRow('check', 'Kemarin', '07.05 WIB', 'Terkonfirmasi', '') +
      historyRow('alert', '2 hari lalu', 'Tidak ada konfirmasi', 'Belum dikonfirmasi', 'missed') +
      '</div>' +
      '</section>';
  }

  function historyRow(iconName, title, time, status, tone) {
    return '<div class="history-row">' +
      '<span class="history-dot ' + tone + '">' + icon(iconName) + '</span>' +
      '<div><strong>' + title + '</strong><small>' + time + '</small></div>' +
      '<span class="history-status ' + tone + '">' + status + '</span>' +
      '</div>';
  }

  function infoStrip(copy) {
    return '<div class="demo-info-strip">' + icon('info') + '<span>' + copy + '</span></div>';
  }

  function beranda() {
    return greeting('Pasien Contoh', 'PC', 'Selamat pagi,') +
      '<div class="demo-grid">' +
      '<div class="demo-stack">' + medicineCard() + nextControlCard() + '</div>' +
      '<div class="demo-stack">' + progressCard() + historyCard() +
      infoStrip('Ini pratinjau lokal. Data contoh tidak dikirim, disimpan, atau ditampilkan di produksi.') +
      '</div></div>';
  }

  function jadwal() {
    return '<div class="demo-stack">' +
      '<section class="control-hero" aria-labelledby="control-title">' +
      '<p class="eyebrow">Kontrol berikutnya</p>' +
      '<div class="control-date"><strong>10</strong><div><b id="control-title">Oktober 2026</b><span>Sabtu</span></div></div>' +
      '<div class="control-meta"><span>' + icon('clock') + '08.00–11.00 WIB</span><span>' + icon('map-pin') + 'Puskesmas Contoh</span></div>' +
      '<div class="countdown">' + icon('clock') + '15 hari lagi</div>' +
      '</section>' +
      '<div class="demo-warning-strip">' + icon('alert') + '<span>Jadwal ini contoh. Jadwal sebenarnya ditetapkan oleh petugas kesehatan dan tidak dapat diubah melalui aplikasi.</span></div>' +
      '<section class="demo-card" aria-labelledby="prepare-title">' +
      '<div class="demo-card-head"><div><h2 id="prepare-title">Yang perlu disiapkan</h2><p>Sebelum datang ke fasilitas kesehatan</p></div></div>' +
      '<div class="check-list">' +
      '<span><i>' + icon('check') + '</i>Kartu berobat pasien</span>' +
      '<span><i>' + icon('check') + '</i>Obat yang masih tersisa</span>' +
      '<span><i>' + icon('check') + '</i>Catatan keluhan, jika ada</span>' +
      '</div></section>' +
      '<section class="demo-card" aria-labelledby="visit-title">' +
      '<div class="demo-card-head"><div><h2 id="visit-title">Riwayat kontrol</h2><p>Kunjungan sebelumnya</p></div></div>' +
      '<div class="history-list">' +
      historyRow('check', '25 Sep 2026', 'Kontrol selesai', 'Obat diberikan', '') +
      historyRow('check', '11 Sep 2026', 'Kontrol selesai', 'Obat diberikan', '') +
      historyRow('check', '28 Agu 2026', 'Kontrol selesai', 'Obat diberikan', '') +
      '</div></section>' +
      infoStrip('Pratinjau lokal: jadwal dan riwayat di atas adalah data contoh.') +
      '</div>';
  }

  function perkembangan() {
    return '<div class="demo-stack">' +
      '<section class="stage-card" aria-labelledby="stage-title">' +
      '<div class="stage-top"><div><span>Tahap pengobatan saat ini</span><h1 id="stage-title">Bulan ke-3</h1><p>Fase lanjutan</p></div><div class="stage-ring">50%</div></div>' +
      '<div class="stage-track" role="img" aria-label="Kemajuan 50 persen"><i></i></div>' +
      '<div class="stage-labels"><span>Mulai<br><b>12 Jul 2026</b></span><span>Rencana 6 bulan*</span></div>' +
      '</section>' +
      '<div class="demo-warning-strip">' + icon('alert') + '<span>*Durasi mengikuti catatan petugas kesehatan dan dapat berubah sesuai evaluasi klinis. Aplikasi tidak menentukan kesembuhan.</span></div>' +
      '<section class="demo-card" aria-labelledby="week-title">' +
      '<div class="demo-card-head"><div><h2 id="week-title">Konfirmasi minggu ini</h2><p>19–25 September 2026</p></div><strong>6/7</strong></div>' +
      '<div class="week-days" aria-label="Enam dari tujuh hari terkonfirmasi">' +
      weekDay('S', true) + weekDay('S', true) + weekDay('R', true) + weekDay('K', true) + weekDay('J', true) + weekDay('S', false) + weekDay('M', true) +
      '</div>' +
      '<div class="demo-info-strip" style="margin-top:12px">' + icon('info') + '<span>Satu hari tidak memiliki konfirmasi di pratinjau. Ini bukan penilaian medis.</span></div>' +
      '</section>' +
      '<div class="demo-metrics"><div><span>' + icon('check') + '</span><strong>72 hari</strong><p>Terkonfirmasi sejak mulai</p></div><div><span>' + icon('calendar') + '</span><strong>3 kali</strong><p>Kontrol tercatat</p></div></div>' +
      '<section class="demo-card" aria-labelledby="milestone-title">' +
      '<div class="demo-card-head"><div><h2 id="milestone-title">Perjalanan pengobatan</h2><p>Catatan penting terverifikasi</p></div></div>' +
      '<div class="milestones">' +
      '<div><i></i><div><span>25 Sep 2026</span><strong>Kontrol rutin selesai</strong><p>Obat diberikan oleh petugas.</p></div></div>' +
      '<div><i></i><div><span>12 Jul 2026</span><strong>Pengobatan dimulai</strong><p>Data dicatat di fasilitas kesehatan.</p></div></div>' +
      '</div></section>' +
      infoStrip('Pratinjau lokal: seluruh angka dan tanggal adalah data contoh.') +
      '</div>';
  }

  function weekDay(label, done) {
    return '<div><span class="' + (done ? '' : 'empty') + '">' + (done ? icon('check') : '—') + '</span><small>' + label + '</small></div>';
  }

  function profil() {
    return '<div class="demo-stack">' +
      '<section class="profile-card" aria-labelledby="profile-title">' +
      '<div class="profile-avatar" aria-hidden="true">PC</div>' +
      '<h1 id="profile-title">Pasien Contoh</h1>' +
      '<p>Nomor Register</p><strong>2026-0000-0000</strong>' +
      '<span class="demo-badge">Pengobatan aktif</span>' +
      '</section>' +
      '<section class="demo-card" aria-labelledby="profile-info-title">' +
      '<div class="demo-card-head"><div><h2 id="profile-info-title">Informasi pengobatan</h2><p>Data contoh terverifikasi</p></div></div>' +
      '<div class="profile-info">' +
      '<div><span>Mulai pengobatan</span><strong>12 Juli 2026</strong></div>' +
      '<div><span>Tahap saat ini</span><strong>Bulan ke-3</strong></div>' +
      '<div><span>Kontrol berikutnya</span><strong>10 Oktober 2026</strong></div>' +
      '<div><span>Pengingat utama</span><strong>' + profileReminderValue(0) + '</strong></div>' +
      '<div><span>Pengingat malam</span><strong>' + profileReminderValue(1) + '</strong></div>' +
      '</div></section>' +
      (hasReminderWindows() ? '' : '<div class="demo-info-strip" style="margin-top:12px">' + icon('info') + '<span>Pratinjau lokal belum membaca pengaturan pengingat petugas.</span></div>') +
      '<section class="demo-card" aria-labelledby="profile-menu-title">' +
      '<div class="demo-card-head"><div><h2 id="profile-menu-title">Bantuan dan informasi</h2><p>Pilihan pada pratinjau</p></div></div>' +
      '<div class="demo-menu">' +
      '<button type="button" data-preview-action="demo-note"><span>' + icon('help') + '</span><div><strong>Bantuan &amp; Informasi</strong><small>Cara menggunakan Dinar-TB</small></div>' + icon('chevron') + '</button>' +
      '<button type="button" data-preview-action="demo-note"><span>' + icon('user') + '</span><div><strong>Hubungi Petugas</strong><small>Puskesmas Contoh</small></div>' + icon('chevron') + '</button>' +
      '<button type="button" data-preview-action="demo-note"><span>' + icon('bell') + '</span><div><strong>Pengaturan Notifikasi</strong><small>Contoh pengaturan</small></div>' + icon('chevron') + '</button>' +
      '</div></section>' +
      '<div class="demo-warning-strip">' + icon('alert') + '<span>Jangan mengubah atau menghentikan obat sendiri. Hubungi petugas kesehatan terlebih dahulu.</span></div>' +
      '<p style="text-align:center;font-size:.65rem;color:#8b97a8">Pratinjau lokal Dinar-TB · bukan data pasien</p>' +
      '</div>';
  }

  function panelFor(tab) {
    if (tab === 'jadwal') return jadwal();
    if (tab === 'perkembangan') return perkembangan();
    if (tab === 'profil') return profil();
    return beranda();
  }

  function render(root) {
    var panels = root.querySelector('#demo-panels');
    if (!panels) return;
    panels.innerHTML = '<div class="demo-panel">' + panelFor(state.tab) + '</div>';
    root.querySelectorAll('[data-preview-tab]').forEach(function (button) {
      var active = button.getAttribute('data-preview-tab') === state.tab;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function setTab(root, tab) {
    if (['beranda', 'jadwal', 'perkembangan', 'profil'].indexOf(tab) === -1) return;
    state.tab = tab;
    render(root);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function mount(root, options) {
    state.reminderWindows = normalizeReminderWindows(options && options.reminderWindows);
    root.innerHTML = '<div class="demo-app">' +
      banner() + topbar() + nav() +
      '<div id="demo-panels"></div>' +
      bottomNav() +
      '</div>';

    root.addEventListener('click', function (event) {
      var tabButton = event.target.closest('[data-preview-tab]');
      if (tabButton) {
        setTab(root, tabButton.getAttribute('data-preview-tab'));
        return;
      }

      var goButton = event.target.closest('[data-preview-go]');
      if (goButton) {
        setTab(root, goButton.getAttribute('data-preview-go'));
        return;
      }

      var actionButton = event.target.closest('[data-preview-action]');
      if (!actionButton) return;
      var action = actionButton.getAttribute('data-preview-action');

      if (action === 'confirm') {
        state.confirmed = true;
        render(root);
        if (window.DinarPortal) {
          window.DinarPortal.showToast('Konfirmasi contoh tersimpan di pratinjau lokal.');
        }
      } else if (action === 'remind') {
        if (window.DinarPortal) {
          window.DinarPortal.showToast('Pengingat tidak dijadwalkan pada pratinjau lokal.');
        }
      } else if (action === 'demo-note') {
        if (window.DinarPortal) {
          window.DinarPortal.showToast('Ini pratinjau lokal; fitur ini belum terhubung ke data pasien.');
        }
      }
    });

    render(root);
  }

  window.DinarPreview = { mount: mount };
})();
