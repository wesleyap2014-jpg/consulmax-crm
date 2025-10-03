// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useMemo, useState, useEffect } from 'react'

const items = [
  { to: '/leads', label: 'Leads' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/oportunidades', label: 'Oportunidades' },
  { to: '/agenda', label: 'Agenda' },
  // { to: '/simuladores', label: 'Simuladores' }, // 🔁 vira grupo abaixo
  { to: '/propostas', label: 'Propostas' },
  { to: '/comissoes', label: 'Comissões' }, // 👈 NOVO
  { to: '/carteira', label: 'Carteira' },
  { to: '/usuarios', label: 'Usuários' },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos' },
  { to: '/parametros', label: 'Parâmetros' },
]

// usa caminho absoluto do Vite/public + cache-bust
const LOGO_URL = '/logo-consulmax.png?v=3'
const FALLBACK_URL = '/favicon.ico?v=3'

export default function Sidebar() {
  const location = useLocation()
  const simuladoresActive = useMemo(
    () => location.pathname.startsWith('/simuladores'),
    [location.pathname]
  )

  // abre o grupo automaticamente quando estiver em /simuladores/*
  const [simGroupOpen, setSimGroupOpen] = useState(simuladoresActive)
  useEffect(() => {
    setSimGroupOpen(simuladoresActive)
  }, [simuladoresActive])

  return (
    <aside className="w-64 bg-white shadow h-[calc(100vh-56px)] sticky top-14 p-3">
      {/* Cabeçalho com logo e slogan (clicável) */}
      <Link to="/leads" className="flex items-center gap-3 mb-6 px-2">
        <img
          src={LOGO_URL}
          alt="Consulmax"
          title="Consulmax"
          width={40}
          height={40}
          loading="eager"
          className="h-10 w-10 object-contain rounded-md bg-[#F5F5F5]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = FALLBACK_URL
          }}
        />
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-consulmax-primary text-lg">Consulmax</span>
          <span className="text-xs text-consulmax-secondary">
            Maximize as suas conquistas
          </span>
        </div>
      </Link>

      {/* Navegação */}
      <nav className="grid gap-2">
        {/* Itens padrão */}
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) =>
              `px-3 py-2 rounded-2xl transition-colors ${
                isActive
                  ? 'bg-consulmax-primary text-white'
                  : 'hover:bg-consulmax-neutral'
              }`
            }
          >
            {i.label}
          </NavLink>
        ))}

        {/* Grupo: Simuladores */}
        <button
          type="button"
          onClick={() => setSimGroupOpen((v) => !v)}
          className={`text-left px-3 py-2 rounded-2xl transition-colors flex items-center justify-between ${
            simuladoresActive
              ? 'bg-consulmax-primary text-white'
              : 'hover:bg-consulmax-neutral'
          }`}
          aria-expanded={simGroupOpen}
        >
          <span>Simuladores</span>
          <span className="text-xs opacity-80">{simGroupOpen ? '▾' : '▸'}</span>
        </button>

        {simGroupOpen && (
          <div className="ml-3 grid gap-1">
            <NavLink
              to="/simuladores/embracon"
              className={({ isActive }) =>
                `px-3 py-2 rounded-2xl transition-colors ${
                  isActive
                    ? 'bg-consulmax-primary text-white'
                    : 'hover:bg-consulmax-neutral'
                }`
              }
            >
              Embracon
            </NavLink>

            <NavLink
              to="/simuladores/add"
              className={({ isActive }) =>
                `px-3 py-2 rounded-2xl transition-colors ${
                  isActive
                    ? 'bg-consulmax-primary text-white'
                    : 'hover:bg-consulmax-neutral'
                }`
              }
            >
              + Add Administradora
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  )
}
