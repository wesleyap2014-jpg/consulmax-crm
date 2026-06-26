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
const RadarOfertas = React.lazy(() => import("./pages/RadarOfertas"));
const CentralGrupos = React.lazy(() => import("./pages/CentralGrupos"));
const AdicionarAdministradora = React.lazy(() => import("./pages/AdicionarAdministradora"));
const EmbraconSimulator = React.lazy(() => import("./pages/simuladores/EmbraconSimulator"));
const MaggiSimulator = React.lazy(() => import("./pages/simuladores/MaggiSimulator"));
const BBConsorciosSimulator = React.lazy(() => import("./pages/simuladores/BBConsorciosSimulator"));
const Propostas = React.lazy(() => import("./pages/Propostas"));
const PropostasCadenciado = React.lazy(() => import("./pages/PropostasCadenciado"));
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
const PublicAreaCandidato = React.lazy(() => import("./pages/PublicAreaCandidato"));
const PublicPoliticaPrivacidade = React.lazy(() => import("./pages/PublicPoliticaPrivacidade"));
const FluxoDeCaixa = React.lazy(() => import("./pages/FluxoDeCaixa"));
const Planejamento = React.lazy(() => import("./pages/Planejamento"));
const CentralProjetos = React.lazy(() => import("./pages/CentralProjetos"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Procedimentos = React.lazy(() => import("./pages/Procedimentos"));
const EstoqueContempladas = React.lazy(() => import("./pages/EstoqueContempladas"));
const Processos = React.lazy(() => import("./pages/Processos"));
const RH = React.lazy(() => import("./pages/RH"));
const RHVagas = React.lazy(() => import("./pages/RHVagas"));
const WhatsAppAtendimento = React.lazy(() => import("./pages/whatsapp/WhatsAppAtendimento"));
const WhatsAppCampanhas = React.lazy(() => import("./pages/whatsapp/WhatsAppCampanhas"));
const WhatsAppModelos = React.lazy(() => import("./pages/whatsapp/WhatsAppModelos"));
const WhatsAppAutorizacoes = React.lazy(() => import("./pages/whatsapp/WhatsAppAutorizacoes"));

function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense fallback={<div className="min-h-dvh p-4 text-sm text-gray-600 flex items-center justify-center">Carregando…</div>}>
      {node}
    </React.Suspense>
  );
}

function EB({ title, children }: { title?: string; children: React.ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary title={title} resetKeys={[location.pathname]}>{children}</ErrorBoundary>;
}

function GiroDeCarteiraInlineTest() {
  return (
    <div style={{ minHeight: "100vh", padding: 40, background: "#ecfdf5", color: "#064e3b" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", border: "2px solid #10b981", borderRadius: 24, background: "white", padding: 32 }}>
        <div style={{ display: "inline-block", border: "1px solid #10b981", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>TESTE ROTA RAIZ /giro-de-carteira</div>
        <h1 style={{ marginTop: 20, fontSize: 34, fontWeight: 800 }}>A rota raiz /giro-de-carteira está renderizando.</h1>
        <p style={{ marginTop: 12, fontSize: 16 }}>Esta tela bypassa RequireAuth, App, Header, Sidebar e Outlet.</p>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/giro-de-carteira", element: <GiroDeCarteiraInlineTest /> },
  { path: "/giro", element: <Navigate to="/giro-de-carteira" replace /> },

  // ==== Rotas públicas ====
  { path: "/publico/simulador", element: withSuspense(<PublicSimulador />) },
  { path: "/simular", element: <Navigate to="/publico/simulador" replace /> },
  { path: "/public/simulador", element: <Navigate to="/publico/simulador" replace /> },

  { path: "/ponto", element: withSuspense(<PublicPonto />) },
  { path: "/registro-ponto", element: <Navigate to="/ponto" replace /> },
  { path: "/ponto-eletronico", element: <Navigate to="/ponto" replace /> },

  { path: "/trabalhe-conosco", element: withSuspense(<PublicTrabalheConosco />) },
  { path: "/area-candidato", element: withSuspense(<PublicAreaCandidato />) },

  // Política de Privacidade pública para Meta/WhatsApp
  { path: "/politica-de-privacidade", element: withSuspense(<PublicPoliticaPrivacidade />) },
  { path: "/privacidade", element: <Navigate to="/politica-de-privacidade" replace /> },
  { path: "/privacy", element: <Navigate to="/politica-de-privacidade" replace /> },

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
          { path: "central-projetos", element: withSuspense(<CentralProjetos />) },
          { path: "gestao-de-projetos", element: <Navigate to="/central-projetos" replace /> },
          { path: "projetos", element: <Navigate to="/central-projetos" replace /> },
          { path: "procedimentos", element: withSuspense(<Procedimentos />) },
          { path: "relatorios", element: withSuspense(<Relatorios />) },

          // WhatsApp
          { path: "atendimento-whatsapp", element: <Navigate to="/whatsapp/atendimento" replace /> },
          { path: "whatsapp", element: <Navigate to="/whatsapp/atendimento" replace /> },
          { path: "whatsapp/atendimento", element: withSuspense(<WhatsAppAtendimento />) },
          { path: "whatsapp/campanhas", element: withSuspense(<WhatsAppCampanhas />) },
          { path: "whatsapp/modelos", element: withSuspense(<WhatsAppModelos />) },
          { path: "whatsapp/autorizacoes", element: withSuspense(<WhatsAppAutorizacoes />) },
          { path: "central-whatsapp", element: <Navigate to="/whatsapp/atendimento" replace /> },
          { path: "atendimento", element: <Navigate to="/whatsapp/atendimento" replace /> },

          { path: "estoque-contempladas", element: withSuspense(<EstoqueContempladas />) },
          { path: "estoque", element: <Navigate to="/estoque-contempladas" replace /> },
          { path: "cotas-contempladas", element: <Navigate to="/estoque-contempladas" replace /> },
          { path: "radar-ofertas", element: withSuspense(<RadarOfertas />) },
          { path: "buscar-ofertas", element: <Navigate to="/radar-ofertas" replace /> },
          { path: "central-grupos", element: withSuspense(<CentralGrupos />) },
          { path: "grupos-disponiveis", element: <Navigate to="/central-grupos" replace /> },

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
          { path: "propostas-cadenciado", element: withSuspense(<PropostasCadenciado />) },
          { path: "comissoes", element: withSuspense(<Comissoes />) },
          { path: "carteira", element: withSuspense(<Carteira />) },
          { path: "fluxo-de-caixa", element: withSuspense(<FluxoDeCaixa />) },
          { path: "processos", element: withSuspense(<Processos />) },
          { path: "rh", element: withSuspense(<RH />) },
          { path: "rh/vagas", element: withSuspense(<RHVagas />) },

          { path: "giro-de-carteira", element: <EB title="Erro no Giro de Carteira"><GiroDeCarteiraInlineTest /></EB> },
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