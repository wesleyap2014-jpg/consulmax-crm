// src/App.tsx
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Routes, Route, Navigate } from "react-router-dom";

import Simuladores from "@/pages/Simuladores";
import Propostas from "@/pages/Propostas";

function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        O endereço acessado não existe.{" "}
        <a href="/simuladores" className="text-primary underline">
          Voltar aos simuladores
        </a>
        .
      </p>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4">
          <Routes>
            {/* Redireciona raiz para Simuladores */}
            <Route path="/" element={<Navigate to="/simuladores" replace />} />

            {/* Páginas */}
            <Route path="/simuladores" element={<Simuladores />} />
            <Route path="/propostas" element={<Propostas />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
