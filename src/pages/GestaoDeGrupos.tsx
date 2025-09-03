import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function calcMediana(maior?: number | null, menor?: number | null) {
  if (maior == null || menor == null) return null;
  return (maior + menor) / 2;
}

/** ------------------------------------------------------
 *  PAINEL EXPANSÍVEL: LOTERIA FEDERAL (sem dialog)
 *  ------------------------------------------------------ */

function PainelLoteria({ onSaved }: { onSaved: (lf: LoteriaFederal) => void }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState<string>("");
  const [form, setForm] = useState<LoteriaFederal>({
    data_sorteio: "",
    primeiro: "",
    segundo: "",
    terceiro: "",
    quarto: "",
    quinto: "",
  });

  const canSave =
    Boolean(data) &&
    Boolean(form.primeiro) &&
    Boolean(form.segundo) &&
    Boolean(form.terceiro) &&
    Boolean(form.quarto) &&
    Boolean(form.quinto);

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
    setAberto(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg">LOTERIA FEDERAL</CardTitle>
        <Button variant="secondary" className="gap-2" onClick={() => setAberto((s) => !s)}>
          <Percent className="h-4 w-4" />
          {aberto ? "Fechar formulário" : "Informar resultados"}
        </Button>
      </div>

      {aberto && (
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <Label>Data do sorteio</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["primeiro", "Primeiro Prêmio"],
              ["segundo", "Segundo Prêmio"],
              ["terceiro", "Terceiro Prêmio"],
              ["quarto", "Quarto Prêmio"],
              ["quinto", "Quinto Prêmio"],
            ].map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label>{label}</Label>
                <Input
                  maxLength={6}
                  inputMode="numeric"
                  pattern="\d*"
                  placeholder="00000"
                  value={(form as any)[key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [key]: sanitizeBilhete5(e.target.value),
                    }))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Sempre 5 dígitos (mantém zeros à esquerda; se digitar 6, guarda os últimos 5).
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button disabled={!canSave} onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ------------------------------------------------------
 *  PAINEL EXPANSÍVEL: ASSEMBLEIAS (salva no Supabase)
 *  ------------------------------------------------------ */

type ResultadoLinha = {
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
  mediana: number | null;
};

function AssembleiasPanel({
  grupos,
  onSaved,
}: {
  grupos: { id: string; codigo: string }[];
  onSaved: (params: {
    date: string;
    next_due_date: string | null;
    next_draw_date: string | null;
    next_assembly_date: string | null;
    remaining_meetings: number | null;
  }) => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [date, setDate] = useState<string>("");
  const [nextDue, setNextDue] = useState<string>("");
  const [nextDraw, setNextDraw] = useState<string>("");
  const [nextAsm, setNextAsm] = useState<string>("");
  const [prazoEnc, setPrazoEnc] = useState<string>("");

  const [linhas, setLinhas] = useState<ResultadoLinha[]>([]);

  // inicializa linhas quando abrir
  useEffect(() => {
    if (!aberto) return;
    const base: ResultadoLinha[] = grupos.map((g) => ({
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
      mediana: null,
    }));
    setLinhas(base);
  }, [aberto, grupos]);

  const upd = (id: string, campo: keyof ResultadoLinha, valor: number | null) => {
    setLinhas((prev) =>
      prev.map((r) => {
        if (r.group_id !== id) return r;
        const next = { ...r, [campo]: valor ?? 0 } as ResultadoLinha;
        if (campo === "ll_maior" || campo === "ll_menor") {
          next.mediana = calcMediana(next.ll_maior, next.ll_menor);
        }
        return next;
      })
    );
  };

  const podeSalvar = Boolean(date) && linhas.length > 0;

  const handleSave = async () => {
    // 1) upsert em assemblies (uma por data)
    const { data: assem, error: errAsm } = await supabase
      .from("assemblies")
      .upsert(
        {
          date,
          next_due_date: nextDue || null,
          next_draw_date: nextDraw || null,
          next_assembly_date: nextAsm || null,
          remaining_meetings: prazoEnc ? Number(prazoEnc) : null,
        },
        { onConflict: "date" }
      )
      .select()
      .single();

    if (errAsm) {
      console.error(errAsm);
      alert("Erro ao salvar a assembleia.");
      return;
    }

    // 2) upsert dos resultados por grupo
    const payload = linhas.map((r) => ({
      assembly_id: assem.id,
      group_id: r.group_id,
      date,
      fixed25_offers: r.fix25_ofertas,
      fixed25_deliveries: r.fix25_entregas,
      fixed50_offers: r.fix50_ofertas,
      fixed50_deliveries: r.fix50_entregas,
      ll_offers: r.ll_ofertas,
      ll_deliveries: r.ll_entregas,
      ll_high: r.ll_maior,
      ll_low: r.ll_menor,
      median: r.mediana,
    }));

    const { error: errRes } = await supabase.from("assembly_results").upsert(payload, {
      onConflict: "assembly_id,group_id",
    });
    if (errRes) {
      console.error(errRes);
      alert("Erro ao salvar os resultados da assembleia.");
      return;
    }

    // 3) atualizar datas futuras e prazo nos grupos editados
    const ids = linhas.map((l) => l.group_id);
    const { error: errGrp } = await supabase
      .from("groups")
      .update({
        prox_vencimento: nextDue || null,
        prox_sorteio: nextDraw || null,
        prox_assembleia: nextAsm || null,
        prazo_encerramento_meses: prazoEnc ? Number(prazoEnc) : null,
      })
      .in("id", ids);

    if (errGrp) console.error(errGrp);

    await onSaved({
      date,
      next_due_date: nextDue || null,
      next_draw_date: nextDraw || null,
      next_assembly_date: nextAsm || null,
      remaining_meetings: prazoEnc ? Number(prazoEnc) : null,
    });

    setAberto(false);
    alert("Resultados salvos com sucesso!");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg">ASSEMBLEIAS</CardTitle>
        <Button variant="secondary" className="gap-2" onClick={() => setAberto((s) => !s)}>
          <Settings className="h-4 w-4" />
          {aberto ? "Fechar formulário" : "Informar resultados"}
        </Button>
      </div>

      {aberto && (
        <div className="rounded-xl border p-4 space-y-4">
          {/* Datas gerais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Data da assembleia</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Vencimento (próximo)</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
            <div>
              <Label>Sorteio (próximo)</Label>
              <Input type="date" value={nextDraw} onChange={(e) => setNextDraw(e.target.value)} />
            </div>
            <div>
              <Label>Próxima assembleia</Label>
              <Input type="date" value={nextAsm} onChange={(e) => setNextAsm(e.target.value)} />
            </div>
            <div>
              <Label>Prazo de encerramento (meses)</Label>
              <Input type="number" min={0} value={prazoEnc} onChange={(e) => setPrazoEnc(e.target.value)} />
            </div>
          </div>

          {/* Tabela por grupo */}
          <div className="max-h-[55vh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-center">25% Entregas</th>
                  <th className="p-2 text-center">25% Ofertas</th>
                  <th className="p-2 text-center">50% Entregas</th>
                  <th className="p-2 text-center">50% Ofertas</th>
                  <th className="p-2 text-center">LL Entregas</th>
                  <th className="p-2 text-center">LL Ofertas</th>
                  <th className="p-2 text-center">LL Maior %</th>
                  <th className="p-2 text-center">LL Menor %</th>
                  <th className="p-2 text-center">Mediana</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.group_id} className="odd:bg-muted/30">
                    <td className="p-2 font-medium">{l.codigo}</td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.fix25_entregas} onChange={(e) => upd(l.group_id, "fix25_entregas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.fix25_ofertas} onChange={(e) => upd(l.group_id, "fix25_ofertas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.fix50_entregas} onChange={(e) => upd(l.group_id, "fix50_entregas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.fix50_ofertas} onChange={(e) => upd(l.group_id, "fix50_ofertas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.ll_entregas} onChange={(e) => upd(l.group_id, "ll_entregas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} value={l.ll_ofertas} onChange={(e) => upd(l.group_id, "ll_ofertas", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} step="0.01" value={l.ll_maior ?? ""} onChange={(e) => upd(l.group_id, "ll_maior", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">
                      <Input type="number" min={0} step="0.01" value={l.ll_menor ?? ""} onChange={(e) => upd(l.group_id, "ll_menor", Number(e.target.value))} />
                    </td>
                    <td className="p-1 text-center">{l.mediana != null ? `${l.mediana.toFixed(2)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button disabled={!podeSalvar} onClick={handleSave}>
              Salvar resultados
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ------------------------------------------------------
 *  PÁGINA PRINCIPAL
 *  ------------------------------------------------------ */

export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loteria, setLoteria] = useState<LoteriaFederal | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: g, error } = await supabase.from("groups").select("*");
      if (error) console.error(error);
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
          <CardHeader className="pb-2">
            <PainelLoteria onSaved={(lf) => setLoteria(lf)} />
          </CardHeader>
          <CardContent className="text-sm grid grid-cols-5 gap-2">
            <div className="col-span-5 text-xs text-muted-foreground">
              {loteria?.data_sorteio
                ? `Sorteio: ${new Date(loteria.data_sorteio).toLocaleDateString()}`
                : "Sem resultado selecionado"}
            </div>
            {(
              [loteria?.primeiro, loteria?.segundo, loteria?.terceiro, loteria?.quarto, loteria?.quinto].filter(
                Boolean
              ) as string[]
            ).map((v, i) => (
              <div key={i} className="px-2 py-1 rounded bg-muted text-center font-mono">
                {v}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <AssembleiasPanel
              grupos={grupos.map((g) => ({ id: g.id, codigo: g.codigo }))}
              onSaved={async () => {
                // (opcional) recarregar dados após salvar
              }}
            />
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
