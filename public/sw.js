// public/sw.js
self.addEventListener('install', (event) => {
  // Ativa imediatamente após instalar
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Assume controle das páginas abertas
  event.waitUntil(self.clients.claim());
});

// Pass-through: não faz cache, só deixa tudo seguir normal
self.addEventListener('fetch', () => {});
