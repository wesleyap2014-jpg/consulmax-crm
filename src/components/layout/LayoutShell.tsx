// src/components/layout/LayoutShell.tsx
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
// importe seu Sidebar real
import Sidebar from "@/components/layout/Sidebar";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh flex">
      {/* Sidebar fixa no desktop */}
      <aside className="hidden md:block w-64 shrink-0 border-r">
        <Sidebar />
      </aside>

      {/* Header no mobile com botão de menu */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 border-b bg-background z-50 flex items-center gap-2 px-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="p-2 -ml-1">
            <Menu size={22} />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-xs">
            {/* Fechar o drawer ao navegar: passamos onNavigate */}
            <Sidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="font-semibold">Consulmax CRM</div>
      </div>

      {/* Conteúdo: dá espaço para o header no mobile */}
      <main className="flex-1 w-full pt-14 md:pt-0">{children}</main>
    </div>
  );
}
