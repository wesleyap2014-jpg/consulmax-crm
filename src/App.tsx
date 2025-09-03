// src/App.tsx
import React from "react";
import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 border-r">
        <div className="p-4 font-bold text-lg">Consulmax</div>
        {/* Aqui ficam os links de navegação (Leads, Oportunidades, Carteira, Usuários, Gestão de Grupos) */}
      </aside>

      {/* Área de conteúdo */}
      <main className="flex-1 overflow-y-auto">
        {/* Header fixo */}
        <header className="p-4 border-b flex justify-between items-center">
          <h1 className="text-xl font-semibold">CRM Consulmax</h1>
          <button className="text-sm text-gray-600">Sair</button>
        </header>

        {/* 🔑 Onde as páginas carregam */}
        <div className="p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
