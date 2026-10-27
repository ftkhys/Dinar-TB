'use strict';

var CACHE_NAME = 'dinar-tb-portal-v7';
var STATIC_ASSETS = [
  '/pasien.html',
  '/portal.html',
  '/portal.css',
  '/portal.js',
  '/portal-app.js',
  '/config.js',
  '/portal-preview.js',
  '/portal-manifest.webmanifest',
  '/logo2.png',
  '/portal-icons/apple-touch-icon.png',
  '/portal-icons/icon-192.png',
  '/portal-icons/icon-512.png',
  '/portal-icons/maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(STATIC_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (url.pathname !== '/pasien.html' && url.pathname !== '/portal.html') return;
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(url.pathname, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(url.pathname);
        })
    );
    return;
  }

  // Only the explicit public shell assets are cached. API responses, patient
  // data, checksums, and the APK are always left to the network.
  if (STATIC_ASSETS.indexOf(url.pathname) === -1) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (!response || !response.ok) return response;
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      });
    })
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      data = { body: event.data.text() };
    }
  }
  var title = data.title || 'Dinar-TB';
  var options = {
    body: data.body || 'Ada pengingat pengobatan dari Dinar-TB.',
    icon: data.icon || '/portal-icons/icon-192.png',
    badge: data.badge || '/portal-icons/icon-192.png',
    tag: data.tag || 'dinar-tb-reminder',
    data: data.data || { url: '/pasien.html?app=1' },
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/pasien.html?app=1';
  var targetUrl = new URL(target, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var index = 0; index < clientList.length; index += 1) {
        var client = clientList[index];
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});
