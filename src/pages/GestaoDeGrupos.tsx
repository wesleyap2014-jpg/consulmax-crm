// src/pages/GestaoDeGrupos.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Filter as FilterIcon,
  Percent,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  X,
} from "lucide-react";

/* =========================================================
   TIPOS
   ========================================================= */
type Administradora = "Embracon" | "HS" | string;
type SegmentoUI = "Automóvel" | "Imóvel" | "Veículo" | "Motocicleta" | "Serviços" | "Pesados" | string;

type Grupo = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
  prazo_encerramento_meses: number | null;
};

type LoteriaFederal = {
  data_sorteio: string;
  primeiro: string;
  segundo: string;
  terceiro: string;
  quarto: string;
  quinto: string;
};

type UltimoResultado = {
  group_id: string;
  date: string | null;
  fixed25_offers: number;
  fixed25_deliveries: number;
  fixed50_offers: number;
  fixed50_deliveries: number;
  ll_offers: number;
  ll_deliveries: number;
  ll_high: number | null;
  ll_low: number | null;
  median: number | null;
};

/* =========================================================
   HELPERS
   ========================================================= */
function normalizeDateStr(d: string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}
function calcMediana(maior?: number | null, menor?: number | null) {
  if (maior == null || menor == null) return null;
  return (maior + menor) / 2;
}
function withinLLMedianFilter(mediana: number | null | undefined, alvo: number | null): boolean {
  if (alvo == null) return true;
  if (mediana == null) return false;
  const min = Math.max(0, alvo * 0.7);
  const max = alvo * 1.3;
  return mediana >= min && mediana <= max;
}
function referenciaPorAdministradora(params: {
  administradora: Administradora;
  participantes: number | null | undefined;
  bilhetes: LoteriaFederal | null;
}): number | null {
  return null; // simplificado p/ este trecho
}

/* =========================================================
   OVERLAY: INFORMAR RESULTADOS
   ========================================================= */
type LinhaAsm = {
  group_id: string;
  codigo: string;
  fix25_entregas: number;
  fix25_ofertas: number;
  fix50_entregas: number;
  fix50_ofertas: number;
  ll_entregas: number;
  ll_ofertas: number;
  ll_maior: number | null;
  ll_menor: number | null;
  prazo_enc_meses: number | null;
};

function OverlayAssembleias({
  gruposBase,
  onClose,
  onSaved,
}: {
  gruposBase: Grupo[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>("");
  const [nextDue, setNextDue] = useState<string>("");
  const [nextDraw, setNextDraw] = useState<string>("");
  const [nextAsm, setNextAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaAsm[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) {
      setLinhas([]);
      return;
    }
    const subset = gruposBase
      .filter((g) => normalizeDateStr(g.prox_assembleia) === normalizeDateStr(date))
      .map<LinhaAsm>((g) => ({
        group_id: g.id,
        codigo: g.codigo,
        fix25_entregas: 0,
        fix25_ofertas: 0,
        fix50_entregas: 0,
        fix50_ofertas: 0,
        ll_entregas: 0,
        ll_ofertas: 0,
        ll_maior: null,
        ll_menor: null,
        prazo_enc_meses: g.prazo_encerramento_meses ?? null,
      }));
    setLinhas(subset);
  }, [date, gruposBase]);

  const upd = (id: string, campo: keyof LinhaAsm, val: number | null) =>
    setLinhas((prev) => prev.map((r) => (r.group_id === id ? { ...r, [campo]: val } : r)));

  const dataPassadaOk = date && date <= today;
  const datasFuturasOk = (!nextDue || nextDue > today) && (!nextDraw || nextDraw > today) && (!nextAsm || nextAsm > today);
  const podeSalvar = dataPassadaOk && datasFuturasOk && linhas.length > 0;

  const handleSave = async () => {
    if (!podeSalvar) {
      alert("Verifique as datas e os grupos selecionados.");
      return;
    }
    try {
      setLoading(true);
      const { data: assem, error: errAsm } = await supabase
        .from("assemblies")
        .upsert(
          { date, next_due_date: nextDue || null, next_draw_date: nextDraw || null, next_assembly_date: nextAsm || null },
          { onConflict: "date" }
        )
        .select()
        .single();
      if (errAsm) throw errAsm;

      const payload = linhas.map((r) => ({
        assembly_id: assem!.id,
        group_id: r.group_id,
        date,
        fixed25_offers: r.fix25_ofertas ?? 0,
        fixed25_deliveries: r.fix25_entregas ?? 0,
        fixed50_offers: r.fix50_ofertas ?? 0,
        fixed50_deliveries: r.fix50_entregas ?? 0,
        ll_offers: r.ll_ofertas ?? 0,
        ll_deliveries: r.ll_entregas ?? 0,
        ll_high: r.ll_maior,
        ll_low: r.ll_menor,
        median: calcMediana(r.ll_maior, r.ll_menor),
      }));
      const { error: errRes } = await supabase.from("assembly_results").upsert(payload, { onConflict: "assembly_id,group_id" });
      if (errRes) throw errRes;

      await Promise.all(
        linhas.map((l) =>
          supabase
            .from("groups")
            .update({ prox_vencimento: nextDue, prox_sorteio: nextDraw, prox_assembleia: nextAsm, prazo_encerramento_meses: l.prazo_enc_meses })
            .eq("id", l.group_id)
        )
      );

      await onSaved();
      alert("Resultados salvos com sucesso!");
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Erro ao salvar os resultados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5" /> Informar resultados da Assembleia
        </h2>
        <Button variant="secondary" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" /> Fechar
        </Button>
      </div>
      <div className="p-5 space-y-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Data da Assembleia</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Ocorrida em</Label>
              <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Informe os dados da próxima assembleia</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Próximo Vencimento</Label><Input type="date" min={today} value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></div>
            <div><Label>Próximo Sorteio</Label><Input type="date" min={today} value={nextDraw} onChange={(e) => setNextDraw(e.target.value)} /></div>
            <div><Label>Próxima Assembleia</Label><Input type="date" min={today} value={nextAsm} onChange={(e) => setNextAsm(e.target.value)} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Grupos dessa assembleia</CardTitle></CardHeader>
          <CardContent>
            {(!date || linhas.length === 0) ? (
              <div className="text-sm text-muted-foreground">Nenhum grupo estava com 'Próx. Assembleia' nessa data.</div>
            ) : (
              <div className="overflow-auto max-h-[60vh] border rounded-xl">
                <table className="w-full text-sm">
                  <thead><tr><th className="p-2">Grupo</th><th className="p-2">25% Entregas</th><th className="p-2">25% Ofertas</th></tr></thead>
                  <tbody>{linhas.map((l) => (<tr key={l.group_id}><td className="p-2">{l.codigo}</td></tr>))}</tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end pt-3"><Button disabled={!podeSalvar || loading} onClick={handleSave}><Save className="h-4 w-4 mr-2" />Salvar Resultados</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* =========================================================
   PÁGINA PRINCIPAL (resumida)
   ========================================================= */
export default function GestaoDeGrupos() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [asmOpen, setAsmOpen] = useState(false);
  const carregar = async () => {
    const { data } = await supabase.from("groups").select("*");
    setGrupos(data || []);
  };
  useEffect(() => { carregar(); }, []);
  return (
    <div className="p-6">
      <Button onClick={() => setAsmOpen(true)}>Informar resultados</Button>
      {asmOpen && <OverlayAssembleias gruposBase={grupos} onClose={() => setAsmOpen(false)} onSaved={carregar} />}
    </div>
  );
}
