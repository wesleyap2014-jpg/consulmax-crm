// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient' // ✅ novo

// 👇 Ícones do lucide-react
import {
  Users,
  UserCheck,
  Briefcase,
  Calendar,
  Calculator,
  FileText,
  Wallet,
  Layers,
  UserCog,
  SlidersHorizontal,
  BarChart3,
} from 'lucide-react'

// ordem ajustada
const items = [
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/oportunidades', label: 'Oportunidades', icon: Briefcase },
  // simuladores entra logo abaixo como grupo
  { to: '/propostas', label: 'Propostas', icon: FileText },
  { to: '/carteira', label: 'Carteira', icon: Wallet },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos', icon: Layers },
  { to: '/clientes', label: 'Clientes', icon: UserCheck },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/comissoes', label: 'Comissões', icon: BarChart3 },
  { to: '/usuarios', label: 'Usuários', icon: UserCog },
  { to: '/parametros', label: 'Parâmetros', icon: SlidersHorizontal },
]

const LOGO_URL = '/logo-consulmax.png?v=3'
const FALLBACK_URL = '/favicon.ico?v=3'

export default function Sidebar() {
  const location = useLocation()
  const simuladoresActive = useMemo(
    () => location.pathname.startsWith('/simuladores'),
    [location.pathname]
  )

  const [simGroupOpen, setSimGroupOpen] = useState(simuladoresActive)
  useEffect(() => {
    setSimGroupOpen(simuladoresActive)
  }, [simuladoresActive])

  // ✅ lista dinâmica de administradoras
  const [admins, setAdmins] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('sim_admins')
        .select('id, name')
        .order('name', { ascending: true })
      if (!alive) return
      setAdmins(data ?? [])
    })()
    return () => {
      alive = false
    }
    // refaz a busca quando navegar dentro dos simuladores (ex.: add / novo id)
  }, [location.pathname])

  return (
    <aside className="w-64 bg-white shadow h-[calc(100vh-56px)] sticky top-14 p-3">
      {/* Cabeçalho com logo */}
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
        {items.map((i) =>
          i.to === '/propostas' ? (
            // antes de "Propostas" insere o grupo Simuladores
            <div key="simuladores-group">
              {/* Grupo Simuladores */}
              <button
                type="button"
                onClick={() => setSimGroupOpen((v) => !v)}
                className={`w-full text-left px-3 py-2 rounded-2xl transition-colors flex items-center justify-between ${
                  simuladoresActive
                    ? 'bg-consulmax-primary text-white'
                    : 'hover:bg-consulmax-neutral'
                }`}
                aria-expanded={simGroupOpen}
              >
                <span className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Simuladores
                </span>
                <span className="text-xs opacity-80">{simGroupOpen ? '▾' : '▸'}</span>
              </button>

              {simGroupOpen && (
                <div className="ml-6 grid gap-1 mt-1">
                  {/* ✅ Lista dinâmica de administradoras (A→Z) */}
                  {admins.length > 0 ? (
                    admins.map((ad) => (
                      <NavLink
                        key={ad.id}
                        to={`/simuladores/${ad.id}`}
                        className={({ isActive }) =>
                          `px-3 py-2 rounded-2xl transition-colors ${
                            isActive
                              ? 'bg-consulmax-primary text-white'
                              : 'hover:bg-consulmax-neutral'
                          }`
                        }
                      >
                        {ad.name}
                      </NavLink>
                    ))
                  ) : (
                    // Fallback se ainda não houver nenhuma cadastrada
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
                  )}

                  {/* Botão para adicionar nova administradora */}
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

              {/* Depois insere o item Propostas normalmente */}
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-2xl transition-colors flex items-center gap-2 ${
                    isActive
                      ? 'bg-consulmax-primary text-white'
                      : 'hover:bg-consulmax-neutral'
                  }`
                }
              >
                <i.icon className="h-4 w-4" />
                {i.label}
              </NavLink>
            </div>
          ) : (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-2xl transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'bg-consulmax-primary text-white'
                    : 'hover:bg-consulmax-neutral'
                }`
              }
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </NavLink>
          )
        )}
      </nav>
    </aside>
  )
}
