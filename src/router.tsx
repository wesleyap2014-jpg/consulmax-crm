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
import Carteira from './pages/Carteira';
import GestaoDeGrupos from './pages/GestaoDeGrupos';

// 👇 importe a página que te enviei
import Parametros from './pages/Parametros';

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
          { path: 'leads', element: <Leads /> },
          { path: 'oportunidades', element: <Oportunidades /> },
          { path: 'usuarios', element: <Usuarios /> },
          { path: 'carteira', element: <Carteira /> },
          { path: 'gestao-de-grupos', element: <GestaoDeGrupos /> },
          // 👇 nova rota
          { path: 'parametros', element: <Parametros /> },
          { path: 'lgpd', element: <TermsLGPD /> },
          { path: '*', element: <Navigate to="/leads" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
