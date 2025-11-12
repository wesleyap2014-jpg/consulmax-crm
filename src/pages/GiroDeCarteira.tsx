// src/pages/GiroDeCarteira.tsx
import React from "react";

export default function GiroDeCarteira() {
  return (
    <div
      style={{
        padding: 24,
        background: "rgba(255,230,0,0.35)",
        color: "#111",                 // <- força texto escuro
        fontSize: 32,
        fontWeight: 800,
        border: "2px dashed #111",     // <- contorno visível
        minHeight: "50vh",
        position: "relative",
        zIndex: 2,                     // <- acima de qualquer fundo
      }}
    >
      Wesley Lindo (SMOKE)
    </div>
  );
}
