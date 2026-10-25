(function () {
  'use strict';

  var isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].indexOf(window.location.hostname) !== -1;
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var params = new URLSearchParams(window.location.search);

  var dialog = document.getElementById('info-dialog');
  var dialogTitle = document.getElementById('dialog-title');
  var dialogBody = document.getElementById('dialog-body');
  var toast = document.getElementById('toast');
  var toastTimer = null;

  var dialogs = {
    access:
      '<p>Portal web belum menampilkan data pengobatan karena akses web yang aman belum tersedia. Dinar-TB tidak ingin menampilkan data pasien tanpa perlindungan yang memadai.</p>' +
      '<h3>Mengapa kode aktivasi tidak dipakai di web?</h3>' +
      '<p>Kode aktivasi saat ini terikat pada satu perangkat dan hanya dapat digunakan sekali. Memakainya di browser dapat mengganggu akses aplikasi Android Anda.</p>' +
      '<h3>Yang dapat dilakukan sekarang</h3>' +
      '<ul>' +
      '<li>Gunakan aplikasi Android untuk konfirmasi obat dan pengingat.</li>' +
      '<li>Hubungi petugas TB jika Anda memerlukan bantuan akses.</li>' +
      '<li>Jangan membagikan kode aktivasi kepada siapa pun.</li>' +
      '</ul>' +
      '<div class="dialog-note">Akses data web hanya akan dibuka setelah mekanisme sesi yang aman tersedia. Portal ini tidak meminta kata sandi atau kode aktivasi melalui pesan.</div>' +
      '<div class="dialog-actions"><a class="button button-primary" href="/Dinar-TB-Patient.apk" download="Dinar-TB-Patient.apk">Unduh aplikasi Android</a><button class="button button-secondary" type="button" data-close>Tutup</button></div>',
    iphone:
      '<p>Ikuti langkah berikut untuk menambahkan portal Dinar-TB ke Layar Utama iPhone atau iPad.</p>' +
      '<ol>' +
      '<li>Buka halaman ini menggunakan <strong>Safari</strong>.</li>' +
      '<li>Ketuk tombol <strong>Bagikan</strong> di bagian bawah layar.</li>' +
      '<li>Pilih <strong>Tambah ke Layar Utama</strong>, lalu ketuk <strong>Tambah</strong>.</li>' +
      '<li>Buka portal dari ikon yang muncul di Layar Utama.</li>' +
      '</ol>' +
      '<div class="dialog-note">Data pasien tetap memerlukan akses web yang aman. Untuk konfirmasi obat dan pengingat, gunakan aplikasi Android bila tersedia. Notifikasi web tidak selalu sama dengan notifikasi aplikasi Android.</div>' +
      '<div class="dialog-actions"><button class="button button-primary" type="button" data-close>Mengerti</button></div>',
    help:
      '<p>Butuh bantuan terkait pengobatan atau akses Dinar-TB? Hubungi petugas TB di fasilitas kesehatan Anda.</p>' +
      '<h3>Bantuan yang tersedia</h3>' +
      '<ul>' +
      '<li><strong>Kode aktivasi:</strong> minta kepada petugas yang menangani pengobatan Anda.</li>' +
      '<li><strong>Jadwal kontrol:</strong> periksa aplikasi Android atau hubungi petugas.</li>' +
      '<li><strong>Konfirmasi obat:</strong> lakukan melalui aplikasi Android.</li>' +
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
      '<li>Portal web tidak menampilkan data tanpa sesi yang aman.</li>' +
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
    var locked = document.getElementById('locked-view');
    var root = document.getElementById('preview-root');
    if (!locked || !root) return;

    var script = document.createElement('script');
    script.src = '/portal-preview.js';
    script.onload = function () {
      if (!window.DinarPreview || typeof window.DinarPreview.mount !== 'function') {
        showToast('Pratinjau lokal tidak dapat dimuat.');
        return;
      }
      locked.hidden = true;
      root.hidden = false;
      document.body.classList.add('preview-mode');
      document.title = 'Pratinjau Portal Pasien — Dinar-TB';
      window.DinarPreview.mount(root);
      window.scrollTo(0, 0);
    };
    script.onerror = function () {
      showToast('Pratinjau lokal tidak dapat dimuat.');
    };
    document.body.appendChild(script);
  }

  if (isLocal && params.get('demo') === '1') loadPreview();

  window.DinarPortal = {
    showToast: showToast,
    openDialog: openDialog
  };

  if ('serviceWorker' in window.navigator && (window.location.protocol === 'https:' || isLocal)) {
    window.addEventListener('load', function () {
      window.navigator.serviceWorker.register('/portal-sw.js').catch(function () {
        /* Offline support is optional; the portal remains usable online. */
      });
    });
  }
})();
