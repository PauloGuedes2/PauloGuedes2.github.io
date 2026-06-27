const CACHE_NAME = 'salsi-viewer-v4';
const APP_SHELL = [
  '/projetos/arquitetura/',
  '/projetos/arquitetura/index.html',
  '/projetos/arquitetura/projects.html',
  '/projetos/arquitetura/photos.html',
  '/projetos/arquitetura/notes.html',
  '/projetos/arquitetura/models.html',
  '/projetos/arquitetura/reports.html',
  '/projetos/arquitetura/settings.html',
  '/projetos/arquitetura/manifest.json',
  '/projetos/arquitetura/logo.png',
  '/projetos/arquitetura/icon-192.png',
  '/projetos/arquitetura/icon-512.png',
  '/projetos/arquitetura/icon-512-maskable.png',
  '/projetos/arquitetura/assets/app.css',
  '/projetos/arquitetura/assets/db.js',
  '/projetos/arquitetura/assets/shell.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => { /* alguma URL do app shell falhou; segue sem travar a instalação */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: responde do cache imediatamente quando existir (rápido + funciona offline),
// e em paralelo busca na rede para atualizar o cache para a próxima vez.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
