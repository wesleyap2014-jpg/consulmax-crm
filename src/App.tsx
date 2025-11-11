// src/App.tsx
import React from "react";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="min-h-screen w-full bg-white text-foreground">
      <Header />

      <div className="flex">
        {/* Sidebar fixa/colável (onNavigate fecha drawer no mobile, se houver) */}
        <Sidebar onNavigate={() => {}} />

        {/* Área central com fundo "liquid glass" */}
        <main
          role="main"
          className="relative flex-1 p-4 md:p-6 isolate min-h-[calc(100vh-56px)] overflow-auto"
        >
          {/* CSS do efeito embutido para não depender de arquivo externo */}
          <style>{`
            .liquid-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
            .liquid-bg .blob{position:absolute;width:320px;height:320px;border-radius:50%;filter:blur(40px);opacity:.55}
            .liquid-bg .b1{left:-80px;top:-60px;background:radial-gradient(closest-side,#A11C27,rgba(161,28,39,0));animation:float1 26s ease-in-out infinite}
            .liquid-bg .b2{right:-90px;bottom:-60px;background:radial-gradient(closest-side,#1E293F,rgba(30,41,63,0));animation:float2 30s ease-in-out infinite}
            .liquid-bg .gold{position:absolute;right:-60px;top:45%;width:180px;height:180px;border-radius:50%;
              background:radial-gradient(closest-side,rgba(181,165,115,.35),rgba(181,165,115,0));filter:blur(30px);opacity:.6}
            @keyframes float1{0%{transform:translate(0,0) scale(1)}50%{transform:translate(18px,14px) scale(1.06)}100%{transform:translate(0,0) scale(1)}}
            @keyframes float2{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-16px,-10px) scale(1.05)}100%{transform:translate(0,0) scale(1)}}
          `}</style>

          {/* fundo líquido */}
          <div className="liquid-bg">
            <span className="blob b1" />
            <span className="blob b2" />
            <span className="gold" />
          </div>

          {/* conteúdo acima do fundo */}
          <div className="relative z-[1]">
            <React.Suspense
              fallback={
                <div className="p-4 text-sm text-gray-600">
                  Carregando conteúdo…
                </div>
              }
            >
              <Outlet />
            </React.Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
