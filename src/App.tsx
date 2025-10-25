// src/App.tsx
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { Outlet } from 'react-router-dom'

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />

      <div className="flex">
        <Sidebar />

        {/* área central com o liquid glass de fundo */}
        <main className="relative flex-1 p-4 isolate">
          {/* fundo líquido: primeiro filho do container relative */}
          <div className="liquid-bg">
            <span className="blob b1" />
            <span className="blob b2" />
            <span className="gold" />
          </div>

          {/* conteúdo acima do fundo */}
          <div className="relative z-[1]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
