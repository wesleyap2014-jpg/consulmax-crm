import { NavLink, Link } from 'react-router-dom'

const items = [
  { to: '/leads', label: 'Leads' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/oportunidades', label: 'Oportunidades' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/simuladores', label: 'Simuladores' },
  { to: '/carteira', label: 'Carteira' },
  { to: '/usuarios', label: 'Usuários' },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos' },
  { to: '/parametros', label: 'Parâmetros' },
]

// usa caminho absoluto do Vite/public + cache-bust
const LOGO_URL = '/logo-consulmax.png?v=3'
const FALLBACK_URL = '/favicon.ico?v=3'

export default function Sidebar() {
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
      </nav>
    </aside>
  )
}
