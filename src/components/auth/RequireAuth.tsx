// src/components/auth/RequireAuth.tsx (EXEMPLO)
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function RequireAuth() {
  const location = useLocation();
  // pegue do seu contexto/estado real:
  const isAuthed = true;              // <-- ajuste ao seu caso
  const userScopes: string[] = [];    // <-- ajuste ao seu caso

  // Rotas públicas
  const PUBLIC = new Set(["/login", "/publico/simulador", "/simular", "/public/simulador"]);

  // ⚠️ TEMP: liberar giro até ajustar mapeamento de escopos
  const TEMP_ALLOW = new Set(["/giro-de-carteira"]);

  if (!isAuthed && !PUBLIC.has(location.pathname)) {
    return <Navigate to="/login" replace />;
  }

  // === checagem de escopo (exemplo) ===
  const path = location.pathname;

  const needScope = (p: string) => {
    // seu mapeamento real aqui:
    if (p.startsWith("/oportunidades")) return "oportunidades";
    if (p.startsWith("/clientes")) return "leads";
    if (p.startsWith("/gestao-de-grupos")) return "gestao_grupos";
    if (p.startsWith("/comissoes")) return "comissoes";
    if (p.startsWith("/usuarios")) return "usuarios";
    if (p.startsWith("/parametros")) return "parametros";

    if (p.startsWith("/giro-de-carteira")) return "giro"; // <-- novo escopo (se usar)
    return null; // sem escopo específico
  };

  const required = needScope(path);

  if (!TEMP_ALLOW.has(path) && required && !userScopes.includes(required)) {
    console.warn("[RequireAuth] Bloqueado por escopo", { path, required, userScopes });
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-800">Acesso restrito</h2>
          <p className="text-sm text-amber-700 mt-1">
            Você não possui permissão para acessar <code>{path}</code>.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
