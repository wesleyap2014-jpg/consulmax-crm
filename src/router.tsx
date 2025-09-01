// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';

import App from './App';
import Login from './pages/Login';
import Leads from './pages/Leads';
import Oportunidades from './pages/Oportunidades';
import Usuarios from './pages/Usuarios';
import TermsLGPD from './pages/TermsLGPD';
import RequireAuth from './components/auth/RequireAuth';
import AlterarSenha from './pages/AlterarSenha';

export const router = createBrowserRouter([
  // Público
  { path: '/login', element: <Login /> },

  // Protegido
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      // 1) Rota de troca de senha (fora do shell do App, mas ainda protegida)
      { path: 'alterar-senha', element: <AlterarSenha /> },

      // 2) Shell do app + rotas internas
      {
        element: <App />,
        children: [
          // Redireciona a home para /leads (evita "tela em branco")
          { index: true, element: <Navigate to="/leads" replace /> },

          { path: 'leads', element: <Leads /> },
          { path: 'oportunidades', element: <Oportunidades /> },
          { path: 'usuarios', element: <Usuarios /> },
          { path: 'lgpd', element: <TermsLGPD /> },

          // Qualquer rota desconhecida dentro do app → /leads
          { path: '*', element: <Navigate to="/leads" replace /> },
        ],
      },
    ],
  },

  // Qualquer rota desconhecida fora do app → /login
  { path: '*', element: <Navigate to="/login" replace /> },
]);
