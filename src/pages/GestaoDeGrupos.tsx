import React, { useEffect, useMemo, useState } from "react";
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

function withinLLMedianFilter(mediana: number | null | undefined, alvo: number | null): boolean {
  if (alvo == null) return true;
  if (mediana == null) return false;
  // alvo ±15% (ex.: alvo 45 → faixa 30..60)
  const min = Math.max(0, alvo * 0.70);
  const max = alvo * 1.30;
  return mediana >= min && mediana <= max;
}

/** Regras de Referência (Embracon/HS) */
function referenciaPorAdministradora(params: {
  administradora: Administradora;
  participantes: number | null | undefined;
  bilhetes: LoteriaFederal | null; // usa a data selecionada ativa
}): number | null {
  const { administradora, participantes, bilhetes } = params;
  if (!participantes || participantes <= 0 || !bilhetes) return null;

  const premios = [bilhetes.primeiro, bilhetes.segundo, bilhetes.terceiro, bilhetes.quarto, bilhetes.quinto];

  function reduceByCap(n: number, cap: number): number {
    if (cap <= 0) return 0;
    let v = n;
    while (v > cap) v -= cap;
    if (v === 0) v = cap;
    return v;
  }

  function tryTresUltimosOuInicio(num5: string, cap: number): number | null {
    const ult3 = parseInt(num5.slice(-3));
    if (ult3 >= 1 && ult3 <= cap) return ult3;
    const alt = parseInt(num5.slice(0, 3));
    if (alt >= 1 && alt <= cap) return alt;
    return null;
  }

  for (const premio of premios) {
    const p5 = sanitizeBilhete5(premio);

    if (administradora.toLowerCase() === "embracon") {
      if (participantes <= 1000) {
        const tentativa = tryTresUltimosOuInicio(p5, participantes);
        if (tentativa != null) return tentativa;
        continue; // tenta próximo prêmio
      } else if (participantes >= 5000) {
        const quatro = parseInt(p5.slice(-4));
        const ajustado = reduceByCap(quatro, 5000);
        if (ajustado >= 1 && ajustado <= 5000) return ajustado;
        continue;
      } else {
        // 1001..4999 → estratégia conservadora: 4 últimos reduzindo pelo cap real
        const quatro = parseInt(p5.slice(-4));
        return reduceByCap(quatro, participantes);
      }
    }

    if (administradora.toLowerCase() === "hs") {
      const quatro = parseInt(p5.slice(-4));
      return reduceByCap(quatro, participantes);
    }

    // padrão: 3 últimos reduzindo por cap
    const tres = parseInt(p5.slice(-3));
    return reduceByCap(tres, participantes);
  }

  return null;
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

type LinhaUI = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;

  // resultados
  total_entregas: number;
  fix25_entregas: number;
  fix25_ofertas: number;
  fix50_entregas: number;
  fix50_ofertas: number;
  ll_entregas: number;
  ll_ofertas: number;
  ll_maior: number | null;
  ll_menor: number | null;
  mediana: number | null;

  apuracao_dia: string | null;
  prazo_encerramento_meses: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;

  referencia: number | null;
};

export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [rows, setRows] = useState<LinhaUI[]>([]);
  const [loteria, setLoteria] = useState<LoteriaFederal | null>(null);

  // filtros
  const [fAdmin, setFAdmin] = useState("");
  const [fSeg, setFSeg] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fFaixa, setFFaixa] = useState("");
  const [fMedianaAlvo, setFMedianaAlvo] = useState("");

  // carrega grupos e últimos resultados
  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: g, error: gErr } = await supabase
        .from("groups")
        .select("id, administradora, segmento, codigo, participantes, faixa_min, faixa_max, prox_vencimento, prox_sorteio, prox_assembleia, prazo_encerramento_meses");
      if (gErr) console.error(gErr);

      const gruposFetched: Grupo[] =
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
        })) || [];

      setGrupos(gruposFetched);

      // últimos resultados por grupo (view)
      const { data: ar, error: arErr } = await supabase
        .from("v_group_last_assembly")
        .select("group_id, date, fixed25_offers, fixed25_deliveries, fixed50_offers, fixed50_deliveries, ll_offers, ll_deliveries, ll_high, ll_low, median");

      if (arErr) console.error(arErr);

      const byGroup = new Map<string, UltimoResultado>();
      (ar || []).forEach((r: any) => byGroup.set(r.group_id, r));

      const linhas: LinhaUI[] = gruposFetched.map((g) => {
        const r = byGroup.get(g.id);
        const t25 = r?.fixed25_deliveries || 0;
        const t50 = r?.fixed50_deliveries || 0;
        const tLL = r?.ll_deliveries || 0;
        const total = t25 + t50 + tLL;
        const med = r?.median ?? calcMediana(r?.ll_high ?? null, r?.ll_low ?? null);

        return {
          id: g.id,
          administradora: g.administradora,
          segmento: g.segmento,
          codigo: g.codigo,
          participantes: g.participantes,
          faixa_min: g.faixa_min,
          faixa_max: g.faixa_max,

          total_entregas: total,
          fix25_entregas: t25,
          fix25_ofertas: r?.fixed25_offers || 0,
          fix50_entregas: t50,
          fix50_ofertas: r?.fixed50_offers || 0,
          ll_entregas: tLL,
          ll_ofertas: r?.ll_offers || 0,
          ll_maior: r?.ll_high ?? null,
          ll_menor: r?.ll_low ?? null,
          mediana: med,

          apuracao_dia: r?.date ?? null,
          prazo_encerramento_meses: g.prazo_encerramento_meses,
          prox_vencimento: g.prox_vencimento,
          prox_sorteio: g.prox_sorteio,
          prox_assembleia: g.prox_assembleia,

          referencia: referenciaPorAdministradora({
            administradora: g.administradora,
            participantes: g.participantes,
            bilhetes: loteria,
          }),
        };
      });

      setRows(linhas);
      setLoading(false);
    })();
  }, [loteria]); // recalcula referência quando informar novo sorteio

  // aplica filtros
  const filtered = useMemo(() => {
    const alvo = fMedianaAlvo ? Number(fMedianaAlvo) : null;
    return rows.filter((r) => {
      const faixaStr = `${r.faixa_min ?? ""}-${r.faixa_max ?? ""}`;
      return (
        (!fAdmin || r.administradora.toLowerCase().includes(fAdmin.toLowerCase())) &&
        (!fSeg || r.segmento.toLowerCase().includes(fSeg.toLowerCase())) &&
        (!fGrupo || r.codigo.toLowerCase().includes(fGrupo.toLowerCase())) &&
        (!fFaixa || faixaStr.includes(fFaixa)) &&
        withinLLMedianFilter(r.mediana, alvo)
      );
    });
  }, [rows, fAdmin, fSeg, fGrupo, fFaixa, fMedianaAlvo]);

  const totalEntregas = useMemo(() => filtered.reduce((acc, r) => acc + r.total_entregas, 0), [filtered]);

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
                // (opcional) recarregar depois de salvar
              }}
            />
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Informe resultados por data e atualize os prazos do grupo.
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FilterIcon className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label>Administradora</Label>
            <Input value={fAdmin} onChange={(e) => setFAdmin(e.target.value)} placeholder="Filtrar Administradora" />
          </div>
          <div>
            <Label>Segmento</Label>
            <Input value={fSeg} onChange={(e) => setFSeg(e.target.value)} placeholder="Filtrar Segmento" />
          </div>
          <div>
            <Label>Grupo</Label>
            <Input value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Filtrar Grupo" />
          </div>
          <div>
            <Label>Faixa de Crédito</Label>
            <Input value={fFaixa} onChange={(e) => setFFaixa(e.target.value)} placeholder="ex.: 80000-120000" />
          </div>
          <div>
            <Label>% Lance Livre (mediana ±15%)</Label>
            <Input
              type="number"
              step="0.01"
              value={fMedianaAlvo}
              onChange={(e) => setFMedianaAlvo(e.target.value)}
              placeholder="ex.: 45"
            />
            <p className="text-xs text-muted-foreground mt-1">Ex.: 45 → mostra grupos com mediana entre 30% e 60%.</p>
          </div>
        </CardContent>
      </Card>

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
              <th className="p-2 text-right">Total Entregas</th>
              <th className="p-2 text-right">25% Entregas</th>
              <th className="p-2 text-right">25% Ofertas</th>
              <th className="p-2 text-right">50% Entregas</th>
              <th className="p-2 text-right">50% Ofertas</th>
              <th className="p-2 text-right">LL Entregas</th>
              <th className="p-2 text-right">LL Ofertas</th>
              <th className="p-2 text-right">Maior %</th>
              <th className="p-2 text-right">Menor %</th>
              <th className="p-2 text-right">Mediana</th>
              <th className="p-2 text-center">Apuração Dia</th>
              <th className="p-2 text-center">Pz Enc</th>
              <th className="p-2 text-center">Vencimento</th>
              <th className="p-2 text-center">Sorteio</th>
              <th className="p-2 text-center">Assembleia</th>
              <th className="p-2 text-right">Referência</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={21} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Carregando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={21} className="p-6 text-center text-muted-foreground">
                  Sem registros para os filtros aplicados.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="odd:bg-muted/30">
                  <td className="p-2">{r.administradora}</td>
                  <td className="p-2">{r.segmento}</td>
                  <td className="p-2 font-medium">{r.codigo}</td>
                  <td className="p-2 text-right">{r.participantes ?? "—"}</td>
                  <td className="p-2 text-center">
                    {r.faixa_min != null && r.faixa_max != null
                      ? r.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) +
                        " — " +
                        r.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </td>
                  <td className="p-2 text-right font-semibold">{r.total_entregas}</td>
                  <td className="p-2 text-right">{r.fix25_entregas}</td>
                  <td className="p-2 text-right">{r.fix25_ofertas}</td>
                  <td className="p-2 text-right">{r.fix50_entregas}</td>
                  <td className="p-2 text-right">{r.fix50_ofertas}</td>
                  <td className="p-2 text-right">{r.ll_entregas}</td>
                  <td className="p-2 text-right">{r.ll_ofertas}</td>
                  <td className="p-2 text-right">{r.ll_maior != null ? `${r.ll_maior.toFixed(2)}%` : "—"}</td>
                  <td className="p-2 text-right">{r.ll_menor != null ? `${r.ll_menor.toFixed(2)}%` : "—"}</td>
                  <td className="p-2 text-right">{r.mediana != null ? `${r.mediana.toFixed(2)}%` : "—"}</td>
                  <td className="p-2 text-center">{r.apuracao_dia ? new Date(r.apuracao_dia).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-center">{r.prazo_encerramento_meses ?? "—"}</td>
                  <td className="p-2 text-center">{r.prox_vencimento ? new Date(r.prox_vencimento).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-center">{r.prox_sorteio ? new Date(r.prox_sorteio).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-center">{r.prox_assembleia ? new Date(r.prox_assembleia).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-right font-semibold">{r.referencia ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé simples */}
      <div className="text-sm text-muted-foreground">
        Total de entregas (linhas filtradas): <span className="font-semibold text-foreground">{totalEntregas}</span>
      </div>
    </div>
  );
}
