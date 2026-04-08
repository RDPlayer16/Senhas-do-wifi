const CACHE_NAME = 'wifi-manager-v15'; // Atualizado para forçar o navegador a instalar a nova versão
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './js/core.js',
  './js/map-engine.js',
  './js/qr-engine.js',
  './js/firebase-sync.js',
  './js/libs/html5-qrcode.min.js',
  './js/libs/jspdf.umd.min.js',
  './js/libs/leaflet.css',
  './js/libs/leaflet.js',
  './js/libs/qrcode.min.js',
  './js/libs/images/marker-icon.png',
  './js/libs/images/marker-icon-2x.png',
  './js/libs/images/marker-shadow.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Instalando Cache e adicionando recursos...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  console.log('✅ Service Worker Ativado!');
});

// Estratégia: Cache First para recursos estáticos, Network First para o resto
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Para arquivos locais que estão no ASSETS, usamos Cache First para máxima velocidade offline
  if (ASSETS.some(asset => e.request.url.includes(asset.replace('./', '')))) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request);
      })
    );
  } else {
    // Para outras requisições (como Firebase), tentamos rede primeiro, depois cache
    e.respondWith(
      fetch(e.request).catch(() => {
        return caches.match(e.request);
      })
    );
  }
});
