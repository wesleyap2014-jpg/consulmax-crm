// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useMemo, useState, useEffect, useId } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Ícones
import {
  // Users, // removido (não há mais item Leads)
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
  Link as LinkIcon, // ✅ novo ícone para "Links Úteis"
} from 'lucide-react'

type SidebarProps = {
  /** Chamado ao navegar para fechar o drawer no mobile */
  onNavigate?: () => void
}

// Removido o item /leads
// ✅ Adicionado "Links Úteis" (rota /links)
const items = [
  { to: '/oportunidades',   label: 'Oportunidades',    icon: Briefcase },
  // (grupo Simuladores vem antes de Propostas)
  { to: '/propostas',        label: 'Propostas',        icon: FileText },
  { to: '/carteira',         label: 'Carteira',         icon: Wallet },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos', icon: Layers },
  { to: '/clientes',         label: 'Clientes',         icon: UserCheck },
  { to: '/agenda',           label: 'Agenda',           icon: Calendar },
  { to: '/comissoes',        label: 'Comissões',        icon: BarChart3 },
  { to: '/usuarios',         label: 'Usuários',         icon: UserCog },
  { to: '/parametros',       label: 'Parâmetros',       icon: SlidersHorizontal },
  { to: '/links',            label: 'Links Úteis',      icon: LinkIcon }, // ✅ novo item
]

const LOGO_URL = '/logo-consulmax.png?v=3'
const FALLBACK_URL = '/favicon.ico?v=3'

type AdminRow = { id: string; name: string; slug: string | null }

/** ================= Liquid Glass Helpers (Sidebar) ================= */
const glassSidebarBase: React.CSSProperties = {
  position: 'relative',
  background: 'rgba(255,255,255,.55)',
  borderRight: '1px solid rgba(255,255,255,.35)',
  backdropFilter: 'saturate(160%) blur(10px)',
  WebkitBackdropFilter: 'saturate(160%) blur(10px)',
  boxShadow: 'inset -8px 0 30px rgba(181,165,115,.10)', // brilho dourado sutil (B5A573)
}

const activePillStyle: React.CSSProperties = {
  // mantém a cor rubi das suas classes; aqui só acrescentamos “vidro/brilho”
  background: 'linear-gradient(180deg, rgba(161,28,39,1) 0%, rgba(161,28,39,.96) 100%)',
  border: '1px solid rgba(255,255,255,.18)',
  boxShadow: '0 6px 18px rgba(161,28,39,.25), inset 0 -8px 20px rgba(255,255,255,.12)',
}

const glassHoverPill: React.CSSProperties = {
  background: 'rgba(255,255,255,.58)',
  border: '1px solid rgba(255,255,255,.35)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,.04)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
}

const SidebarLiquidBG: React.FC = () => (
  <div style={sbLiquidCanvas}>
    <style>{sbLiquidKeyframes}</style>
    <span style={{ ...sbBlob, ...sbBlob1 }} />
    <span style={{ ...sbBlob, ...sbBlob2 }} />
    <span style={{ ...sbGoldGlow }} />
  </div>
)

const sbLiquidCanvas: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
}

const sbBlob: React.CSSProperties = {
  position: 'absolute',
  width: 280,
  height: 280,
  borderRadius: '50%',
  filter: 'blur(40px)',
  opacity: 0.55,
}

const sbBlob1: React.CSSProperties = {
  left: -80,
  top: -60,
  background: 'radial-gradient(closest-side, #A11C27, rgba(161,28,39,0))',
  animation: 'sbFloat1 26s ease-in-out infinite',
}

const sbBlob2: React.CSSProperties = {
  right: -90,
  bottom: -60,
  background: 'radial-gradient(closest-side, #1E293F, rgba(30,41,63,0))',
  animation: 'sbFloat2 30s ease-in-out infinite',
}

const sbGoldGlow: React.CSSProperties = {
  position: 'absolute',
  right: -60,
  top: '45%',
  width: 180,
  height: 180,
  borderRadius: '50%',
  background: 'radial-gradient(closest-side, rgba(181,165,115,.35), rgba(181,165,115,0))',
  filter: 'blur(30px)',
  opacity: 0.6,
}

const sbLiquidKeyframes = `
@keyframes sbFloat1 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(18px,14px) scale(1.06)} 100%{transform:translate(0,0) scale(1)} }
@keyframes sbFloat2 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(-16px,-10px) scale(1.05)} 100%{transform:translate(0,0) scale(1)} }
`

/** =============================== Component =============================== */
export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation()
  const simuladoresActive = useMemo(
    () => location.pathname.startsWith('/simuladores'),
    [location.pathname]
  )

  const simListId = useId()
  const [simGroupOpen, setSimGroupOpen] = useState(simuladoresActive)
  useEffect(() => { setSimGroupOpen(simuladoresActive) }, [simuladoresActive])

  // fecha o drawer ao mudar de rota
  useEffect(() => { onNavigate?.() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // lista dinâmica de administradoras
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [embraconId, setEmbraconId] = useState<string | null>(null)

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
        setEmbraconId(null)
      } else {
        const list = data ?? []
        setAdmins(list)
        const embr = list.find(a => a.name?.toLowerCase() === 'embracon')
        setEmbraconId(embr?.id ?? null)
      }
      setAdminsLoading(false)
    })()
    return () => { alive = false }
  }, [location.pathname])

  return (
    <aside
      className="
        md:w-64 w-full border-r
        md:shadow
        md:sticky md:top-14
        h-[calc(100vh-56px)]
        p-3
        overflow-y-auto
        pb-[max(env(safe-area-inset-bottom),theme(spacing.3))]
      "
      style={glassSidebarBase}
      role="navigation"
      aria-label="Navegação principal"
    >
      {/* camada líquida (fica por baixo do conteúdo) */}
      <SidebarLiquidBG />

      {/* Cabeçalho com logo */}
      <Link
        to="/oportunidades"
        className="relative z-[1] flex items-center gap-3 mb-6 px-2"
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
      <nav className="relative z-[1] grid gap-2">
        {items.map((i) =>
          i.to === '/propostas' ? (
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
                style={simuladoresActive ? activePillStyle : glassHoverPill}
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
                  {adminsLoading && (
                    <div className="px-3 py-2 text-xs text-gray-500">Carregando…</div>
                  )}

                  {!adminsLoading && admins.length > 0 && admins.map((ad) => (
                    <NavLink
                      key={ad.id}
                      to={`/simuladores/${ad.id}`} // sempre ID
                      className={({ isActive }) =>
                        `px-3 py-2.5 rounded-2xl transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                         ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                      }
                      style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                      onClick={() => onNavigate?.()}
                    >
                      {ad.name}
                    </NavLink>
                  ))}

                  {!adminsLoading && admins.length === 0 && embraconId && (
                    <NavLink
                      to={`/simuladores/${embraconId}`}
                      className={({ isActive }) =>
                        `px-3 py-2.5 rounded-2xl transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                         ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                      }
                      style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                      onClick={() => onNavigate?.()}
                    >
                      Embracon
                    </NavLink>
                  )}

                  <NavLink
                    to="/simuladores/add"
                    className={({ isActive }) =>
                      `px-3 py-2.5 rounded-2xl transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                       ${isActive ? 'bg-consulmax-primary text-white' : 'hover:bg-consulmax-neutral'}`
                    }
                    style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill))}
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
                style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
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
              style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
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
