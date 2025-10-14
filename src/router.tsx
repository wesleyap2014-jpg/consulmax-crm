// src/router.tsx
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import RequireAuth from './components/auth/RequireAuth';
import App from './App';

// ===== Lazy pages (ok para desktop também) =====
const Login                   = React.lazy(() => import('./pages/Login'));
const Leads                   = React.lazy(() => import('./pages/Leads'));
const Clientes                = React.lazy(() => import('./pages/Clientes'));
const Oportunidades           = React.lazy(() => import('./pages/Oportunidades'));
const Agenda                  = React.lazy(() => import('./pages/Agenda'));
const Simuladores             = React.lazy(() => import('./pages/Simuladores'));
const Propostas               = React.lazy(() => import('./pages/Propostas'));
const Comissoes               = React.lazy(() => import('./pages/Comissoes'));
const Carteira                = React.lazy(() => import('./pages/Carteira'));
const Usuarios                = React.lazy(() => import('./pages/Usuarios'));
const GestaoDeGrupos          = React.lazy(() => import('./pages/GestaoDeGrupos'));
const Parametros              = React.lazy(() => import('./pages/Parametros'));
const TermsLGPD               = React.lazy(() => import('./pages/TermsLGPD'));
const AlterarSenha            = React.lazy(() => import('./pages/AlterarSenha'));
const AdicionarAdministradora = React.lazy(() => import('./pages/AdicionarAdministradora'));

function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense fallback={<div className="p-4 text-sm text-gray-600">Carregando…</div>}>
      {node}
    </React.Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: withSuspense(<Login />) },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { path: 'alterar-senha', element: withSuspense(<AlterarSenha />) },
      {
        element: <App />, // layout principal
        children: [
          { index: true, element: <Navigate to="/leads" replace /> },

          { path: 'leads',            element: withSuspense(<Leads />) },
          { path: 'clientes',         element: withSuspense(<Clientes />) },
          { path: 'oportunidades',    element: withSuspense(<Oportunidades />) },
          { path: 'agenda',           element: withSuspense(<Agenda />) },

          {
            path: 'simuladores',
            children: [
              { index: true,   element: withSuspense(<Simuladores />) },
              { path: 'embracon', element: withSuspense(<Simuladores />) }, // opcional: atalho legacy
              { path: 'add',   element: withSuspense(<AdicionarAdministradora />) },
              { path: ':id',   element: withSuspense(<Simuladores />) },    // <- ajustado para :id
            ],
          },

          { path: 'propostas',         element: withSuspense(<Propostas />) },
          { path: 'comissoes',         element: withSuspense(<Comissoes />) },
          { path: 'carteira',          element: withSuspense(<Carteira />) },
          { path: 'usuarios',          element: withSuspense(<Usuarios />) },
          { path: 'gestao-de-grupos',  element: withSuspense(<GestaoDeGrupos />) },
          { path: 'parametros',        element: withSuspense(<Parametros />) },
          { path: 'lgpd',              element: withSuspense(<TermsLGPD />) },

          { path: '*', element: <Navigate to="/leads" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
