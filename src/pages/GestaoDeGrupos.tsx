import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Filter as FilterIcon, Percent, Settings } from "lucide-react";

/** ------------------------------------------------------
 *  TIPOS DE DADOS
 *  ------------------------------------------------------ */

type Administradora = "Embracon" | "HS" | string;

type SegmentoUI =
  | "Automóvel"
  | "Imóvel"
  | "Veículo"
  | "Motocicleta"
  | "Serviços"
  | "Pesados"
  | string;

type Grupo = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string; // ex.: 1234/5
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

/** ------------------------------------------------------
 *  HELPERS
 *  ------------------------------------------------------ */

function sanitizeBilhete5(value: string): string {
  const onlyDigits = (value || "").replace(/\D/g, "");
  if (onlyDigits.length <= 5) return onlyDigits.padStart(5, "0");
  return onlyDigits.slice(-5);
}

/** ------------------------------------------------------
 *  MODAL: LOTERIA FEDERAL
 *  ------------------------------------------------------ */

function ModalLoteria({ onSaved }: { onSaved: (lf: LoteriaFederal) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<string>("");
  const [form, setForm] = useState<LoteriaFederal>({
    data_sorteio: "",
    primeiro: "",
    segundo: "",
    terceiro: "",
    quarto: "",
    quinto: "",
  });

  const canSave = data && form.primeiro && form.segundo && form.terceiro && form.quarto && form.quinto;

  const handleSave = async () => {
    const payload: LoteriaFederal = { ...form, data_sorteio: data };
    try {
      await supabase.from("lottery_draws").upsert({
        draw_date: payload.data_sorteio,
        first: payload.primeiro,
        second: payload.segundo,
        third: payload.terceiro,
        fourth: payload.quarto,
        fifth: payload.quinto,
      });
    } catch (e) {
      console.error(e);
    }
    onSaved(payload);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Percent className="h-4 w-4" /> Informar resultados
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Loteria Federal — Informar Resultados</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Data do sorteio</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          {["Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto"].map((label, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <Label>{label} Prêmio</Label>
              <Input
                maxLength={6}
                inputMode="numeric"
                pattern="\d*"
                placeholder="00000"
                value={(form as any)[label.toLowerCase()]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    [label.toLowerCase()]: sanitizeBilhete5(e.target.value),
                  }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={!canSave} onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ------------------------------------------------------
 *  COMPONENTE PRINCIPAL
 *  ------------------------------------------------------ */

export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loteria, setLoteria] = useState<LoteriaFederal | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: g } = await supabase.from("groups").select("*");
      setGrupos(
        (g || []).map((r: any) => ({
          id: r.id,
          administradora: r.administradora,
          segmento: r.segmento === "Imóvel Estendido" ? "Imóvel" : r.segmento,
          codigo: r.codigo,
          participantes: r.participantes,
          faixa_min: r.faixa_min,
          faixa_max: r.faixa_max,
          prox_vencimento: r.prox_vencimento,
          prox_sorteio: r.prox_sorteio,
          prox_assembleia: r.prox_assembleia,
          prazo_encerramento_meses: r.prazo_encerramento_meses,
        }))
      );
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">GESTÃO DE GRUPOS</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Visão consolidada por grupo: resultados de assembleias, filtros e referência do sorteio.
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-lg">LOTERIA FEDERAL</CardTitle>
            <ModalLoteria onSaved={(lf) => setLoteria(lf)} />
          </CardHeader>
          <CardContent className="text-sm grid grid-cols-5 gap-2">
            <div className="col-span-5 text-xs text-muted-foreground">
              {loteria?.data_sorteio ? `Sorteio: ${new Date(loteria.data_sorteio).toLocaleDateString()}` : "Sem resultado selecionado"}
            </div>
            {([loteria?.primeiro, loteria?.segundo, loteria?.terceiro, loteria?.quarto, loteria?.quinto].filter(Boolean) as string[]).map((v, i) => (
              <div key={i} className="px-2 py-1 rounded bg-muted text-center font-mono">
                {v}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-lg">ASSEMBLEIAS</CardTitle>
            <Button variant="secondary" className="gap-2">
              <Settings className="h-4 w-4" /> Informar resultados
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Informe resultados por data e atualize os prazos do grupo.
          </CardContent>
        </Card>
      </div>

      {/* Tabela de grupos */}
      <div className="rounded-2xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 sticky top-0 backdrop-blur">
            <tr>
              <th className="p-2 text-left">ADMINISTRADORA</th>
              <th className="p-2 text-left">SEGMENTO</th>
              <th className="p-2 text-left">GRUPO</th>
              <th className="p-2 text-right">PARTICIPANTES</th>
              <th className="p-2 text-center">FAIXA DE CRÉDITO</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Carregando…
                </td>
              </tr>
            ) : grupos.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Sem registros de grupos.
                </td>
              </tr>
            ) : (
              grupos.map((g) => (
                <tr key={g.id} className="odd:bg-muted/30">
                  <td className="p-2">{g.administradora}</td>
                  <td className="p-2">{g.segmento}</td>
                  <td className="p-2 font-medium">{g.codigo}</td>
                  <td className="p-2 text-right">{g.participantes ?? "—"}</td>
                  <td className="p-2 text-center">
                    {g.faixa_min != null && g.faixa_max != null
                      ? g.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) +
                        " — " +
                        g.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
