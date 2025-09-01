// src/pages/TermsLGPD.tsx
import React, { useEffect, useState } from 'react';

export default function TermsLGPD() {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Simula um carregamento (troque pelo seu fetch/cheque real com try/catch)
    const t = setTimeout(() => {
      setOk(true);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <div>Carregando termos…</div>;

  if (!ok) {
    // caso dê erro de fetch, a tela não fica em branco
    return <div style={{ color: 'crimson' }}>Não foi possível carregar os termos LGPD.</div>;
  }

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
      <h2>Termos LGPD</h2>
      <p>Conteúdo de exemplo. Substitua aqui pelo seu texto e lógica de aceite.</p>
    </div>
  );
}
