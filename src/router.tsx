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

// IMPORTANTE: a rota /alterar-senha fica protegida, mas fora do <App/>,
// pra não carregar layout/menu enquanto o usuário ainda precisa trocar senha.
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },

  {
    path: '/',
    element: <RequireAuth />,
    children: [
      // rota protegida específica para troca de senha
      { path: '/alterar-senha', element: <AlterarSenha /> },

      // app principal protegido
      {
        path: '/',
        element: <App />,
        children: [
          // ✅ index: redireciona para /leads quando abrir o app sem rota
          { index: true, element: <Navigate to="/leads" replace /> },

          { path: '/leads', element: <Leads /> },
          { path: '/oportunidades', element: <Oportunidades /> },
          { path: '/usuarios', element: <Usuarios /> },
          { path: '/lgpd', element: <TermsLGPD /> },
        ],
      },
    ],
  },

  // catch-all: se cair numa rota inválida, manda pro index (que vai pra /leads)
  { path: '*', element: <Navigate to="/" replace /> },
]);
