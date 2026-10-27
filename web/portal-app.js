(function () {
  'use strict';

  var API_BASE = String(window.DINAR_API_BASE || '').replace(/\/$/, '');
  var REMINDER_LABELS = ['Pengingat utama', 'Pengingat malam'];
  var TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
  var MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  var MONTHS_LONG = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  var DAYS_LONG = [
    'Minggu',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu',
  ];
  var DAYS_SHORT = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];
  var TAKEN = 'Sudah diminum';
  var MISSED = 'Terlewat';
  var NOT_CONFIRMED = 'Belum dikonfirmasi';
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  var state = {
    root: null,
    session: null,
    data: null,
    tab: 'beranda',
    loading: true,
    error: null,
    busy: false,
    pushBusy: false,
    pushSubscribed: false,
    pushConfig: null,
    expiryTimer: null,
  };

  function icon(name, className) {
    return (
      '<svg class="icon ' +
      (className || '') +
      '" aria-hidden="true"><use href="#i-' +
      name +
      '"/></svg>'
    );
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function api(path, options) {
    var requestOptions = options || {};
    var headers = { Accept: 'application/json' };
    if (requestOptions.body && typeof requestOptions.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(requestOptions.body);
    }
    Object.keys(requestOptions.headers || {}).forEach(function (key) {
      headers[key] = requestOptions.headers[key];
    });
    return fetch(API_BASE + path, {
      method: requestOptions.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: headers,
      body: requestOptions.body,
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch (error) {
            body = null;
          }
        }
        if (response.status === 401) {
          if (
            window.DinarPortal &&
            typeof window.DinarPortal.onSessionExpired === 'function'
          ) {
            window.DinarPortal.onSessionExpired();
          }
          throw makeError(
            'Sesi web tidak berlaku. Masukkan kode aktivasi baru.',
            401,
            body,
          );
        }
        if (!response.ok) {
          var message = body && body.message;
          if (Array.isArray(message)) message = message.join(' ');
          throw makeError(
            message || 'Permintaan tidak dapat diproses. Coba lagi.',
            response.status,
            body,
          );
        }
        return body;
      });
    });
  }

  function makeError(message, status, body) {
    var error = new Error(message);
    error.status = status;
    error.body = body;
    return error;
  }

  function parseDateOnly(value) {
    var parts = String(value || '')
      .split('-')
      .map(Number);
    if (
      parts.length !== 3 ||
      parts.some(function (part) {
        return !Number.isFinite(part);
      })
    )
      return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function formatDateLong(value) {
    var date = parseDateOnly(value);
    if (!date) return '—';
    return (
      DAYS_LONG[date.getUTCDay()] +
      ', ' +
      date.getUTCDate() +
      ' ' +
      MONTHS_LONG[date.getUTCMonth()] +
      ' ' +
      date.getUTCFullYear()
    );
  }

  function formatDateShort(value) {
    var date = parseDateOnly(value);
    if (!date) return '—';
    return (
      date.getUTCDate() +
      ' ' +
      MONTHS_SHORT[date.getUTCMonth()] +
      ' ' +
      date.getUTCFullYear()
    );
  }

  function formatMonthShort(value) {
    var date = parseDateOnly(value);
    return date ? MONTHS_SHORT[date.getUTCMonth()].toUpperCase() : '—';
  }

  function formatDay(value) {
    var date = parseDateOnly(value);
    return date ? String(date.getUTCDate()) : '—';
  }

  function formatTime(value) {
    return String(value || '').replace(':', '.') + ' WIB';
  }

  function formatClock(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return (
      new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
      })
        .format(date)
        .replace(':', '.') + ' WIB'
    );
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    })
      .format(date)
      .replace(':', '.');
  }

  function todayJakarta() {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());
  }

  function daysBetween(from, to) {
    var start = parseDateOnly(from);
    var end = parseDateOnly(to);
    if (!start || !end) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function relativeDay(value) {
    var today = todayJakarta();
    var diff = daysBetween(value, today);
    if (diff === 0) return 'Hari ini';
    if (diff === 1) return 'Kemarin';
    return formatDateShort(value);
  }

  function greeting() {
    var hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
      }).format(new Date()),
    );
    if (hour < 11) return 'Selamat pagi,';
    if (hour < 15) return 'Selamat siang,';
    if (hour < 18) return 'Selamat sore,';
    return 'Selamat malam,';
  }

  function initials(name) {
    var parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return 'P';
    return parts
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0);
      })
      .join('')
      .toUpperCase();
  }

  function patient() {
    return (
      (state.data && state.data.patient) ||
      (state.session && state.session.patient) ||
      {}
    );
  }

  function clinicName() {
    return (
      (state.data && state.data.clinic && state.data.clinic.name) ||
      'Fasilitas kesehatan'
    );
  }

  function activeCourse() {
    var today = todayJakarta();
    var courses = (state.data && state.data.treatmentCourses) || [];
    return (
      courses.filter(function (course) {
        return !course.completedAt && course.startDate <= today;
      })[0] || null
    );
  }

  function treatment() {
    return state.data && state.data.progress
      ? state.data.progress.treatment
      : null;
  }

  function adherenceDays() {
    var progress = state.data && state.data.progress;
    return progress &&
      progress.adherence &&
      Array.isArray(progress.adherence.days)
      ? progress.adherence.days
      : [];
  }

  function todayAdherence() {
    var today = todayJakarta();
    return (
      adherenceDays().filter(function (day) {
        return day.date === today;
      })[0] || null
    );
  }

  function isConfirmedToday() {
    var day = todayAdherence();
    return !!day && day.status === TAKEN;
  }

  function nextSchedule() {
    var today = todayJakarta();
    var schedules = (state.data && state.data.controlSchedules) || [];
    return (
      schedules
        .filter(function (item) {
          return item.scheduledDate >= today;
        })
        .sort(function (a, b) {
          return a.scheduledDate.localeCompare(b.scheduledDate);
        })[0] || null
    );
  }

  function normalizeReminderWindows(windows) {
    var result = [];
    for (var index = 0; index < 2; index += 1) {
      var item = Array.isArray(windows) ? windows[index] : null;
      result.push(
        item && typeof item.start === 'string' && TIME_PATTERN.test(item.start)
          ? {
              start: item.start,
              end:
                typeof item.end === 'string' && TIME_PATTERN.test(item.end)
                  ? item.end
                  : null,
            }
          : null,
      );
    }
    return result;
  }

  function reminderWindows() {
    return normalizeReminderWindows(state.data && state.data.reminderWindows);
  }

  function hasReminderWindows() {
    return reminderWindows().some(function (item) {
      return item !== null;
    });
  }

  function reminderValue(index) {
    var item = reminderWindows()[index];
    return item ? formatTime(item.start) : 'Belum diatur';
  }

  function treatmentProgress() {
    var course = treatment();
    if (!course) return null;
    var target = course.continuedTargetEndDate || course.initialTargetEndDate;
    var totalDays = Math.max(1, daysBetween(course.startDate, target));
    var elapsed = Math.max(0, daysBetween(course.startDate, todayJakarta()));
    var completed = !!course.completedAt;
    var percent = completed
      ? 100
      : Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100)));
    var totalMonths = Math.max(1, Math.round(totalDays / 30.4375));
    var month = completed
      ? totalMonths
      : Math.min(totalMonths, Math.max(1, Math.floor(elapsed / 30.4375) + 1));
    return {
      startDate: course.startDate,
      targetDate: target,
      totalDays: totalDays,
      elapsed: elapsed,
      completed: completed,
      percent: percent,
      month: month,
      totalMonths: totalMonths,
    };
  }

  function navButton(tab, iconName, label) {
    return (
      '<button type="button" data-app-tab="' +
      tab +
      '" class="' +
      (state.tab === tab ? 'active' : '') +
      '">' +
      '<span>' +
      icon(iconName) +
      '</span>' +
      label +
      '</button>'
    );
  }

  function nav() {
    return (
      '<nav class="demo-nav" aria-label="Navigasi portal">' +
      navButton('beranda', 'home', 'Beranda') +
      navButton('jadwal', 'calendar', 'Jadwal') +
      navButton('perkembangan', 'chart', 'Perkembangan') +
      navButton('profil', 'user', 'Profil') +
      '</nav>'
    );
  }

  function bottomNav() {
    return (
      '<nav class="demo-bottom-nav" aria-label="Navigasi portal">' +
      navButton('beranda', 'home', 'Beranda') +
      navButton('jadwal', 'calendar', 'Jadwal') +
      navButton('perkembangan', 'chart', 'Perkembangan') +
      navButton('profil', 'user', 'Profil') +
      '</nav>'
    );
  }

  function topbar() {
    return (
      '<div class="demo-topbar">' +
      '<a class="demo-brand" href="/pasien.html" aria-label="Dinar-TB">' +
      '<img src="/logo2.png" alt="" width="38" height="38">' +
      '<span>Dinar-TB<span aria-hidden="true">.</span></span>' +
      '</a>' +
      '<span class="demo-chip">' +
      icon('lock') +
      'Sesi aman</span>' +
      '<button class="demo-exit" type="button" data-app-action="logout">' +
      icon('arrow-left') +
      'Keluar</button>' +
      '</div>'
    );
  }

  function greetingBlock() {
    var person = patient();
    return (
      '<div class="demo-greeting">' +
      '<div><p>' +
      greeting() +
      '</p><h1>' +
      escapeHtml(person.fullName || 'Pasien') +
      '</h1></div>' +
      '<div class="demo-avatar" aria-hidden="true">' +
      escapeHtml(initials(person.fullName)) +
      '</div>' +
      '</div>'
    );
  }

  function medicineTimes() {
    var windows = reminderWindows();
    return (
      '<div class="medicine-times" aria-label="Jadwal pengingat minum obat dari petugas">' +
      windows
        .map(function (item, index) {
          return (
            '<div class="medicine-time' +
            (item ? '' : ' is-empty') +
            '">' +
            '<span>' +
            REMINDER_LABELS[index] +
            '</span>' +
            '<strong>' +
            (item ? formatTime(item.start) : '—') +
            '</strong>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function medicineCard() {
    var course = activeCourse();
    var confirmed = isConfirmedToday();
    var hasWindows = hasReminderWindows();
    var button = '';
    if (!course) {
      button =
        '<div class="demo-info-strip">' +
        icon('info') +
        '<span>Tidak ada pengobatan aktif saat ini. Hubungi petugas jika Anda memerlukan bantuan.</span></div>';
    } else {
      button =
        '<button class="demo-primary" type="button" data-app-action="confirm"' +
        (confirmed || state.busy ? ' disabled' : '') +
        '>' +
        icon('check') +
        (state.busy
          ? 'Menyimpan…'
          : confirmed
            ? 'Sudah minum obat'
            : 'Saya sudah minum obat') +
        '</button>';
    }
    return (
      '<section class="medicine-card ' +
      (confirmed ? 'confirmed' : '') +
      '" aria-labelledby="medicine-title">' +
      '<div class="medicine-status">' +
      '<span class="medicine-pill">' +
      icon(confirmed ? 'check' : 'clock') +
      (confirmed ? 'Sudah dikonfirmasi' : 'Belum dikonfirmasi') +
      '</span>' +
      '<small>Hari ini</small>' +
      '</div>' +
      '<div class="medicine-main">' +
      '<span class="medicine-icon">' +
      icon('pill') +
      '</span>' +
      '<div class="medicine-main-copy"><p id="medicine-title">Jadwal minum obat</p>' +
      medicineTimes() +
      '</div>' +
      '</div>' +
      '<p class="medicine-copy">' +
      (confirmed
        ? 'Konfirmasi hari ini sudah tersimpan di server.'
        : 'Minum obat sesuai petunjuk petugas kesehatan, lalu lakukan konfirmasi.') +
      '</p>' +
      '<p class="medicine-source">' +
      (hasWindows
        ? 'Waktu mengikuti pengaturan petugas ' + escapeHtml(clinicName()) + '.'
        : 'Petugas belum mengatur waktu pengingat. Hubungi fasilitas kesehatan Anda.') +
      '</p>' +
      button +
      '</section>'
    );
  }

  function nextControlCard() {
    var schedule = nextSchedule();
    if (!schedule) {
      return (
        '<section class="demo-card" aria-labelledby="next-control-title">' +
        '<div class="demo-card-head"><div><h2 id="next-control-title">Kontrol berikutnya</h2><p>Jadwal dari petugas</p></div></div>' +
        '<div class="demo-info-strip">' +
        icon('info') +
        '<span>Belum ada jadwal kontrol berikutnya. Hubungi petugas untuk informasi.</span></div>' +
        '</section>'
      );
    }
    var diff = daysBetween(todayJakarta(), schedule.scheduledDate);
    var countdown = diff === 0 ? 'Hari ini' : diff + ' hari lagi';
    return (
      '<section class="demo-card" aria-labelledby="next-control-title">' +
      '<div class="demo-card-head">' +
      '<div><h2 id="next-control-title">Kontrol berikutnya</h2><p>Jangan lupa membawa kartu berobat</p></div>' +
      '<button class="demo-link" type="button" data-app-go="jadwal">Detail ' +
      icon('chevron') +
      '</button>' +
      '</div>' +
      '<div class="next-control">' +
      '<div class="date-block"><span>' +
      formatMonthShort(schedule.scheduledDate) +
      '</span><strong>' +
      formatDay(schedule.scheduledDate) +
      '</strong></div>' +
      '<div><h3>' +
      formatDateLong(schedule.scheduledDate) +
      '</h3><p>' +
      escapeHtml(clinicName()) +
      '</p>' +
      '<div class="next-meta"><span>' +
      icon('calendar') +
      'Jadwal terverifikasi</span></div></div>' +
      '</div>' +
      '<div class="countdown">' +
      icon('clock') +
      countdown +
      '</div>' +
      '</section>'
    );
  }

  function progressCard() {
    var progress = treatmentProgress();
    if (!progress) {
      return (
        '<section class="demo-card" aria-labelledby="progress-title">' +
        '<div class="demo-card-head"><div><h2 id="progress-title">Perkembangan pengobatan</h2><p>Berdasarkan catatan terverifikasi</p></div></div>' +
        '<div class="demo-info-strip">' +
        icon('info') +
        '<span>Data pengobatan belum tersedia.</span></div>' +
        '</section>'
      );
    }
    var adherence = (state.data.progress && state.data.progress.adherence) || {
      totalTaken: 0,
    };
    var visits = (state.data.progress && state.data.progress.visits) || [];
    return (
      '<section class="demo-card" aria-labelledby="progress-title">' +
      '<div class="demo-card-head"><div><h2 id="progress-title">Perkembangan pengobatan</h2><p>Berdasarkan catatan terverifikasi</p></div></div>' +
      '<div class="progress-label"><strong>' +
      (progress.completed
        ? 'Pengobatan selesai'
        : 'Bulan ke-' + progress.month + ' dari ' + progress.totalMonths) +
      '</strong><span>' +
      progress.percent +
      '%</span></div>' +
      '<div class="progress-track" role="img" aria-label="Kemajuan pengobatan ' +
      progress.percent +
      ' persen"><i style="width:' +
      progress.percent +
      '%"></i></div>' +
      '<div class="progress-stats"><div><strong>' +
      Number(adherence.totalTaken || 0) +
      '</strong><span>Konfirmasi tercatat</span></div><div><strong>' +
      visits.length +
      '</strong><span>Kontrol tercatat</span></div></div>' +
      '</section>'
    );
  }

  function historyRow(iconName, title, time, status, tone) {
    return (
      '<div class="history-row">' +
      '<span class="history-dot ' +
      tone +
      '">' +
      icon(iconName) +
      '</span>' +
      '<div><strong>' +
      escapeHtml(title) +
      '</strong><small>' +
      escapeHtml(time) +
      '</small></div>' +
      '<span class="history-status ' +
      tone +
      '">' +
      escapeHtml(status) +
      '</span>' +
      '</div>'
    );
  }

  function adherenceRow(day) {
    if (day.status === TAKEN) {
      return historyRow(
        'check',
        relativeDay(day.date),
        formatClock(day.confirmedAt),
        'Terkonfirmasi',
        '',
      );
    }
    if (day.status === MISSED) {
      return historyRow(
        'alert',
        relativeDay(day.date),
        'Tidak ada konfirmasi',
        'Terlewat',
        'missed',
      );
    }
    return historyRow(
      'clock',
      relativeDay(day.date),
      'Belum ada konfirmasi',
      'Belum dikonfirmasi',
      'pending',
    );
  }

  function historyCard() {
    var days = adherenceDays().slice(-3).reverse();
    return (
      '<section class="demo-card" aria-labelledby="history-title">' +
      '<div class="demo-card-head"><div><h2 id="history-title">Riwayat minum obat</h2><p>3 hari terakhir</p></div>' +
      '<button class="demo-link" type="button" data-app-go="perkembangan">Lihat semua ' +
      icon('chevron') +
      '</button></div>' +
      '<div class="history-list">' +
      (days.length
        ? days.map(adherenceRow).join('')
        : '<div class="demo-info-strip">' +
          icon('info') +
          '<span>Belum ada riwayat konfirmasi.</span></div>') +
      '</div></section>'
    );
  }

  function infoStrip(copy) {
    return (
      '<div class="demo-info-strip">' +
      icon('info') +
      '<span>' +
      escapeHtml(copy) +
      '</span></div>'
    );
  }

  function beranda() {
    return (
      greetingBlock() +
      '<div class="demo-grid">' +
      '<div class="demo-stack">' +
      medicineCard() +
      nextControlCard() +
      '</div>' +
      '<div class="demo-stack">' +
      progressCard() +
      historyCard() +
      infoStrip(
        'Data ini berasal dari catatan petugas. Aplikasi tidak menggantikan nasihat atau pemeriksaan klinis.',
      ) +
      '</div></div>'
    );
  }

  function controlHero() {
    var schedule = nextSchedule();
    if (!schedule) {
      return (
        '<section class="control-hero" aria-labelledby="control-title">' +
        '<p class="eyebrow">Kontrol berikutnya</p>' +
        '<div class="control-date"><strong>—</strong><div><b id="control-title">Belum dijadwalkan</b><span>Hubungi petugas</span></div></div>' +
        '<div class="control-meta"><span>' +
        icon('map-pin') +
        escapeHtml(clinicName()) +
        '</span></div>' +
        '</section>'
      );
    }
    var diff = daysBetween(todayJakarta(), schedule.scheduledDate);
    return (
      '<section class="control-hero" aria-labelledby="control-title">' +
      '<p class="eyebrow">Kontrol berikutnya</p>' +
      '<div class="control-date"><strong>' +
      formatDay(schedule.scheduledDate) +
      '</strong><div><b id="control-title">' +
      MONTHS_LONG[parseDateOnly(schedule.scheduledDate).getUTCMonth()] +
      ' ' +
      parseDateOnly(schedule.scheduledDate).getUTCFullYear() +
      '</b><span>' +
      DAYS_LONG[parseDateOnly(schedule.scheduledDate).getUTCDay()] +
      '</span></div></div>' +
      '<div class="control-meta"><span>' +
      icon('calendar') +
      'Jadwal terverifikasi</span><span>' +
      icon('map-pin') +
      escapeHtml(clinicName()) +
      '</span></div>' +
      '<div class="countdown">' +
      icon('clock') +
      (diff === 0 ? 'Hari ini' : diff + ' hari lagi') +
      '</div>' +
      '</section>'
    );
  }

  function visitsCard(limit) {
    var visits = (
      (state.data.progress && state.data.progress.visits) ||
      []
    ).slice(0, limit || 5);
    return (
      '<section class="demo-card" aria-labelledby="visit-title">' +
      '<div class="demo-card-head"><div><h2 id="visit-title">Riwayat kontrol</h2><p>Kunjungan sebelumnya</p></div></div>' +
      '<div class="history-list">' +
      (visits.length
        ? visits
            .map(function (visit) {
              var status = visit.medicineGiven
                ? 'Obat diberikan'
                : 'Kontrol selesai';
              var note =
                visit.complaintProgress ||
                visit.additionalNote ||
                'Catatan kontrol';
              return historyRow(
                'check',
                formatDateShort(visit.visitDate),
                note,
                status,
                '',
              );
            })
            .join('')
        : '<div class="demo-info-strip">' +
          icon('info') +
          '<span>Belum ada riwayat kontrol.</span></div>') +
      '</div></section>'
    );
  }

  function jadwal() {
    return (
      '<div class="demo-stack">' +
      controlHero() +
      '<div class="demo-warning-strip">' +
      icon('alert') +
      '<span>Jadwal ditetapkan oleh petugas kesehatan dan tidak dapat diubah melalui portal.</span></div>' +
      '<section class="demo-card" aria-labelledby="prepare-title">' +
      '<div class="demo-card-head"><div><h2 id="prepare-title">Yang perlu disiapkan</h2><p>Sebelum datang ke fasilitas kesehatan</p></div></div>' +
      '<div class="check-list">' +
      '<span><i>' +
      icon('check') +
      '</i>Kartu berobat pasien</span>' +
      '<span><i>' +
      icon('check') +
      '</i>Obat yang masih tersisa</span>' +
      '<span><i>' +
      icon('check') +
      '</i>Catatan keluhan, jika ada</span>' +
      '</div></section>' +
      visitsCard(5) +
      infoStrip(
        'Hubungi ' + clinicName() + ' jika jadwal atau kondisi Anda berubah.',
      ) +
      '</div>'
    );
  }

  function weekDay(label, status) {
    var className =
      status === TAKEN ? '' : status === NOT_CONFIRMED ? 'pending' : 'empty';
    var content =
      status === TAKEN
        ? icon('check')
        : status === NOT_CONFIRMED
          ? icon('clock')
          : '—';
    return (
      '<div><span class="' +
      className +
      '">' +
      content +
      '</span><small>' +
      label +
      '</small></div>'
    );
  }

  function weekCard() {
    var days = adherenceDays().slice(-7);
    var taken = days.filter(function (day) {
      return day.status === TAKEN;
    }).length;
    var range = days.length
      ? formatDateShort(days[0].date) +
        ' – ' +
        formatDateShort(days[days.length - 1].date)
      : 'Belum ada data';
    return (
      '<section class="demo-card" aria-labelledby="week-title">' +
      '<div class="demo-card-head"><div><h2 id="week-title">Konfirmasi minggu ini</h2><p>' +
      escapeHtml(range) +
      '</p></div><strong>' +
      taken +
      '/' +
      days.length +
      '</strong></div>' +
      '<div class="week-days" aria-label="' +
      taken +
      ' dari ' +
      days.length +
      ' hari terkonfirmasi">' +
      (days.length
        ? days
            .map(function (day) {
              var date = parseDateOnly(day.date);
              return weekDay(
                date ? DAYS_SHORT[date.getUTCDay()] : '—',
                day.status,
              );
            })
            .join('')
        : '') +
      '</div>' +
      infoStrip(
        'Konfirmasi yang tidak tercatat bukan penilaian medis. Hubungi petugas jika ada kendala minum obat.',
      ) +
      '</section>'
    );
  }

  function perkembangan() {
    var progress = treatmentProgress();
    var adherence = (state.data.progress && state.data.progress.adherence) || {
      totalTaken: 0,
      totalMissed: 0,
    };
    var visits = (state.data.progress && state.data.progress.visits) || [];
    var stage = progress
      ? '<section class="stage-card" aria-labelledby="stage-title">' +
        '<div class="stage-top"><div><span>Tahap pengobatan saat ini</span><h1 id="stage-title">' +
        (progress.completed
          ? 'Pengobatan selesai'
          : 'Bulan ke-' + progress.month) +
        '</h1><p>Berdasarkan tanggal pengobatan</p></div><div class="stage-ring">' +
        progress.percent +
        '%</div></div>' +
        '<div class="stage-track" role="img" aria-label="Kemajuan ' +
        progress.percent +
        ' persen"><i style="width:' +
        progress.percent +
        '%"></i></div>' +
        '<div class="stage-labels"><span>Mulai<br><b>' +
        formatDateShort(progress.startDate) +
        '</b></span><span>Target<br><b>' +
        formatDateShort(progress.targetDate) +
        '</b></span></div>' +
        '</section>'
      : '<section class="demo-card"><div class="demo-info-strip">' +
        icon('info') +
        '<span>Data pengobatan belum tersedia.</span></div></section>';
    var milestones = [];
    if (visits.length) {
      milestones.push(
        '<div><i></i><div><span>' +
          formatDateShort(visits[0].visitDate) +
          '</span><strong>Kontrol terakhir tercatat</strong><p>' +
          escapeHtml(
            visits[0].medicineGiven
              ? 'Obat diberikan oleh petugas.'
              : 'Kontrol selesai.',
          ) +
          '</p></div></div>',
      );
    }
    if (progress) {
      milestones.push(
        '<div><i></i><div><span>' +
          formatDateShort(progress.startDate) +
          '</span><strong>Pengobatan dimulai</strong><p>Data dicatat di fasilitas kesehatan.</p></div></div>',
      );
    }
    return (
      '<div class="demo-stack">' +
      stage +
      '<div class="demo-warning-strip">' +
      icon('alert') +
      '<span>Durasi dan tahap mengikuti catatan petugas kesehatan serta dapat berubah sesuai evaluasi klinis. Portal tidak menentukan kesembuhan.</span></div>' +
      weekCard() +
      '<div class="demo-metrics"><div><span>' +
      icon('check') +
      '</span><strong>' +
      Number(adherence.totalTaken || 0) +
      ' hari</strong><p>Terkonfirmasi sejak mulai</p></div><div><span>' +
      icon('calendar') +
      '</span><strong>' +
      visits.length +
      ' kali</strong><p>Kontrol tercatat</p></div></div>' +
      '<section class="demo-card" aria-labelledby="milestone-title">' +
      '<div class="demo-card-head"><div><h2 id="milestone-title">Perjalanan pengobatan</h2><p>Catatan penting terverifikasi</p></div></div>' +
      '<div class="milestones">' +
      (milestones.length
        ? milestones.join('')
        : '<div class="demo-info-strip">' +
          icon('info') +
          '<span>Belum ada catatan perjalanan pengobatan.</span></div>') +
      '</div>' +
      '</section>' +
      infoStrip(
        'Angka di halaman ini dihitung dari konfirmasi dan kunjungan yang tercatat di server.',
      ) +
      '</div>'
    );
  }

  function pushCard() {
    var supported =
      'serviceWorker' in window.navigator && 'PushManager' in window;
    var config = state.pushConfig || {};
    var configured = !!(config.enabled && config.publicKey);
    var permissionDenied =
      'Notification' in window && window.Notification.permission === 'denied';
    var iosBlocked = isIos && !isStandalone;
    var statusClass = state.pushSubscribed ? ' is-on' : '';
    var statusIcon = state.pushSubscribed ? 'check' : 'bell';
    var statusCopy;
    if (!supported) {
      statusCopy =
        'Browser ini belum mendukung notifikasi web. Gunakan Safari atau Chrome terbaru.';
    } else if (iosBlocked) {
      statusCopy =
        'Di iPhone, tambahkan portal ke Layar Utama melalui Safari, lalu buka dari ikon tersebut. Web Push memerlukan iOS 16.4 atau lebih baru.';
    } else if (!configured) {
      statusCopy =
        'Server belum mengaktifkan Web Push. Hubungi petugas bila notifikasi diperlukan.';
    } else if (permissionDenied) {
      statusCopy =
        'Izin notifikasi diblokir di browser ini. Ubah izin situs melalui pengaturan browser.';
    } else if (state.pushSubscribed) {
      statusCopy =
        'Notifikasi pengingat aktif di browser ini. Pengingat dikirim sesuai jadwal dari petugas.';
    } else {
      statusCopy =
        'Aktifkan notifikasi agar pengingat obat dapat dikirim ke perangkat ini.';
    }
    var actions = '';
    if (supported && configured && !iosBlocked && !permissionDenied) {
      if (state.pushSubscribed) {
        actions =
          '<button class="button button-primary button-full" type="button" data-app-action="push-test"' +
          (state.pushBusy ? ' disabled' : '') +
          '>Kirim notifikasi uji</button>' +
          '<button class="button button-secondary button-full" type="button" data-app-action="push-disable"' +
          (state.pushBusy ? ' disabled' : '') +
          '>Matikan notifikasi</button>';
      } else {
        actions =
          '<button class="button button-primary button-full" type="button" data-app-action="push-enable"' +
          (state.pushBusy ? ' disabled' : '') +
          '>Aktifkan notifikasi</button>';
      }
    }
    return (
      '<section class="demo-card" aria-labelledby="push-title">' +
      '<div class="demo-card-head"><div><h2 id="push-title">Notifikasi pengingat</h2><p>Web Push untuk perangkat ini</p></div><span class="demo-badge">' +
      (state.pushSubscribed ? 'Aktif' : 'Belum aktif') +
      '</span></div>' +
      '<div class="push-state' +
      statusClass +
      '">' +
      icon(statusIcon) +
      '<span>' +
      escapeHtml(statusCopy) +
      '</span></div>' +
      '<div class="push-actions">' +
      actions +
      '</div>' +
      '</section>'
    );
  }

  function profil() {
    var person = patient();
    var progress = treatmentProgress();
    var schedule = nextSchedule();
    return (
      '<div class="demo-stack">' +
      '<section class="profile-card" aria-labelledby="profile-title">' +
      '<div class="profile-avatar" aria-hidden="true">' +
      escapeHtml(initials(person.fullName)) +
      '</div>' +
      '<h1 id="profile-title">' +
      escapeHtml(person.fullName || 'Pasien') +
      '</h1>' +
      '<p>Nomor Register</p><strong>' +
      escapeHtml(person.registerNumber || '—') +
      '</strong>' +
      '<span class="demo-badge">' +
      (activeCourse() ? 'Pengobatan aktif' : 'Tidak ada pengobatan aktif') +
      '</span>' +
      '</section>' +
      '<section class="demo-card" aria-labelledby="profile-info-title">' +
      '<div class="demo-card-head"><div><h2 id="profile-info-title">Informasi pengobatan</h2><p>Data terverifikasi</p></div></div>' +
      '<div class="profile-info">' +
      '<div><span>Mulai pengobatan</span><strong>' +
      (progress ? formatDateLong(progress.startDate) : '—') +
      '</strong></div>' +
      '<div><span>Tahap saat ini</span><strong>' +
      (progress
        ? progress.completed
          ? 'Selesai'
          : 'Bulan ke-' + progress.month + ' dari ' + progress.totalMonths
        : '—') +
      '</strong></div>' +
      '<div><span>Kontrol berikutnya</span><strong>' +
      (schedule
        ? formatDateLong(schedule.scheduledDate)
        : 'Belum dijadwalkan') +
      '</strong></div>' +
      '<div><span>Pengingat utama</span><strong>' +
      reminderValue(0) +
      '</strong></div>' +
      '<div><span>Pengingat malam</span><strong>' +
      reminderValue(1) +
      '</strong></div>' +
      '</div></section>' +
      pushCard() +
      '<section class="demo-card" aria-labelledby="profile-help-title">' +
      '<div class="demo-card-head"><div><h2 id="profile-help-title">Bantuan</h2><p>Hubungi petugas pengobatan</p></div></div>' +
      '<div class="profile-info">' +
      '<div><span>Fasilitas kesehatan</span><strong>' +
      escapeHtml(clinicName()) +
      '</strong></div>' +
      '<div><span>Telepon</span><strong>' +
      escapeHtml(
        (state.data.clinic && state.data.clinic.phone) || 'Belum tersedia',
      ) +
      '</strong></div>' +
      '</div>' +
      '<div class="demo-warning-strip" style="margin-top:12px">' +
      icon('alert') +
      '<span>Jangan mengubah atau menghentikan obat sendiri. Hubungi petugas kesehatan terlebih dahulu.</span></div>' +
      '</section>' +
      '<button class="button button-full profile-logout" type="button" data-app-action="logout">' +
      icon('arrow-left') +
      'Keluar dari portal</button>' +
      '<p class="app-meta">Sesi berakhir ' +
      escapeHtml(formatDateTime(state.session && state.session.expiresAt)) +
      '</p>' +
      '</div>'
    );
  }

  function panelFor(tab) {
    if (tab === 'jadwal') return jadwal();
    if (tab === 'perkembangan') return perkembangan();
    if (tab === 'profil') return profil();
    return beranda();
  }

  function loadingView() {
    return '<div class="app-loading"><div><div class="app-spinner" aria-hidden="true"></div><strong>Memuat data pengobatan…</strong><p>Mohon tunggu sebentar.</p></div></div>';
  }

  function errorView() {
    return (
      '<div class="app-error"><div>' +
      icon('alert') +
      '<h1>Data belum dapat dimuat</h1><p>' +
      escapeHtml(state.error || 'Terjadi kesalahan.') +
      '</p>' +
      '<button class="button button-primary" type="button" data-app-action="retry">Coba lagi</button></div></div>'
    );
  }

  function render() {
    if (!state.root) return;
    var panels = state.root.querySelector('#app-panels');
    if (!panels) return;
    panels.innerHTML = state.loading
      ? loadingView()
      : state.error
        ? errorView()
        : '<div class="demo-panel">' + panelFor(state.tab) + '</div>';
    state.root.querySelectorAll('[data-app-tab]').forEach(function (button) {
      var active = button.getAttribute('data-app-tab') === state.tab;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function setTab(tab) {
    if (['beranda', 'jadwal', 'perkembangan', 'profil'].indexOf(tab) === -1)
      return;
    state.tab = tab;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toast(message) {
    if (
      window.DinarPortal &&
      typeof window.DinarPortal.showToast === 'function'
    ) {
      window.DinarPortal.showToast(message);
    }
  }

  function load() {
    state.loading = true;
    state.error = null;
    render();
    return api('/web/me')
      .then(function (data) {
        state.data = data;
        if (data && data.session)
          state.session.expiresAt = data.session.expiresAt;
        state.loading = false;
        render();
        scheduleExpiry();
        refreshPushState();
      })
      .catch(function (error) {
        if (error.status === 401) return;
        state.loading = false;
        state.error = error.message;
        render();
      });
  }

  function confirmDose() {
    var course = activeCourse();
    if (!course || state.busy) return;
    state.busy = true;
    render();
    api('/web/me/treatments/' + encodeURIComponent(course.id) + '/adherence', {
      method: 'POST',
      body: {
        adherenceDate: todayJakarta(),
        expectedTreatmentVersion: course.version,
      },
    })
      .then(function (result) {
        state.busy = false;
        if (result && result.code === 'CONFLICT') {
          toast('Data pengobatan berubah. Data dimuat ulang.');
          return load();
        }
        toast(
          result && result.code === 'DUPLICATE'
            ? 'Konfirmasi hari ini sudah tersimpan.'
            : 'Konfirmasi minum obat tersimpan.',
        );
        return load();
      })
      .catch(function (error) {
        state.busy = false;
        if (error.status === 401) return;
        render();
        toast(error.message || 'Konfirmasi gagal disimpan.');
      });
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var output = new Uint8Array(rawData.length);
    for (var index = 0; index < rawData.length; index += 1) {
      output[index] = rawData.charCodeAt(index);
    }
    return output;
  }

  function refreshPushState() {
    if (!('serviceWorker' in window.navigator) || !('PushManager' in window)) {
      state.pushSubscribed = false;
      return Promise.resolve();
    }
    return window.navigator.serviceWorker.ready
      .then(function (registration) {
        return registration.pushManager.getSubscription();
      })
      .then(function (subscription) {
        state.pushSubscribed = !!subscription;
        if (state.tab === 'profil') render();
      })
      .catch(function () {
        state.pushSubscribed = false;
      });
  }

  function enablePush() {
    if (state.pushBusy) return;
    if (!('serviceWorker' in window.navigator) || !('PushManager' in window)) {
      toast('Browser ini belum mendukung notifikasi web.');
      return;
    }
    if (isIos && !isStandalone) {
      toast('Tambahkan portal ke Layar Utama melalui Safari terlebih dahulu.');
      return;
    }
    var config = state.pushConfig || {};
    if (!config.enabled || !config.publicKey) {
      toast('Web Push belum diaktifkan oleh server.');
      return;
    }
    state.pushBusy = true;
    render();
    var permissionPromise =
      'Notification' in window && window.Notification.permission === 'granted'
        ? Promise.resolve('granted')
        : window.Notification.requestPermission();
    permissionPromise
      .then(function (permission) {
        if (permission !== 'granted')
          throw new Error('Izin notifikasi tidak diberikan.');
        return window.navigator.serviceWorker.ready;
      })
      .then(function (registration) {
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      })
      .then(function (subscription) {
        var json = subscription.toJSON();
        return api('/web/push/subscribe', {
          method: 'POST',
          body: {
            endpoint: json.endpoint,
            expirationTime: json.expirationTime || null,
            keys: json.keys,
            userAgent: window.navigator.userAgent,
          },
        })
          .then(function () {
            state.pushSubscribed = true;
            state.pushBusy = false;
            render();
            toast('Notifikasi diaktifkan. Mengirim notifikasi uji…');
            return api('/web/push/test', { method: 'POST' })
              .then(function (result) {
                toast(
                  result && result.sent > 0
                    ? 'Permintaan notifikasi uji dikirim. Periksa perangkat Anda.'
                    : 'Langganan tersimpan, tetapi pengiriman uji gagal.',
                );
              })
              .catch(function () {
                toast(
                  'Langganan tersimpan, tetapi notifikasi uji belum dapat dikirim.',
                );
              });
          })
          .catch(function (error) {
            subscription.unsubscribe().catch(function () {});
            throw error;
          });
      })
      .catch(function (error) {
        state.pushBusy = false;
        render();
        toast(error.message || 'Notifikasi tidak dapat diaktifkan.');
      });
  }

  function disablePush() {
    if (state.pushBusy) return;
    state.pushBusy = true;
    render();
    window.navigator.serviceWorker.ready
      .then(function (registration) {
        return registration.pushManager.getSubscription();
      })
      .then(function (subscription) {
        if (!subscription) return null;
        var endpoint = subscription.endpoint;
        return api('/web/push/subscribe', {
          method: 'DELETE',
          body: { endpoint: endpoint },
        }).then(function () {
          return subscription.unsubscribe();
        });
      })
      .then(function () {
        state.pushBusy = false;
        state.pushSubscribed = false;
        render();
        toast('Notifikasi dimatikan untuk perangkat ini.');
      })
      .catch(function (error) {
        state.pushBusy = false;
        render();
        if (error.status !== 401)
          toast(error.message || 'Notifikasi tidak dapat dimatikan.');
      });
  }

  function testPush() {
    if (state.pushBusy) return;
    state.pushBusy = true;
    render();
    api('/web/push/test', { method: 'POST' })
      .then(function (result) {
        state.pushBusy = false;
        render();
        toast(
          result && result.sent > 0
            ? 'Permintaan notifikasi uji dikirim. Periksa perangkat Anda.'
            : 'Notifikasi uji gagal dikirim.',
        );
      })
      .catch(function (error) {
        state.pushBusy = false;
        render();
        if (error.status !== 401)
          toast(error.message || 'Notifikasi uji gagal dikirim.');
      });
  }

  function logout() {
    if (
      !window.confirm(
        'Keluar dari portal? Anda perlu kode aktivasi baru untuk masuk kembali.',
      )
    )
      return;
    api('/web/logout', { method: 'POST' })
      .catch(function () {
        return null;
      })
      .then(function () {
        if ('serviceWorker' in window.navigator && 'PushManager' in window) {
          return window.navigator.serviceWorker.ready
            .then(function (registration) {
              return registration.pushManager.getSubscription();
            })
            .then(function (subscription) {
              if (subscription) return subscription.unsubscribe();
              return null;
            })
            .catch(function () {
              return null;
            });
        }
        return null;
      })
      .then(function () {
        window.location.href = '/pasien.html';
      });
  }

  function scheduleExpiry() {
    window.clearTimeout(state.expiryTimer);
    var expiresAt =
      state.session && state.session.expiresAt
        ? new Date(state.session.expiresAt).getTime()
        : NaN;
    if (!Number.isFinite(expiresAt)) return;
    var delay = expiresAt - Date.now();
    if (delay <= 0) {
      if (
        window.DinarPortal &&
        typeof window.DinarPortal.onSessionExpired === 'function'
      ) {
        window.DinarPortal.onSessionExpired();
      }
      return;
    }
    state.expiryTimer = window.setTimeout(
      function () {
        if (
          window.DinarPortal &&
          typeof window.DinarPortal.onSessionExpired === 'function'
        ) {
          window.DinarPortal.onSessionExpired();
        }
      },
      Math.min(delay, 2147483647),
    );
  }

  function bind() {
    if (!state.root || state.root.getAttribute('data-app-bound') === 'true')
      return;
    state.root.setAttribute('data-app-bound', 'true');
    state.root.addEventListener('click', function (event) {
      var tabButton = event.target.closest('[data-app-tab]');
      if (tabButton) {
        setTab(tabButton.getAttribute('data-app-tab'));
        return;
      }
      var goButton = event.target.closest('[data-app-go]');
      if (goButton) {
        setTab(goButton.getAttribute('data-app-go'));
        return;
      }
      var actionButton = event.target.closest('[data-app-action]');
      if (!actionButton) return;
      var action = actionButton.getAttribute('data-app-action');
      if (action === 'confirm') confirmDose();
      else if (action === 'retry') load();
      else if (action === 'push-enable') enablePush();
      else if (action === 'push-disable') disablePush();
      else if (action === 'push-test') testPush();
      else if (action === 'logout') logout();
    });
  }

  function mount(root, session) {
    state.root = root;
    state.session = session || {};
    state.pushConfig = state.session.push || null;
    state.data = null;
    state.tab = 'beranda';
    state.loading = true;
    state.error = null;
    state.busy = false;
    state.pushBusy = false;
    root.innerHTML =
      '<div class="demo-app">' +
      topbar() +
      nav() +
      '<div id="app-panels"></div>' +
      bottomNav() +
      '</div>';
    bind();
    render();
    if (state.pushConfig && state.pushConfig.enabled) refreshPushState();
    load();
  }

  window.DinarPortalApp = { mount: mount };
})();
