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

// ✅ simuladores
import Simuladores from './pages/Simuladores'

// já existia
import Parametros from './pages/Parametros'

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
          { path: 'clientes', element: <Clientes /> },          // novo
          { path: 'oportunidades', element: <Oportunidades /> },
          { path: 'agenda', element: <Agenda /> },              // novo
          { path: 'simuladores', element: <Simuladores /> },    // 👈 simuladores

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
