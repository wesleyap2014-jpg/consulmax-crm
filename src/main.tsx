import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./index.css"; // ESSENCIAL

// PWA: ajuda a evitar "versão velha" quando o app estiver instalado
function setupServiceWorkerAutoUpdate() {
  if (!("serviceWorker" in navigator)) return;

  // Se já tem SW e ele atualizar, forçamos ativar e recarregar
  navigator.serviceWorker.ready
    .then((reg) => {
      // Se existir uma versão nova esperando, ativa agora
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // Quando achar update, aguarda instalar e então força ativar
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed") {
            // Se já tinha SW controlando, então isso é um update (não é primeira instalação)
            if (navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          }
        });
      });
    })
    .catch(() => {});

  // Quando o SW novo assumir, recarrega 1x para pegar assets novos
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

setupServiceWorkerAutoUpdate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
