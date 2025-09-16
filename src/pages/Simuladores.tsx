// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pencil, X, ChevronLeft, ChevronRight } from "lucide-react";

/* =========================================================
   Tipos
   ========================================================= */
type UUID = string;

type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string };

type SimTable = {
  id: UUID;
  admin_id: UUID;
  segmento: string;
  nome_tabela: string;
  faixa_min: number;
  faixa_max: number;
  prazo_limite: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  antecip_pct: number;
  antecip_parcelas: number;
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  permite_lance_embutido: boolean;
  permite_lance_fixo_25: boolean;
  permite_lance_fixo_50: boolean;
  permite_lance_livre: boolean;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
  indice_correcao: string[];
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* =========================================================
   PillTabs (substitui shadcn/ui/tabs para evitar erro no build)
   ========================================================= */
function PillTabs({
  value,
  onChange,
  items,
}: {
  value: string | null;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={
              "px-4 py-2 rounded-2xl border transition-colors " +
              (active
                ? "bg-consulmax-primary text-white border-consulmax-primary"
                : "bg-white hover:bg-consulmax-neutral border-gray-200")
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   Helpers
   ========================================================= */
const brMoney = (v: number) =>
  isFinite(v)
    ? v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      })
    : "";

const parseMoney = (s: string) => {
  const onlyDigits = s.replace(/\D+/g, "");
  if (!onlyDigits) return 0;
  return Number(onlyDigits) / 100;
};

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";
const pctToInput = (v: number) => (v * 100).toFixed(4).replace(".", ",");
const inputToPct = (s: string) => {
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return isFinite(n) ? n / 100 : 0;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if (segmento?.toLowerCase() === "motocicleta" && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/* =========================================================
   Cálculo (com regra especial 2ª parcela c/ antecipação)
   ========================================================= */
type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;

  taxaAdmFull: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: 0 | 1 | 2;
  limitadorPct: number;
  seguroPrestPct: number;

  lanceOfertPct: number;
  lanceEmbutPct: number;
  parcContemplacao: number;
};

function calcularSimulacao(i: CalcInput) {
  const {
    credito: C,
    prazoVenda,
    forma,
    seguro,
    segmento,
    taxaAdmFull,
    frPct,
    antecipPct,
    antecipParcelas,
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  // TA efetiva p/ parcelamento (antecipação sai daqui)
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  // Valor de categoria (base das regras)
  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  // Fundo comum (forma de contratação)
  const fundoComumFactor =
    forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  // Parcela base sem seguro
  const baseMensalSemSeguro =
    (C * fundoComumFactor + C * TA_efetiva + C * frPct) / prazo;

  const seguroMensal = seguro ? valorCategoria * i.seguroPrestPct : 0;

  // Antecipação
  const antecipTotal = C * antecipPct;
  const antecipPorParcela =
    antecipParcelas > 0 ? antecipTotal / antecipParcelas : 0;

  // Exibição pré-contemplação
  const parcelaAte =
    baseMensalSemSeguro +
    (antecipParcelas > 0 ? antecipPorParcela : 0) +
    seguroMensal;

  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // Pago até a contemplação (sem seguro)
  const pagoAteContemplacaoSemSeguro =
    baseMensalSemSeguro * parcelasPagas +
    (antecipParcelas > 0
      ? antecipPorParcela * Math.min(parcelasPagas, antecipParcelas)
      : 0);

  // Lances
  const lanceOfertadoValor = C * lanceOfertPct;
  const lanceEmbutidoValor = C * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  // Saldo após contemplação
  const saldoDevedorFinal = Math.max(
    0,
    valorCategoria - pagoAteContemplacaoSemSeguro - lanceOfertadoValor
  );

  // Nova parcela sem limite (média)
  const novaParcelaSemLimite = saldoDevedorFinal / Math.max(1, prazoRestante);

  // Limitador
  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C);
  const parcelaLimitante = limitadorBase > 0 ? valorCategoria * limitadorBase : 0;
  const aplicouLimitador = limitadorBase > 0 && parcelaLimitante > novaParcelaSemLimite;

  const parcelaEscolhida = aplicouLimitador
    ? parcelaLimitante
    : novaParcelaSemLimite;

  // Regra: se antecipação em 2 parcelas e contemplado na 1ª,
  // somar a antecipação também na 2ª parcela.
  let segundaParcelaComAntecipacao = 0;
  let novoPrazo: number;

  if (antecipParcelas === 2 && parcContemplacao === 1) {
    segundaParcelaComAntecipacao = parcelaEscolhida + antecipPorParcela;
    const saldoAposSegunda = Math.max(
      0,
      saldoDevedorFinal - segundaParcelaComAntecipacao
    );
    novoPrazo = Math.ceil(saldoAposSegunda / Math.max(parcelaEscolhida, 1e-9));
  } else {
    novoPrazo = aplicouLimitador
      ? Math.round(saldoDevedorFinal / Math.max(parcelaEscolhida, 1e-9))
      : Math.max(1, prazoRestante);
  }

  return {
    valorCategoria,
    TA_efetiva,
    fundoComumFactor,
    baseMensalSemSeguro,
    antecipPorParcela,
    seguroMensal,

    parcelaAte,
    parcelaDemais,

    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,

    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida,
    segundaParcelaComAntecipacao,
    saldoDevedorFinal,
    novoPrazo,
  };
}

/* =========================================================
   Página
   ========================================================= */
export default function SimuladoresPage() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  const [managerOpen, setManagerOpen] = useState(false);

  // Embracon controls
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  const [segmento, setSegmento] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");
  const [prazoAte, setPrazoAte] = useState<number>(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [creditoText, setCreditoText] = useState<string>("");
  const credito = parseMoney(creditoText);

  const [prazoVenda, setPrazoVenda] = useState<number>(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);

  const [lanceOfertPctText, setLanceOfertPctText] = useState<string>("0,0000");
  const lanceOfertPct = inputToPct(lanceOfertPctText);

  const [lanceEmbutPctText, setLanceEmbutPctText] = useState<string>("0,0000");
  const lanceImputPctRaw = inputToPct(lanceEmbutPctText);
  const lanceEmbutPct = clamp(lanceImputPctRaw, 0, 0.25);

  const [parcContemplacao, setParcContemplacao] = useState<number>(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // bootstrap
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*").order("segmento", { ascending: true }),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins(a ?? []);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      setActiveAdminId(embr?.id ?? (a?.[0]?.id ?? null));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const adminTables = useMemo(
    () => tables.filter((t) => t.admin_id === activeAdminId),
    [tables, activeAdminId]
  );
  const tablesBySegment = useMemo(
    () => adminTables.filter((t) => (segmento ? t.segmento === segmento : true)),
    [adminTables, segmento]
  );
  const tabelaSelecionada = useMemo(
    () => tables.find((t) => t.id === tabelaId) || null,
    [tables, tabelaId]
  );

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]);

  useEffect(() => {
    if (lanceImputPctRaw !== lanceEmbutPct) {
      setLanceEmbutPctText(pctToInput(lanceEmbutPct));
    }
  }, [lanceImputPctRaw, lanceEmbutPct]);

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada &&
    credito > 0 &&
    prazoVenda > 0 &&
    parcContemplacao > 0 &&
    parcContemplacao < prazoVenda;

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: (tabelaSelecionada.antecip_parcelas as 0 | 1 | 2) ?? 0,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
      lanceOfertPct,
      lanceEmbutPct,
      parcContemplacao,
    };
    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
  ]);

  async function salvarSimulacao() {
    if (!tabelaSelecionada || !calc) return;
    setSalvando(true);
    const payload = {
      admin_id: activeAdminId,
      table_id: tabelaSelecionada.id,
      lead_id: leadId || null,
      lead_nome: leadInfo?.nome || null,
      lead_telefone: leadInfo?.telefone || null,
      grupo: grupo || null,
      segmento: tabelaSelecionada.segmento,
      nome_tabela: tabelaSelecionada.nome_tabela,
      credito,
      prazo_venda: prazoVenda,
      forma_contratacao: forma,
      seguro_prestamista: seguroPrest,
      lance_ofertado_pct: inputToPct(lanceOfertPctText),
      lance_embutido_pct: inputToPct(lanceEmbutPctText),
      parcela_contemplacao: parcContemplacao,
      valor_categoria: calc.valorCategoria,
      parcela_ate_1_ou_2: calc.parcelaAte,
      parcela_demais: calc.parcelaDemais,
      lance_ofertado_valor: calc.lanceOfertadoValor,
      lance_embutido_valor: calc.lanceEmbutidoValor,
      lance_proprio_valor: calc.lanceProprioValor,
      lance_percebido_pct: calc.lancePercebidoPct,
      novo_credito: calc.novoCredito,
      nova_parcela_sem_limite: calc.novaParcelaSemLimite,
      parcela_limitante: calc.parcelaLimitante,
      parcela_escolhida: calc.parcelaEscolhida,
      parcela2_antecip: calc.segundaParcelaComAntecipacao,
      saldo_devedor_final: calc.saldoDevedorFinal,
      novo_prazo: calc.novoPrazo,
    };

    const { data, error } = await supabase
      .from("sim_simulations")
      .insert(payload)
      .select("code")
      .single();
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar simulação: " + error.message);
      return;
    }
    setSimCode(data?.code ?? null);
  }

  useEffect(() => {
    if (!managerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setManagerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [managerOpen]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  const adminItems = admins.map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <PillTabs
            value={activeAdminId}
            onChange={(v) => setActiveAdminId(v)}
            items={adminItems}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setManagerOpen(true)} className="rounded-2xl px-4 py-2">
            Gerenciar Tabelas
          </Button>
          <Button variant="secondary" onClick={() => alert("Em breve: adicionar administradora.")} className="rounded-2xl px-4 py-2">
            <Plus className="h-4 w-4 mr-1" /> Adicionar administradora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Simuladores */}
        <Card>
          <CardHeader>
            <CardTitle>Simuladores</CardTitle>
          </CardHeader>
          <CardContent>
            {admins.map((a) =>
              a.id === activeAdminId ? (
                <div key={a.id}>
                  {a.name === "Embracon" ? (
                    <EmbraconSimulator
                      leads={leads}
                      adminTables={adminTables}
                      tablesBySegment={tablesBySegment}
                      tabelaSelecionada={tabelaSelecionada}
                      prazoAte={prazoAte}
                      faixa={faixa}
                      leadId={leadId}
                      setLeadId={setLeadId}
                      leadInfo={leadInfo}
                      grupo={grupo}
                      setGrupo={setGrupo}
                      segmento={segmento}
                      setSegmento={setSegmento}
                      tabelaId={tabelaId}
                      setTabelaId={setTabelaId}
                      credito={credito}
                      creditoText={creditoText}
                      setCreditoText={setCreditoText}
                      prazoVenda={prazoVenda}
                      setPrazoVenda={setPrazoVenda}
                      forma={forma}
                      setForma={setForma}
                      seguroPrest={seguroPrest}
                      setSeguroPrest={setSeguroPrest}
                      lanceOfertPctText={lanceOfertPctText}
                      setLanceOfertPctText={setLanceOfertPctText}
                      lanceEmbutPctText={lanceEmbutPctText}
                      setLanceEmbutPctText={setLanceEmbutPctText}
                      parcContemplacao={parcContemplacao}
                      setParcContemplacao={setParcContemplacao}
                      prazoAviso={prazoAviso}
                      calc={calc}
                      salvar={salvarSimulacao}
                      salvando={salvando}
                      simCode={simCode}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground p-4">
                      Em breve: simulador para <strong>{a.name}</strong>.
                    </div>
                  )}
                </div>
              ) : null
            )}
          </CardContent>
        </Card>

        {/* Memória de Cálculo */}
        <Card>
          <CardHeader>
            <CardTitle>Memória de Cálculo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {tabelaSelecionada ? (
              <>
                <div>Valor de Categoria: <strong>{calc ? brMoney(calc.valorCategoria) : "-"}</strong></div>
                <div>TA efetiva (p/ parcela): <strong>{calc ? pctHuman(calc.TA_efetiva) : "-"}</strong></div>
                <div>Parcela base (sem seguro): <strong>{calc ? brMoney(calc.baseMensalSemSeguro) : "-"}</strong></div>
                <div>Antecipação por parcela: <strong>{calc ? brMoney(calc.antecipPorParcela) : "-"}</strong></div>
                <div>Seguro mensal (exibição): <strong>{calc ? brMoney(calc.seguroMensal) : "-"}</strong></div>
                <div>Nova Parcela (sem limite): <strong>{calc ? brMoney(calc.novaParcelaSemLimite) : "-"}</strong></div>
                <div>Parcela Limitante: <strong>{calc ? brMoney(calc.parcelaLimitante) : "-"}</strong></div>
                <div>Parcela Escolhida: <strong>{calc ? brMoney(calc.parcelaEscolhida) : "-"}</strong></div>
                {calc?.segundaParcelaComAntecipacao > 0 && (
                  <div>Parcela 2 (c/ antecipação): <strong>{brMoney(calc.segundaParcelaComAntecipacao)}</strong></div>
                )}
                <div>Novo Prazo: <strong>{calc ? String(calc.novoPrazo) : "-"}</strong> meses</div>
              </>
            ) : (
              <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overlay: Gerenciar Tabelas */}
      {managerOpen && (
        <TablesManager
          onClose={() => setManagerOpen(false)}
          adminId={activeAdminId!}
          tables={adminTables}
          onReload={async () => {
            const { data } = await supabase.from("sim_tables").select("*");
            (data ?? []).length && setTables(data as any);
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   Embracon UI
   ========================================================= */
type EmbraconProps = {
  leads: Lead[];
  adminTables: SimTable[];
  tablesBySegment: SimTable[];
  tabelaSelecionada: SimTable | null;
  prazoAte: number;
  faixa: { min: number; max: number } | null;
  leadId: string;
  setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string;
  setGrupo: (v: string) => void;

  segmento: string; setSegmento: (v: string) => void;
  tabelaId: string; setTabelaId: (v: string) => void;

  credito: number;
  creditoText: string; setCreditoText: (v: string) => void;
  prazoVenda: number; setPrazoVenda: (v: number) => void;
  forma: FormaContratacao; setForma: (v: FormaContratacao) => void;
  seguroPrest: boolean; setSeguroPrest: (v: boolean) => void;

  lanceOfertPctText: string; setLanceOfertPctText: (v: string) => void;
  lanceEmbutPctText: string; setLanceEmbutPctText: (v: string) => void;
  parcContemplacao: number; setParcContemplacao: (v: number) => void;

  prazoAviso: string | null;
  calc: ReturnType<typeof calcularSimulacao> | null;

  salvar: () => Promise<void>;
  salvando: boolean;
  simCode: number | null;
};

function EmbraconSimulator(p: EmbraconProps) {
  const segmentos = Array.from(new Set(p.adminTables.map((t) => t.segmento)));

  return (
    <div className="space-y-6">
      {/* Seleção de Lead */}
      <Card>
        <CardHeader>
          <CardTitle>Embracon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <Select value={p.leadId} onValueChange={(v) => p.setLeadId(v)}>
                <SelectTrigger><SelectValue placeholder="Escolha um lead" /></SelectTrigger>
                <SelectContent>
                  {p.leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {p.leadInfo && (
                <p className="text-xs text-muted-foreground mt-1">
                  {p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}
                </p>
              )}
            </div>

            <div>
              <Label>Nº do Grupo (opcional)</Label>
              <Input value={p.grupo} onChange={(e) => p.setGrupo(e.target.value)} placeholder="ex.: 9957" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configurações do Plano */}
      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <Select value={p.segmento} onValueChange={(v) => { p.setSegmento(v); p.setTabelaId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o segmento" /></SelectTrigger>
                  <SelectContent>
                    {segmentos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tabela</Label>
                <Select value={p.tabelaId} onValueChange={p.setTabelaId} disabled={!p.segmento}>
                  <SelectTrigger><SelectValue placeholder="Selecione a tabela" /></SelectTrigger>
                  <SelectContent>
                    {p.tablesBySegment.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome_tabela}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Prazo Até</Label>
                <Input value={p.prazoAte || ""} readOnly />
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Configurações da Venda */}
          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Valor do Crédito</Label>
                <Input
                  inputMode="numeric"
                  value={p.creditoText}
                  onChange={(e) => {
                    const val = parseMoney(e.target.value);
                    p.setCreditoText(brMoney(val));
                  }}
                  onFocus={(e) => {
                    const val = parseMoney(e.target.value);
                    e.currentTarget.value = String(val.toFixed(2)).replace(".", ",");
                  }}
                  onBlur={(e) => {
                    const n = Number(e.currentTarget.value.replace(/\./g, "").replace(",", "."));
                    const val = isFinite(n) ? n : 0;
                    p.setCreditoText(brMoney(val));
                  }}
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input
                  type="number"
                  value={p.prazoVenda || ""}
                  onChange={(e) => p.setPrazoVenda(Number(e.target.value))}
                />
                {p.prazoAviso && <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>}
              </div>

              <div>
                <Label>Forma de Contratação</Label>
                <Select value={p.forma} onValueChange={(v) => p.setForma(v as any)} disabled={!p.tabelaSelecionada}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {p.tabelaSelecionada?.contrata_parcela_cheia && <SelectItem value="Parcela Cheia">Parcela Cheia</SelectItem>}
                    {p.tabelaSelecionada?.contrata_reduzida_25 && <SelectItem value="Reduzida 25%">Reduzida 25%</SelectItem>}
                    {p.tabelaSelecionada?.contrata_reduzida_50 && <SelectItem value="Reduzida 50%">Reduzida 50%</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={p.seguroPrest ? "bg-red-600 text-white hover:bg-red-600" : ""}
                    onClick={() => p.setSeguroPrest(true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={!p.seguroPrest ? "bg-red-600 text-white hover:bg-red-600" : ""}
                    onClick={() => p.setSeguroPrest(false)}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>% Taxa de Adm: <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong></div>
                  <div>% Fundo Reserva: <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong></div>
                  <div>% Antecipação: <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> • Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong></div>
                  <div>Limitador de Parcela: <strong>{pctHuman(resolveLimitadorPct(p.tabelaSelecionada.limitador_parcela_pct, p.tabelaSelecionada.segmento, p.credito || 0))}</strong></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plano até a contemplação */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento até a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>
                  {p.tabelaSelecionada?.antecip_parcelas === 2 ? "Parcelas 1 a 2" :
                   p.tabelaSelecionada?.antecip_parcelas === 1 ? "Parcela 1" : "Parcela Inicial"}
                </Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Configurações do lance */}
          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado (%)</Label>
                <Input
                  inputMode="decimal"
                  value={p.lanceOfertPctText}
                  onChange={(e) => p.setLanceOfertPctText(e.target.value)}
                />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <Input
                  inputMode="decimal"
                  value={p.lanceEmbutPctText}
                  onChange={(e) => {
                    const frac = inputToPct(e.target.value);
                    if (frac > 0.25) {
                      alert("Lance embutido limitado a 25,0000% do crédito. Voltando para 25,0000%.");
                      p.setLanceEmbutPctText("25,0000");
                    } else {
                      p.setLanceEmbutPctText(e.target.value);
                    }
                  }}
                />
              </div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input
                  type="number"
                  value={p.parcContemplacao}
                  onChange={(e) => p.setParcContemplacao(Math.max(1, Number(e.target.value)))}
                />
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          {/* Pós-contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado</Label>
                <Input value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""} readOnly />
              </div>
              <div>
                <Label>Lance Embutido</Label>
                <Input value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""} readOnly />
              </div>
              <div>
                <Label>Lance Próprio</Label>
                <Input value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""} readOnly />
              </div>

              <div>
                <Label>Lance Percebido (%)</Label>
                <Input value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""} readOnly />
              </div>
              <div>
                <Label>Novo Crédito</Label>
                <Input value={p.calc ? brMoney(p.calc.novoCredito) : ""} readOnly />
              </div>
              <div>
                <Label>Nova Parcela (sem limite)</Label>
                <Input value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""} readOnly />
              </div>

              <div>
                <Label>Parcela Limitante</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""} readOnly />
              </div>
              <div>
                <Label>Parcela Escolhida</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""} readOnly />
              </div>
              {p.calc?.segundaParcelaComAntecipacao > 0 && (
                <div>
                  <Label>Parcela 2 (c/ antecipação)</Label>
                  <Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
              <div>
                <Label>Novo Prazo (meses)</Label>
                <Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex items-center gap-3">
            <Button disabled={!p.calc || p.salvando} onClick={p.salvar}>
              {p.salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {p.simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{p.simCode}</strong></span>}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}

/* =========================================================
   Overlay: Gerenciar Tabelas
   ========================================================= */
function TablesManager({
  onClose,
  adminId,
  tables,
  onReload,
}: {
  onClose: () => void;
  adminId: string;
  tables: SimTable[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<SimTable | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const items = useMemo(
    () => tables.filter((t) => t.admin_id === adminId),
    [tables, adminId]
  );
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  async function remove(id: string) {
    if (!confirm("Excluir esta tabela?")) return;
    const { error } = await supabase.from("sim_tables").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
    } else {
      await onReload();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">Gerenciar Tabelas</h3>
          <Button variant="secondary" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <div className="p-4">
          {!editing && !creating && (
            <>
              <div className="flex justify-between mb-3">
                <div className="text-sm text-muted-foreground">
                  {items.length} tabela(s) • página {page} de {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setCreating(true)}
                    className="rounded-2xl"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Nova Tabela
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-2">Segmento</th>
                      <th className="py-2 pr-2">Tabela</th>
                      <th className="py-2 pr-2">Prazo</th>
                      <th className="py-2 pr-2">% Adm</th>
                      <th className="py-2 pr-2">% FR</th>
                      <th className="py-2 pr-2">% Antecip</th>
                      <th className="py-2 pr-2">Parc Ant</th>
                      <th className="py-2 pr-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="py-2 pr-2">{t.segmento}</td>
                        <td className="py-2 pr-2">{t.nome_tabela}</td>
                        <td className="py-2 pr-2">{t.prazo_limite}</td>
                        <td className="py-2 pr-2">{pctHuman(t.taxa_adm_pct)}</td>
                        <td className="py-2 pr-2">{pctHuman(t.fundo_reserva_pct)}</td>
                        <td className="py-2 pr-2">{pctHuman(t.antecip_pct)}</td>
                        <td className="py-2 pr-2">{t.antecip_parcelas}</td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                              <Pencil className="h-4 w-4 mr-1" /> Editar
                            </Button>
                            <Button size="sm" variant="secondary" className="bg-red-600 text-white hover:bg-red-600" onClick={() => remove(t.id)}>
                              <Trash2 className="h-4 w-4 mr-1" /> Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pageItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-muted-foreground">
                          Nenhuma tabela nesta página.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <div className="text-sm">
                  Página {page} de {totalPages}
                </div>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {(editing || creating) && (
            <TableForm
              adminId={adminId}
              initial={editing ?? undefined}
              onCancel={() => { setEditing(null); setCreating(false); }}
              onSaved={async () => { setEditing(null); setCreating(false); await onReload(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TableForm({
  adminId,
  initial,
  onCancel,
  onSaved,
}: {
  adminId: string;
  initial?: SimTable;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<SimTable>>(
    initial ?? {
      admin_id: adminId,
      segmento: "",
      nome_tabela: "",
      faixa_min: 0,
      faixa_max: 0,
      prazo_limite: 0,
      taxa_adm_pct: 0,
      fundo_reserva_pct: 0,
      antecip_pct: 0,
      antecip_parcelas: 0,
      limitador_parcela_pct: 0,
      seguro_prest_pct: 0,
      permite_lance_embutido: true,
      permite_lance_fixo_25: true,
      permite_lance_fixo_50: true,
      permite_lance_livre: true,
      contrata_parcela_cheia: true,
      contrata_reduzida_25: true,
      contrata_reduzida_50: true,
      indice_correcao: ["IPCA"],
    }
  );

  const isEdit = !!initial;

  async function save() {
    const payload = { ...form, admin_id: adminId } as any;
    const pctKeys: (keyof SimTable)[] = [
      "taxa_adm_pct",
      "fundo_reserva_pct",
      "antecip_pct",
      "limitador_parcela_pct",
      "seguro_prest_pct",
    ];
    pctKeys.forEach((k) => {
      const v = (payload[k] ?? 0) as number;
      if (v > 1.0000001) payload[k] = Number(v) / 100;
    });

    if (isEdit) {
      const { error } = await supabase.from("sim_tables").update(payload).eq("id", initial!.id);
      if (error) return alert("Erro ao salvar: " + error.message);
    } else {
      const { error } = await supabase.from("sim_tables").insert(payload);
      if (error) return alert("Erro ao salvar tabela: " + error.message);
    }
    await onSaved();
  }

  return (
    <div className="bg-muted/40 rounded-xl p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Segmento</Label>
          <Input value={form.segmento || ""} onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value }))} />
        </div>
        <div>
          <Label>Nome da Tabela</Label>
          <Input value={form.nome_tabela || ""} onChange={(e) => setForm((f) => ({ ...f, nome_tabela: e.target.value }))} />
        </div>

        <div>
          <Label>Faixa (mín)</Label>
          <Input
            value={String(form.faixa_min ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, faixa_min: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Faixa (máx)</Label>
          <Input
            value={String(form.faixa_max ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, faixa_max: Number(e.target.value) }))}
          />
        </div>

        <div>
          <Label>Prazo Limite (meses)</Label>
          <Input
            value={String(form.prazo_limite ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, prazo_limite: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>% Taxa Adm</Label>
          <Input
            value={String(form.taxa_adm_pct ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, taxa_adm_pct: Number(e.target.value) }))}
            placeholder="22 (para 22%)"
          />
        </div>

        <div>
          <Label>% Fundo Reserva</Label>
          <Input
            value={String(form.fundo_reserva_pct ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, fundo_reserva_pct: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>% Antecipação da Adm</Label>
          <Input
            value={String(form.antecip_pct ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, antecip_pct: Number(e.target.value) }))}
          />
        </div>

        <div>
          <Label>Parcelas da Antecipação</Label>
          <Input
            value={String(form.antecip_parcelas ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, antecip_parcelas: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>% Limitador Parcela</Label>
          <Input
            value={String(form.limitador_parcela_pct ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, limitador_parcela_pct: Number(e.target.value) }))}
          />
        </div>

        <div>
          <Label>% Seguro por parcela</Label>
          <Input
            value={String(form.seguro_prest_pct ?? 0)}
            onChange={(e) => setForm((f) => ({ ...f, seguro_prest_pct: Number(e.target.value) }))}
          />
        </div>

        <div className="md:col-span-2">
          <Label>Lances Permitidos</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.permite_lance_embutido}
                onChange={(e) => setForm((f) => ({ ...f, permite_lance_embutido: e.target.checked }))} /> Embutido
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.permite_lance_fixo_25}
                onChange={(e) => setForm((f) => ({ ...f, permite_lance_fixo_25: e.target.checked }))} /> Fixo 25%
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.permite_lance_fixo_50}
                onChange={(e) => setForm((f) => ({ ...f, permite_lance_fixo_50: e.target.checked }))} /> Fixo 50%
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.permite_lance_livre}
                onChange={(e) => setForm((f) => ({ ...f, permite_lance_livre: e.target.checked }))} /> Livre
            </label>
          </div>
        </div>

        <div className="md:col-span-2">
          <Label>Formas de Contratação</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.contrata_parcela_cheia}
                onChange={(e) => setForm((f) => ({ ...f, contrata_parcela_cheia: e.target.checked }))} /> Parcela Cheia
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.contrata_reduzida_25}
                onChange={(e) => setForm((f) => ({ ...f, contrata_reduzida_25: e.target.checked }))} /> Reduzida 25%
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.contrata_reduzida_50}
                onChange={(e) => setForm((f) => ({ ...f, contrata_reduzida_50: e.target.checked }))} /> Reduzida 50%
            </label>
          </div>
        </div>

        <div className="md:col-span-2">
          <Label>Índice de Correção (separe por vírgula)</Label>
          <Input
            value={(form.indice_correcao ?? []).join(",")}
            onChange={(e) =>
              setForm((f) => ({ ...f, indice_correcao: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))
            }
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={save}>{isEdit ? "Salvar" : "Salvar Tabela"}</Button>
      </div>
    </div>
  );
}
