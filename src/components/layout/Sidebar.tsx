import { NavLink } from 'react-router-dom'

const items = [
  { to: '/leads', label: 'Leads' },
  { to: '/clientes', label: 'Clientes' },          // 👈 novo item
  { to: '/oportunidades', label: 'Oportunidades' },
  { to: '/agenda', label: 'Agenda' },              // 👈 novo item
  { to: '/carteira', label: 'Carteira' },          // guia existente
  { to: '/usuarios', label: 'Usuários' },
  { to: '/gestao-de-grupos', label: 'Gestão de Grupos' }, // guia existente
  { to: '/parametros', label: 'Parâmetros' }       // guia existente
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white shadow h-[calc(100vh-56px)] sticky top-14 p-3">
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
