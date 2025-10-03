// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'

import App from './App'
import Login from './pages/Login'
import Leads from './pages/Leads'
import Oportunidades from './pages/Oportunidades'
import Usuarios from './pages/Usuarios'
import TermsLGPD from './pages/TermsLGPD'
import RequireAuth from './components/auth/RequireAuth'
import AlterarSenha from './pages/AlterarSenha'
import Carteira from './pages/Carteira'
import GestaoDeGrupos from './pages/GestaoDeGrupos'

// ✅ novas páginas
import Clientes from './pages/Clientes'
import Agenda from './pages/Agenda'

// ✅ simuladores / propostas
import Simuladores from './pages/Simuladores'
import Propostas from './pages/Propostas'

// ✅ comissões
import Comissoes from './pages/Comissoes' // 👈 NOVO

// ✅ página real de adicionar administradora
import AdicionarAdministradora from './pages/AdicionarAdministradora'

// ====== Rotas ======
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { path: 'alterar-senha', element: <AlterarSenha /> },
      {
        element: <App />,
        children: [
          { index: true, element: <Navigate to="/leads" replace /> },

          // 👇 rotas principais
          { path: 'leads', element: <Leads /> },
          { path: 'clientes', element: <Clientes /> },
          { path: 'oportunidades', element: <Oportunidades /> },
          { path: 'agenda', element: <Agenda /> },

          // 👇 Simuladores com rotas-filhas
          {
            path: 'simuladores',
            children: [
              { index: true, element: <Navigate to="/simuladores/embracon" replace /> },
              { path: 'embracon', element: <Simuladores /> },
              { path: 'add', element: <AdicionarAdministradora /> },

              // ✅ AGORA a rota dinâmica usa a própria página de Simuladores
              //    e passaremos o id da administradora na URL
              { path: ':adminId', element: <Simuladores /> },
            ],
          },

          { path: 'propostas', element: <Propostas /> },

          // 👇 nova guia Comissões
          { path: 'comissoes', element: <Comissoes /> }, // 👈 NOVO

          // 👇 demais guias existentes
          { path: 'carteira', element: <Carteira /> },
          { path: 'usuarios', element: <Usuarios /> },
          { path: 'gestao-de-grupos', element: <GestaoDeGrupos /> },
          { path: 'parametros', element: <Parametros /> },
          { path: 'lgpd', element: <TermsLGPD /> },

          // fallback interno autenticado
          { path: '*', element: <Navigate to="/leads" replace /> },
        ],
      },
    ],
  },
  // fallback global
  { path: '*', element: <Navigate to="/login" replace /> },
])

// nota: Parametros é importado abaixo para manter a ordem original
import Parametros from './pages/Parametros'
