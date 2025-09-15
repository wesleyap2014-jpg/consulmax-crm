// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";

/* =========================================================
   Tipos
   ========================================================= */
type UUID = string;

type Lead = {
  id: UUID;
  nome: string;
  telefone?: string | null;
};

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
   Helpers
   ========================================================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Regra especial do limitador (moto >= 20k vira 1%) */
function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if (segmento?.toLowerCase() === "motocicleta" && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/* =========================================================
   Cálculos
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
  lanceEmbutPct: number; // <= 0.25
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
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);
  const valorCategoria = C * (1 + taxaAdmFull + frPct); // base p/ seguro e limitador

  // Base mensal por forma
  const fundoComumFactor = forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;
  const baseMensalSemSeguro = (C * fundoComumFactor + C * TA_efetiva + C * frPct) / prazo;
  const seguroMensal = seguro ? valorCategoria * i.seguroPrestPct : 0;

  // Antecipação nas 1 ou 2 primeiras
  const antecipAdicionalCada = antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;
  const parcelaAte =
    antecipParcelas === 0
      ? baseMensalSemSeguro + seguroMensal
      : baseMensalSemSeguro + seguroMensal + antecipAdicionalCada;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // Pós-contemplação
  const lanceOfertadoValor = C * lanceOfertPct;
  const lanceEmbutidoValor = C * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  const valorCatNovo = novoCredito * (1 + TA_efetiva + frPct);
  const prazoRestante = Math.max(1, prazo - Math.max(0, i.parcContemplacao));
  const novaParcelaSemLimite = valorCatNovo / prazoRestante + seguroMensal;

  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C);
  const parcelaLimitante = limitadorBase > 0 ? valorCategoria * limitadorBase : 0;
  const aplicaLimitador = limitadorBase > 0;
  const parcelaEscolhida = aplicaLimitador ? Math.max(novaParcelaSemLimite, parcelaLimitante) : novaParcelaSemLimite;

  const saldoDevedorFinal = Math.max(0, valorCatNovo - lanceProprioValor);
  const novoPrazo = Math.max(1, Math.ceil(saldoDevedorFinal / parcelaEscolhida));

  return {
    valorCategoria,
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
    saldoDevedorFinal,
    novoPrazo,
  };
}

/* =========================================================
   Página
   ========================================================= */
export default function Simuladores() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  // Seleção Embracon
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  const [segmento, setSegmento] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");
  const [prazoAte, setPrazoAte] = useState<number>(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState<number>(0);
  const [prazoVenda, setPrazoVenda] = useState<number>(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);

  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0);
  const [parcContemplacao, setParcContemplacao] = useState<number>(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // Carrega admins, tables e leads
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins(a ?? []);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));
      // Embracon como ativa por padrão
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      setActiveAdminId(embr?.id ?? (a?.[0]?.id ?? null));
      setLoading(false);
    })();
  }, []);

  // Lead selecionado
  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  // Tabelas do admin ativo
  const adminTables = useMemo(() => tables.filter((t) => t.admin_id === activeAdminId), [tables, activeAdminId]);

  // Tabelas por segmento
  const tablesBySegment = useMemo(
    () => adminTables.filter((t) => (segmento ? t.segmento === segmento : true)),
    [adminTables, segmento]
  );

  const tabelaSelecionada = useMemo(() => tables.find((t) => t.id === tabelaId) || null, [tables, tabelaId]);

  // Ao escolher tabela, propaga prazo e faixa + valida forma
  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // Validações rápidas
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid) setLanceEmbutPct(lanceEmbutPctValid);
  }, [lanceEmbutPct]); // eslint-disable-line

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  // Recalcula
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
      lanceEmbutPct: lanceEmbutPctValid,
      parcContemplacao,
    };
    setCalc(calcularSimulacao(inp));
  }, [tabelaSelecionada, credito, prazoVenda, forma, seguroPrest, lanceOfertPct, lanceEmbutPctValid, parcContemplacao]); // eslint-disable-line

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
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: lanceEmbutPctValid,
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
      saldo_devedor_final: calc.saldoDevedorFinal,
      novo_prazo: calc.novoPrazo,
    };

    const { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar simulação: " + error.message);
      return;
    }
    setSimCode(data?.code ?? null);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simuladores</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Botões de administradora (substitui Tabs) */}
          <div className="flex flex-wrap gap-2">
            {admins.map((a) => (
              <Button
                key={a.id}
                variant={activeAdminId === a.id ? "default" : "secondary"}
                onClick={() => setActiveAdminId(a.id)}
              >
                {a.name}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              className="ml-2"
              onClick={() => alert("Em breve: adicionar administradora pelo app.")}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>

          {/* Conteúdo da administradora ativa */}
          <div className="mt-6">
            {admins.map((a) =>
              a.id !== activeAdminId ? null : (
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
                      setCredito={setCredito}
                      prazoVenda={prazoVenda}
                      setPrazoVenda={setPrazoVenda}
                      forma={forma}
                      setForma={setForma}
                      seguroPrest={seguroPrest}
                      setSeguroPrest={setSeguroPrest}
                      lanceOfertPct={lanceOfertPct}
                      setLanceOfertPct={setLanceOfertPct}
                      lanceEmbutPct={lanceEmbutPct}
                      setLanceEmbutPct={setLanceEmbutPct}
                      parcContemplacao={parcContemplacao}
                      setParcContemplacao={setParcContemplacao}
                      prazoAviso={prazoAviso}
                      calc={calc}
                      salvar={salvarSimulacao}
                      salvando={salvando}
                      simCode={simCode}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Em breve: simulador para <strong>{a.name}</strong>.
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>
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

  credito: number; setCredito: (v: number) => void;
  prazoVenda: number; setPrazoVenda: (v: number) => void;
  forma: FormaContratacao; setForma: (v: FormaContratacao) => void;
  seguroPrest: boolean; setSeguroPrest: (v: boolean) => void;

  lanceOfertPct: number; setLanceOfertPct: (v: number) => void;
  lanceEmbutPct: number; setLanceEmbutPct: (v: number) => void;
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
              <select
                className="w-full h-10 border rounded-md px-3"
                value={p.leadId}
                onChange={(e) => p.setLeadId(e.target.value)}
              >
                <option value="">Escolha um lead</option>
                {p.leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
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
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.segmento}
                  onChange={(e) => { p.setSegmento(e.target.value); p.setTabelaId(""); }}
                >
                  <option value="">Selecione o segmento</option>
                  {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <Label>Tabela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.tabelaId}
                  disabled={!p.segmento}
                  onChange={(e) => p.setTabelaId(e.target.value)}
                >
                  <option value="">{p.segmento ? "Selecione a tabela" : "Selecione um segmento antes"}</option>
                  {p.tablesBySegment.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome_tabela}</option>
                  ))}
                </select>
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
                  type="number"
                  value={p.credito || ""}
                  onChange={(e) => p.setCredito(Number(e.target.value))}
                  placeholder="Ex.: 100000"
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
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.forma}
                  disabled={!p.tabelaSelecionada}
                  onChange={(e) => p.setForma(e.target.value as any)}
                >
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                </select>
              </div>

              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={p.seguroPrest ? "default" : "secondary"} onClick={() => p.setSeguroPrest(true)}>Sim</Button>
                  <Button type="button" variant={!p.seguroPrest ? "default" : "secondary"} onClick={() => p.setSeguroPrest(false)}>Não</Button>
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
                  type="number" step="0.0001"
                  value={p.lanceOfertPct}
                  onChange={(e) => p.setLanceOfertPct(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <Input
                  type="number" step="0.0001"
                  value={p.lanceEmbutPct}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0.25) {
                      alert("Lance embutido limitado a 25,0000% do crédito. Voltando para 25%.");
                      p.setLanceEmbutPct(0.25);
                    } else {
                      p.setLanceEmbutPct(v);
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
