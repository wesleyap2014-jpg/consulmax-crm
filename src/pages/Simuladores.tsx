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
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

function formatBRLInputFromNumber(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

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

function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if (segmento?.toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ===== Índices de correção (12m) ===== */
type IndexRow = { code: string; name: string };
type IndexValueRow = { ref_month: string; value: number | string };

const DEFAULT_INDEXES: IndexRow[] = [
  { code: "IPCA", name: "IPCA" },
  { code: "INPC", name: "INPC" },
  { code: "IGP-M", name: "IGP-M (FGV)" },
  { code: "IGP-DI", name: "IGP-DI" },
  { code: "INCC", name: "INCC" },
];

function normalizeYM(s: string): string {
  const m = (s || "").toString().slice(0, 7).replace("/", "-");
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  const hit = (s || "").toString().match(/(\d{4})[-\/](\d{2})/);
  return hit ? `${hit[1]}-${hit[2]}` : "";
}

function asMonthlyDecimal(raw: number | string): number {
  const v = typeof raw === "string" ? parseFloat(raw.replace("%", "").replace(",", ".")) : raw;
  if (!isFinite(v)) return 0;
  if (v === 0) return 0;
  if (v > 1.5) return v / 100;
  if (v > 0 && v <= 1.5) return v >= 0.2 ? v / 100 : v;
  if (v < 0 && v > -1.5) return v <= -0.2 ? v / 100 : v;
  return v;
}

function accumulated12m(vals: IndexValueRow[]) {
  if (!vals.length) return 0;
  const norm = vals
    .map(r => ({ ym: normalizeYM(r.ref_month), d: asMonthlyDecimal(r.value) }))
    .filter(r => r.ym);
  norm.sort((a, b) => a.ym.localeCompare(b.ym));
  const last12 = norm.slice(-12);
  if (!last12.length) return 0;
  const factor = last12.reduce((acc, r) => acc * (1 + r.d), 1);
  const res = Math.max(-0.9, Math.min(5, factor - 1));
  return res;
}

/* ======================= Cálculo ========================= */
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
  indexPct: number; // acumulado 12m (decimal)
};

type ExtratoRow = {
  parcela: number;
  creditoVigente: number;
  valorPago: number;
  saldoDevedor: number;
  investimentoAcum: number;
  reajuste?: number;
  lanceAplicado?: number;
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
  extrato: ExtratoRow[];
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
    indexPct,
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

  // ===== PRÉ-CONTEMPLAÇÃO =====
  let C_corr = C0;
  let totalPagoAteContemplacao = 0;
  let parcelaCorrenteSemSeguro = baseMensalSemSeguro;
  const extrato: ExtratoRow[] = [];
  let investimento = 0;
  let saldoTeorico = C0 + admValor + frValor; // saldo base teórico (sem seguro)
  let creditoVigenteNoMes = C_corr;

  function recomputeParcelaSemSeguro(mesAtual: number) {
    const totalBase = C_corr + admValor + frValor;
    const pagos = totalPagoAteContemplacao;
    const rem = Math.max(1, prazo - (mesAtual - 1));
    const nova = Math.max(0, (totalBase - pagos) / rem);
    return nova;
  }

  for (let mes = 1; mes <= mCont; mes++) {
    const isAniver = mes > 1 && ((mes - 1) % 12 === 0);
    if (isAniver) {
      // reajuste sobre o crédito (não altera adm/fr)
      C_corr = C_corr * (1 + indexPct);
      creditoVigenteNoMes = C_corr;
      parcelaCorrenteSemSeguro = recomputeParcelaSemSeguro(mes);
      // registra linha com reajuste incidindo no crédito (sem pagamento ainda)
    } else {
      creditoVigenteNoMes = C_corr;
    }

    const comAntecip = mes <= antecipParcelas ? antecipAdicionalCada : 0;
    const pagaSemSeguro = parcelaCorrenteSemSeguro + comAntecip;
    totalPagoAteContemplacao += pagaSemSeguro;
    investimento += pagaSemSeguro + (seguro ? seguroMensal : 0);

    saldoTeorico = (C_corr + admValor + frValor) - totalPagoAteContemplacao;
    extrato.push({
      parcela: mes,
      creditoVigente: creditoVigenteNoMes,
      valorPago: pagaSemSeguro + (seguro ? seguroMensal : 0),
      saldoDevedor: Math.max(0, saldoTeorico),
      investimentoAcum: investimento,
      reajuste: isAniver ? indexPct : undefined,
    });
  }

  // Base de crédito ATUALIZADO usada para lances (ponto crucial)
  const creditoAtualParaLances = C_corr;

  // Lances
  const lanceOfertadoValor = creditoAtualParaLances * lanceOfertPct;
  const lanceEmbutidoValor = creditoAtualParaLances * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, creditoAtualParaLances - lanceEmbutidoValor);

  const valorCategoria = valorCategoriaBase;

  const saldoAntesLance = Math.max(0, (C_corr + admValor + frValor) - totalPagoAteContemplacao);
  let saldoAposLance = Math.max(0, saldoAntesLance - lanceOfertadoValor);

  // registra o mês da contemplação (abate do lance)
  const lastExtrato = extrato[extrato.length - 1];
  if (lastExtrato) {
    lastExtrato.lanceAplicado = lanceOfertadoValor;
    lastExtrato.saldoDevedor = saldoAposLance;
  }

  // ===== PÓS-CONTEMPLAÇÃO =====
  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C0);
  const parcelaLimitante = limitadorBase > 0 ? valorCategoria * limitadorBase : 0;

  const manterParcela = isServico || (isMoto && C0 < 20000);

  const prazoRestanteInicial = Math.max(1, prazo - mCont);
  let parcelaPosSemLimite = saldoAposLance / prazoRestanteInicial;

  let parcelaEscolhidaSemSeguro: number;
  let aplicouLimitador = false;
  if (!manterParcela) {
    if (parcelaLimitante > parcelaPosSemLimite) {
      parcelaEscolhidaSemSeguro = parcelaLimitante;
      aplicouLimitador = true;
    } else {
      parcelaEscolhidaSemSeguro = parcelaPosSemLimite;
    }
  } else {
    parcelaEscolhidaSemSeguro = parcelaPosSemLimite;
  }

  // Guarda a "primeira parcela pós contemplação" para UI
  const primeiraParcelaPos = parcelaEscolhidaSemSeguro;

  // Simula do mês mCont+1 até o fim (com reajustes no saldo)
  let saldo = saldoAposLance;
  let mesAtual = mCont + 1;
  let investimentoAcum = investimento;
  let creditoVigente = C_corr; // após contemplação, "Crédito" exibido = novoCredito (após embutido)
  while (mesAtual <= prazo && saldo > 0.01) {
    const isAniverPos = (mesAtual > 1) && ((mesAtual - 1) % 12 === 0);
    if (isAniverPos) {
      // reajuste no saldo
      const reaj = saldo * indexPct;
      saldo = saldo + reaj;
      // crédito exibido como referência (novo crédito corrige nos aniversários também para consulta)
      novoCredito * (1 + indexPct);
      extrato.push({
        parcela: mesAtual,
        creditoVigente: creditoVigente, // mantém referência
        valorPago: 0,
        saldoDevedor: saldo,
        investimentoAcum: investimentoAcum,
        reajuste: indexPct,
      });
    }

    const pagaSemSeguro = parcelaEscolhidaSemSeguro;
    saldo = Math.max(0, saldo - pagaSemSeguro);
    investimentoAcum += pagaSemSeguro + (seguro ? seguroMensal : 0);

    extrato.push({
      parcela: mesAtual,
      creditoVigente: creditoVigente,
      valorPago: pagaSemSeguro + (seguro ? seguroMensal : 0),
      saldoDevedor: saldo,
      investimentoAcum: investimentoAcum,
    });

    mesAtual++;
  }

  const newPrazo = Math.max(1, Math.ceil(saldoAposLance / parcelaEscolhidaSemSeguro));

  const has2aAntecipDepois = antecipParcelas >= 2 && mCont === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? primeiraParcelaPos + antecipAdicionalCada : null;

  return {
    valorCategoria,
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,
    novaParcelaSemLimite: saldoAposLance / Math.max(1, prazo - mCont),
    parcelaLimitante,
    parcelaEscolhida: primeiraParcelaPos,
    saldoDevedorFinal: saldoAposLance,
    novoPrazo: newPrazo,
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

  const [mgrOpen, setMgrOpen] = useState(false);

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

  const [userPhone, setUserPhone] = useState<string>("");
  const [assembleia, setAssembleia] = useState<string>("15/10");

  const [indicesList, setIndicesList] = useState<IndexRow[]>([]);
  const [indexCode, setIndexCode] = useState<string>("IPCA");
  const [refMonth, setRefMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [indexValues, setIndexValues] = useState<IndexValueRow[]>([]);
  const [acc12m, setAcc12m] = useState<number>(0);

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

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserPhone((data?.phone || "").toString());
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
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid) setLanceEmbutPct(lanceEmbutPctValid);
  }, [lanceEmbutPct]); // eslint-disable-line

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
    (async () => {
      const { data, error } = await supabase
        .from("sim_indices")
        .select("code,name")
        .order("name", { ascending: true });

      if (!error && data && data.length) {
        setIndicesList(data as IndexRow[]);
        if (!data.find((r: any) => r.code === indexCode)) {
          setIndexCode((data[0] as any).code);
        }
      } else {
        setIndicesList(DEFAULT_INDEXES);
        if (!DEFAULT_INDEXES.find(x => x.code === indexCode)) setIndexCode(DEFAULT_INDEXES[0].code);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!indexCode || !refMonth) return;
      const tryRpc = await supabase.rpc("sim_index_12m", {
        _code: indexCode,
        _ref_month: refMonth + "-01",
      });
      if (!tryRpc.error && typeof tryRpc.data === "number") {
        setAcc12m(Number(tryRpc.data) || 0);
        setIndexValues([]);
        return;
      }
      const [yy, mm] = refMonth.split("-").map((x) => parseInt(x, 10));
      const endDate = `${yy}-${String(mm).padStart(2, "0")}-01`;
      const d = new Date(yy, mm - 1, 1);
      d.setMonth(d.getMonth() - 13);
      const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("sim_indices_values")
        .select("ref_month,value")
        .eq("index_code", indexCode)
        .gte("ref_month", startDate)
        .lte("ref_month", endDate)
        .order("ref_month", { ascending: true });
      if (error) {
        console.error(error);
        setIndexValues([]);
        setAcc12m(0);
        return;
      }
      const rows = (data || []) as IndexValueRow[];
      setIndexValues(rows);
      setAcc12m(accumulated12m(rows));
    })();
  }, [indexCode, refMonth]);

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
      indexPct: acc12m || 0,
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

    const payload: any = {
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

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }
  const activeAdmin = admins.find((a) => a.id === activeAdminId);

  // Extrato PDF/Print
  function abrirExtrato() {
    if (!calc || !tabelaSelecionada) return;
    const corretora = "Consulmax";
    const adminNome = activeAdmin?.name || "";
    const userDigits = (userPhone || "").replace(/\\D/g, "");
    const wa = userDigits ? formatPhoneBR(userPhone) : "";
    const leadTel = formatPhoneBR(leadInfo?.telefone || "");

    const linhas = calc.extrato;
    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Extrato - Simulação</title>
        <style>
          body{font-family: Arial, sans-serif; padding: 20px;}
          h2{margin: 16px 0 8px;}
          table{width:100%; border-collapse: collapse; font-size:12px;}
          th,td{border:1px solid #ddd; padding:6px; text-align:right;}
          th:nth-child(1), td:nth-child(1){text-align:center;}
          .block{border:1px solid #ddd; padding:10px; margin-bottom:10px; font-size:13px;}
          .muted{color:#666;}
        </style>
      </head>
      <body>
        <h2>EXTRATO DETALHADO</h2>
        <div class="block">
          <strong>-------------- DADOS DA CORRETORA ---------------------</strong><br/>
          Corretora: ${corretora} | CNPJ: — | Telefone: — | Administradora: ${adminNome}<br/>
          Usuário: — | Telefone/Whats: ${wa || "—"}
        </div>
        <div class="block">
          <strong>-------------- DADOS DO CLIENTE ---------------------</strong><br/>
          Nome: ${leadInfo?.nome || "—"} | Telefone: ${leadTel || "—"}
        </div>
        <div class="block">
          <strong>------------- DADOS DA SIMULAÇÃO ---------------------</strong><br/>
          Segmento: ${tabelaSelecionada.segmento}<br/>
          % Taxa de Adm: ${(tabelaSelecionada.taxa_adm_pct*100).toFixed(4)}% | Valor da Taxa de Adm: ${brMoney(credito * tabelaSelecionada.taxa_adm_pct)}<br/>
          % Fundo Reserva: ${(tabelaSelecionada.fundo_reserva_pct*100).toFixed(4)}% | Valor do Fundo Reserva: ${brMoney(credito * tabelaSelecionada.fundo_reserva_pct)}<br/>
          % Antecipação: ${(tabelaSelecionada.antecip_pct*100).toFixed(4)}% | Valor da antecipação da taxa de adm: ${brMoney(credito * tabelaSelecionada.antecip_pct)}<br/>
          % Do limitador de Parcela: ${(resolveLimitadorPct(tabelaSelecionada.limitador_parcela_pct,tabelaSelecionada.segmento,credito)*100).toFixed(4)}%
        </div>

        <h2>Detalhamento da Simulação</h2>
        <table>
          <thead>
            <tr>
              <th>Parcela</th>
              <th>Crédito</th>
              <th>Valor Pago</th>
              <th>Saldo Devedor</th>
              <th>Investimento</th>
              <th class="muted">Reaj.</th>
              <th class="muted">Lance</th>
            </tr>
          </thead>
          <tbody>
            ${linhas.map(r => \`
              <tr>
                <td>\${r.parcela}</td>
                <td>\${(r.creditoVigente||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
                <td>\${(r.valorPago||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
                <td>\${(r.saldoDevedor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
                <td>\${(r.investimentoAcum||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
                <td class="muted">\${r.reajuste ? (r.reajuste*100).toFixed(2)+"%" : ""}</td>
                <td class="muted">\${r.lanceAplicado ? r.lanceAplicado.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : ""}</td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
        <br/>
        <button onclick="window.print()">Baixar em PDF</button>
      </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      alert("Habilite pop-ups para visualizar o extrato.");
    }
  }

  return (
    <div className="p-6 space-y-4">
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
              <Button variant="secondary" size="sm" onClick={() => setMgrOpen(true)} className="h-10 rounded-2xl px-4">
                Gerenciar Tabelas
              </Button>
              <Button variant="secondary" size="sm" onClick={() => alert("Em breve: adicionar administradora.")} className="h-10 rounded-2xl px-4 whitespace-nowrap">
                <Plus className="h-4 w-4 mr-1" /> Add Administradora
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
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
                    setSegmento={(v) => { setSegmento(v); setNomeTabela(""); setTabelaId(""); }}
                    nomeTabela={nomeTabela}
                    setNomeTabela={(v) => { setNomeTabela(v); setTabelaId(""); }}
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
                    onGerarExtrato={abrirExtrato}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Em breve: simulador para <strong>{activeAdmin.name}</strong>.
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground">Nenhuma administradora encontrada.</div>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            <Button variant="secondary" disabled={!calc} onClick={abrirExtrato} className="h-10 rounded-2xl px-4">
              Gerar Extrato
            </Button>
            {simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{simCode}</strong></span>}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div><div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div><div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div><div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div><div className="text-right">{seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}</div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Fundo Comum (fator)</div><div className="text-right">{calc ? (calc.fundoComumFactor * 100).toFixed(0) + "%" : "—"}</div>
                    <div>Taxa Adm (total)</div><div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div><div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div><div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div><div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Limitador Parcela</div><div className="text-right">{pctHuman(resolveLimitadorPct(tabelaSelecionada.limitador_parcela_pct, tabelaSelecionada.segmento, credito || 0))}</div>
                    <div>Valor de Categoria</div><div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Índice 12m */}
          <Card>
            <CardHeader><CardTitle>Índice de Correção / Reajuste (12m)</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Índice</Label>
                  <select className="w-full h-10 border rounded-md px-3" value={indexCode} onChange={(e) => setIndexCode(e.target.value)}>
                    {indicesList.map((it) => (<option key={it.code} value={it.code}>{it.name || it.code}</option>))}
                  </select>
                </div>
                <div>
                  <Label>Mês de referência</Label>
                  <Input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} />
                </div>
              </div>
              <div className="text-sm bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-2">
                <div>Acumulado 12 meses</div>
                <div className="text-right font-medium">{(acc12m * 100).toFixed(2)}%</div>
                <div className="col-span-2 text-muted-foreground text-xs leading-relaxed">
                  Pré-contemplação: reajuste anual incide sobre o <strong>crédito</strong> contratado.<br />
                  Pós-contemplação: reajuste anual incide sobre o <strong>saldo devedor</strong>.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabelas overlay removido por brevidade nesta entrega. */}
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
  onGerarExtrato: () => void;
};

function EmbraconSimulator(p: EmbraconProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <select className="w-full h-10 border rounded-md px-3" value={p.leadId} onChange={(e) => p.setLeadId(e.target.value)}>
                <option value="">Escolha um lead</option>
                {p.leads.map((l) => (<option key={l.id} value={l.id}>{l.nome}</option>))}
              </select>
              {p.leadInfo && <p className="text-xs text-muted-foreground mt-1">{p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}</p>}
            </div>
            <div>
              <Label>Nº do Grupo (opcional)</Label>
              <Input value={p.grupo} onChange={(e) => p.setGrupo(e.target.value)} placeholder="ex.: 9957" />
            </div>
          </div>
        </CardContent>
      </Card>

      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.segmento} onChange={(e) => p.setSegmento(e.target.value)}>
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <Label>Tabela</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.nomeTabela} disabled={!p.segmento} onChange={(e) => p.setNomeTabela(e.target.value)}>
                  <option value="">{p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}</option>
                  {p.nomesTabelaSegmento.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div>
                <Label>Prazo Até</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.tabelaId} disabled={!p.nomeTabela} onChange={(e) => p.setTabelaId(e.target.value)}>
                  <option value="">{p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}</option>
                  {p.variantesDaTabela.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Faixa de Crédito</Label>
                <Input value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div><Label>Valor do Crédito</Label><MoneyInput value={p.credito || 0} onChange={p.setCredito} /></div>
              <div><Label>Prazo da Venda (meses)</Label><Input type="number" value={p.prazoVenda || ""} onChange={(e) => p.setPrazoVenda(Number(e.target.value))} /></div>
              <div>
                <Label>Forma de Contratação</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.forma} disabled={!p.tabelaSelecionada} onChange={(e) => p.setForma(e.target.value as any)}>
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                </select>
              </div>
              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button type="button" className={p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={() => p.setSeguroPrest(true)}>Sim</Button>
                  <Button type="button" className={!p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={() => p.setSeguroPrest(false)}>Não</Button>
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
              {p.prazoAviso && <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div><Label>{p.tabelaSelecionada?.antecip_parcelas === 2 ? "Parcelas 1 e 2" : p.tabelaSelecionada?.antecip_parcelas === 1 ? "Parcela 1" : "Parcela Inicial"}</Label><Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly /></div>
              <div><Label>Demais Parcelas</Label><Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado (%)</Label><PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} /></div>
              <div><Label>Lance Embutido (%)</Label><PercentInput valueDecimal={p.lanceEmbutPct} onChangeDecimal={p.setLanceEmbutPct} maxDecimal={0.25} /></div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={p.parcContemplacao} onChange={(e) => p.setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
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
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={p.salvar} disabled={!p.calc || p.salvando} className="h-10 rounded-2xl px-4">
              {p.salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            <Button variant="secondary" onClick={p.onGerarExtrato} disabled={!p.calc} className="h-10 rounded-2xl px-4">
              Gerar Extrato
            </Button>
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}
