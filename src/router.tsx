// src/router.tsx
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import RequireAuth from './components/auth/RequireAuth';
import LayoutShell from './components/layout/LayoutShell';

// Páginas leves que podem ficar síncronas (opcional)
// import Login from './pages/Login';

// ===== Lazy pages (melhor para mobile) =====
const Login                  = React.lazy(() => import('./pages/Login'));
const Leads                  = React.lazy(() => import('./pages/Leads'));
const Clientes               = React.lazy(() => import('./pages/Clientes'));
const Oportunidades          = React.lazy(() => import('./pages/Oportunidades'));
const Agenda                 = React.lazy(() => import('./pages/Agenda'));
const Simuladores            = React.lazy(() => import('./pages/Simuladores'));
const Propostas              = React.lazy(() => import('./pages/Propostas'));
const Comissoes              = React.lazy(() => import('./pages/Comissoes'));
const Carteira               = React.lazy(() => import('./pages/Carteira'));
const Usuarios               = React.lazy(() => import('./pages/Usuarios'));
const GestaoDeGrupos         = React.lazy(() => import('./pages/GestaoDeGrupos'));
const Parametros             = React.lazy(() => import('./pages/Parametros'));
const TermsLGPD              = React.lazy(() => import('./pages/TermsLGPD'));
const AlterarSenha           = React.lazy(() => import('./pages/AlterarSenha'));
const AdicionarAdministradora= React.lazy(() => import('./pages/AdicionarAdministradora'));

// ===== Suspense helper =====
function withSuspense(node: React.ReactNode) {
  return (
    <React.Suspense fallback={<div className="p-4 text-sm text-gray-600">Carregando…</div>}>
      {node}
    </React.Suspense>
  );
}

// ====== Rotas ======
export const router = createBrowserRouter([
  { path: '/login', element: withSuspense(<Login />) },

  {
    path: '/',
    element: <RequireAuth />,
    children: [
      // Rota autenticada fora do layout principal
      { path: 'alterar-senha', element: withSuspense(<AlterarSenha />) },

      // ⬇️ Envolve todas as páginas autenticadas no LayoutShell (header móvel + drawer)
      {
        element: <LayoutShell />,
        children: [
          { index: true, element: <Navigate to="/leads" replace /> },

          // 👇 rotas principais
          { path: 'leads',           element: withSuspense(<Leads />) },
          { path: 'clientes',        element: withSuspense(<Clientes />) },
          { path: 'oportunidades',   element: withSuspense(<Oportunidades />) },
          { path: 'agenda',          element: withSuspense(<Agenda />) },

          // 👇 Simuladores com rotas-filhas
          {
            path: 'simuladores',
            children: [
              { index: true,                element: withSuspense(<Simuladores />) },           // /simuladores
              { path: 'embracon',           element: withSuspense(<Simuladores />) },           // /simuladores/embracon
              { path: 'add',                element: withSuspense(<AdicionarAdministradora />) },// /simuladores/add
              { path: ':adminKey',          element: withSuspense(<Simuladores />) },           // /simuladores/:adminKey
            ],
          },

          { path: 'propostas',      element: withSuspense(<Propostas />) },

          // 👇 nova guia Comissões
          { path: 'comissoes',      element: withSuspense(<Comissoes />) },

          // 👇 demais guias existentes
          { path: 'carteira',       element: withSuspense(<Carteira />) },
          { path: 'usuarios',       element: withSuspense(<Usuarios />) },
          { path: 'gestao-de-grupos', element: withSuspense(<GestaoDeGrupos />) },
          { path: 'parametros',     element: withSuspense(<Parametros />) },
          { path: 'lgpd',           element: withSuspense(<TermsLGPD />) },

          // fallback interno autenticado
          { path: '*', element: <Navigate to="/leads" replace /> },
        ],
      },
    ],
  },

  // fallback global
  { path: '*', element: <Navigate to="/login" replace /> },
]);
