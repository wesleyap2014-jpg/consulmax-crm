// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useMemo, useState, useEffect, useId } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Ícones
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

type SidebarProps = {
  /** Chamado ao navegar para fechar o drawer no mobile */
  onNavigate?: () => void
}

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

type AdminRow = { id: string; name: string; slug: string | null }

export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation()
  const simuladoresActive = useMemo(
    () => location.pathname.startsWith('/simuladores'),
    [location.pathname]
  )

  // id para aria-controls do grupo
  const simListId = useId()

  const [simGroupOpen, setSimGroupOpen] = useState(simuladoresActive)
  useEffect(() => {
    setSimGroupOpen(simuladoresActive)
  }, [simuladoresActive])

  // fecha o drawer ao mudar de rota (caso a navegação venha por atalho/redirect)
  useEffect(() => {
    onNavigate?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // lista dinâmica de administradoras
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setAdminsLoading(true)
      const { data, error } = await supabase
        .from('sim_admins')
        .select('id, name, slug')
        .order('name', { ascending: true })

      if (!alive) return
      if (error) {
        console.error('Erro ao carregar administradoras:', error.message)
        setAdmins([])
      } else {
        setAdmins(data ?? [])
      }
      setAdminsLoading(false)
    })()
    return () => { alive = false }
    // refaz a busca quando navegar dentro de simuladores (ex.: add / novo id ou slug)
  }, [location.pathname])

  return (
    <aside
      className="
        md:w-64 w-full bg-white border-r
        md:shadow
        md:sticky md:top-14
        h-[calc(100vh-56px)]
        p-3
        overflow-y-auto
        pb-[max(env(safe-area-inset-bottom),theme(spacing.3))]
      "
      role="navigation"
      aria-label="Navegação principal"
    >
      {/* Cabeçalho com logo */}
      <Link
        to="/leads"
        className="flex items-center gap-3 mb-6 px-2"
        onClick={() => onNavigate?.()}
      >
        <img
          src={LOGO_URL}
          alt="Consulmax"
          title="Consulmax"
          width={40}
          height={40}
          loading="eager"
          className="h-10 w-10 object-contain rounded-md bg-[#F5F5F5]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_URL }}
        />
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-consulmax-primary text-lg">Consulmax</span>
          <span className="text-xs text-consulmax-secondary">Maximize as suas conquistas</span>
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
                className={`
                  w-full text-left px-3 py-2.5 rounded-2xl transition-colors
                  flex items-center justify-between
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                  ${simuladoresActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}
                `}
                aria-expanded={simGroupOpen}
                aria-controls={simListId}
              >
                <span className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Simuladores
                </span>
                <span className="text-xs opacity-80" aria-hidden>
                  {simGroupOpen ? '▾' : '▸'}
                </span>
              </button>

              {simGroupOpen && (
                <div id={simListId} className="ml-6 grid gap-1 mt-1">
                  {/* Lista dinâmica de administradoras (A→Z) com slug (fallback id) */}
                  {adminsLoading && (
                    <div className="px-3 py-2 text-xs text-gray-500">Carregando…</div>
                  )}

                  {!adminsLoading && admins.length > 0 ? (
                    admins.map((ad) => {
                      const key = ad.slug || ad.id // usa slug quando houver
                      return (
                        <NavLink
                          key={ad.id}
                          to={`/simuladores/${key}`}
                          className={({ isActive }) =>
                            `px-3 py-2.5 rounded-2xl transition-colors
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                             ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                          }
                          onClick={() => onNavigate?.()}
                        >
                          {ad.name}
                        </NavLink>
                      )
                    })
                  ) : (
                    // Fallback se ainda não houver nenhuma cadastrada
                    !adminsLoading && (
                      <NavLink
                        to="/simuladores/embracon"
                        className={({ isActive }) =>
                          `px-3 py-2.5 rounded-2xl transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                           ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                        }
                        onClick={() => onNavigate?.()}
                      >
                        Embracon
                      </NavLink>
                    )
                  )}

                  {/* Botão para adicionar nova administradora */}
                  <NavLink
                    to="/simuladores/add"
                    className={({ isActive }) =>
                      `px-3 py-2.5 rounded-2xl transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                       ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                    }
                    onClick={() => onNavigate?.()}
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
                  `px-3 py-2.5 rounded-2xl transition-colors flex items-center gap-2
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                   ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                }
                onClick={() => onNavigate?.()}
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
                `px-3 py-2.5 rounded-2xl transition-colors flex items-center gap-2
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                 ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
              }
              onClick={() => onNavigate?.()}
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
