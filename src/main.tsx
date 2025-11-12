// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";

// Captura erros globais para evitar “tela branca silenciosa”
if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    console.error("[global error]", ev.error || ev.message || ev);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    console.error("[unhandledrejection]", ev.reason || ev);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
