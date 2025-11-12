// src/router.tsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import RequireAuth from "./components/auth/RequireAuth";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

/** ========= Helpers de robustez ========= */
/** Suspense wrapper padrão */
function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense fallback={<div className="p-4 text-sm text-gray-600">Carregando…</div>}>
      {node}
    </React.Suspense>
  );
}

/** Evita tela branca quando um chunk de rota falha após deploy (ChunkLoadError) */
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      // heurística simples
      if (msg.includes("ChunkLoadError") || msg.includes("Failed to fetch") || msg.includes("Loading chunk")) {
        // força recarregar para baixar os novos chunks
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
      throw err;
    }
  });
}

/** Error element simples para rotas (cai aqui em qualquer erro de render da rota) */
function RouteError() {
  return (
    <div className="p-4 text-sm">
      <div className="mb-2 font-semibold">Ops! Algo deu errado ao carregar esta página.</div>
      <div>Tente atualizar a página. Se persistir, faça login novamente.</div>
    </div>
  );
}

/** ========= Lazy pages com retry ========= */
const Login                   = lazyWithRetry(() => import("./pages/Login"));
const Clientes                = lazyWithRetry(() => import("./pages/Clientes"));
const Oportunidades           = lazyWithRetry(() => import("./pages/Oportunidades"));
const Agenda                  = lazyWithRetry(() => import("./pages/Agenda"));
const Simuladores             = lazyWithRetry(() => import("./pages/Simuladores"));
const Propostas               = lazyWithRetry(() => import("./pages/Propostas"));
const Comissoes               = lazyWithRetry(() => import("./pages/Comissoes"));
const Carteira                = lazyWithRetry(() => import("./pages/Carteira"));
const Usuarios                = lazyWithRetry(() => import("./pages/Usuarios"));
const GestaoDeGrupos          = lazyWithRetry(() => import("./pages/GestaoDeGrupos"));
const Parametros              = lazyWithRetry(() => import("./pages/Parametros"));
const TermsLGPD               = lazyWithRetry(() => import("./pages/TermsLGPD"));
const AlterarSenha            = lazyWithRetry(() => import("./pages/AlterarSenha"));
const AdicionarAdministradora = lazyWithRetry(() => import("./pages/AdicionarAdministradora"));
const LinksUteis              = lazyWithRetry(() => import("./pages/LinksUteis"));
const RankingVendedores       = lazyWithRetry(() => import("./pages/RankingVendedores"));
const PublicSimulador         = lazyWithRetry(() => import("./pages/PublicSimulador"));
const GiroDeCarteira          = lazyWithRetry(() => import("./pages/GiroDeCarteira"));

/** ========= Router ========= */
export const router = createBrowserRouter([
  // ===== Rotas públicas (sem login) =====
  {
    path: "/publico/simulador",
    element: withSuspense(<PublicSimulador />),
    errorElement: <RouteError />,
  },
  // atalhos públicos
  { path: "/simular",          element: <Navigate to="/publico/simulador" replace /> },
  { path: "/public/simulador", element: <Navigate to="/publico/simulador" replace /> },

  // ===== Login =====
  {
    path: "/login",
    element: withSuspense(<Login />),
    errorElement: <RouteError />,
  },

  // ===== Rotas autenticadas =====
  {
    path: "/",
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: "alterar-senha", element: withSuspense(<AlterarSenha />) },

      {
        element: withSuspense(<App />), // layout principal com Suspense
        errorElement: (
          <ErrorBoundary title="Erro no layout principal">
            <RouteError />
          </ErrorBoundary>
        ),
        children: [
          // Home -> Oportunidades
          { index: true, element: <Navigate to="/oportunidades" replace /> },

          // legado /leads
          { path: "leads", element: <Navigate to="/oportunidades" replace /> },

          { path: "oportunidades", element: withSuspense(<Oportunidades />) },
          { path: "clientes",      element: withSuspense(<Clientes />) },
          { path: "agenda",        element: withSuspense(<Agenda />) },

          {
            path: "simuladores",
            children: [
              { index: true,      element: withSuspense(<Simuladores />) },
              { path: "embracon", element: withSuspense(<Simuladores />) }, // atalho legado
              { path: "add",      element: withSuspense(<AdicionarAdministradora />) },
              { path: ":id",      element: withSuspense(<Simuladores />) },
            ],
          },

          { path: "propostas",  element: withSuspense(<Propostas />) },
          { path: "comissoes",  element: withSuspense(<Comissoes />) },
          { path: "carteira",   element: withSuspense(<Carteira />) },

          // Giro de Carteira com ErrorBoundary (para qualquer exceção local)
          {
            path: "giro-de-carteira",
            element: withSuspense(
              <ErrorBoundary title="Erro no Giro de Carteira">
                <GiroDeCarteira />
              </ErrorBoundary>
            ),
          },
          // atalhos/legados
          { path: "giro",              element: <Navigate to="/giro-de-carteira" replace /> },
          { path: "giro-de-carteira/", element: <Navigate to="/giro-de-carteira" replace /> },

          // Ranking
          { path: "ranking", element: withSuspense(<RankingVendedores />) },
          // legados para ranking
          { path: "ranking-vendedores", element: <Navigate to="/ranking" replace /> },
          { path: "vendedores/ranking", element: <Navigate to="/ranking" replace /> },
          { path: "ranking-vendas",     element: <Navigate to="/ranking" replace /> },

          { path: "usuarios",         element: withSuspense(<Usuarios />) },
          { path: "gestao-de-grupos", element: withSuspense(<GestaoDeGrupos />) },
          { path: "parametros",       element: withSuspense(<Parametros />) },
          { path: "lgpd",             element: withSuspense(<TermsLGPD />) },

          // Links úteis
          { path: "links",       element: withSuspense(<LinksUteis />) },
          { path: "links-uteis", element: <Navigate to="/links" replace /> },
          { path: "linksuteis",  element: <Navigate to="/links" replace /> },

          // 404 dentro da área autenticada
          { path: "*", element: <Navigate to="/oportunidades" replace /> },
        ],
      },
    ],
  },

  // Fallback global (fora da área autenticada)
  { path: "*", element: <Navigate to="/login" replace /> },
]);
