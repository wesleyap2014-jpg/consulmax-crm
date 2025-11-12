// src/pages/_Health.tsx
import React from "react";

export default function Health() {
  const now = new Date().toISOString();
  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
      <h1>✅ Health OK</h1>
      <p>Se você está vendo isso, o React montou e o Router funcionou.</p>
      <p><strong>Agora:</strong> desative gradualmente o safe-mode para achar o ponto que quebra.</p>
      <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 8 }}>
        {JSON.stringify({ now, userAgent: navigator.userAgent }, null, 2)}
      </pre>
    </div>
  );
}
