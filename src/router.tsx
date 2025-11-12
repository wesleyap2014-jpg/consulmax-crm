// src/router.tsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import RequireAuth from "./components/auth/RequireAuth";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// ==== Lazy pages (mantém lazy em TODO o resto) ====
const Login                   = React.lazy(() => import("./pages/Login"));
const Clientes                = React.lazy(() => import("./pages/Clientes"));
const Oportunidades           = React.lazy(() => import("./pages/Oportunidades"));
const Agenda                  = React.lazy(() => import("./pages/Agenda"));
const Simuladores             = React.lazy(() => import("./pages/Simuladores"));
const Propostas               = React.lazy(() => import("./pages/Propostas"));
const Comissoes               = React.lazy(() => import("./pages/Comissoes"));
const Carteira                = React.lazy(() => import("./pages/Carteira"));
const Usuarios                = React.lazy(() => import("./pages/Usuarios"));
const GestaoDeGrupos          = React.lazy(() => import("./pages/GestaoDeGrupos"));
const Parametros              = React.lazy(() => import("./pages/Parametros"));
const TermsLGPD               = React.lazy(() => import("./pages/TermsLGPD"));
const AlterarSenha            = React.lazy(() => import("./pages/AlterarSenha"));
const AdicionarAdministradora = React.lazy(() => import("./pages/AdicionarAdministradora"));
const LinksUteis              = React.lazy(() => import("./pages/LinksUteis"));
const RankingVendedores       = React.lazy(() => import("./pages/RankingVendedores"));
const PublicSimulador         = React.lazy(() => import("./pages/PublicSimulador"));

// ==== Giro de Carteira SEM lazy (força import direto) ====
import GiroDeCarteira from "./pages/GiroDeCarteira";

// Wrapper simples para Suspense
function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense fallback={
      <div className="p-6 text-sm text-gray-700">Carregando…</div>
    }>
      {node}
    </React.Suspense>
  );
}

export const router = createBrowserRouter([
  // ==== Rotas públicas (sem login) ====
  { path: "/publico/simulador", element: withSuspense(<PublicSimulador />) },
  { path: "/simular",          element: <Navigate to="/publico/simulador" replace /> },
  { path: "/public/simulador", element: <Navigate to="/publico/simulador" replace /> },

  // Login
  { path: "/login", element: withSuspense(<Login />) },

  // ==== Rotas autenticadas ====
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { path: "alterar-senha", element: withSuspense(<AlterarSenha />) },

      {
        element: <App />, // layout principal
        children: [
          { index: true, element: <Navigate to="/oportunidades" replace /> },
          { path: "leads", element: <Navigate to="/oportunidades" replace /> },

          { path: "oportunidades", element: withSuspense(<Oportunidades />) },
          { path: "clientes",      element: withSuspense(<Clientes />) },
          { path: "agenda",        element: withSuspense(<Agenda />) },

          {
            path: "simuladores",
            children: [
              { index: true,      element: withSuspense(<Simuladores />) },
              { path: "embracon", element: withSuspense(<Simuladores />) },
              { path: "add",      element: withSuspense(<AdicionarAdministradora />) },
              { path: ":id",      element: withSuspense(<Simuladores />) },
            ],
          },

          { path: "propostas",  element: withSuspense(<Propostas />) },
          { path: "comissoes",  element: withSuspense(<Comissoes />) },
          { path: "carteira",   element: withSuspense(<Carteira />) },

          // ===== Giro de Carteira: import direto + ErrorBoundary por fora =====
          {
            path: "giro-de-carteira",
            element: (
              <ErrorBoundary title="Erro no Giro de Carteira">
                <GiroDeCarteira />
              </ErrorBoundary>
            ),
          },
          { path: "giro",               element: <Navigate to="/giro-de-carteira" replace /> },
          { path: "giro-de-carteira/",  element: <Navigate to="/giro-de-carteira" replace /> },

          { path: "ranking", element: withSuspense(<RankingVendedores />) },
          { path: "ranking-vendedores", element: <Navigate to="/ranking" replace /> },
          { path: "vendedores/ranking", element: <Navigate to="/ranking" replace /> },
          { path: "ranking-vendas",     element: <Navigate to="/ranking" replace /> },

          { path: "usuarios",         element: withSuspense(<Usuarios />) },
          { path: "gestao-de-grupos", element: withSuspense(<GestaoDeGrupos />) },
          { path: "parametros",       element: withSuspense(<Parametros />) },
          { path: "lgpd",             element: withSuspense(<TermsLGPD />) },

          { path: "links",       element: withSuspense(<LinksUteis />) },
          { path: "links-uteis", element: <Navigate to="/links" replace /> },
          { path: "linksuteis",  element: <Navigate to="/links" replace /> },

          { path: "*", element: <Navigate to="/oportunidades" replace /> },
        ],
      },
    ],
  },

  { path: "*", element: <Navigate to="/login" replace /> },
]);
