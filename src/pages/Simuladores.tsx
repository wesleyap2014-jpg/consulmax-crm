"use client";

// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

/* ========================= Tipos ========================= */
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
  antecip_parcelas: number; // 0|1|2
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

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

/** BRL mask */
function formatBRLInputFromNumber(n: number): string {
  return (isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

/** Percent “25,0000” <-> 0.25 (decimal) */
function formatPctInputFromDecimal(d: number): string {
  return (d * 100).toFixed(4).replace(".", ",");
}
function parsePctInputToDecimal(s: string): number {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Exceção do limitador: Motocicleta >= 20k => 1% */
function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if (segmento?.toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/** Formata telefone BR para exibição */
function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ===== Índice 12m ===== */
type IndexCode = string;
async function fetchIndex12m(code: IndexCode, refMonthISO: string): Promise<number> {
  // Espera a RPC sim_index_12m(code text, ref_month date) retornando decimal (ex.: 0.039 = 3,9%)
  try {
    const { data, error } = await supabase.rpc("sim_index_12m", {
      _code: code,
      _ref_month: refMonthISO + "-01",
    } as any);
    if (!error && typeof data === "number") return Number(data) || 0;
  } catch {}
  return 0; // fallback
}

/* ======================= Cálculo ========================= */
type ExtratoItem = {
  parcelaN: number;
  creditoMes: number;
  valorParcela: number;
  reajusteAplicado: number;
  abateLance: number;
  saldoAposPagamento: number;
  investimentoAcumulado: number;
  evento?: string;
};

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
  index12mPct: number; // reajuste anual (acumulado 12m)
};

type CalcResult = {
  valorCategoria: number;
  parcelaAte: number;
  parcelaDemais: number;

  lanceOfertadoValor: number;
  lanceEmbutidoValor: number;
  lanceProprioValor: number;
  lancePercebidoPct: number;
  novoCredito: number;

  novaParcelaSemLimite: number;
  parcelaLimitante: number;
  parcelaEscolhida: number;

  saldoDevedorFinal: number;
  novoPrazo: number;

  TA_efetiva: number;
  fundoComumFactor: number;
  antecipAdicionalCada: number;
  segundaParcelaComAntecipacao: number | null;
  has2aAntecipDepois: boolean;
  aplicouLimitador: boolean;

  extrato: ExtratoItem[];
};

function calcularSimulacao(i: CalcInput): CalcResult {
  const {
    credito: C0,
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
    index12mPct,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const mCont = Math.max(1, Math.min(parcContemplacao, prazo));
  const segLower = (segmento || "").toLowerCase();
  const isServico = segLower.includes("serv");
  const isMoto = segLower.includes("moto");

  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);
  const fundoComumFactor = forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  const admValor = C0 * taxaAdmFull;
  const frValor = C0 * frPct;
  const valorCategoriaBase = C0 * (1 + taxaAdmFull + frPct);

  const seguroMensal = seguro ? valorCategoriaBase * i.seguroPrestPct : 0;
  const antecipAdicionalCada = antecipParcelas > 0 ? (C0 * antecipPct) / antecipParcelas : 0;

  const baseMensalSemSeguro = (C0 * fundoComumFactor + C0 * TA_efetiva + C0 * frPct) / prazo;
  const parcelaAte = baseMensalSemSeguro + (antecipParcelas > 0 ? antecipAdicionalCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  const extrato: ExtratoItem[] = [];
  let C_corr = C0; // crédito que sofre reajuste antes da contemplação
  let saldo = C0 + admValor + frValor; // saldo devedor do contrato
  let parcelaCorrenteSemSeguro = baseMensalSemSeguro;
  let investimentoAcum = 0;

  const recomputeParcelaSemSeguroPre = (mesAtual: number) => {
    // Recalcula a base mensal (pré-contemplação) diluindo o total remanescente
    const pagos = extrato
      .filter((e) => e.parcelaN <= mesAtual - 1)
      .reduce((acc, e) => acc + Math.max(0, e.valorParcela - seguroMensal), 0);
    const totalBase = C_corr + admValor + frValor;
    const rem = Math.max(1, prazo - (mesAtual - 1));
    return Math.max(0, (totalBase - pagos) / rem);
  };

  for (let mes = 1; mes <= mCont; mes++) {
    const isAniver = mes > 1 && ((mes - 1) % 12 === 0);
    let reaj = 0;
    if (isAniver) {
      // Pré-contemplação: reajuste no CRÉDITO vigente e somado ao saldo
      reaj = C_corr * index12mPct;
      C_corr = C_corr * (1 + index12mPct);
      saldo += reaj;
      parcelaCorrenteSemSeguro = recomputeParcelaSemSeguroPre(mes);
      extrato.push({
        parcelaN: mes - 1,
        creditoMes: C_corr,
        valorParcela: 0,
        reajusteAplicado: reaj,
        abateLance: 0,
        saldoAposPagamento: saldo,
        investimentoAcumulado: investimentoAcum,
        evento: "Reajuste anual sobre crédito",
      });
    }
    const comAntecip = mes <= antecipParcelas ? antecipAdicionalCada : 0;
    const valorParcelaSemSeguro = parcelaCorrenteSemSeguro + comAntecip;
    saldo = Math.max(0, saldo - valorParcelaSemSeguro);
    const pago = valorParcelaSemSeguro + seguroMensal;
    investimentoAcum += pago;
    extrato.push({
      parcelaN: mes,
      creditoMes: C_corr,
      valorParcela: pago,
      reajusteAplicado: 0,
      abateLance: 0,
      saldoAposPagamento: saldo,
      investimentoAcumulado: investimentoAcum,
      evento: mes <= antecipParcelas ? "Parcela com antecipação" : undefined,
    });
  }

  // Contemplação: lances
  const lanceEmbutidoValor = C_corr * lanceEmbutPct; // abatido do crédito atualizado
  const novoCredito = Math.max(0, C_corr - lanceEmbutidoValor);
  const lanceOfertadoValor = C_corr * lanceOfertPct; // ofertado SOBRE o crédito atualizado
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);

  // Abate do lance ofertado no mês da contemplação (no saldo)
  saldo = Math.max(0, saldo - lanceOfertadoValor);
  extrato.push({
    parcelaN: mCont,
    creditoMes: novoCredito,
    valorParcela: 0,
    reajusteAplicado: 0,
    abateLance: lanceOfertadoValor,
    saldoAposPagamento: saldo,
    investimentoAcumulado: investimentoAcum,
    evento: "Contemplação + Lance abatido do saldo",
  });

  // Pós-contemplação
  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C0);
  const parcelaLimitante = limitadorBase > 0 ? (novoCredito + admValor + frValor) * limitadorBase : 0;
  const manterParcela = isServico || (isMoto && C0 < 20000);

  let mesAtual = mCont + 1;
  let prazoRestante = Math.max(1, prazo - mCont);
  let proposta = saldo / prazoRestante;
  let parcelaEscolhidaSemSeguro = manterParcela ? proposta : Math.max(proposta, parcelaLimitante);
  let aplicouLimitador = !manterParcela && parcelaEscolhidaSemSeguro > proposta;
  const novaParcelaSemLimite = saldo / prazoRestante;

  while (mesAtual <= prazo && saldo > 0.01) {
    const isAniver = mesAtual > 1 && ((mesAtual - 1) % 12 === 0);
    if (isAniver) {
      // Pós-contemplação: reajuste incide sobre o SALDO
      const reaj = saldo * index12mPct;
      saldo += reaj;
      extrato.push({
        parcelaN: mesAtual - 1,
        creditoMes: novoCredito,
        valorParcela: 0,
        reajusteAplicado: reaj,
        abateLance: 0,
        saldoAposPagamento: saldo,
        investimentoAcumulado: investimentoAcum,
        evento: "Reajuste anual sobre saldo",
      });

      // Recalcula proposta e, se aplicável, aplica limitador
      prazoRestante = Math.max(1, prazo - (mesAtual - 1));
      proposta = saldo / prazoRestante;
      if (!manterParcela) {
        parcelaEscolhidaSemSeguro = Math.max(proposta, parcelaLimitante);
        aplicouLimitador = aplicouLimitador || parcelaEscolhidaSemSeguro > proposta;
      } else {
        parcelaEscolhidaSemSeguro = proposta;
      }
    }

    // Paga prestação
    const pagoSemSeguro = parcelaEscolhidaSemSeguro;
    saldo = Math.max(0, saldo - pagoSemSeguro);
    const pago = pagoSemSeguro + (seguro ? valorCategoriaBase * i.seguroPrestPct : 0);
    investimentoAcum += pago;

    extrato.push({
      parcelaN: mesAtual,
      creditoMes: novoCredito,
      valorParcela: pago,
      reajusteAplicado: 0,
      abateLance: 0,
      saldoAposPagamento: saldo,
      investimentoAcumulado: investimentoAcum,
    });
    mesAtual++;
  }

  const has2aAntecipDepois = antecipParcelas >= 2 && mCont === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? parcelaEscolhidaSemSeguro + antecipAdicionalCada : null;
  const novoPrazo = Math.max(1, prazo - mCont);

  return {
    valorCategoria: valorCategoriaBase,
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,
    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida: parcelaEscolhidaSemSeguro,
    saldoDevedorFinal: saldo,
    novoPrazo,
    TA_efetiva,
    fundoComumFactor,
    antecipAdicionalCada,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
    aplicouLimitador,
    extrato,
  };
}

/* ========== Inputs com máscara (Money / Percent) ========== */
function MoneyInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      value={formatBRLInputFromNumber(value || 0)}
      onChange={(e) => onChange(parseBRLInputToNumber(e.target.value))}
      className={`text-right ${rest.className || ""}`}
    />
  );
}

function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  ...rest
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const display = formatPctInputFromDecimal(valueDecimal || 0);
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          let d = parsePctInputToDecimal(e.target.value);
          if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
          onChangeDecimal(d);
        }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}
/* ========================= Página ======================== */
export default function Simuladores() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  const [mgrOpen, setMgrOpen] = useState(false); // overlay lista/edição

  // seleção Embracon
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  const [segmento, setSegmento] = useState<string>("");
  const [nomeTabela, setNomeTabela] = useState<string>("");
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

  // usuário logado (nome/telefone para extrato)
  const [userName, setUserName] = useState<string>("");
  const [userPhone, setUserPhone] = useState<string>("");

  // Índice 12m
  const [indexCode, setIndexCode] = useState<string>("IPCA");
  const [refMonth, setRefMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [acc12m, setAcc12m] = useState<number>(0);

  // Extrato modal
  const [extratoOpen, setExtratoOpen] = useState(false);

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
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      setActiveAdminId(embr?.id ?? (a?.[0]?.id ?? null));
      setLoading(false);
    })();
  }, []);

  // pega usuário logado (nome/phone) em public.users
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("users").select("name, phone").eq("auth_user_id", uid).maybeSingle();
      setUserPhone((data?.phone || "").toString());
      setUserName((data?.name || "").toString() || "Usuário Logado");
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

  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  const variantesDaTabela = useMemo(() => {
    return adminTables.filter(
      (t) => t.segmento === segmento && t.nome_tabela === nomeTabela
    );
  }, [adminTables, segmento, nomeTabela]);

  const tabelaSelecionada = useMemo(
    () => tables.find((t) => t.id === tabelaId) || null,
    [tables, tabelaId]
  );

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({
      min: tabelaSelecionada.faixa_min,
      max: tabelaSelecionada.faixa_max,
    });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25)
      setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50)
      setForma("Parcela Cheia");

    // índice: pega o primeiro da tabela, se existir
    if (tabelaSelecionada.indice_correcao?.length) {
      setIndexCode(tabelaSelecionada.indice_correcao[0]);
    }
  }, [tabelaSelecionada]); // eslint-disable-line

  // valida % embutido
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid)
      setLanceEmbutPct(lanceEmbutPctValid);
  }, [lanceEmbutPct]); // eslint-disable-line

  // captura automática do índice 12m (RPC)
  useEffect(() => {
    (async () => {
      if (!indexCode || !refMonth) return;
      const v = await fetchIndex12m(indexCode, refMonth);
      setAcc12m(v || 0);
    })();
  }, [indexCode, refMonth]);

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
      lanceEmbutPct: lanceEmbutPctValid,
      parcContemplacao,
      index12mPct: acc12m || 0,
    };
    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPctValid,
    parcContemplacao,
    acc12m,
  ]); // eslint-disable-line

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
      index_code: indexCode,
      index_ref_month: refMonth ? refMonth + "-01" : null,
      index_12m_value: acc12m ?? 0,
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

  function handleTableCreatedOrUpdated(newTable: SimTable) {
    setTables((prev) => {
      const exists = prev.find((t) => t.id === newTable.id);
      if (exists) return prev.map((t) => (t.id === newTable.id ? newTable : t));
      return [newTable, ...prev];
    });
  }

  function handleTableDeleted(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  // ===== Resumo de Proposta =====
  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";

    const bem = (() => {
      const seg = (segmento || tabelaSelecionada.segmento || "").toLowerCase();
      if (seg.includes("imó")) return "imóvel";
      if (seg.includes("serv")) return "serviço";
      if (seg.includes("moto")) return "motocicleta";
      return "veículo";
    })();

    const primeiraParcelaLabel =
      tabelaSelecionada.antecip_parcelas === 2
        ? "Parcelas 1 e 2"
        : tabelaSelecionada.antecip_parcelas === 1
        ? "Parcela 1"
        : "Parcela inicial";

    const parcelaRestanteValor = brMoney(calc.parcelaEscolhida);
    const segundaParcExtra =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª parcela com antecipação: ${brMoney(
            calc.segundaParcelaComAntecipacao
          )})`
        : "";

    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    return (
`🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (Primeira parcela em até 3x sem juros no cartão)

💵 Demais parcelas até a contemplação: ${brMoney(calc.parcelaDemais)}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${parcelaRestanteValor}${segundaParcExtra}

⏳ Prazo restante: ${calc.novoPrazo} meses

💡 Um planejamento inteligente que cabe no seu bolso e acelera a realização do seu sonho!

👉 Quer simular com o valor do seu ${bem} dos sonhos?
Me chama aqui e eu te mostro o melhor caminho 👇
https://wa.me/${telDigits || ""}`
    );
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  // ===== Texto OPORTUNIDADE / PROPOSTA =====
  function normalizarSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "Imóvel";
    if (s.includes("auto")) return "Automóvel";
    if (s.includes("moto")) return "Motocicleta";
    if (s.includes("serv")) return "Serviços";
    if (s.includes("pesad")) return "Pesados";
    return (seg || "Automóvel");
  }
  function emojiDoSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "🏠";
    if (s.includes("moto")) return "🏍️";
    if (s.includes("serv")) return "✈️";
    if (s.includes("pesad")) return "🚚";
    return "🚗";
  }

  const assembleiaDefault = "15/10";
  const [assembleia, setAssembleia] = useState<string>(assembleiaDefault);

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";

    const segBase = segmento || tabelaSelecionada?.segmento || "Automóvel";
    const seg = normalizarSegmento(segBase);
    const emoji = emojiDoSegmento(segBase);

    const parcela1 = brMoney(calc.parcelaAte);
    const mostraParc2 = !!(calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null);
    const linhaParc2 = mostraParc2 ? `\n💰 Parcela 2: ${brMoney(calc.segundaParcelaComAntecipacao!)} (com antecipação)` : "";

    const linhaPrazo = `📆 + ${calc.novoPrazo}x de ${brMoney(calc.parcelaEscolhida)}`;

    const grupoTxt = grupo || "—";

    const whatsappFmt = formatPhoneBR(userPhone);
    const whatsappLine = whatsappFmt ? `\nWhatsApp: ${whatsappFmt}` : "";

    return (
`🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${seg}

${emoji} Crédito: ${brMoney(calc.novoCredito)}
💰 Parcela 1: ${parcela1} (Em até 3x no cartão)${linhaParc2}
${linhaPrazo}
💵 Lance Próprio: ${brMoney(calc.lanceProprioValor)}
📢 Grupo: ${grupoTxt}

🚨 POUCAS VAGAS DISPONÍVEIS🚨

Assembleia ${assembleia}

📲 Garanta sua vaga agora!${whatsappLine}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`
    );
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone]);

  async function copiarProposta() {
    try {
      await navigator.clipboard.writeText(propostaTexto);
      alert("Texto copiado!");
    } catch {
      alert("Não foi possível copiar o texto.");
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  const activeAdmin = admins.find((a) => a.id === activeAdminId);

  return (
    <div className="p-6 space-y-4">
      {/* topo: admins + botões */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => (
            <Button
              key={a.id}
              variant={activeAdminId === a.id ? "default" : "secondary"}
              onClick={() => setActiveAdminId(a.id)}
              className="h-10 rounded-2xl px-4"
            >
              {a.name}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeAdmin && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMgrOpen(true)}
                className="h-10 rounded-2xl px-4"
              >
                Gerenciar Tabelas
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => alert("Em breve: adicionar administradora.")}
                className="h-10 rounded-2xl px-4 whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-1" /> + Add Administradora
              </Button>
            </>
          )}
        </div>
      </div>

      {/* layout em duas colunas */}
      <div className="grid grid-cols-12 gap-4">
        {/* coluna esquerda: simulador */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Simuladores</CardTitle>
            </CardHeader>
            <CardContent>
              {activeAdmin ? (
                activeAdmin.name === "Embracon" ? (
                  <EmbraconSimulator
                    leads={leads}
                    adminTables={adminTables}
                    nomesTabelaSegmento={nomesTabelaSegmento}
                    variantesDaTabela={variantesDaTabela}
                    tabelaSelecionada={tabelaSelecionada}
                    prazoAte={prazoAte}
                    faixa={faixa}
                    leadId={leadId}
                    setLeadId={setLeadId}
                    leadInfo={leadInfo}
                    grupo={grupo}
                    setGrupo={setGrupo}
                    segmento={segmento}
                    setSegmento={(v) => {
                      setSegmento(v);
                      setNomeTabela("");
                      setTabelaId("");
                    }}
                    nomeTabela={nomeTabela}
                    setNomeTabela={(v) => {
                      setNomeTabela(v);
                      setTabelaId("");
                    }}
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
                    Em breve: simulador para <strong>{activeAdmin.name}</strong>.
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nenhuma administradora encontrada.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ações principais */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {calc && (
              <Button variant="secondary" onClick={() => setExtratoOpen(true)} className="h-10 rounded-2xl px-4">
                Gerar Extrato
              </Button>
            )}
            {simCode && (
              <span className="text-sm">
                ✅ Salvo como <strong>Simulação #{simCode}</strong>
              </span>
            )}
          </div>
        </div>

        {/* coluna direita: memória + textos */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memória de Cálculo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">
                  Selecione uma tabela para ver os detalhes.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div>
                    <div className="text-right font-medium">
                      {brMoney(credito || 0)}
                    </div>
                    <div>Prazo da Venda</div>
                    <div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div>
                    <div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">
                      {seguroPrest
                        ? pctHuman(tabelaSelecionada.seguro_prest_pct)
                        : "—"}
                    </div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Fundo Comum (fator)</div>
                    <div className="text-right">
                      {calc
                        ? (calc.fundoComumFactor * 100).toFixed(0) + "%"
                        : "—"}
                    </div>
                    <div>Taxa Adm (total)</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.taxa_adm_pct)}
                    </div>
                    <div>TA efetiva</div>
                    <div className="text-right">
                      {calc ? pctHuman(calc.TA_efetiva) : "—"}
                    </div>
                    <div>Fundo Reserva</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.fundo_reserva_pct)}
                    </div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.antecip_pct)} •{" "}
                      {tabelaSelecionada.antecip_parcelas}x
                    </div>
                    <div>Limitador Parcela</div>
                    <div className="text-right">
                      {pctHuman(
                        resolveLimitadorPct(
                          tabelaSelecionada.limitador_parcela_pct,
                          tabelaSelecionada.segmento,
                          credito || 0
                        )
                      )}
                    </div>
                    <div>Valor de Categoria</div>
                    <div className="text-right">
                      {calc ? brMoney(calc.valorCategoria) : "—"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Resumo antigo */}
          <Card>
            <CardHeader>
              <CardTitle>Resumo da Proposta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={resumoTexto}
                placeholder="Preencha os campos da simulação para gerar o resumo."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarResumo} disabled={!resumoTexto}>
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* NOVO: OPORTUNIDADE / PROPOSTA EMBRACON */}
          <Card>
            <CardHeader>
              <CardTitle>Texto: Oportunidade / Proposta Embracon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Assembleia (ex.: 15/10)</Label>
                  <Input
                    value={assembleia}
                    onChange={(e) => setAssembleia(e.target.value)}
                    placeholder="dd/mm"
                  />
                </div>
              </div>
              <textarea
                className="w-full h-72 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={propostaTexto}
                placeholder="Preencha a simulação para gerar o texto."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarProposta} disabled={!propostaTexto}>
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Overlay de gerenciamento de tabelas */}
      {mgrOpen && activeAdmin && (
        <TableManagerModal
          admin={activeAdmin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onCreatedOrUpdated={handleTableCreatedOrUpdated}
          onDeleted={handleTableDeleted}
        />
      )}

      {/* Extrato: detalhes + PDF */}
      {extratoOpen && calc && (
        <ExtratoModal
          onClose={() => setExtratoOpen(false)}
          extrato={calc.extrato}
          dadosCorretora={{
            corretora: "Consulmax Consórcios e Investimentos",
            cnpj: "57.942.043/0001-03",
            telefone: "(69) 9 9302-9380",
            administradora: activeAdmin?.name || "-",
          }}
          dadosUsuario={{ nome: userName || "Usuário Logado", telefone: formatPhoneBR(userPhone) }}
          dadosCliente={{ nome: leadInfo?.nome || "-", telefone: leadInfo?.telefone || "-" }}
          dadosSimulacao={{
            segmento: tabelaSelecionada?.segmento || "-",
            taxaAdmPct: tabelaSelecionada?.taxa_adm_pct || 0,
            frPct: tabelaSelecionada?.fundo_reserva_pct || 0,
            antecipPct: tabelaSelecionada?.antecip_pct || 0,
            antecipParcelas: tabelaSelecionada?.antecip_parcelas || 0,
            limitadorPct: resolveLimitadorPct(tabelaSelecionada?.limitador_parcela_pct || 0, tabelaSelecionada?.segmento || "", credito || 0),
            valores: {
              taxaAdmValor: credito * (tabelaSelecionada?.taxa_adm_pct || 0),
              fundoReservaValor: credito * (tabelaSelecionada?.fundo_reserva_pct || 0),
              antecipacaoValor: credito * (tabelaSelecionada?.antecip_pct || 0),
            }
          }}
        />
      )}
    </div>
  );
}

/* =============== Modal base =============== */
function ModalBase({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Extrato (Modal + PDF) ============== */
function ExtratoModal({
  onClose, extrato,
  dadosCorretora, dadosUsuario, dadosCliente, dadosSimulacao,
}: {
  onClose: () => void;
  extrato: ExtratoItem[];
  dadosCorretora: { corretora: string; cnpj: string; telefone: string; administradora: string };
  dadosUsuario: { nome: string; telefone: string };
  dadosCliente: { nome: string; telefone: string | null };
  dadosSimulacao: {
    segmento: string;
    taxaAdmPct: number;
    frPct: number;
    antecipPct: number;
    antecipParcelas: number;
    limitadorPct: number;
    valores: { taxaAdmValor: number; fundoReservaValor: number; antecipacaoValor: number };
  };
}) {
  async function logoToDataURL(): Promise<string | null> {
    try {
      const res = await fetch("/logo-consulmax.png");
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function exportarExtratoPDF() {
    const { default: jsPDF } = await import("jspdf");
    await import("jspdf-autotable");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Logo
    const dataURL = await logoToDataURL();
    if (dataURL) {
      try { doc.addImage(dataURL, "PNG", 24, 18, 120, 36); } catch {}
    }
    doc.setFontSize(12);
    doc.text("Extrato de Simulação", pageW - 24, 34, { align: "right" });

    // Cabeçalhos
    doc.setFontSize(10);
    const head = [
      ["-------------- DADOS DA CORRETORA ---------------------"],
      [`Corretora: ${dadosCorretora.corretora} | CNPJ: ${dadosCorretora.cnpj} | Telefone: ${dadosCorretora.telefone} | Administradora: ${dadosCorretora.administradora}`],
      [`Usuário: ${dadosUsuario.nome} | Telefone/Whats: ${dadosUsuario.telefone}`],
      [""],
      ["-------------- DADOS DO CLIENTE ---------------------"],
      [`Nome: ${dadosCliente.nome} | Telefone: ${dadosCliente.telefone || "-"}`],
      [""],
      ["------------- DADOS DA SIMULAÇÃO ---------------------"],
      [`Segmento: ${dadosSimulacao.segmento}`],
      [`% Taxa de Adm: ${(dadosSimulacao.taxaAdmPct*100).toFixed(4)}% | Valor da Taxa de Adm: ${brMoney(dadosSimulacao.valores.taxaAdmValor)}`],
      [`% Fundo Reserva: ${(dadosSimulacao.frPct*100).toFixed(4)}% | Valor do Fundo Reserva: ${brMoney(dadosSimulacao.valores.fundoReservaValor)}`],
      [`% Antecipação: ${(dadosSimulacao.antecipPct*100).toFixed(4)}% | Valor da antecipação da taxa de adm: ${brMoney(dadosSimulacao.valores.antecipacaoValor)}`],
      [`% Do limitador de Parcela: ${(dadosSimulacao.limitadorPct*100).toFixed(4)}%`],
      [""],
      ["Detalhamento da Simulação"],
    ];
    (doc as any).autoTable({ startY: 70, body: head, theme: "plain", styles: { fontSize: 9 } });

    const rows = extrato.map((e) => [
      e.parcelaN,
      brMoney(e.creditoMes),
      e.reajusteAplicado ? brMoney(e.reajusteAplicado) : "—",
      e.abateLance ? brMoney(e.abateLance) : "—",
      brMoney(e.valorParcela),
      brMoney(e.saldoAposPagamento),
      brMoney(e.investimentoAcumulado),
      e.evento || "—",
    ]);
    (doc as any).autoTable({
      head: [["Parcela","Crédito","Reajuste","Lance","Valor Pago","Saldo devedor","Investimento","Evento"]],
      body: rows,
      startY: (doc as any).lastAutoTable.finalY + 6,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [245,245,245], textColor: 20, halign: "center" },
      columnStyles: { 0: { halign: "right" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } }
    });

    doc.save("extrato-simulacao.pdf");
  }

  return (
    <ModalBase onClose={onClose} title="Extrato detalhado da simulação">
      <div className="p-4 space-y-4">
        {/* Cabeçalhos */}
        <div className="rounded-lg border p-3 text-sm leading-6 bg-muted/20">
          <div className="font-semibold mb-2">-------------- DADOS DA CORRETORA ---------------------</div>
          <div>Corretora: {dadosCorretora.corretora} | CNPJ: {dadosCorretora.cnpj} | Telefone: {dadosCorretora.telefone} | Administradora: {dadosCorretora.administradora}</div>
          <div>Usuário: {dadosUsuario.nome} | Telefone/Whats: {dadosUsuario.telefone}</div>

          <div className="font-semibold my-2">-------------- DADOS DO CLIENTE ---------------------</div>
          <div>Nome: {dadosCliente.nome} | Telefone: {dadosCliente.telefone || "-"}</div>

          <div className="font-semibold my-2">------------- DADOS DA SIMULAÇÃO ---------------------</div>
          <div>Segmento: {dadosSimulacao.segmento}</div>
          <div>% Taxa de Adm: {pctHuman(dadosSimulacao.taxaAdmPct)} | Valor da Taxa de Adm: {brMoney(dadosSimulacao.valores.taxaAdmValor)}</div>
          <div>% Fundo Reserva: {pctHuman(dadosSimulacao.frPct)} | Valor do Fundo Reserva: {brMoney(dadosSimulacao.valores.fundoReservaValor)}</div>
          <div>% Antecipação: {pctHuman(dadosSimulacao.antecipPct)} | Valor da antecipação da taxa de adm: {brMoney(dadosSimulacao.valores.antecipacaoValor)}</div>
          <div>% Do limitador de Parcela: {pctHuman(dadosSimulacao.limitadorPct)}</div>
        </div>

        {/* Grid com tabela estilizada */}
        <div className="overflow-auto rounded-lg border max-h-[60vh]">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Parcela</th>
                <th className="text-right p-2">Crédito</th>
                <th className="text-right p-2">Reajuste</th>
                <th className="text-right p-2">Lance</th>
                <th className="text-right p-2">Valor Pago</th>
                <th className="text-right p-2">Saldo devedor</th>
                <th className="text-right p-2">Investimento</th>
                <th className="text-left p-2">Evento</th>
              </tr>
            </thead>
            <tbody>
              {extrato.map((r, idx) => (
                <tr key={idx} className="border-t hover:bg-muted/20">
                  <td className="p-2">{r.parcelaN}</td>
                  <td className="p-2 text-right">{brMoney(r.creditoMes)}</td>
                  <td className="p-2 text-right">{r.reajusteAplicado !== 0 ? brMoney(r.reajusteAplicado) : "—"}</td>
                  <td className="p-2 text-right">{r.abateLance !== 0 ? brMoney(r.abateLance) : "—"}</td>
                  <td className="p-2 text-right">{brMoney(r.valorParcela)}</td>
                  <td className="p-2 text-right">{brMoney(r.saldoAposPagamento)}</td>
                  <td className="p-2 text-right">{brMoney(r.investimentoAcumulado)}</td>
                  <td className="p-2">{r.evento || "—"}</td>
                </tr>
              ))}
              {extrato.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum item para exibir.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={exportarExtratoPDF} className="h-10 rounded-2xl px-4">Exportar PDF</Button>
          <Button variant="secondary" onClick={onClose} className="h-10 rounded-2xl px-4">Fechar</Button>
        </div>
      </div>
    </ModalBase>
  );
}

/* ============== Gerenciar Tabelas ============== */
function TableManagerModal({
  admin,
  allTables,
  onClose,
  onCreatedOrUpdated,
  onDeleted,
}: {
  admin: Admin;
  allTables: SimTable[];
  onClose: () => void;
  onCreatedOrUpdated: (t: SimTable) => void;
  onDeleted: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SimTable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => setPage(1), [allTables.length]);

  const grouped = useMemo(() => {
    return [...allTables].sort((a, b) => {
      const sa = (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase();
      const sb = (b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase();
      return sa.localeCompare(sb);
    });
  }, [allTables]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(
    () => grouped.slice((page - 1) * pageSize, page * pageSize),
    [grouped, page]
  );

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (As simulações vinculadas a ela também serão excluídas)")) return;
    setBusyId(id);
    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) {
      setBusyId(null);
      alert("Erro ao excluir simulações vinculadas: " + delSims.error.message);
      return;
    }
    const { error } = await supabase.from("sim_tables").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    onDeleted(id);
  }

  return (
    <ModalBase onClose={onClose} title="Gerenciador de Tabelas">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            Admin ativa: <strong>{admin.name}</strong>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="h-10 rounded-2xl px-4"
          >
            <Plus className="h-4 w-4 mr-1" /> Nova Tabela
          </Button>
        </div>

        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Segmento</th>
                <th className="text-left p-2">Tabela</th>
                <th className="text-left p-2">Prazo</th>
                <th className="text-left p-2">% Adm</th>
                <th className="text-left p-2">% FR</th>
                <th className="text-left p-2">% Antecip</th>
                <th className="text-left p-2">Parc Ant.</th>
                <th className="text-left p-2">% Limite</th>
                <th className="text-left p-2">% Seguro</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.segmento}</td>
                  <td className="p-2">{t.nome_tabela}</td>
                  <td className="p-2">{t.prazo_limite}</td>
                  <td className="p-2">{pctHuman(t.taxa_adm_pct)}</td>
                  <td className="p-2">{pctHuman(t.fundo_reserva_pct)}</td>
                  <td className="p-2">{pctHuman(t.antecip_pct)}</td>
                  <td className="p-2">{t.antecip_parcelas}</td>
                  <td className="p-2">{pctHuman(t.limitador_parcela_pct)}</td>
                  <td className="p-2">{pctHuman(t.seguro_prest_pct)}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setEditing(t); setShowForm(true); }}
                        className="h-9 rounded-xl px-3"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === t.id}
                        onClick={() => deletar(t.id)}
                        className="h-9 rounded-xl px-3"
                      >
                        {busyId === t.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-muted-foreground">
                    Sem tabelas para esta administradora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div className="flex items-center justify-between mt-3 text-sm">
          <div>
            {grouped.length > 0 && (
              <>
                Mostrando{" "}
                <strong>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, grouped.length)}
                </strong>{" "}
                de <strong>{grouped.length}</strong>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <span> Página {page} de {totalPages} </span>
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={() => setShowForm(false)}
          onSaved={(t) => { onCreatedOrUpdated(t); setShowForm(false); }}
        />
      )}
    </ModalBase>
  );
}

/* ===== Formulário de Tabela ==== */
function TableFormOverlay({
  adminId, initial, onSaved, onClose,
}: {
  adminId: string;
  initial?: SimTable;
  onSaved: (t: SimTable) => void;
  onClose: () => void;
}) {
  const [segmento, setSegmento] = useState(initial?.segmento || "Imóvel Estendido");
  const [nome, setNome] = useState(initial?.nome_tabela || "Select Estendido");
  const [faixaMin, setFaixaMin] = useState(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState(initial?.prazo_limite ?? 240);

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(formatPctInputFromDecimal(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(formatPctInputFromDecimal(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(formatPctInputFromDecimal(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(formatPctInputFromDecimal(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(formatPctInputFromDecimal(initial?.seguro_prest_pct ?? 0.00061));

  const [perEmbutido, setPerEmbutido] = useState(initial?.permite_lance_embutido ?? true);
  const [perFixo25, setPerFixo25] = useState(initial?.permite_lance_fixo_25 ?? true);
  const [perFixo50, setPerFixo50] = useState(initial?.permite_lance_fixo_50 ?? true);
  const [perLivre, setPerLivre] = useState(initial?.permite_lance_livre ?? true);

  const [cParcelaCheia, setCParcelaCheia] = useState(initial?.contrata_parcela_cheia ?? true);
  const [cRed25, setCRed25] = useState(initial?.contrata_reduzida_25 ?? true);
  const [cRed50, setCRed50] = useState(initial?.contrata_reduzida_50 ?? true);
  const [indices, setIndices] = useState((initial?.indice_correcao || ["IPCA"]).join(", "));

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function salvar() {
    setSaving(true);
    const payload: Omit<SimTable, "id"> = {
      admin_id: adminId,
      segmento,
      nome_tabela: nome,
      faixa_min: Number(faixaMin) || 0,
      faixa_max: Number(faixaMax) || 0,
      prazo_limite: Number(prazoLimite) || 0,
      taxa_adm_pct: parsePctInputToDecimal(taxaAdmHuman),
      fundo_reserva_pct: parsePctInputToDecimal(frHuman),
      antecip_pct: parsePctInputToDecimal(antecipHuman),
      antecip_parcelas: Number(antecipParcelas) || 0,
      limitador_parcela_pct: parsePctInputToDecimal(limHuman),
      seguro_prest_pct: parsePctInputToDecimal(seguroHuman),
      permite_lance_embutido: perEmbutido,
      permite_lance_fixo_25: perFixo25,
      permite_lance_fixo_50: perFixo50,
      permite_lance_livre: perLivre,
      contrata_parcela_cheia: cParcelaCheia,
      contrata_reduzida_25: cRed25,
      contrata_reduzida_50: cRed50,
      indice_correcao: indices.split(",").map((s) => s.trim()).filter(Boolean),
    };
    let res;
    if (initial) res = await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single();
    else res = await supabase.from("sim_tables").insert(payload).select("*").single();
    setSaving(false);
    if (res.error) { alert("Erro ao salvar tabela: " + res.error.message); return; }
    onSaved(res.data as SimTable);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{initial ? "Editar Tabela" : "Nova Tabela"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 grid gap-3 md:grid-cols-4">
          <div><Label>Segmento</Label><Input value={segmento} onChange={(e) => setSegmento(e.target.value)} /></div>
          <div><Label>Nome da Tabela</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Faixa (mín)</Label><Input type="number" value={faixaMin} onChange={(e) => setFaixaMin(Number(e.target.value))} /></div>
          <div><Label>Faixa (máx)</Label><Input type="number" value={faixaMax} onChange={(e) => setFaixaMax(Number(e.target.value))} /></div>
          <div><Label>Prazo Limite (meses)</Label><Input type="number" value={prazoLimite} onChange={(e) => setPrazoLimite(Number(e.target.value))} /></div>
          <div><Label>% Taxa Adm</Label><Input value={taxaAdmHuman} onChange={(e) => setTaxaAdmHuman(e.target.value)} /></div>
          <div><Label>% Fundo Reserva</Label><Input value={frHuman} onChange={(e) => setFrHuman(e.target.value)} /></div>
          <div><Label>% Antecipação da Adm</Label><Input value={antecipHuman} onChange={(e) => setAntecipHuman(e.target.value)} /></div>
          <div><Label>Parcelas da Antecipação</Label><Input type="number" value={antecipParcelas} onChange={(e) => setAntecipParcelas(Number(e.target.value))} /></div>
          <div><Label>% Limitador Parcela</Label><Input value={limHuman} onChange={(e) => setLimHuman(e.target.value)} /></div>
          <div><Label>% Seguro por parcela</Label><Input value={seguroHuman} onChange={(e) => setSeguroHuman(e.target.value)} /></div>
          <div className="col-span-2">
            <Label>Lances Permitidos</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={perEmbutido} onChange={(e) => setPerEmbutido(e.target.checked)} />Embutido</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo25} onChange={(e) => setPerFixo25(e.target.checked)} />Fixo 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo50} onChange={(e) => setPerFixo50(e.target.checked)} />Fixo 50%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perLivre} onChange={(e) => setPerLivre(e.target.checked)} />Livre</label>
            </div>
          </div>
          <div className="col-span-2">
            <Label>Formas de Contratação</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cParcelaCheia} onChange={(e) => setCParcelaCheia(e.target.checked)} />Parcela Cheia</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed25} onChange={(e) => setCRed25(e.target.checked)} />Reduzida 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed50} onChange={(e) => setCRed50(e.target.checked)} />Reduzida 50%</label>
            </div>
          </div>
          <div className="md:col-span-4"><Label>Índice de Correção (separar por vírgula)</Label><Input value={indices} onChange={(e) => setIndices(e.target.value)} placeholder="IPCA, INCC, IGP-M" /></div>
          <div className="md:col-span-4 flex gap-2">
            <Button onClick={salvar} disabled={saving} className="h-10 rounded-2xl px-4">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{initial ? "Salvar alterações" : "Salvar Tabela"}</Button>
            <Button variant="secondary" onClick={onClose} disabled={saving} className="h-10 rounded-2xl px-4">Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== Embracon UI ====================== */
type EmbraconProps = {
  leads: Lead[];
  adminTables: SimTable[];
  nomesTabelaSegmento: string[];
  variantesDaTabela: SimTable[];
  tabelaSelecionada: SimTable | null;
  prazoAte: number;
  faixa: { min: number; max: number } | null;
  leadId: string; setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string; setGrupo: (v: string) => void;

  segmento: string; setSegmento: (v: string) => void;
  nomeTabela: string; setNomeTabela: (v: string) => void;
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
  return (
    <div className="space-y-6">
      {/* Lead */}
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
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
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
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
              <Input
                value={p.grupo}
                onChange={(e) => p.setGrupo(e.target.value)}
                placeholder="ex.: 9957"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plano */}
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
                  onChange={(e) => p.setSegmento(e.target.value)}
                >
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <Label>Tabela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.nomeTabela}
                  disabled={!p.segmento}
                  onChange={(e) => p.setNomeTabela(e.target.value)}
                >
                  <option value="">
                    {p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}
                  </option>
                  {p.nomesTabelaSegmento.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Prazo Até</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.tabelaId}
                  disabled={!p.nomeTabela}
                  onChange={(e) => p.setTabelaId(e.target.value)}
                >
                  <option value="">
                    {p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}
                  </option>
                  {p.variantesDaTabela.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR{" "}
                      {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input
                  value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>

          {/* Venda */}
          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Valor do Crédito</Label>
                <MoneyInput value={p.credito || 0} onChange={p.setCredito} />
              </div>

              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input
                  type="number"
                  value={p.prazoVenda || ""}
                  onChange={(e) => p.setPrazoVenda(Number(e.target.value))}
                />
                {p.prazoAviso && (
                  <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>
                )}
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
                  {p.tabelaSelecionada?.contrata_parcela_cheia && (
                    <option value="Parcela Cheia">Parcela Cheia</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && (
                    <option value="Reduzida 25%">Reduzida 25%</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && (
                    <option value="Reduzida 50%">Reduzida 50%</option>
                  )}
                </select>
              </div>

              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className={
                      p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    className={
                      !p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(false)}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>
                    % Taxa de Adm:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong>
                  </div>
                  <div>
                    % Fundo Reserva:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong>
                  </div>
                  <div>
                    % Antecipação:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> •
                    Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong>
                  </div>
                  <div>
                    Limitador de Parcela:{" "}
                    <strong>
                      {pctHuman(
                        resolveLimitadorPct(
                          p.tabelaSelecionada.limitador_parcela_pct,
                          p.tabelaSelecionada.segmento,
                          p.credito || 0
                        )
                      )}
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento até a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>
                  {p.tabelaSelecionada?.antecip_parcelas === 2
                    ? "Parcelas 1 e 2"
                    : p.tabelaSelecionada?.antecip_parcelas === 1
                    ? "Parcela 1"
                    : "Parcela Inicial"}
                </Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Configurações do Lance */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Lance</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado (%)</Label>
                <PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <PercentInput
                  valueDecimal={p.lanceEmbutPct}
                  onChangeDecimal={(d) => {
                    if (d > 0.25) {
                      alert("Lance embutido limitado a 25,0000% do crédito. Voltando para 25%.");
                      p.setLanceEmbutPct(0.25);
                    } else {
                      p.setLanceEmbutPct(d);
                    }
                  }}
                  maxDecimal={0.25}
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

          {/* Pós */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento após a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""} readOnly /></div>
              <div><Label>Lance Próprio</Label><Input value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""} readOnly /></div>

              <div><Label>Lance Percebido (%)</Label><Input value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""} readOnly /></div>
              <div><Label>Novo Crédito</Label><Input value={p.calc ? brMoney(p.calc.novoCredito) : ""} readOnly /></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""} readOnly /></div>

              <div><Label>Parcela Limitante</Label><Input value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""} readOnly /></div>
              <div><Label>Parcela Escolhida</Label><Input value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""} readOnly /></div>
              <div><Label>Novo Prazo (meses)</Label><Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly /></div>

              {p.calc?.has2aAntecipDepois && p.calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3">
                  <Label>2ª parcela (com antecipação)</Label>
                  <Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Selecione um lead para abrir o simulador.
        </div>
      )}
    </div>
  );
}
