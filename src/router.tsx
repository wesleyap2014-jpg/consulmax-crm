// src/router.tsx
import { createBrowserRouter, Navigate, Link, useParams } from 'react-router-dom'

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

// ====== Páginas leves inline para Simuladores ======
// (+Add Adm) — simples placeholder anterior (mantido aqui caso queira usar futuramente)
const AddAdm = () => (
  <div className="p-6 space-y-4">
    <h1 className="text-xl font-semibold">Adicionar Administradora</h1>
    <p className="text-sm text-muted-foreground">
      Aqui você poderá cadastrar novas administradoras para o Simulador. Após cadastrar, acesse
      a rota <code className="px-1 py-0.5 rounded bg-gray-100">/simuladores/&lt;slug&gt;</code> para configurar os critérios.
    </p>
    <div className="text-sm">
      <p className="mb-2">Por enquanto, use a página <Link to="/parametros" className="text-blue-600 underline">Parâmetros</Link> para centralizar esse cadastro.</p>
      <ul className="list-disc ml-6">
        <li>Defina um <strong>slug</strong> (ex.: <code>maggi</code>, <code>ancora</code>, <code>hs</code>).</li>
        <li>Depois acesse <code>/simuladores/&lt;seu-slug&gt;</code> para configurar os critérios.</li>
      </ul>
    </div>
  </div>
);

// Configuração de critérios por administradora (rota dinâmica)
// Quando você criar a tela real, basta substituir este placeholder pelo componente definitivo.
const AdmConfigPage = () => {
  const { admSlug } = useParams();
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Configurar critérios — {admSlug?.toUpperCase()}</h1>
      <p className="text-sm text-muted-foreground">
        Esta é a rota de configuração específica da administradora <strong>{admSlug}</strong>.
        Aqui você vai definir coeficientes, prazos, faixas de crédito e regras.
      </p>
      <p className="text-sm">
        Se preferir, volte para <Link to="/parametros" className="text-blue-600 underline">Parâmetros</Link> para centralizar o cadastro inicial.
      </p>
    </div>
  );
};

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
              // Ao entrar em /simuladores, manda para Embracon (mantém seu fluxo atual)
              { index: true, element: <Navigate to="/simuladores/embracon" replace /> },

              // Embracon continua usando a página atual de Simuladores (não mexemos)
              { path: 'embracon', element: <Simuladores /> },

              // +Add Adm → agora usa a página real
              { path: 'add', element: <AdicionarAdministradora /> },

              // Rota dinâmica para futuras administradoras cadastradas
              { path: ':admSlug', element: <AdmConfigPage /> },
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
