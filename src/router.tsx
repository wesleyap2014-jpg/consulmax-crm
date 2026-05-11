// src/router.tsx
import React from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";

import RequireAuth from "./components/auth/RequireAuth";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// ==== Lazy pages (mantém lazy no resto) ====
const Login = React.lazy(() => import("./pages/Login"));
const Inicio = React.lazy(() => import("./pages/Inicio"));
const Clientes = React.lazy(() => import("./pages/Clientes"));
const Oportunidades = React.lazy(() => import("./pages/OportunidadesPipelineV7"));
const Agenda = React.lazy(() => import("./pages/AgendaLiveKit"));
const AgendaSala = React.lazy(() => import("./pages/AgendaSala"));
const Simuladores = React.lazy(() => import("./pages/SimuladoresHub"));
const AdicionarAdministradora = React.lazy(() => import("./pages/AdicionarAdministradora"));
const EmbraconSimulator = React.lazy(() => import("./pages/simuladores/EmbraconSimulator"));
const MaggiSimulator = React.lazy(() => import("./pages/simuladores/MaggiSimulator"));
const BBConsorciosSimulator = React.lazy(() => import("./pages/simuladores/BBConsorciosSimulator"));
const Propostas = React.lazy(() => import("./pages/Propostas"));
const Comissoes = React.lazy(() => import("./pages/Comissoes"));
const Carteira = React.lazy(() => import("./pages/Carteira"));
const Usuarios = React.lazy(() => import("./pages/Usuarios"));
const GestaoDeGrupos = React.lazy(() => import("./pages/GestaoDeGrupos"));
const Parametros = React.lazy(() => import("./pages/Parametros"));
const TermsLGPD = React.lazy(() => import("./pages/TermsLGPD"));
const AlterarSenha = React.lazy(() => import("./pages/AlterarSenha"));
const LinksUteis = React.lazy(() => import("./pages/LinksUteis"));
const RankingVendedores = React.lazy(() => import("./pages/RankingVendedores"));
const PublicSimulador = React.lazy(() => import("./pages/PublicSimulador"));
const FluxoDeCaixa = React.lazy(() => import("./pages/FluxoDeCaixa"));
const Planejamento = React.lazy(() => import("./pages/Planejamento"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Procedimentos = React.lazy(() => import("./pages/Procedimentos"));
const EstoqueContempladas = React.lazy(() => import("./pages/EstoqueContempladas"));
const Processos = React.lazy(() => import("./pages/Processos"));

// ==== Giro de Carteira SEM lazy (import direto) ====
import GiroDeCarteira from "./pages/GiroDeCarteira";

function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-dvh p-4 text-sm text-gray-600 flex items-center justify-center">
          Carregando…
        </div>
      }
    >
      {node}
    </React.Suspense>
  );
}

function EB({ title, children }: { title?: string; children: React.ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary title={title} resetKeys={[location.pathname]}>
      {children}
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  { path: "/publico/simulador", element: withSuspense(<PublicSimulador />) },
  { path: "/simular", element: <Navigate to="/publico/simulador" replace /> },
  { path: "/public/simulador", element: <Navigate to="/publico/simulador" replace /> },
  { path: "/agenda/sala/:eventId", element: withSuspense(<AgendaSala />) },

  { path: "/login", element: withSuspense(<Login />) },

  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { path: "alterar-senha", element: withSuspense(<AlterarSenha />) },

      {
        element: <App />,
        children: [
          { index: true, element: withSuspense(<Inicio />) },
          { path: "inicio", element: withSuspense(<Inicio />) },
          { path: "leads", element: <Navigate to="/oportunidades" replace /> },

          { path: "oportunidades", element: withSuspense(<Oportunidades />) },
          { path: "clientes", element: withSuspense(<Clientes />) },
          { path: "agenda", element: withSuspense(<Agenda />) },
          { path: "planejamento", element: withSuspense(<Planejamento />) },
          { path: "procedimentos", element: withSuspense(<Procedimentos />) },
          { path: "relatorios", element: withSuspense(<Relatorios />) },

          { path: "estoque-contempladas", element: withSuspense(<EstoqueContempladas />) },
          { path: "estoque", element: <Navigate to="/estoque-contempladas" replace /> },
          { path: "cotas-contempladas", element: <Navigate to="/estoque-contempladas" replace /> },

          {
            path: "simuladores",
            children: [
              { index: true, element: withSuspense(<Simuladores />) },
              { path: "add", element: withSuspense(<AdicionarAdministradora />) },
              { path: "admin/:id", element: withSuspense(<AdicionarAdministradora />) },
              { path: "embracon", element: withSuspense(<EmbraconSimulator />) },
              { path: "maggi", element: withSuspense(<MaggiSimulator />) },
              { path: "bb-consorcios", element: withSuspense(<BBConsorciosSimulator />) },
              { path: ":id", element: withSuspense(<EmbraconSimulator />) },
            ],
          },

          { path: "propostas", element: withSuspense(<Propostas />) },
          { path: "comissoes", element: withSuspense(<Comissoes />) },
          { path: "carteira", element: withSuspense(<Carteira />) },
          { path: "fluxo-de-caixa", element: withSuspense(<FluxoDeCaixa />) },
          { path: "processos", element: withSuspense(<Processos />) },

          {
            path: "giro-de-carteira",
            element: (
              <EB title="Erro no Giro de Carteira">
                <GiroDeCarteira />
              </EB>
            ),
          },
          { path: "giro", element: <Navigate to="/giro-de-carteira" replace /> },
          { path: "giro-de-carteira/", element: <Navigate to="/giro-de-carteira" replace /> },

          { path: "ranking", element: withSuspense(<RankingVendedores />) },
          { path: "ranking-vendedores", element: <Navigate to="/ranking" replace /> },
          { path: "vendedores/ranking", element: <Navigate to="/ranking" replace /> },
          { path: "ranking-vendas", element: <Navigate to="/ranking" replace /> },

          { path: "usuarios", element: withSuspense(<Usuarios />) },
          { path: "gestao-de-grupos", element: withSuspense(<GestaoDeGrupos />) },
          { path: "parametros", element: withSuspense(<Parametros />) },
          { path: "lgpd", element: withSuspense(<TermsLGPD />) },

          { path: "links", element: withSuspense(<LinksUteis />) },
          { path: "links-uteis", element: <Navigate to="/links" replace /> },
          { path: "linksuteis", element: <Navigate to="/links" replace /> },

          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },

  { path: "*", element: <Navigate to="/login" replace /> },
]);
