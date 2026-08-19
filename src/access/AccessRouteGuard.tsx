import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccess } from "./AccessContext";

export default function AccessRouteGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, canAccessPath, accessProfile, legacyMode } = useAccess();

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm font-semibold text-slate-500">
        Validando permissões…
      </div>
    );
  }

  if (!canAccessPath(location.pathname)) {
    return (
      <Card className="mx-auto mt-10 max-w-xl border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]">
            <ShieldX className="h-6 w-6" />
          </div>
          <div className="text-lg font-black text-slate-900">Acesso não liberado para este perfil</div>
          <div className="max-w-md text-sm text-slate-500">
            {legacyMode
              ? "A rota não está disponível para este usuário."
              : `O perfil ${accessProfile?.name || "atual"} não possui acesso a esta guia ou recurso.`}
          </div>
          <Button variant="outline" onClick={() => navigate("/inicio", { replace: true })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Início
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
