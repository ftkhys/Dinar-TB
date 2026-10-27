(function () {
  'use strict';

  var isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].indexOf(window.location.hostname) !== -1;
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var params = new URLSearchParams(window.location.search);
  var apiBase = String(window.DINAR_API_BASE || '').replace(/\/$/, '');
  var appRequested = params.get('app') === '1';
  var defaultTitle = document.title;
  var webAuthSubmitting = false;

  var dialog = document.getElementById('info-dialog');
  var dialogTitle = document.getElementById('dialog-title');
  var dialogBody = document.getElementById('dialog-body');
  var toast = document.getElementById('toast');
  var toastTimer = null;

  var dialogs = {
    access:
      '<p>Portal web sekarang dapat menampilkan data pengobatan setelah Anda masuk dengan kode aktivasi yang aman.</p>' +
      '<h3>Cara masuk</h3>' +
      '<ul>' +
      '<li>Minta kode aktivasi 8 karakter kepada petugas TB.</li>' +
      '<li>Masukkan kode satu kali melalui halaman masuk portal.</li>' +
      '<li>Sesi browser tetap aktif sampai Anda keluar atau sesi berakhir.</li>' +
      '</ul>' +
      '<h3>Aman untuk Android</h3>' +
      '<p>Aktivasi web membuat sesi browser terpisah dan tidak menonaktifkan aplikasi Android yang sudah aktif.</p>' +
      '<div class="dialog-note">Jangan bagikan kode aktivasi melalui pesan atau media sosial. Portal tidak pernah meminta kata sandi.</div>' +
      '<div class="dialog-actions"><a class="button button-primary" href="/pasien.html?app=1">Masuk ke portal</a><button class="button button-secondary" type="button" data-close>Tutup</button></div>',
    iphone:
      '<p>Ikuti langkah berikut untuk menambahkan portal Dinar-TB ke Layar Utama iPhone atau iPad.</p>' +
      '<ol>' +
      '<li>Buka halaman ini menggunakan <strong>Safari</strong>.</li>' +
      '<li>Ketuk tombol <strong>Bagikan</strong> di bagian bawah layar.</li>' +
      '<li>Pilih <strong>Tambah ke Layar Utama</strong>, lalu ketuk <strong>Tambah</strong>.</li>' +
      '<li>Buka portal dari ikon yang muncul di Layar Utama.</li>' +
      '</ol>' +
      '<div class="dialog-note">Setelah portal ditambahkan ke Layar Utama, masuk dengan kode aktivasi. Web Push memerlukan iOS 16.4 atau lebih baru; izin notifikasi diminta saat Anda mengaktifkannya di halaman Profil.</div>' +
      '<div class="dialog-actions"><button class="button button-primary" type="button" data-close>Mengerti</button></div>',
    help:
      '<p>Butuh bantuan terkait pengobatan atau akses Dinar-TB? Hubungi petugas TB di fasilitas kesehatan Anda.</p>' +
      '<h3>Bantuan yang tersedia</h3>' +
      '<ul>' +
      '<li><strong>Kode aktivasi:</strong> minta kepada petugas yang menangani pengobatan Anda.</li>' +
      '<li><strong>Jadwal kontrol:</strong> periksa portal web, aplikasi Android, atau hubungi petugas.</li>' +
      '<li><strong>Konfirmasi obat:</strong> lakukan melalui portal web atau aplikasi Android.</li>' +
      '<li><strong>Kendala teknis:</strong> tunjukkan pesan kesalahan kepada petugas.</li>' +
      '</ul>' +
      '<div class="dialog-note">Jangan mengubah atau menghentikan obat tanpa arahan petugas kesehatan.</div>' +
      '<div class="dialog-actions"><button class="button button-primary" type="button" data-close>Tutup</button></div>',
    privacy:
      '<p>Dinar-TB membantu pencatatan pengingat dan pemantauan pengobatan tuberkulosis. Data pengobatan adalah data pribadi yang harus dilindungi.</p>' +
      '<h3>Prinsip yang kami terapkan</h3>' +
      '<ul>' +
      '<li>Data pasien hanya ditampilkan kepada pihak yang berhak.</li>' +
      '<li>Kode aktivasi tidak boleh dibagikan melalui pesan atau media sosial.</li>' +
      '<li>Portal web memakai sesi aman dan tidak menampilkan data tanpa aktivasi yang sah.</li>' +
      '<li>Riwayat aplikasi bukan pengganti catatan atau nasihat klinis.</li>' +
      '</ul>' +
      '<div class="dialog-note">Jika Anda menemukan akses atau pesan mencurigakan, segera hubungi petugas TB di fasilitas kesehatan Anda.</div>' +
      '<div class="dialog-actions"><button class="button button-primary" type="button" data-close>Tutup</button></div>',
    'install-unavailable':
      '<p>Browser ini belum menawarkan pemasangan otomatis. Anda tetap dapat menambahkan portal ke layar utama secara manual.</p>' +
      '<h3>Di Chrome atau Edge</h3>' +
      '<ol>' +
      '<li>Buka menu browser (tiga titik).</li>' +
      '<li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li>' +
      '<li>Konfirmasi pemasangan.</li>' +
      '</ol>' +
      '<div class="dialog-note">Pada iPhone, gunakan Safari lalu pilih <strong>Bagikan</strong> &gt; <strong>Tambah ke Layar Utama</strong>.</div>' +
      '<div class="dialog-actions"><button class="button button-primary" type="button" data-close>Tutup</button></div>'
  };

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  function openDialog(key) {
    if (!dialog || !dialogTitle || !dialogBody) return;
    var content = dialogs[key];
    if (!content) return;
    var titles = {
      access: 'Status akses portal web',
      iphone: 'Pasang di iPhone',
      help: 'Bantuan Dinar-TB',
      privacy: 'Privasi dan keamanan',
      'install-unavailable': 'Pasang portal'
    };
    dialogTitle.textContent = titles[key] || 'Informasi';
    dialogBody.innerHTML = content;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    document.body.style.overflow = '';
  }

  function normalizeTokenCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function formatTokenCode(value) {
    var normalized = normalizeTokenCode(value);
    return normalized.length > 4 ? normalized.slice(0, 4) + '-' + normalized.slice(4) : normalized;
  }

  function setTokenStatus(message, tone) {
    var status = document.getElementById('token-status');
    var input = document.getElementById('activation-code');
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
    status.className = 'token-status' + (tone ? ' is-' + tone : '');
    if (input) {
      input.classList.toggle('has-error', tone === 'error');
      if (tone === 'error') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearTokenStatus() {
    var status = document.getElementById('token-status');
    var input = document.getElementById('activation-code');
    if (status) {
      status.hidden = true;
      status.textContent = '';
      status.className = 'token-status';
    }
    if (input) {
      input.classList.remove('has-error');
      input.removeAttribute('aria-invalid');
    }
  }

  function apiUrl(path) {
    return apiBase + path;
  }

  function requestJson(path, options) {
    var requestOptions = options || {};
    var headers = { Accept: 'application/json' };
    if (requestOptions.body && typeof requestOptions.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(requestOptions.body);
    }
    return fetch(apiUrl(path), {
      method: requestOptions.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: headers,
      body: requestOptions.body
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
        if (!response.ok) {
          var message = body && body.message;
          if (Array.isArray(message)) message = message.join(' ');
          var error = new Error(message || 'Permintaan tidak dapat diproses. Coba lagi.');
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function setWebAuthStatus(message, tone) {
    var status = document.getElementById('web-activation-status');
    var input = document.getElementById('web-activation-code');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.className = 'token-status';
      if (input) {
        input.classList.remove('has-error');
        input.removeAttribute('aria-invalid');
      }
      return;
    }
    status.textContent = message;
    status.hidden = false;
    status.className = 'token-status' + (tone ? ' is-' + tone : '');
    if (input) {
      input.classList.toggle('has-error', tone === 'error');
      if (tone === 'error') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function hidePatientViews() {
    ['locked-view', 'patient-auth', 'patient-app', 'token-preview', 'preview-root'].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.hidden = true;
    });
    document.body.classList.remove('preview-mode');
    document.body.classList.remove('app-mode');
  }

  function showLanding() {
    hidePatientViews();
    var locked = document.getElementById('locked-view');
    if (locked) locked.hidden = false;
    document.title = defaultTitle;
    window.scrollTo(0, 0);
  }

  function showAuth(message) {
    hidePatientViews();
    var auth = document.getElementById('patient-auth');
    if (!auth) return;
    auth.hidden = false;
    document.body.classList.add('app-mode');
    document.title = 'Masuk — Dinar-TB';
    setWebAuthStatus(message || '', message ? 'error' : '');
    window.scrollTo(0, 0);
    var input = document.getElementById('web-activation-code');
    if (input && !message) {
      window.setTimeout(function () { input.focus(); }, 80);
    }
  }

  function showApp(session) {
    hidePatientViews();
    var app = document.getElementById('patient-app');
    if (!app) return;
    app.hidden = false;
    document.body.classList.add('app-mode');
    document.title = 'Portal Pasien — Dinar-TB';
    window.scrollTo(0, 0);
    if (window.DinarPortalApp && typeof window.DinarPortalApp.mount === 'function') {
      window.DinarPortalApp.mount(app, session || {});
    } else {
      showAuth('Aplikasi portal tidak dapat dimuat. Muat ulang halaman.');
    }
  }

  function checkSession() {
    return fetch(apiUrl('/web/session'), {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      if (response.ok) {
        return response.json().then(function (session) {
          showApp(session);
        });
      }
      if (response.status === 401) {
        if (appRequested) showAuth();
        else showLanding();
        return;
      }
      throw new Error('Sesi tidak dapat diperiksa.');
    }).catch(function () {
      if (appRequested) {
        showAuth('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
      } else {
        showLanding();
      }
    });
  }

  function bindWebActivation() {
    var form = document.getElementById('web-activation-form');
    var input = document.getElementById('web-activation-code');
    var submit = document.getElementById('web-activation-submit');
    if (!form || !input || !submit) return;

    input.addEventListener('input', function () {
      var formatted = formatTokenCode(input.value);
      if (formatted !== input.value) input.value = formatted;
      setWebAuthStatus('');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (webAuthSubmitting) return;
      var normalized = normalizeTokenCode(input.value);
      input.value = formatTokenCode(normalized);
      if (!normalized) {
        setWebAuthStatus('Masukkan kode aktivasi terlebih dahulu.', 'error');
        input.focus();
        return;
      }
      if (normalized.length !== 8) {
        setWebAuthStatus('Kode aktivasi terdiri dari 8 karakter. Periksa kembali kode dari petugas.', 'error');
        input.focus();
        return;
      }

      webAuthSubmitting = true;
      input.disabled = true;
      submit.disabled = true;
      setWebAuthStatus('Memeriksa kode aktivasi…', 'info');

      requestJson('/web/activation', {
        method: 'POST',
        body: { activationCode: normalized }
      }).then(function (result) {
        showToast('Berhasil masuk ke portal.');
        showApp({
          patient: result && result.patient,
          expiresAt: result && result.expiresAt,
          push: result && result.push
        });
      }).catch(function (error) {
        if (error.status === 429) {
          setWebAuthStatus('Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.', 'error');
        } else if (error.status === 401) {
          setWebAuthStatus('Kode aktivasi tidak berlaku atau sudah digunakan. Minta kode baru kepada petugas.', 'error');
        } else {
          setWebAuthStatus(error.message || 'Kode aktivasi tidak dapat diverifikasi. Coba lagi.', 'error');
        }
        input.focus();
      }).then(function () {
        webAuthSubmitting = false;
        input.disabled = false;
        submit.disabled = false;
      });
    });
  }

  function showTokenPreview() {
    hidePatientViews();
    var token = document.getElementById('token-preview');
    if (!token) return;
    token.hidden = false;
    document.body.classList.add('preview-mode');
    document.title = 'Pratinjau Token Aktivasi — Dinar-TB';
    window.scrollTo(0, 0);
    var input = document.getElementById('activation-code');
    if (input) {
      window.setTimeout(function () { input.focus(); }, 80);
    }
  }

  function bindTokenPreview() {
    var form = document.getElementById('token-form');
    var input = document.getElementById('activation-code');
    if (!form || !input) return;

    input.addEventListener('input', function () {
      var formatted = formatTokenCode(input.value);
      if (formatted !== input.value) input.value = formatted;
      clearTokenStatus();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var normalized = normalizeTokenCode(input.value);
      input.value = formatTokenCode(normalized);
      if (!normalized) {
        setTokenStatus('Masukkan kode aktivasi terlebih dahulu.', 'error');
        input.focus();
        return;
      }
      if (normalized.length !== 8) {
        setTokenStatus('Kode aktivasi terdiri dari 8 karakter. Periksa kembali kode dari petugas.', 'error');
        input.focus();
        return;
      }
      setTokenStatus(
        'Pratinjau UI: format kode terlihat benar. Token tidak dikirim atau divalidasi di mode ini. Validasi sebenarnya dilakukan server pada halaman masuk.',
        'info'
      );
    });
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-dialog]');
    if (trigger) {
      event.preventDefault();
      openDialog(trigger.getAttribute('data-dialog'));
      return;
    }
    if (event.target.closest('[data-close]')) {
      event.preventDefault();
      closeDialog();
    }
  });

  if (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('close', function () {
      document.body.style.overflow = '';
    });
  }

  var installButtons = Array.prototype.slice.call(document.querySelectorAll('[data-install]'));
  var deferredPrompt = null;

  function setInstallVisible(visible) {
    installButtons.forEach(function (button) {
      button.hidden = !visible;
    });
  }

  if (!isStandalone && isIos) setInstallVisible(true);

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    setInstallVisible(true);
  });

  installButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (isIos) {
        openDialog('iphone');
        return;
      }
      if (!deferredPrompt) {
        openDialog('install-unavailable');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          showToast('Portal berhasil dipasang.');
        }
        deferredPrompt = null;
        setInstallVisible(false);
      }).catch(function () {
        deferredPrompt = null;
      });
    });
  });

  window.addEventListener('appinstalled', function () {
    showToast('Portal berhasil dipasang.');
    setInstallVisible(false);
  });

  if (isStandalone) setInstallVisible(false);

  document.querySelectorAll('[data-local-preview]').forEach(function (element) {
    if (isLocal) element.hidden = false;
  });

  function loadPreview() {
    var root = document.getElementById('preview-root');
    if (!root) return;

    var script = document.createElement('script');
    script.src = '/portal-preview.js';
    script.onload = function () {
      if (!window.DinarPreview || typeof window.DinarPreview.mount !== 'function') {
        showToast('Pratinjau lokal tidak dapat dimuat.');
        return;
      }
      hidePatientViews();
      root.hidden = false;
      document.body.classList.add('preview-mode');
      document.title = 'Pratinjau Portal Pasien — Dinar-TB';
      window.DinarPreview.mount(root, window.DinarPreviewData || {});
      window.scrollTo(0, 0);
    };
    script.onerror = function () {
      showToast('Pratinjau lokal tidak dapat dimuat.');
    };
    document.body.appendChild(script);
  }

  function onSessionExpired() {
    showAuth('Sesi web berakhir. Masukkan kode aktivasi baru dari petugas.');
  }

  bindTokenPreview();
  bindWebActivation();

  window.DinarPortal = {
    showToast: showToast,
    openDialog: openDialog,
    onSessionExpired: onSessionExpired
  };

  if (isLocal && params.get('demo') === 'token') {
    showTokenPreview();
  } else if (isLocal && params.get('demo') === '1') {
    loadPreview();
  } else {
    if (appRequested) showAuth();
    checkSession();
  }

  if ('serviceWorker' in window.navigator && (window.location.protocol === 'https:' || isLocal)) {
    window.addEventListener('load', function () {
      window.navigator.serviceWorker.register('/portal-sw.js').catch(function () {
        /* Offline support is optional; the portal remains usable online. */
      });
    });
  }
})();
