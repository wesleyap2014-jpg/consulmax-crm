// src/router.tsx
import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import Login from './pages/Login'
import Leads from './pages/Leads'
import Oportunidades from './pages/Oportunidades'
import Usuarios from './pages/Usuarios'
import TermsLGPD from './pages/TermsLGPD'
import RequireAuth from './components/auth/RequireAuth'

// 👉 NOVO import
import AlterarSenha from './pages/AlterarSenha'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },

  {
    path: '/',
    element: <RequireAuth />,
    children: [
      // 👉 NOVA ROTA protegida, fora do <App/>
      { path: '/alterar-senha', element: <AlterarSenha /> },

      {
        path: '/',
        element: <App />,
        children: [
          { path: '/leads', element: <Leads /> },
          { path: '/oportunidades', element: <Oportunidades /> },
          { path: '/usuarios', element: <Usuarios /> },
          { path: '/lgpd', element: <TermsLGPD /> },
        ],
      },
    ],
  },
])
