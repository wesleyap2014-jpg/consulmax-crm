import { NavLink } from 'react-router-dom'

const items = [
  { to: '/leads', label: 'Leads' },
  { to: '/clientes', label: 'Clientes' },          // 👈 novo item
  { to: '/oportunidades', label: 'Oportunidades' },
  { to: '/agenda', label: 'Agenda' },              // 👈 novo item
  { to: '/simuladores', label: 'Simuladores' },    // 👈 adicionamos aqui
  { to: '/carteira', label: 'Carteira' },          // guia existente
  { to: '/usuarios', label: 'Usuários' },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos' }, // guia existente
  { to: '/parametros', label: 'Parâmetros' }       // guia existente
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white shadow h-[calc(100vh-56px)] sticky top-14 p-3">
      
      {/* Cabeçalho com logo e slogan */}
      <div className="flex items-center gap-3 mb-6 px-2">
        <img
          src="/logo-consulmax.png"
          alt="Consulmax"
          className="h-10 w-10 object-contain rounded-md"
        />
        <div className="flex flex-col">
          <span className="font-bold text-consulmax-primary text-lg">Consulmax</span>
          <span className="text-xs text-consulmax-secondary">
            Maximize as suas conquistas
          </span>
        </div>
      </div>

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
