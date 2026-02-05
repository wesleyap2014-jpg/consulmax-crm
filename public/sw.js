// public/sw.js

self.addEventListener("install", (event) => {
  // Instala e já fica pronto para ativar
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Assume controle das páginas abertas
      await self.clients.claim();

      // Melhora navegação quando suportado (Chrome/Edge)
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }
    })()
  );
});

// Permite forçar a ativação do SW novo a partir do app (main.tsx)
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// IMPORTANTE:
// Não adicionamos fetch handler.
// Assim o SW não interfere em nada da rede e evita bug de cache/“carregando infinito”.
