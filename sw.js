const CACHE_NAME = 'wifi-manager-pwa-v23-offline-first-native-parity-v2';
const APP_SHELL = './index.html';

const ASSETS = [
  './',
  APP_SHELL,
  './manifest.json',
  './assets/css/style.css',
  './assets/app-icon-source.png',
  './js/core.js',
  './js/native-wifi.js',
  './js/map-engine.js',
  './js/qr-engine.js',
  './js/firebase-sync.js',
  './js/libs/html5-qrcode.min.js',
  './js/libs/jspdf.umd.min.js',
  './js/libs/leaflet.css',
  './js/libs/leaflet.js',
  './js/libs/qrcode-modern.js',
  './js/libs/qrcode.min.js',
  './js/libs/images/marker-icon.png',
  './js/libs/images/marker-icon-2x.png'
];

const cacheableResponse = (response) => {
  return response && (response.ok || response.type === 'opaque');
};

const isAppAsset = (requestUrl) => {
  if (requestUrl.origin !== self.location.origin) return false;

  return ASSETS.some((asset) => {
    const assetUrl = new URL(asset, self.location.href);
    return assetUrl.origin === requestUrl.origin && assetUrl.pathname === requestUrl.pathname;
  });
};

const putInCache = async (request, response) => {
  if (!cacheableResponse(response)) return;

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putInCache(request, response);
  return response;
};

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    throw error;
  }
};

const appShellFirst = async (request) => {
  const cachedShell = await caches.match(APP_SHELL);
  if (cachedShell) {
    fetch(request)
      .then((response) => putInCache(APP_SHELL, response))
      .catch(() => {});

    return cachedShell;
  }

  try {
    const response = await fetch(request);
    await putInCache(APP_SHELL, response);
    return response;
  } catch (error) {
    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('wifi-manager') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(appShellFirst(request));
    return;
  }

  if (isAppAsset(requestUrl)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
