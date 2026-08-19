import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const scopeLabels: Record<string, string> = {
  vendas: "Vendas",
  pos_venda: "Pós-venda",
  leads: "Leads",
  oportunidades: "Oportunidades",
  simuladores: "Simuladores",
  propostas: "Propostas",
  carteira: "Carteira",
  estoque_contempladas: "Contempladas",
  gestao_grupos: "Gestão de Grupos",
  clientes: "Clientes",
  agenda: "Agenda",
  planejamento: "Planejamento",
  relatorios: "Relatórios",
  comissoes: "Comissões",
  ranking: "Ranking",
  usuarios: "Usuários",
  parametros: "Parâmetros",
  links: "Links",
  procedimentos: "Procedimentos",
  processos: "Processos",
  fluxo_caixa: "Fluxo de Caixa",
  giro_carteira: "Giro de Carteira",
  financeiro: "Financeiro",
  administrativo: "Administrativo",
  lgpd: "LGPD",
  suporte: "Suporte",
};

type Summary = {
  accessProfileName: string | null;
  partnerCategoryName: string | null;
  partnerCategorySince: string | null;
};

function roleLabel(role?: string | null) {
  if (role === "admin") return "Administrador";
  if (role === "gestor") return "Gestor";
  if (role === "vendedor") return "Vendedor";
  if (role === "viewer") return "Operações";
  return role || "Usuário";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export default function ProfileAccessSummary({
  userId,
  role,
  scopes,
}: {
  userId: string;
  role?: string | null;
  scopes?: string[] | null;
}) {
  const [summary, setSummary] = useState<Summary>({
    accessProfileName: null,
    partnerCategoryName: null,
    partnerCategorySince: null,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const assignmentRes = await supabase
          .from("user_access_assignments")
          .select("access_profile_id,partner_category_id,partner_category_since")
          .eq("user_id", userId)
          .maybeSingle();

        if (assignmentRes.error) throw assignmentRes.error;
        const assignment = assignmentRes.data;
        const [profileRes, categoryRes] = await Promise.all([
          assignment?.access_profile_id
            ? supabase.from("access_profiles").select("name").eq("id", assignment.access_profile_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          assignment?.partner_category_id
            ? supabase.from("partner_categories").select("name").eq("id", assignment.partner_category_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!cancelled) {
          setSummary({
            accessProfileName: (profileRes as any)?.data?.name || null,
            partnerCategoryName: (categoryRes as any)?.data?.name || null,
            partnerCategorySince: assignment?.partner_category_since || null,
          });
        }
      } catch (e) {
        console.warn("[ProfileAccessSummary]", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card className="bg-white/95 xl:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#A11C27]/10 text-[#A11C27]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          Perfil de Acesso e Programa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
          <span className="text-slate-500">Perfil de acesso</span>
          <span className="font-extrabold text-slate-900">
            {loaded ? summary.accessProfileName || "Acesso legado atual" : "Carregando…"}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
          <span className="text-slate-500">Papel técnico</span>
          <span className="font-semibold text-slate-800">{roleLabel(role)}</span>
        </div>
        <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
          <span className="text-slate-500">Categoria</span>
          <span className="font-extrabold text-slate-900">
            {loaded ? summary.partnerCategoryName || "Não se aplica" : "Carregando…"}
          </span>
        </div>
        {summary.partnerCategoryName ? (
          <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
            <span className="text-slate-500">Na categoria desde</span>
            <span className="font-semibold text-slate-800">{formatDate(summary.partnerCategorySince)}</span>
          </div>
        ) : null}

        {!summary.accessProfileName && (scopes || []).length ? (
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <UserCog className="h-3.5 w-3.5" /> Escopos legados
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(scopes || []).map((scope) => (
                <Badge key={scope} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                  <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> {scopeLabels[scope] || scope}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
