const CACHE_NAME = 'mis-gastos-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalación: Cachear de antemano todos los recursos locales y Chart.js CDN
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Borrar caches previas obsoletas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia Cache-First para garantizar funcionamiento completo en iOS/Modo Avión
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no está en caché, buscar en red y almacenar si es válido
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          (networkResponse.status === 200 || networkResponse.type === 'opaque') &&
          (event.request.url.startsWith(self.location.origin) ||
           event.request.url.includes('cdn.jsdelivr.net') ||
           event.request.url.includes('fonts.googleapis.com') ||
           event.request.url.includes('fonts.gstatic.com'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // En caso de caída de conexión durante navegación HTML, devolver index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
