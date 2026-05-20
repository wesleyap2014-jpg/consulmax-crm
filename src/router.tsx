// src/router.tsx
import React from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";

import RequireAuth from "./components/auth/RequireAuth";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// ==== Lazy pages ====
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
const PublicPonto = React.lazy(() => import("./pages/PublicPonto"));
const PublicTrabalheConosco = React.lazy(() => import("./pages/PublicTrabalheConosco"));
const FluxoDeCaixa = React.lazy(() => import("./pages/FluxoDeCaixa"));
const Planejamento = React.lazy(() => import("./pages/Planejamento"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Procedimentos = React.lazy(() => import("./pages/Procedimentos"));
const EstoqueContempladas = React.lazy(() => import("./pages/EstoqueContempladas"));
const Processos = React.lazy(() => import("./pages/Processos"));
const RH = React.lazy(() => import("./pages/RH"));

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

function GiroDeCarteiraInlineTest() {
  return (
    <div style={{ minHeight: "100vh", padding: 40, background: "#ecfdf5", color: "#064e3b" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", border: "2px solid #10b981", borderRadius: 24, background: "white", padding: 32 }}>
        <div style={{ display: "inline-block", border: "1px solid #10b981", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
          TESTE ROTA RAIZ /giro-de-carteira
        </div>
        <h1 style={{ marginTop: 20, fontSize: 34, fontWeight: 800 }}>
          A rota raiz /giro-de-carteira está renderizando.
        </h1>
        <p style={{ marginTop: 12, fontSize: 16 }}>
          Esta tela bypassa RequireAuth, App, Header, Sidebar e Outlet. Se aparecer, o problema está no layout/rota filha. Se não aparecer, o problema está antes do router atual ser executado.
        </p>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/giro-de-carteira", element: <GiroDeCarteiraInlineTest /> },
  { path: "/giro", element: <Navigate to="/giro-de-carteira" replace /> },

  { path: "/publico/simulador", element: withSuspense(<PublicSimulador />) },
  { path: "/simular", element: <Navigate to="/publico/simulador" replace /> },
  { path: "/public/simulador", element: <Navigate to="/publico/simulador" replace /> },
  { path: "/ponto", element: withSuspense(<PublicPonto />) },
  { path: "/registro-ponto", element: <Navigate to="/ponto" replace /> },
  { path: "/ponto-eletronico", element: <Navigate to="/ponto" replace /> },
  { path: "/trabalhe-conosco", element: withSuspense(<PublicTrabalheConosco />) },
  { path: "/trabalheconosco", element: <Navigate to="/trabalhe-conosco" replace /> },
  { path: "/carreiras", element: <Navigate to="/trabalhe-conosco" replace /> },
  { path: "/vagas", element: <Navigate to="/trabalhe-conosco" replace /> },
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
          { path: "rh", element: withSuspense(<RH />) },

          {
            path: "giro-de-carteira",
            element: (
              <EB title="Erro no Giro de Carteira">
                <GiroDeCarteiraInlineTest />
              </EB>
            ),
          },
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