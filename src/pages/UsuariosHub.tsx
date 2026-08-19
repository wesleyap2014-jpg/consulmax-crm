import React from "react";
import { ShieldCheck, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Usuarios from "./Usuarios";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/access/AccessContext";

export default function UsuariosHub() {
  const navigate = useNavigate();
  const { isAdmin } = useAccess();

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="font-black text-slate-900">Perfis, permissões e categorias</div>
              <div className="mt-0.5 max-w-3xl text-sm text-slate-500">
                Crie Perfis de Usuário, escolha quais guias aparecem no menu, defina informações e ações permitidas e atribua a categoria do Programa de Parceiros.
              </div>
            </div>
          </div>
          <Button onClick={() => navigate("/usuarios/perfis")} className="bg-[#A11C27] hover:bg-[#861720]">
            <UsersRound className="mr-2 h-4 w-4" /> Gerenciar Perfis
          </Button>
        </section>
      ) : null}

      <Usuarios />
    </div>
  );
}
