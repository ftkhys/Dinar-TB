'use strict';

var CACHE_NAME = 'dinar-tb-portal-v1';
var STATIC_ASSETS = [
  '/portal.html',
  '/portal.css',
  '/portal.js',
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
    if (url.pathname !== '/portal.html') return;
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put('/portal.html', copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match('/portal.html');
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
