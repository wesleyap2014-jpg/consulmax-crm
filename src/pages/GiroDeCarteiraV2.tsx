// src/pages/GiroDeCarteiraV2.tsx
import React from "react";

export default function GiroDeCarteiraV2() {
  return (
    <div className="min-h-[calc(100vh-90px)] p-6 text-slate-900">
      <div className="mx-auto w-full max-w-[1200px] rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          TESTE DE ROTA
        </div>

        <h1 className="mt-5 text-3xl font-bold text-slate-950">
          Giro de Carteira V2 funcionando
        </h1>

        <p className="mt-3 text-base text-slate-600">
          Se você está vendo esta mensagem, a rota /giro-de-carteira está carregando corretamente o arquivo
          src/pages/GiroDeCarteiraV2.tsx.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Próximo passo: se esta tela aparecer, o problema está dentro da lógica/consulta do componente antigo.
          Se esta tela não aparecer, o problema está no deploy, cache, service worker, build ou router publicado.
        </div>
      </div>
    </div>
  );
}
