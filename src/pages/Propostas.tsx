// src/pages/Propostas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, ClipboardCopy, FileText, Trash2, Megaphone,
  Search, X, SlidersHorizontal, GripVertical, Download, Eye, EyeOff, Home, Banknote, TrendingUp
} from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList,
  RadialBarChart, RadialBar
} from "recharts";

import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ========================= Tipos ========================= */
type SimRow = {
  code: number;
  created_at: string;
  lead_nome: string | null;
  lead_telefone: string | null;
  segmento: string | null;
  grupo: string | null;

  credito: number | null;
  prazo_venda: number | null;
  parcela_contemplacao: number | null;

  novo_credito: number | null;
  parcela_escolhida: number | null;
  novo_prazo: number | null;

  parcela_ate_1_ou_2: number | null;
  parcela_demais: number | null;

  valor_categoria?: number | null;
  lance_ofertado_valor?: number | null;
  lance_embutido_valor?: number | null;
  lance_proprio_valor: number | null;
  lance_ofertado_pct?: number | null;
  lance_percebido_pct?: number | null;

  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;

  antecip_parcelas?: number | null;
};

type ModelKey =
  | "direcionada"
  | "venda_contemplada"
  | "alav_fin"
  | "alav_patr"
  | "previdencia"
  | "credito_correcao"
  | "extrato";

/* ======================= Helpers ========================= */
const brand = {
  header: "#0F1E36",
  primary: "#1E293F",
  accent: "#A11C27",
  grayRow: "#F3F4F6",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const LOGO_URL = "/logo-consulmax.png";

const brMoney = (v?: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function toDateInputValue(d: Date) {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const startOfDayISO = (d: string) => new Date(`${d}T00:00:00.000`).toISOString();
const endOfDayISO = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

function normalizeSegment(seg?: string | null) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "Imóvel";
  if (s.includes("moto")) return "Motocicleta";
  if (s.includes("serv")) return "Serviços";
  if (s.includes("pesad")) return "Pesados";
  if (s.includes("auto")) return "Automóvel";
  return seg || "Automóvel";
}
function emojiBySegment(seg?: string | null) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó")) return "🏠";
  if (s.includes("moto")) return "🏍️";
  if (s.includes("serv")) return "✈️";
  if (s.includes("pesad")) return "🚚";
  return "🚗";
}
function formatPhoneBR(s?: string | null) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}
function waMeLink(phone?: string | null) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "https://wa.me/";
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}
async function fetchAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/* ============ Percent helpers ============== */
function parsePercentInput(raw: string): number {
  const s = (raw || "").toString().trim().replace(/\s+/g, "");
  if (!s) return 0;
  const hasPercent = s.endsWith("%");
  const cleaned = s.replace("%", "").replace(".", "").replace(",", ".");
  const n = Number(cleaned);
  if (isNaN(n)) return 0;
  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}
function formatPercentFraction(frac: number, withSymbol = true): string {
  const pct = (frac * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return withSymbol ? `${pct}%` : pct;
}

/* ============== Finance helpers ============== */
function annualToMonthlyCompound(fracAnnual: number): number {
  return Math.pow(1 + (fracAnnual || 0), 1 / 12) - 1;
}
function pmt(i: number, n: number, pv: number): number {
  const rate = Number(i) || 0;
  const periods = Math.max(1, Math.round(Number(n) || 0));
  const principal = Math.max(0, Number(pv) || 0);
  if (rate === 0) return principal / periods;
  const f = Math.pow(1 + rate, periods);
  return principal * (rate * f) / (f - 1);
}

/* ==================== ENGINE (SSOT) ==================== */
type EngineParams = {
  selic_anual: number;
  cdi_anual: number;
  ipca12m: number;
  igpm12m: number;
  incc12m: number;
  inpc12m: number;

  fin_veic_mensal: number;
  fin_imob_anual: number;

  reforco_pct: number; // usado em "venda contemplada" e outros

  // NOVOS (Alavancagem Patrimonial)
  aluguel_pct: number;   // % do aluguel mensal sobre o crédito líquido
  airbnb_pct: number;    // % taxa Airbnb sobre o aluguel mensal
  condominio_pct: number; // % condomínio sobre o aluguel mensal
};

type EngineOut = {
  credito: number;
  prazo: number;
  segmento: string;
  labelParcelaInicial: string;
  parcelaInicialValor: number;
  parcelaDemaisValor: number;
  parcelaAposValor: number;
  prazoApos: number;

  adm?: number | null;
  fr?: number | null;
  valorCategoria?: number | null;
  encargos?: number | null;

  embutidoValor: number;
  lanceProprioValor: number;
  lancePct: number;

  nContemplacao: number;
  investido: number; // para "direcionada" e "venda contemplada" (até a contemplação)
  creditoLiberado: number;
  valorVenda: number; // usado em VC
  lucro: number;
  roi: number;
  rentabMes: number;
  pctCDI: number;
};

type PrevidenciaCalc = {
  cdiMes: number;
  indiceCM: number; // 99% do CDI mês
  rentabMes: number; // cdiMes * 0.99
  prazoAplicacao: number; // novo prazo
  creditoLiquido: number; // novo_credito
  investimento: number; // soma das parcelas pós + lance próprio (com reajustes)
  retornoBruto: number; // creditoLiquido*(1+rentabMes)^{prazo}
  retornoLiquido: number; // retornoBruto - investimento
  roi: number;
  roiMes: number;
  extrato: Array<{ mes: number; saldo: number; retorno: number; parcela: number; capital: number }>; // conforme tabela
};

type AlavPatrCalc = {
  // Entradas base
  creditoLiquido: number;         // crédito contrat. – embutido
  prazoPos: number;               // novo prazo
  parcelaPos: number;             // nova parcela
  aluguelMesBase: number;         // créditoLiquido * aluguel_pct

  // Fluxos (corrigidos por IGP-M anual)
  valorImovelCorrigidoFinal: number;
  totalAlugueisRecebidos: number;
  pagoPeloConsorcio: number;      // parcelas pós + lance próprio
  custoFinal: number;             // pagoPeloConsorcio – totalAlugueisRecebidos
  valorPagoPeloImovel: number;    // igual custoFinal (sem sinal)
  percPagoPeloImovel: number;     // quando custoFinal > 0 -> custoFinal / valorImovelCorrigidoFinal

  // Fluxo de caixa (médias)
  receitaMesMedia: number;
  parcelaConsorcioMedia: number;
  taxaAirbnbMes: number;
  condominioMes: number;
  lucroLiquidoMes: number;

  // Resultado
  retornoBruto: number;           // créditoLiquido*(1+rentabMes)^{prazoPos}
  investimento: number;           // pagoPeloConsorcio
  roi: number;
  rentabMesUsada: number;
};

/* =============== Funções principais ================= */
function labelInicialFromQtd(qtd?: number | null) {
  const n = Number(qtd || 0);
  if (!n || n <= 1) return "Parcela 1";
  if (n === 2) return "Parcela 1 e 2";
  return `Parcelas 1 a ${n}`;
}

function labelRangeParcela(inicio: number, fim: number) {
  if (inicio === fim) return `Parcela ${inicio}`;
  return `Parcelas ${inicio} a ${fim}`;
}

function buildParcelasAposLanceRows(out: EngineOut, sim: SimRow): [string, string][] {
  const rows: [string, string][] = [];

  const parcelaContemplacao = Math.max(0, Math.round(Number(out.nContemplacao || 0)));
  const prazoApos = Math.max(0, Math.round(Number(out.prazoApos || 0)));
  const antecipParcelas = Math.max(0, Math.round(Number(sim.antecip_parcelas || 0)));

  if (!parcelaContemplacao || !prazoApos) {
    rows.push(["Parcelas após o lance", brMoney(out.parcelaAposValor)]);
    return rows;
  }

  const primeiraParcelaAposContemplacao = parcelaContemplacao + 1;
  // Para exibição no PDF, o intervalo final deve terminar no novo prazo após o lance.
  // Ex.: prazo após o lance = 53 meses => "Parcelas 13 a 53", e não "13 a 54".
  const ultimaParcelaAposLance = prazoApos;

  // Diferença da antecipação antes da contemplação.
  // Ex.: Parcela 1 e 2 = 2.470,83; demais = 1.470,83; antecipação mensal = 1.000,00.
  // Após o lance, a parcela que ainda carrega antecipação deve ser:
  // parcela escolhida pós-lance + antecipação mensal.
  const antecipacaoMensal = Math.max(
    0,
    Number(sim.parcela_ate_1_ou_2 || 0) - Number(sim.parcela_demais || 0)
  );
  const parcelaAposLanceComAntecipacao = out.parcelaAposValor + antecipacaoMensal;

  const aindaTemAntecipacao =
    antecipParcelas > 0 && primeiraParcelaAposContemplacao <= antecipParcelas;

  if (aindaTemAntecipacao) {
    const fimAntecipacaoAposLance = Math.min(antecipParcelas, ultimaParcelaAposLance);

    rows.push([
      labelRangeParcela(primeiraParcelaAposContemplacao, fimAntecipacaoAposLance),
      brMoney(parcelaAposLanceComAntecipacao),
    ]);

    const inicioParcelaFinal = fimAntecipacaoAposLance + 1;

    if (inicioParcelaFinal <= ultimaParcelaAposLance) {
      rows.push([
        labelRangeParcela(inicioParcelaFinal, ultimaParcelaAposLance),
        brMoney(out.parcelaAposValor),
      ]);
    }

    return rows;
  }

  rows.push([
    labelRangeParcela(primeiraParcelaAposContemplacao, ultimaParcelaAposLance),
    brMoney(out.parcelaAposValor),
  ]);

  return rows;
}

function proposalEngine(sim: SimRow, p: EngineParams): EngineOut {
  const safe = (n: any) => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  };

  const C = safe(sim.credito);
  const seg = normalizeSegment(sim.segmento);
  const prazo = safe(sim.prazo_venda);

  const labelParcelaInicial = labelInicialFromQtd(sim.antecip_parcelas ?? 2);

  const adm = typeof sim.adm_tax_pct === "number" ? safe(sim.adm_tax_pct) : null;
  const fr  = typeof sim.fr_tax_pct  === "number" ? safe(sim.fr_tax_pct)  : null;

  // Prioriza os valores finais salvos pelo simulador.
  // Isso evita recalcular lance com base errada quando a administradora usa uma regra própria
  // (ex.: Maggi calcula o lance sobre crédito + taxas, e não apenas sobre o crédito).
  const valorCategoriaSalvo = safe(sim.valor_categoria);
  const valorCategoria = valorCategoriaSalvo > 0
    ? valorCategoriaSalvo
    : (typeof adm === "number" && typeof fr === "number" ? C * (1 + adm + fr) : null);

  const encargos = valorCategoria !== null && valorCategoria > 0
    ? Math.max(0, valorCategoria - C)
    : (typeof adm === "number" && typeof fr === "number" ? C * (adm + fr) : null);

  const novoCredito = safe(sim.novo_credito);

  const lanceOfertadoSalvo = safe(sim.lance_ofertado_valor);
  const lanceEmbutidoSalvo = safe(sim.lance_embutido_valor);
  const lanceProprioSalvo = safe(sim.lance_proprio_valor);

  const embutidoValor = lanceEmbutidoSalvo > 0
    ? lanceEmbutidoSalvo
    : Math.max(0, C - novoCredito);

  const lanceProprioValor = lanceProprioSalvo > 0
    ? lanceProprioSalvo
    : Math.max(0, lanceOfertadoSalvo - embutidoValor);

  const lanceOfertadoValor = lanceOfertadoSalvo > 0
    ? lanceOfertadoSalvo
    : Math.max(0, embutidoValor + lanceProprioValor);

  const baseLance = valorCategoria && valorCategoria > 0 ? valorCategoria : C;
  const lancePctInformado = safe(sim.lance_ofertado_pct);
  const lancePct = lancePctInformado > 0
    ? lancePctInformado
    : (baseLance > 0 ? lanceOfertadoValor / baseLance : 0);

  const n = safe(sim.parcela_contemplacao);
  const p1 = safe(sim.parcela_ate_1_ou_2);
  const pd = safe(sim.parcela_demais);
  const qtdIniciais = Math.max(1, Math.min(n || 0, safe(sim.antecip_parcelas || 1)));

  const investido = n > 0
    ? (p1 * qtdIniciais) + (pd * Math.max(0, n - qtdIniciais)) + lanceProprioValor
    : 0;

  const creditoLiberado = Math.max(0, novoCredito);
  const reforcoPct = safe(p.reforco_pct);
  const valorVenda = creditoLiberado * reforcoPct;
  const lucro = Math.max(0, valorVenda - investido);

  const roi = investido > 0 ? safe(lucro / investido) : 0;
  const cdiMensal = annualToMonthlyCompound(safe(p.cdi_anual));
  const rentabMes = n > 0 ? safe(Math.pow(1 + roi, 1 / n) - 1) : 0;
  const pctCDI = cdiMensal > 0 ? safe(rentabMes / cdiMensal) : 0;

  return {
    credito: C,
    prazo,
    segmento: seg,
    labelParcelaInicial,
    parcelaInicialValor: p1,
    parcelaDemaisValor: pd,
    parcelaAposValor: safe(sim.parcela_escolhida),
    prazoApos: safe(sim.novo_prazo),
    adm, fr, valorCategoria, encargos,
    embutidoValor, lanceProprioValor, lancePct: safe(lancePct),
    nContemplacao: n,
    investido,
    creditoLiberado,
    valorVenda,
    lucro,
    roi,
    rentabMes,
    pctCDI,
  };
}

// ======= Previdência – cálculos específicos =======
function buildPrevidencia(sim: SimRow, p: EngineParams, reajIndex: string): { core: PrevidenciaCalc; out: EngineOut } {
  const out = proposalEngine(sim, p);

  // CDI mês e rentabilidade
  const cdiMes = annualToMonthlyCompound(p.cdi_anual);
  const indiceCM = 0.99; // 99% do CDI mês
  const rentabMes = cdiMes * indiceCM;

  // Prazo pós-contemplação e crédito líquido (C - embutido)
  const prazoAplicacao = Math.max(0, out.prazoApos || 0);
  const creditoLiquido = Math.max(0, out.creditoLiberado || 0);

  // Índice de reajuste anual (12 em 12 meses)
  const idxAnnual =
    reajIndex === "igpm" ? (p.igpm12m || 0) :
    reajIndex === "incc" ? (p.incc12m || 0) :
    reajIndex === "inpc" ? (p.inpc12m || 0) : (p.ipca12m || 0);

  const extrato: Array<{ mes: number; saldo: number; retorno: number; parcela: number; capital: number }> = [];

  let parcelaAtual = Math.max(0, out.parcelaAposValor || 0);
  const nCont = Math.max(0, out.nContemplacao || 0);
  const isReajusteContrato = (globalMes: number) => globalMes >= 13 && (globalMes === 13 || (globalMes - 13) % 12 === 0);

  let saldo = creditoLiquido; // mês 1
  let investimentoSoma = Math.max(0, out.lanceProprioValor || 0);

  for (let m = 1; m <= prazoAplicacao; m++) {
    const globalMes = nCont + m;

    if (isReajusteContrato(globalMes) && m > 1) {
      parcelaAtual = parcelaAtual * (1 + idxAnnual);
    }

    const retorno = saldo * rentabMes;
    const capital = saldo + retorno;

    investimentoSoma += parcelaAtual;

    extrato.push({ mes: m, saldo, retorno, parcela: parcelaAtual, capital });

    saldo = capital;
  }

  const retornoBruto = creditoLiquido * Math.pow(1 + rentabMes, prazoAplicacao);
  const investimento = investimentoSoma;
  const retornoLiquido = Math.max(0, retornoBruto - investimento);
  const roi = investimento > 0 ? retornoLiquido / investimento : 0;
  const roiMes = prazoAplicacao > 0 ? (Math.pow(1 + roi, 1 / prazoAplicacao) - 1) : 0;

  const core: PrevidenciaCalc = {
    cdiMes,
    indiceCM,
    rentabMes,
    prazoAplicacao,
    creditoLiquido,
    investimento,
    retornoBruto,
    retornoLiquido,
    roi,
    roiMes,
    extrato,
  };

  return { core, out };
}

/* ======= Alavancagem Patrimonial – cálculos ======= */
function buildAlavPatr(sim: SimRow, p: EngineParams): { core: AlavPatrCalc; out: EngineOut } {
  const out = proposalEngine(sim, p);

  const creditoLiquido = Math.max(0, out.creditoLiberado || 0);
  const prazoPos = Math.max(0, out.prazoApos || 0);
  const parcelaPos = Math.max(0, out.parcelaAposValor || 0);

  const aluguelMesBase = creditoLiquido * (p.aluguel_pct || 0);

  // IGP-M aplicado anualmente (13º, 25º, ...)
  const nCont = Math.max(0, out.nContemplacao || 0);
  const isReajusteContrato = (globalMes: number) => globalMes >= 13 && (globalMes === 13 || (globalMes - 13) % 12 === 0);
  const igpmAnnual = p.igpm12m || 0;

  let alugAtual = aluguelMesBase;
  let totalAlugueisRecebidos = 0;

  // Valor do imóvel corrigido ao final do prazo (aplicando IGP-M anual)
  let valorImovelCorrigido = creditoLiquido;

  for (let m = 1; m <= prazoPos; m++) {
    const globalMes = nCont + m;

    if (isReajusteContrato(globalMes) && m > 1) {
      alugAtual = alugAtual * (1 + igpmAnnual);
      valorImovelCorrigido = valorImovelCorrigido * (1 + igpmAnnual);
    }

    totalAlugueisRecebidos += alugAtual;
  }

  const pagoPeloConsorcio = parcelaPos * prazoPos + Math.max(0, out.lanceProprioValor || 0);
  const custoFinal = Math.max(0, pagoPeloConsorcio - totalAlugueisRecebidos);
  const valorPagoPeloImovel = custoFinal;
  const percPagoPeloImovel = valorImovelCorrigido > 0 && valorPagoPeloImovel > 0
    ? Math.min(1, valorPagoPeloImovel / valorImovelCorrigido) : 0;

  // Fluxo de caixa — médias mensais
  const receitaMesMedia = prazoPos > 0 ? (totalAlugueisRecebidos / prazoPos) : 0;
  const parcelaConsorcioMedia = parcelaPos;
  const taxaAirbnbMes = receitaMesMedia * (p.airbnb_pct || 0);
  const condominioMes = receitaMesMedia * (p.condominio_pct || 0);
  const lucroLiquidoMes = receitaMesMedia - (parcelaConsorcioMedia + taxaAirbnbMes + condominioMes);

  // Resultado
  const rentabMesUsada = annualToMonthlyCompound(p.cdi_anual); // rentab mês via CDI
  const retornoBruto = creditoLiquido * Math.pow(1 + rentabMesUsada, prazoPos);
  const investimento = pagoPeloConsorcio;
  const roi = investimento > 0 ? (retornoBruto - investimento) / investimento : 0;

  const core: AlavPatrCalc = {
    creditoLiquido,
    prazoPos,
    parcelaPos,
    aluguelMesBase,
    valorImovelCorrigidoFinal: valorImovelCorrigido,
    totalAlugueisRecebidos,
    pagoPeloConsorcio,
    custoFinal,
    valorPagoPeloImovel,
    percPagoPeloImovel,
    receitaMesMedia,
    parcelaConsorcioMedia,
    taxaAirbnbMes,
    condominioMes,
    lucroLiquidoMes,
    retornoBruto,
    investimento,
    roi,
    rentabMesUsada
  };

  return { core, out };
}

/* ========================= Página ======================== */
export default function Propostas() {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);

  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);
  useEffect(() => setPage(1), [rows.length]);

  const [seller, setSeller] = useState<{ nome: string; phone: string; avatar_url?: string | null; }>(
    { nome: "Consultor Consulmax", phone: "" }
  );

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("nome, phone, telefone, avatar_url, photo_url")
        .eq("auth_user_id", uid)
        .maybeSingle();

      setSeller({
        nome: (data?.nome || "").toString().trim() || "Consultor Consulmax",
        phone: (data?.phone || data?.telefone || "").toString(),
        avatar_url: data?.avatar_url || data?.photo_url || null,
      });
    })();
  }, []);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  useEffect(() => { fetchAsDataURL(LOGO_URL).then(setLogoDataUrl); }, []);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("sim_simulations")
      .select([
        "code","created_at","lead_nome","lead_telefone","segmento","grupo",
        "credito","prazo_venda","parcela_contemplacao",
        "novo_credito","parcela_escolhida","novo_prazo",
        "parcela_ate_1_ou_2","parcela_demais",
        "valor_categoria",
        "lance_ofertado_valor","lance_embutido_valor","lance_proprio_valor",
        "lance_ofertado_pct","lance_percebido_pct",
        "adm_tax_pct","fr_tax_pct",
        "antecip_parcelas",
      ].join(","))
      .order("created_at", { ascending: false })
      .limit(300);

    if (dateFrom) query = query.gte("created_at", startOfDayISO(dateFrom));
    if (dateTo) query = query.lte("created_at", endOfDayISO(dateTo));
    if (q.trim()) {
      const like = `%${q.trim()}%`;
      query = query.or(`lead_nome.ilike.${like},lead_telefone.ilike.${like}`);
    }

    const { data, error } = await query;
    setLoading(false);
    if (error) { alert("Erro ao carregar simulações: " + error.message); return; }
    setRows((data || []) as SimRow[]);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(), 350); return () => clearTimeout(t); }, [q, dateFrom, dateTo]);

  type Params = EngineParams;
  const DEFAULT_PARAMS: Params = {
    selic_anual: 0.15,
    cdi_anual: 0.149,
    ipca12m: 0.0535,
    igpm12m: 0.0,
    incc12m: 0.0,
    inpc12m: 0.0,
    fin_veic_mensal: 0.021,
    fin_imob_anual: 0.11,
    reforco_pct: 0.20,
    aluguel_pct: 0.0065,      // 0,65% a.m. (exemplo)
    airbnb_pct: 0.03,         // 3% sobre o aluguel
    condominio_pct: 0.02      // 2% sobre o aluguel
  };
  const [params, setParams] = useState<Params>(() => {
    try { const raw = localStorage.getItem("proposalParamsV4"); if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) }; } catch {}
    return DEFAULT_PARAMS;
  });
  const [paramOpen, setParamOpen] = useState(false);
  const cdiMensal = useMemo(() => annualToMonthlyCompound(params.cdi_anual), [params.cdi_anual]);
  const ipcaMensal = useMemo(() => (params.ipca12m || 0) / 12, [params.ipca12m]);
  const igpmMensal = useMemo(() => (params.igpm12m || 0) / 12, [params.igpm12m]);
  const inccMensal = useMemo(() => (params.incc12m || 0) / 12, [params.incc12m]);
  const inpcMensal = useMemo(() => (params.inpc12m || 0) / 12, [params.inpc12m]);
  function saveParams(p: Params) {
    setParams(p);
    try { localStorage.setItem("proposalParamsV4", JSON.stringify(p)); } catch {}
    setParamOpen(false);
  }

  const [model, setModel] = useState<ModelKey>("direcionada");
  const [active, setActive] = useState<SimRow | null>(null);
  useEffect(() => { setActive(pagedRows[0] ?? null); }, [pagedRows]);

  const [resultsOpen, setResultsOpen] = useState(true);

  // Índice de reajuste (somente para Previdência)
  type ReajIndex = "ipca" | "igpm" | "incc" | "inpc";
  const [reajIndex, setReajIndex] = useState<ReajIndex>(() => {
    try { return (localStorage.getItem("prevReajIndex") as ReajIndex) || "ipca"; } catch { return "ipca"; }
  });
  useEffect(() => { try { localStorage.setItem("prevReajIndex", reajIndex); } catch {} }, [reajIndex]);

  type BlockId = "header" | "specs" | "parcelas" | "lance" | "projecao" | "graficos" | "obs" | "prev-extrato";
  const DEFAULT_LAYOUT: Record<ModelKey, BlockId[]> = {
    direcionada: ["header","specs","parcelas","lance","graficos","obs","projecao"],
    venda_contemplada: ["header","specs","parcelas","projecao","graficos","lance","obs"],
    alav_fin: ["header","specs","graficos","obs"],
    alav_patr: ["header","specs","parcelas","projecao","graficos","lance","obs"], // mantém igual Direcionada + blocos próprios
    previdencia: ["header","specs","parcelas","lance","projecao","graficos","prev-extrato","obs"],
    credito_correcao: ["header","specs","graficos","obs"],
    extrato: ["header","specs","obs"],
  };
  const [layout, setLayout] = useState<BlockId[]>(() => DEFAULT_LAYOUT[model]);
  useEffect(() => { setLayout(DEFAULT_LAYOUT[model]); }, [model]);
  const persistLayout = (arr: BlockId[]) => {
    try {
      const raw = localStorage.getItem("proposalLayoutsV2");
      const parsed = raw ? JSON.parse(raw) as Record<ModelKey, BlockId[]> : {} as Record<ModelKey, BlockId[]>;
      parsed[model] = arr;
      localStorage.setItem("proposalLayoutsV2", JSON.stringify(parsed));
    } catch {}
  };
  function SortableItem({ id, children }: { id: BlockId; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.8 : 1 };
    return (
      <div ref={setNodeRef} style={style} className="relative">
        <div className="absolute -left-3 -top-3 text-muted-foreground/70 cursor-grab">
          <span {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></span>
        </div>
        {children}
      </div>
    );
  }
  const onDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.indexOf(active.id);
    const newIndex = layout.indexOf(over.id);
    const arr = arrayMove(layout, oldIndex, newIndex);
    setLayout(arr); persistLayout(arr);
  };

  function copyOportunidadeText(r: SimRow) {
    const segNorm = normalizeSegment(r.segmento);
    const emoji = emojiBySegment(r.segmento);
    const text = `🚨OPORTUNIDADE 🚨\n\n🔥 PROPOSTA EMBRACON🔥\n\nProposta ${segNorm}\n\n${emoji} Crédito: ${brMoney(r.novo_credito)}\n💰 Parcela 1: ${brMoney(r.parcela_ate_1_ou_2)} (Em até 3x no cartão)\n📆 + ${r.novo_prazo ?? 0}x de ${brMoney(r.parcela_escolhida)}\n💵 Lance Próprio: ${brMoney(r.lance_proprio_valor)}\n📢 Grupo: ${r.grupo || "—"}\n\n🚨 POUCAS VAGAS DISPONÍVEIS🚨\n\nAssembleia 15/10\n\n📲 Garanta sua vaga agora!\n${formatPhoneBR(seller.phone) || "-"}\n\nVantagens\n✅ Primeira parcela em até 3x no cartão\n✅ Parcelas acessíveis\n✅ Alta taxa de contemplação`;
    navigator.clipboard.writeText(text).then(() => alert("Oportunidade copiada!"))
      .catch(() => alert("Não foi possível copiar."));
  }
  function copyResumoText(r: SimRow) {
    const out = proposalEngine(r, params);
    const nCont = out.nContemplacao || 0;
    const wa = waMeLink(seller.phone);

    const text =
`🎯 Com a estratégia certa, você conquista seu imóvel sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(r.credito)}
💳 ${out.labelParcelaInicial}: ${brMoney(r.parcela_ate_1_ou_2)}

💵 Demais parcelas até a contemplação: ${brMoney(r.parcela_demais)}

📈 Após a contemplação (prevista em ${nCont} meses): ${brMoney(r.parcela_escolhida)}
🏦 Lance próprio: ${brMoney(r.lance_proprio_valor)}

✅ Crédito líquido liberado: ${brMoney(r.novo_credito)}

📆 Parcelas restantes (valor): ${brMoney(r.parcela_escolhida)}

⏳ Prazo restante: ${r.novo_prazo ?? 0} meses

💡 Um planejamento inteligente que cabe no seu bolso e acelera a realização do seu sonho!

👉 Quer simular com o valor do seu imóvel dos sonhos?
Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`;

    navigator.clipboard.writeText(text).then(() => alert("Resumo copiado!"))
      .catch(() => alert("Não foi possível copiar."));
  }
  async function handleDelete(code: number) {
    if (!confirm(`Excluir a simulação #${code}?`)) return;
    const { error } = await supabase.from("sim_simulations").delete().eq("code", code);
    if (error) { alert("Erro ao excluir: " + error.message); return; }
    setRows((prev) => prev.filter((x) => x.code !== code));
  }

  const headerBand = (doc: jsPDF, title: string) => {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(brand.header as any); doc.rect(0, 0, w, 90, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.setTextColor("#FFFFFF"); doc.text(title, 40, 60);
    if (logoDataUrl) {
      const props = (doc as any).getImageProperties(logoDataUrl);

      // +30% no tamanho máximo (mantendo proporção)
      const maxW = 120 * 1.3;
      const maxH = 34 * 1.3;

      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const lw = props.width * ratio, lh = props.height * ratio;

      doc.addImage(logoDataUrl, "PNG", w - lw - 40, 30, lw, lh);
    }
  };
  const addFooter = (doc: jsPDF) => {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const yTop = h - 70;
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(1); doc.line(40, yTop, w - 40, yTop);
    doc.setFont("helvetica","normal"); doc.setTextColor(90,90,90); doc.setFontSize(9);
    const lines = [
      "Consulmax Consórcios e Investimentos • CNPJ: 57.942.043/0001-03",
      `Consultor responsável: ${seller.nome} • Whats: ${formatPhoneBR(seller.phone) || "-"}`,
      "consulmaxconsorcios.com.br • Ji-Paraná/RO",
    ];
    let y = yTop + 18; lines.forEach((t) => { doc.text(t, w - 40, y, { align: "right" as any }); y += 12; });
  };

  // ====== PDF SIMPLIFICADO (com regras por modelo) ======
  function pdfSimplificado(sim: SimRow, modelKey: ModelKey) {
    const titleMap: Record<ModelKey, string> = {
      direcionada: "Proposta Direcionada",
      venda_contemplada: "Venda Contemplada",
      alav_fin: "Alavancagem Financeira",
      alav_patr: "Alavancagem Patrimonial",
      previdencia: "Previdência",
      credito_correcao: "Crédito c/ Correção",
      extrato: "Extrato",
    };

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const out = proposalEngine(sim, params);
    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.text(titleMap[modelKey], 40, 60);
    doc.setFont("helvetica","normal"); doc.setFontSize(12);

    const baseRows: (string | number)[][] = [
      ["Crédito", brMoney(out.credito)],
      ["Prazo", `${out.prazo || 0} meses`],
      ["Segmento", out.segmento],
      [out.labelParcelaInicial, brMoney(out.parcelaInicialValor)],
      ["Demais até contemplação", brMoney(out.parcelaDemaisValor)],
      ["Parcela após o lance", brMoney(out.parcelaAposValor)],
      ["Prazo após o lance", out.prazoApos ? `${out.prazoApos} meses` : "—"],
      ["Lance Embutido", brMoney(out.embutidoValor)],
      ["Lance Próprio", brMoney(out.lanceProprioValor)],
    ];

    if (modelKey === "previdencia") {
      const { core } = buildPrevidencia(sim, params, reajIndex);
      baseRows.push(
        ["Crédito (líquido)", brMoney(core.creditoLiquido)],
        ["CDI Mês", formatPercentFraction(core.cdiMes)],
        ["Índice CM", "99% do CDI"],
        ["Rentabilidade Mês", formatPercentFraction(core.rentabMes)],
        ["Prazo (pós)", `${core.prazoAplicacao} meses`],
        ["Retorno", brMoney(core.retornoBruto)],
        ["Investimento (parcelas + lance)", brMoney(core.investimento)],
        ["Retorno Líquido", brMoney(core.retornoBruto - core.investimento)],
        ["ROI", formatPercentFraction(core.roi)],
        ["ROI Mês", formatPercentFraction(core.roiMes)],
      );
    } else if (modelKey === "alav_patr") {
      const { core } = buildAlavPatr(sim, params);
      baseRows.push(
        ["Crédito (líquido)", brMoney(core.creditoLiquido)],
        ["Prazo (pós)", `${core.prazoPos} meses`],
        ["Parcela (pós)", brMoney(core.parcelaPos)],
        ["Aluguel Mês (base)", brMoney(core.aluguelMesBase)],
        ["Valor do Imóvel Corrigido", brMoney(core.valorImovelCorrigidoFinal)],
        ["Aluguéis Recebidos (total)", brMoney(core.totalAlugueisRecebidos)],
        ["Pago pelo Consórcio", brMoney(core.pagoPeloConsorcio)],
        ["Custo Final (Consórcio – Aluguéis)", brMoney(core.custoFinal)],
        ["% Pago pelo Imóvel", formatPercentFraction(core.percPagoPeloImovel)],
        ["Receita Mês (média)", brMoney(core.receitaMesMedia)],
        ["Parcela Consórcio (média)", brMoney(core.parcelaConsorcioMedia)],
        ["Taxa Airbnb (mês)", brMoney(core.taxaAirbnbMes)],
        ["Condomínio (mês)", brMoney(core.condominioMes)],
        ["Lucro Líquido mês (média)", brMoney(core.lucroLiquidoMes)],
        ["Retorno (bruto)", brMoney(core.retornoBruto)],
        ["Investimento (parcelas + lance)", brMoney(core.investimento)],
        ["ROI", formatPercentFraction(core.roi)]
      );
    } else if (modelKey !== "direcionada") {
      baseRows.push(
        ["Crédito Liberado", brMoney(out.creditoLiberado)],
        ["Valor da Venda (Crédito Liberado × Ganho %)", brMoney(out.valorVenda)],
        ["Investido até contemplação", brMoney(out.investido)],
        ["Lucro Líquido", brMoney(out.lucro)],
        ["ROI", formatPercentFraction(out.roi)],
        ["Rentab/mês", formatPercentFraction(out.rentabMes)],
        ["% do CDI (mês)", `${(out.pctCDI * 100).toFixed(0)}%`],
      );
    } else {
      baseRows.push(["Crédito Liberado", brMoney(out.creditoLiberado)]);
    }

    (doc as any).autoTable({
      startY: 90,
      head: [["Campo", "Valor"]],
      body: baseRows as any,
      styles: { font: "helvetica", fontSize: 10, halign: "left" },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });

    doc.save(`${titleMap[modelKey].replace(/\s+/g,'_')}_${sim.code}.pdf`);
  }

  /* ======= PDF COMPLETO — DIRECIONADA ======= */
  function gerarPDFDirecionada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const out = proposalEngine(sim, params);
    const parcelasAposLanceRows = buildParcelasAposLanceRows(out, sim);
    const admPctLabel = typeof out.adm === "number" ? formatPercentFraction(out.adm) : "—";
    const frPctLabel = typeof out.fr === "number" ? formatPercentFraction(out.fr) : "—";
    const w = doc.internal.pageSize.getWidth();
    const marginX = 34;

    // Cabeçalho + Discleimer
    const segTitle = normalizeSegment(sim.segmento);
    headerBand(doc, `Consórcio — Crédito ${segTitle}`);

    // linha menor abaixo do título
    doc.setFont("helvetica","normal");
    doc.setFontSize(11);
    doc.setTextColor("#FFFFFF");
    doc.text(
      `Projeto especialmente elaborado para ${((sim.lead_nome || "—").toString().trim() || "—")}`,
      marginX,
      78
    );

    doc.setFont("helvetica","normal"); doc.setTextColor(40); doc.setFontSize(10);
    const disclaimer =
      "Essa proposta foi desenhada para quem busca um crédito alto com inteligência financeira, seja para compra de um veículo, ampliação patrimonial ou alavancagem de investimentos, com máxima eficiência.";
    doc.text(disclaimer, marginX, 100, { maxWidth: w - marginX * 2 });

    // ===== ESPECIFICAÇÕES DA PROPOSTA =====
    (doc as any).autoTable({
      startY: 118,
      head: [["ESPECIFICAÇÕES DA PROPOSTA", ""]],
      body: [
        ["Crédito Contratado", brMoney(out.credito)],
        ["Prazo", out.prazo ? `${out.prazo} Meses` : "—"],
        ["Taxa de Adm total", admPctLabel],
        ["Fundo Reserva", frPctLabel],
        ["Total de Encargos", out.encargos !== null ? brMoney(out.encargos!) : "—"],
        ["Taxa total mensalizada", (typeof out.adm === "number" && out.prazo)
          ? formatPercentFraction((out.adm || 0) / (out.prazo || 1))
          : "—" ],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
      tableWidth: w - marginX * 2,
    });

    // ===== SIMULAÇÃO DE PARCELAS =====
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["SIMULAÇÃO DE PARCELAS", "Valor"]],
      body: [
        [out.labelParcelaInicial, brMoney(out.parcelaInicialValor)],
        ["Demais", brMoney(out.parcelaDemaisValor)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
      tableWidth: w - marginX * 2,
    });
    doc.setFontSize(8); doc.setTextColor(90);
    doc.text(
      "“Observação”: o valor total será proporcionalmente ajustado à taxa e fundo, diluído conforme a estratégia de lance.",
      marginX, (doc as any).lastAutoTable.finalY + 10
    );

    // ===== ESTRATÉGIA COM LANCE =====
    const yTitle = (doc as any).lastAutoTable.finalY + 26;
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(`ESTRATÉGIA COM LANCE DE ${formatPercentFraction(out.lancePct)}`, marginX, yTitle);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`“A simulação abaixo prevê contemplação em ${out.nContemplacao || 0} meses”`, marginX, yTitle + 14);

    // Quadro comparativo — 2 colunas (Financiamento x Consórcio)
    const colW = (w - marginX * 2 - 12) / 2;
    const left = marginX;
    const right = marginX + colW + 12;

    const taxaFinMensal =
      out.segmento === "Automóvel" || out.segmento === "Motocicleta"
        ? params.fin_veic_mensal
        : annualToMonthlyCompound(params.fin_imob_anual);
    const parcelaFin = pmt(taxaFinMensal, out.prazoApos || 0, out.creditoLiberado || 0);
    const custoFinalFin = parcelaFin * (out.prazoApos || 0) - (out.creditoLiberado || 0);

    (doc as any).autoTable({
      startY: yTitle + 28,
      head: [["FINANCIAMENTO", ""]],
      body: [
        ["Crédito", brMoney(out.creditoLiberado)],
        ["Parcelas", brMoney(parcelaFin)],
        ["Prazo", out.prazoApos ? `${out.prazoApos} meses` : "—"],
        ["Custo Final", brMoney(custoFinalFin)],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left, right: left + colW },
      tableWidth: colW,
      theme: "grid",
      alternateRowStyles: { fillColor: brand.grayRow },
    });

    const custoFinalCons = out.encargos || 0;
    (doc as any).autoTable({
      startY: yTitle + 28,
      head: [["CONSÓRCIO", ""]],
      body: [
        ["Lance Pago", brMoney(out.lanceProprioValor)],
        ...parcelasAposLanceRows,
        ["Prazo após o lance", out.prazoApos ? `${out.prazoApos} meses` : "—"],
        ["Crédito Recebido", brMoney(out.creditoLiberado)],
        ["Custo Final", brMoney(custoFinalCons)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: right, right: right + colW },
      tableWidth: colW,
      theme: "grid",
      alternateRowStyles: { fillColor: brand.grayRow },
    });

    const yAfterTables = Math.max((doc as any).lastAutoTable.finalY, (doc as any).lastAutoTable.finalY) + 10;
    const economia = Math.max(0, custoFinalFin - custoFinalCons);
    (doc as any).autoTable({
      startY: yAfterTables,
      head: [["Comparativo de custos entre consórcio e financiamento", "Valor"]],
      body: [["Economia com o Consórcio >>>", brMoney(economia)]],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: marginX, right: marginX },
      tableWidth: w - marginX * 2,
      theme: "grid",
      alternateRowStyles: { fillColor: brand.grayRow },
    });

    const mid = marginX + (w - marginX * 2) / 2 - 6;
    const yDiff = (doc as any).lastAutoTable.finalY + 8;
    (doc as any).autoTable({
      startY: yDiff,
      head: [["NOSSOS DIFERENCIAIS"]],
      body: [
        ["Sem juros: Você economiza centenas de milhares ao longo dos anos;"],
        ["Planejamento de Contemplação com estratédia de lance;"],
        ["Acompanhamento completo até a entrega do bem;"],
        ["Flexibilidade para uso do crédito: Aquisição de um bem, Venda com Ágio, Previdência Aplicada, investimento, renda passiva, etc."],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: marginX, right: mid },
      tableWidth: (w - marginX * 2) / 2 - 6,
      theme: "grid",
      columnStyles: { 0: { cellWidth: "wrap" } },
    });

    (doc as any).autoTable({
      startY: yDiff,
      head: [["RESUMO", "Valor"]],
      body: [
        ["Crédito", brMoney(out.credito)],
        [out.labelParcelaInicial, brMoney(out.parcelaInicialValor)],
        ["Demais  (Até a contemplação)", brMoney(out.parcelaDemaisValor)],
        [`Taxa de adm total (${admPctLabel})`, typeof out.adm === "number" ? brMoney((out.credito || 0) * (out.adm || 0)) : "—"],
        [`Fundo de Reserva (${frPctLabel})`, typeof out.fr === "number" ? brMoney((out.credito || 0) * (out.fr || 0)) : "—"],
        ["Total do Plano", out.valorCategoria !== null ? brMoney(out.valorCategoria) : "—"],
        ["Lance Sugerido", brMoney(out.lanceProprioValor + out.embutidoValor)],
        ["Crédito sem embutido", brMoney(out.credito)],
        ["Crédito com embutido", brMoney(out.creditoLiberado)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: mid + 12, right: marginX },
      tableWidth: (w - marginX * 2) / 2 - 6,
      theme: "grid",
    });

    const yFinal = Math.max((doc as any).lastAutoTable.finalY, (doc as any).lastAutoTable.finalY) + 8;
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(90);
    doc.text(
      "Atenção: A presente proposta refere-se a uma simulação, NÃO sendo configurada como promessa de contemplação, podendo a mesma ocorrer antes ou após o prazo previsto.",
      marginX, yFinal, { maxWidth: w - marginX * 2 }
    );

    addFooter(doc);
    doc.save(`Proposta_Direcionada_${sim.code}.pdf`);
  }

  /* ======= PDF COMPLETO — Venda Contemplada ======= */
  function gerarPDFVendaContemplada(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const out = proposalEngine(sim, params);
    const marginX = 40;

    headerBand(doc, "Venda Contemplada");

    (doc as any).autoTable({
      startY: 120,
      head: [["Especificações", ""]],
      body: [
        ["Crédito contratado", brMoney(out.credito)],
        ["Taxa de adm (total)", typeof out.adm === "number" ? formatPercentFraction(out.adm) : "—"],
        ["Prazo", out.prazo ? `${out.prazo} meses` : "—"],
        ["Fundo de Reserva", typeof out.fr === "number" ? formatPercentFraction(out.fr) : "—"],
        ["Segmento", out.segmento],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      alternateRowStyles: { fillColor: brand.grayRow },
      styles: { fontSize: 9, cellPadding: 4 },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["Parcelas até a contemplação", "Valor"]],
      body: [
        [out.labelParcelaInicial, brMoney(out.parcelaInicialValor)],
        ["Demais", brMoney(out.parcelaDemaisValor)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      alternateRowStyles: { fillColor: brand.grayRow },
      styles: { fontSize: 9, cellPadding: 4 },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["Projeção na Venda", ""]],
      body: [
        ["Crédito Liberado (Crédito – Embutido)", brMoney(out.creditoLiberado)],
        ["Ganho na Venda (%)", formatPercentFraction(params.reforco_pct)],
        ["Valor da Venda (Crédito Liberado × Ganho %)", brMoney(out.valorVenda)],
        ["Investido até a contemplação", brMoney(out.investido)],
        ["Lucro (Venda – Investido)", brMoney(out.lucro)],
        ["ROI", formatPercentFraction(out.roi)],
        ["Rentabilidade Mês", formatPercentFraction(out.rentabMes)],
        ["% do CDI (mês)", `${(out.pctCDI * 100).toFixed(0)}%`],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      alternateRowStyles: { fillColor: brand.grayRow },
      styles: { fontSize: 9, cellPadding: 4 },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [["Estratégia de Lance", "Valor"]],
      body: [
        ["Lance Embutido", brMoney(out.embutidoValor)],
        ["Lance Próprio (pago)", brMoney(out.lanceProprioValor)],
        ["Parcela após o lance (e prazo)", `${brMoney(out.parcelaAposValor)} (${out.prazoApos || 0}x)`],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      alternateRowStyles: { fillColor: brand.grayRow },
      styles: { fontSize: 9, cellPadding: 4 },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    const yEnd = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(80,80,80);
    doc.text(
      "Atenção: Simulação não é garantia de contemplação; esta pode ocorrer antes ou depois do prazo previsto.",
      marginX, yEnd, { maxWidth: doc.internal.pageSize.getWidth() - marginX*2 }
    );

    addFooter(doc);
    doc.save(`Venda_Contemplada_${sim.code}.pdf`);
  }

  /* ======= PDF COMPLETO — Previdência ======= */
  function gerarPDFPrevidencia(sim: SimRow) {
    const { core, out } = buildPrevidencia(sim, params, reajIndex);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 40;

    headerBand(doc, "Previdência — Con contemplação aplicada");

    (doc as any).autoTable({
      startY: 120,
      head: [["Especificações", ""]],
      body: [
        ["Crédito Contratado", brMoney(out.credito)],
        ["Prazo (contrato)", out.prazo ? `${out.prazo} meses` : "—"],
        ["Taxa de Adm total", typeof out.adm === "number" ? formatPercentFraction(out.adm) : "—"],
        ["Fundo Reserva", typeof out.fr === "number" ? formatPercentFraction(out.fr) : "—"],
        ["Segmento", out.segmento],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Parcelas até a contemplação", "Valor"]],
      body: [[out.labelParcelaInicial, brMoney(out.parcelaInicialValor)], ["Demais", brMoney(out.parcelaDemaisValor)]],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Estratégia de Lance", "Valor"]],
      body: [
        ["Lance Embutido", brMoney(out.embutidoValor)],
        ["Lance Próprio", brMoney(out.lanceProprioValor)],
        ["Parcela após o lance (e prazo)", `${brMoney(out.parcelaAposValor)} (${out.prazoApos}x)`],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Previdência — Resultados", "Valor"]],
      body: [
        ["Crédito (líquido)", brMoney(core.creditoLiquido)],
        ["CDI Mês", formatPercentFraction(core.cdiMes)],
        ["Índice CM", "99% do CDI"],
        ["Rentabilidade Mês", formatPercentFraction(core.rentabMes)],
        ["Prazo de Aplicação (meses)", `${core.prazoAplicacao}`],
        ["Retorno (bruto)", brMoney(core.retornoBruto)],
        ["Investimento (parcelas + lance)", brMoney(core.investimento)],
        ["Retorno Líquido", brMoney(core.retornoBruto - core.investimento)],
        ["ROI", formatPercentFraction(core.roi)],
        ["ROI Mês", formatPercentFraction(core.roiMes)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Extrato
    const head = [["Mês", "Saldo", "Retorno", "Parcela", "Capital"]];
    const bodyAll = core.extrato.map(l => [
      l.mes,
      brMoney(l.saldo),
      brMoney(l.retorno),
      brMoney(l.parcela),
      brMoney(l.capital),
    ]);
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head,
      body: bodyAll,
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
      pageBreak: 'auto'
    });

    addFooter(doc);
    doc.save(`Previdencia_${sim.code}.pdf`);
  }

  /* ======= PDF COMPLETO — Alavancagem Patrimonial ======= */
  function gerarPDFAlavPatr(sim: SimRow) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const { core, out } = buildAlavPatr(sim, params);
    const marginX = 40;

    headerBand(doc, "Alavancagem Patrimonial");

    // Especificações (iguais à Direcionada)
    (doc as any).autoTable({
      startY: 120,
      head: [["Especificações", ""]],
      body: [
        ["Crédito Contratado", brMoney(out.credito)],
        ["Prazo (contrato)", out.prazo ? `${out.prazo} meses` : "—"],
        ["Taxa de Adm total", typeof out.adm === "number" ? formatPercentFraction(out.adm) : "—"],
        ["Fundo Reserva", typeof out.fr === "number" ? formatPercentFraction(out.fr) : "—"],
        ["Segmento", out.segmento],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Parcelas até a contemplação
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Parcelas até a contemplação", "Valor"]],
      body: [
        [out.labelParcelaInicial, brMoney(out.parcelaInicialValor)],
        ["Demais", brMoney(out.parcelaDemaisValor)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Estratégia de Lance (após)
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Estratégia de Lance (pós)", "Valor"]],
      body: [
        ["Lance Embutido", brMoney(out.embutidoValor)],
        ["Lance Próprio", brMoney(out.lanceProprioValor)],
        ["Parcela após o lance (e prazo)", `${brMoney(out.parcelaAposValor)} (${out.prazoApos || 0}x)`],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    // Bloco Alavancagem Patrimonial — Fluxos & Resultado
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Fluxos", "Valor"]],
      body: [
        ["Crédito (líquido)", brMoney(core.creditoLiquido)],
        ["Prazo (pós)", `${core.prazoPos} meses`],
        ["Parcela (pós)", brMoney(core.parcelaPos)],
        ["Aluguel Mês (base)", brMoney(core.aluguelMesBase)],
        ["Valor do Imóvel Corrigido (final)", brMoney(core.valorImovelCorrigidoFinal)],
        ["Aluguéis Recebidos (total)", brMoney(core.totalAlugueisRecebidos)],
        ["Pago pelo Consórcio", brMoney(core.pagoPeloConsorcio)],
        ["Custo Final (Consórcio – Aluguéis)", brMoney(core.custoFinal)],
        ["% Pago pelo Imóvel", formatPercentFraction(core.percPagoPeloImovel)],
        ["Receita Mês (média)", brMoney(core.receitaMesMedia)],
        ["Parcela Consórcio (média)", brMoney(core.parcelaConsorcioMedia)],
        ["Taxa Airbnb (mês)", brMoney(core.taxaAirbnbMes)],
        ["Condomínio (mês)", brMoney(core.condominioMes)],
        ["Lucro Líquido mês (média)", brMoney(core.lucroLiquidoMes)],
      ],
      headStyles: { fillColor: brand.accent, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Resultado", "Valor"]],
      body: [
        ["Retorno (bruto)", brMoney(core.retornoBruto)],
        ["Investimento (parcelas + lance)", brMoney(core.investimento)],
        ["ROI", formatPercentFraction(core.roi)],
      ],
      headStyles: { fillColor: brand.primary, textColor: "#fff" },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: brand.grayRow },
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });

    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(80,80,80);
    doc.text(
      "Observação: Aluguéis e imóvel são corrigidos anualmente pelo IGP-M informado em Parâmetros.",
      marginX, (doc as any).lastAutoTable.finalY + 12,
      { maxWidth: doc.internal.pageSize.getWidth() - marginX*2 }
    );

    addFooter(doc);
    doc.save(`Alavancagem_Patrimonial_${sim.code}.pdf`);
  }

  /* ================== PREVIEW (BLOCOS) ================== */
  const PreviewBlock = ({ sim, model }: { sim: SimRow; model: ModelKey }) => {
    if (!sim) return null;

    const out = proposalEngine(sim, params);

    // === Gráficos: alinhar com o PDF ===
    let barData: { name: string; valor: number }[] = [];
    let radialValuePct = 0;
    let radialLabel = "";

    // Dados adicionais
    let prevCore: PrevidenciaCalc | null = null;
    let apCore: AlavPatrCalc | null = null;

    if (model === "previdencia") {
      prevCore = buildPrevidencia(sim, params, reajIndex).core;
    }
    if (model === "alav_patr") {
      apCore = buildAlavPatr(sim, params).core;
    }

    if (model === "direcionada") {
      const taxaFinMensal =
        out.segmento === "Automóvel" || out.segmento === "Motocicleta"
          ? params.fin_veic_mensal
          : annualToMonthlyCompound(params.fin_imob_anual);
      const parcelaFin = pmt(taxaFinMensal, out.prazoApos || 0, out.creditoLiberado || 0);
      const custoFinalFin = parcelaFin * (out.prazoApos || 0) - (out.creditoLiberado || 0);
      const custoFinalCons = out.encargos || 0;
      const economia = Math.max(0, custoFinalFin - custoFinalCons);

      barData = [
        { name: "Custo Financ.", valor: custoFinalFin },
        { name: "Custo Consórcio", valor: custoFinalCons },
        { name: "Economia", valor: economia },
      ];
      radialValuePct = custoFinalFin > 0 ? (economia / custoFinalFin) * 100 : 0;
      radialLabel = "Economia vs Financ.";
    } else if (model === "previdencia" && prevCore) {
      barData = [
        { name: "Retorno", valor: prevCore.retornoBruto },
        { name: "Investimento", valor: prevCore.investimento },
        { name: "Ret. Líquido", valor: prevCore.retornoBruto - prevCore.investimento },
      ];
      radialValuePct = Math.min(100, Math.max(0, prevCore.roi * 100));
      radialLabel = "ROI aproximado";
    } else if (model === "alav_patr" && apCore) {
      barData = [
        { name: "Aluguéis (tot.)", valor: apCore.totalAlugueisRecebidos },
        { name: "Pagos Consórcio", valor: apCore.pagoPeloConsorcio },
        { name: "Custo Final", valor: apCore.custoFinal },
      ];
      radialValuePct = Math.min(100, Math.max(0, apCore.percPagoPeloImovel * 100));
      radialLabel = "% pago pelo imóvel";
    } else {
      barData = [
        { name: "Venda", valor: out.valorVenda },
        { name: "Investido", valor: out.investido },
        { name: "Lucro", valor: out.lucro },
      ];
      radialValuePct = Math.min(100, Math.max(0, out.roi * 100));
      radialLabel = "ROI aproximado";
    }

    const roiData = [{ name: "KPI", value: radialValuePct }, { name: "Resto", value: Math.max(0, 100 - radialValuePct) }];

    const BlockCard = ({ children, title, icon }: { children: React.ReactNode; title: string; icon?: React.ReactNode }) => (
      <div className="rounded-2xl p-4 border relative overflow-hidden transition-all"
           style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.55), rgba(255,255,255,0.35))", backdropFilter: "blur(8px)", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: "radial-gradient(1200px 400px at -10% -10%, rgba(161,28,39,0.12), transparent 60%), radial-gradient(900px 300px at 110% 110%, rgba(30,41,63,0.12), transparent 60%)" }} />
        <div className="relative">
          <div className="text-sm font-semibold text-[#1E293F] mb-3 inline-flex items-center gap-2">
            {icon}{title}
          </div>
          {children}
        </div>
      </div>
    );

    // Extrato render para Previdência
    const ExtratoPrev = () => {
      if (!prevCore) return null;
      const pageLen = 15;
      const [pg, setPg] = React.useState(1);
      const total = prevCore.extrato.length;
      const totalPg = Math.max(1, Math.ceil(total / pageLen));
      const slice = prevCore.extrato.slice((pg - 1) * pageLen, pg * pageLen);
      return (
        <div className="space-y-2">
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Mês</th>
                  <th className="text-left p-2">Saldo</th>
                  <th className="text-left p-2">Retorno</th>
                  <th className="text-left p-2">Parcela</th>
                  <th className="text-left p-2">Capital</th>
                </tr>
              </thead>
              <tbody>
                {slice.map(l => (
                  <tr key={l.mes} className="border-t">
                    <td className="p-2">{l.mes}</td>
                    <td className="p-2">{brMoney(l.saldo)}</td>
                    <td className="p-2">{brMoney(l.retorno)}</td>
                    <td className="p-2">{brMoney(l.parcela)}</td>
                    <td className="p-2">{brMoney(l.capital)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <div>Mostrando <strong>{(pg - 1) * pageLen + 1}–{Math.min(pg * pageLen, total)}</strong> de <strong>{total}</strong></div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="h-7 rounded-lg px-2" disabled={pg===1} onClick={() => setPg(p => Math.max(1, p-1))}>Anterior</Button>
              <span>Página {pg} de {totalPg}</span>
              <Button variant="secondary" className="h-7 rounded-lg px-2" disabled={pg===totalPg} onClick={() => setPg(p => Math.min(totalPg, p+1))}>Próxima</Button>
            </div>
          </div>
        </div>
      );
    };

    const blocks: Record<BlockId, JSX.Element> = {
      header: (
        <BlockCard title="Cabeçalho" icon={<Home className="h-4 w-4 text-[#1E293F]" />}>
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="logo" className="h-10" />
            <div>
              <div className="font-semibold text-lg">{normalizeSegment(sim.segmento)} • Proposta #{sim.code}</div>
              <div className="text-sm text-muted-foreground">{seller.nome} • Whats {formatPhoneBR(seller.phone) || "-"}</div>
            </div>
          </div>
        </BlockCard>
      ),
      specs: (
        <BlockCard title="Especificações" icon={<FileText className="h-4 w-4 text-[#1E293F]" />}>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Crédito</div><div className="font-semibold">{brMoney(out.credito)}</div></div>
            <div><div className="text-muted-foreground">Prazo</div><div className="font-semibold">{out.prazo || 0} meses</div></div>
            <div><div className="text-muted-foreground">Segmento</div><div className="font-semibold">{out.segmento}</div></div>
            <div><div className="text-muted-foreground">Taxa Adm</div><div className="font-semibold">{typeof out.adm === "number" ? formatPercentFraction(out.adm) : "—"}</div></div>
            <div><div className="text-muted-foreground">Fundo Reserva</div><div className="font-semibold">{typeof out.fr === "number" ? formatPercentFraction(out.fr) : "—"}</div></div>
            <div><div className="text-muted-foreground">Valor de Categoria</div><div className="font-semibold">{out.valorCategoria !== null ? brMoney(out.valorCategoria) : "—"}</div></div>
          </div>
        </BlockCard>
      ),
      parcelas: (
        <BlockCard title="Parcelas até a contemplação" icon={<Banknote className="h-4 w-4 text-[#1E293F]" />}>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div><div className="text-muted-foreground">{out.labelParcelaInicial}</div><div className="font-semibold">{brMoney(out.parcelaInicialValor)}</div></div>
            <div><div className="text-muted-foreground">Demais</div><div className="font-semibold">{brMoney(out.parcelaDemaisValor)}</div></div>
          </div>
        </BlockCard>
      ),
      lance: (
        <BlockCard title="Estratégia de Lance" icon={<TrendingUp className="h-4 w-4 text-[#1E293F]" />}>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Lance Embutido</div><div className="font-semibold">{brMoney(out.embutidoValor)}</div></div>
            <div><div className="text-muted-foreground">Lance Próprio</div><div className="font-semibold">{brMoney(out.lanceProprioValor)}</div></div>
            <div><div className="text-muted-foreground">Parcela após o lance</div><div className="font-semibold">{brMoney(out.parcelaAposValor)} ({out.prazoApos || 0}x)</div></div>
          </div>
        </BlockCard>
      ),
      projecao: (
        <BlockCard title={
          model === "previdencia" ? "Previdência" :
          model === "direcionada" ? "Comparativo de Custos" :
          model === "alav_patr" ? "Alavancagem Patrimonial" : "Projeção na Venda"}>
          {model === "direcionada" ? (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Crédito Liberado</div><div className="font-semibold">{brMoney(out.creditoLiberado)}</div></div>
              <div><div className="text-muted-foreground">Encargos (Consórcio)</div><div className="font-semibold">{brMoney(out.encargos || 0)}</div></div>
              <div><div className="text-muted-foreground">Lance Pago</div><div className="font-semibold">{brMoney(out.lanceProprioValor)}</div></div>
            </div>
          ) : model === "previdencia" && prevCore ? (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Crédito (líquido)</div><div className="font-semibold">{brMoney(prevCore.creditoLiquido)}</div></div>
              <div><div className="text-muted-foreground">CDI Mês</div><div className="font-semibold">{formatPercentFraction(prevCore.cdiMes)}</div></div>
              <div><div className="text-muted-foreground">Índice CM</div><div className="font-semibold">99% do CDI</div></div>
              <div><div className="text-muted-foreground">Rentabilidade Mês</div><div className="font-semibold">{formatPercentFraction(prevCore.rentabMes)}</div></div>
              <div><div className="text-muted-foreground">Prazo (pós)</div><div className="font-semibold">{out.prazoApos || 0} meses</div></div>
              <div><div className="text-muted-foreground">Investimento (parcelas + lance)</div><div className="font-semibold">{brMoney(prevCore.investimento)}</div></div>
              <div><div className="text-muted-foreground">Retorno</div><div className="font-semibold">{brMoney(prevCore.retornoBruto)}</div></div>
              <div><div className="text-muted-foreground">Retorno Líquido</div><div className="font-semibold">{brMoney(prevCore.retornoBruto - prevCore.investimento)}</div></div>
              <div><div className="text-muted-foreground">ROI</div><div className="font-semibold">{formatPercentFraction(prevCore.roi)}</div></div>
            </div>
          ) : model === "alav_patr" && apCore ? (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Crédito (líquido)</div><div className="font-semibold">{brMoney(apCore.creditoLiquido)}</div></div>
              <div><div className="text-muted-foreground">Prazo (pós)</div><div className="font-semibold">{apCore.prazoPos} meses</div></div>
              <div><div className="text-muted-foreground">Parcela (pós)</div><div className="font-semibold">{brMoney(apCore.parcelaPos)}</div></div>
              <div><div className="text-muted-foreground">Aluguel Mês (base)</div><div className="font-semibold">{brMoney(apCore.aluguelMesBase)}</div></div>
              <div><div className="text-muted-foreground">Imóvel Corrigido</div><div className="font-semibold">{brMoney(apCore.valorImovelCorrigidoFinal)}</div></div>
              <div><div className="text-muted-foreground">% pago pelo imóvel</div><div className="font-semibold">{formatPercentFraction(apCore.percPagoPeloImovel)}</div></div>
              <div><div className="text-muted-foreground">Receita Mês (média)</div><div className="font-semibold">{brMoney(apCore.receitaMesMedia)}</div></div>
              <div><div className="text-muted-foreground">Taxas (Airbnb+Cond.)</div><div className="font-semibold">{brMoney(apCore.taxaAirbnbMes + apCore.condominioMes)}</div></div>
              <div><div className="text-muted-foreground">Lucro Líquido mês</div><div className="font-semibold">{brMoney(apCore.lucroLiquidoMes)}</div></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Crédito Liberado</div><div className="font-semibold">{brMoney(out.creditoLiberado)}</div></div>
              <div><div className="text-muted-foreground">Valor da Venda (Crédito Liberado × Ganho %)</div><div className="font-semibold">{brMoney(out.valorVenda)}</div></div>
              <div><div className="text-muted-foreground">Investido</div><div className="font-semibold">{brMoney(out.investido)}</div></div>
              <div><div className="text-muted-foreground">Lucro</div><div className="font-semibold">{brMoney(out.lucro)}</div></div>
              <div><div className="text-muted-foreground">ROI</div><div className="font-semibold">{formatPercentFraction(out.roi)}</div></div>
              <div><div className="text-muted-foreground">% do CDI (mês)</div><div className="font-semibold">{(out.pctCDI * 100).toFixed(0)}%</div></div>
            </div>
          )}
        </BlockCard>
      ),
      graficos: (
        <BlockCard title="Demonstração Gráfica">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-60 rounded-xl p-3 border"
                 style={{ background: "linear-gradient(120deg, rgba(224,206,140,0.12), rgba(30,41,63,0.08))", backdropFilter: "blur(6px)"}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => brMoney(v)} />
                  <Legend />
                  <Bar dataKey="valor" radius={[8,8,0,0]}>
                    <LabelList dataKey="valor" position="top" formatter={(v: number) => brMoney(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-60 rounded-xl p-3 border relative"
                 style={{ background: "linear-gradient(120deg, rgba(161,28,39,0.10), rgba(245,245,245,0.6))", backdropFilter: "blur(6px)"}}>
              <div className="absolute left-1/2 -translate-x-1/2 top-2 text-xs font-semibold text-[#1E293F]">
                {radialLabel}
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="60%" outerRadius="100%" data={roiData}>
                  <RadialBar dataKey="value" clockWise />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-sm font-semibold">{radialValuePct.toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </BlockCard>
      ),
      "prev-extrato": (
        <BlockCard title="Extrato (primeiros 12 meses)">
          <ExtratoPrev />
        </BlockCard>
      ),
      obs: (
        <BlockCard title="Observações">
          <div className="text-xs text-muted-foreground">
            Atenção: Simulação não é garantia de contemplação; esta pode ocorrer antes ou depois do prazo previsto.
          </div>
        </BlockCard>
      ),
    };

    return (
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {layout.map((id) => (
              <SortableItem key={id} id={id as any}>
                {blocks[id]}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-6">
            <Label>Buscar por nome ou telefone</Label>
            <Input placeholder="ex.: Maria / 11 9..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 transition-all ${resultsOpen ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        {resultsOpen && (
          <Card className="transition-all">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Resultados <span className="text-muted-foreground text-sm">({rows.length})</span>
              </CardTitle>
              <Button variant="secondary" size="sm" className="rounded-xl inline-flex items-center gap-2" onClick={() => setResultsOpen(false)}>
                <EyeOff className="h-4 w-4" /> Ocultar
              </Button>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2">Criada</th>
                      <th className="text-left p-2">Lead</th>
                      <th className="text-left p-2">Segmento</th>
                      <th className="text-left p-2">Crédito (após)</th>
                      <th className="text-left p-2">Parcela (após)</th>
                      <th className="text-left p-2">Prazo</th>
                      <th className="text-center p-2">Op.</th>
                      <th className="text-center p-2">Resumo</th>
                      <th className="text-center p-2">Excluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r) => (
                      <tr
                        key={r.code}
                        className={`border-t ${active?.code === r.code ? "bg-muted/30" : ""}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(r.code)); }}
                        onClick={() => setActive(r)}
                      >
                        <td className="p-2">{r.code}</td>
                        <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                        <td className="p-2">
                          <div className="font-medium">{r.lead_nome || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.lead_telefone || "—"}</div>
                        </td>
                        <td className="p-2">{normalizeSegment(r.segmento)}</td>
                        <td className="p-2">{brMoney(r.novo_credito)}</td>
                        <td className="p-2">{brMoney(r.parcela_escolhida)}</td>
                        <td className="p-2">{r.novo_prazo ?? 0}x</td>
                        <td className="p-2 text-center">
                          <button className="h-9 px-3 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center gap-2 hover:opacity-95"
                                  title="Copiar Oportunidade" onClick={(e) => { e.stopPropagation(); copyOportunidadeText(r); }}>
                            <Megaphone className="h-4 w-4" /> Oportunidade
                          </button>
                        </td>
                        <td className="p-2 text-center">
                          <button className="h-9 px-3 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center gap-2 hover:opacity-95"
                                  title="Copiar Resumo" onClick={(e) => { e.stopPropagation(); copyResumoText(r); }}>
                            <ClipboardCopy className="h-4 w-4" /> Resumo
                          </button>
                        </td>
                        <td className="p-2 text-center">
                          <button className="h-9 w-9 rounded-full bg-[#A11C27] text-white inline-flex items-center justify-center hover:opacity-95"
                                  title="Excluir" onClick={(e) => { e.stopPropagation(); handleDelete(r.code); }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pagedRows.length === 0 && (
                      <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">
                        {loading ? "Carregando..." : "Nenhum resultado para os filtros."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div
                className="mt-3 rounded-2xl border-2 border-dashed p-4 text-sm text-center"
                style={{ borderColor: "#B5A573", background: "linear-gradient(120deg, rgba(245,245,245,0.7), rgba(224,206,140,0.12))" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const codeStr = e.dataTransfer.getData("text/plain");
                  const code = Number(codeStr);
                  const found = rows.find((x) => x.code === code);
                  if (found) setActive(found);
                }}
              >
                Arraste aqui a proposta da lista acima para demonstrar no gráfico ao lado
              </div>

              <div className="flex items-center justify-between text-sm">
                <div>
                  {rows.length > 0 && (<>
                    Mostrando <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)}</strong> de <strong>{rows.length}</strong>
                  </>)}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="h-9 rounded-xl px-3"
                          onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                  <span>Página {page} de {totalPages}</span>
                  <Button variant="secondary" className="h-9 rounded-xl px-3"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!resultsOpen && (
          <div className="flex items-center">
            <Button variant="secondary" size="sm" className="rounded-xl mb-2 inline-flex items-center gap-2" onClick={() => setResultsOpen(true)}>
              <Eye className="h-4 w-4" /> Mostrar Resultados
            </Button>
          </div>
        )}

        <Card className={`transition-all ${resultsOpen ? "" : "lg:col-span-1"}`}>
          <CardHeader className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-3">
              <span>Prévia da Proposta</span>
              <button onClick={() => setParamOpen(true)} className="inline-flex items-center gap-2 text-xs border rounded-full px-3 py-1 hover:bg-muted" title="Parâmetros">
                <SlidersHorizontal className="h-4 w-4" /> Parâmetros
              </button>
            </CardTitle>

            <div className="ml-auto flex items-center gap-2">
              <select value={model} onChange={(e) => setModel(e.target.value as any)} className="h-9 rounded-2xl border px-3">
                <option value="direcionada">Direcionada</option>
                <option value="venda_contemplada">Venda Contemplada</option>
                <option value="alav_fin">Alav. Financeira</option>
                <option value="alav_patr">Alav. Patrimonial</option>
                <option value="previdencia">Previdência</option>
                <option value="credito_correcao">Crédito c/ Correção</option>
                <option value="extrato">Extrato</option>
              </select>

              {/* Se modelo = Previdência, escolher índice de reajuste */}
              {model === "previdencia" && (
                <select value={reajIndex} onChange={(e) => setReajIndex(e.target.value as any)} className="h-9 rounded-2xl border px-3" title="Índice de reajuste anual das parcelas após a contemplação">
                  <option value="ipca">Reajuste: IPCA</option>
                  <option value="igpm">Reajuste: IGP-M</option>
                  <option value="incc">Reajuste: INCC</option>
                  <option value="inpc">Reajuste: INPC</option>
                </select>
              )}

              {active && (
                <>
                  <Button
                    variant="secondary"
                    className="rounded-2xl h-9 px-3 inline-flex items-center gap-2"
                    onClick={() => pdfSimplificado(active, model)}
                    title="Gerar PDF Simplificado"
                  >
                    <Download className="h-4 w-4" /> PDF Simplificado
                  </Button>

                  <Button
                    className="rounded-2xl h-9 px-3 inline-flex items-center gap-2"
                    onClick={() => {
                      if (model === "venda_contemplada") gerarPDFVendaContemplada(active);
                      else if (model === "previdencia") gerarPDFPrevidencia(active);
                      else if (model === "alav_patr") gerarPDFAlavPatr(active);
                      else gerarPDFDirecionada(active);
                    }}
                    title="Gerar PDF Completo"
                  >
                    <FileText className="h-4 w-4" /> PDF Completo
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!active ? (
              <div className="p-8 text-center text-muted-foreground rounded-xl border-2 border-dashed"
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { const code = Number(e.dataTransfer.getData("text/plain")); const found = rows.find((x) => x.code === code); if (found) setActive(found); }}>
                Selecione um item da lista ou arraste uma proposta para cá.
              </div>
            ) : (
              <PreviewBlock sim={active} model={model} />
            )}
          </CardContent>
        </Card>
      </div>

      {paramOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Parâmetros das propostas
              </div>
              <button className="p-1 rounded hover:bg-muted" onClick={() => setParamOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 grid gap-5 md:grid-cols-3 text-sm">
              <div>
                <Label>Selic Anual</Label>
                <Input defaultValue={formatPercentFraction(params.selic_anual)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, selic_anual: v })); }} />
              </div>
              <div>
                <Label>CDI Anual</Label>
                <Input defaultValue={formatPercentFraction(params.cdi_anual)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, cdi_anual: v })); }} />
                <div className="text-xs text-muted-foreground mt-1">CDI Mensal (composto): <strong>{formatPercentFraction(cdiMensal)}</strong></div>
              </div>
              <div>
                <Label>Ganho na Venda (%)</Label>
                <Input defaultValue={formatPercentFraction(params.reforco_pct)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, reforco_pct: v })); }} />
              </div>

              <div>
                <Label>IPCA 12m</Label>
                <Input defaultValue={formatPercentFraction(params.ipca12m)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, ipca12m: v })); }} />
                <div className="text-xs text-muted-foreground mt-1">IPCA mês (média): <strong>{formatPercentFraction(ipcaMensal)}</strong></div>
              </div>
              <div>
                <Label>IGP-M 12m</Label>
                <Input defaultValue={formatPercentFraction(params.igpm12m)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, igpm12m: v })); }} />
                <div className="text-xs text-muted-foreground mt-1">IGP-M mês (média): <strong>{formatPercentFraction(igpmMensal)}</strong></div>
              </div>
              <div>
                <Label>INCC 12m</Label>
                <Input defaultValue={formatPercentFraction(params.incc12m)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, incc12m: v })); }} />
                <div className="text-xs text-muted-foreground mt-1">INCC mês (média): <strong>{formatPercentFraction(inccMensal)}</strong></div>
              </div>
              <div>
                <Label>INPC 12m</Label>
                <Input defaultValue={formatPercentFraction(params.inpc12m)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, inpc12m: v })); }} />
                <div className="text-xs text-muted-foreground mt-1">INPC mês (média): <strong>{formatPercentFraction(inpcMensal)}</strong></div>
              </div>

              <div>
                <Label>Juros Financiamento — Veículos (ao mês)</Label>
                <Input defaultValue={formatPercentFraction(params.fin_veic_mensal)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, fin_veic_mensal: v })); }} />
              </div>
              <div>
                <Label>Juros Financiamento — Imob./Rural (ao ano)</Label>
                <Input defaultValue={formatPercentFraction(params.fin_imob_anual)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p) => ({ ...p, fin_imob_anual: v })); }} />
              </div>

              {/* NOVOS PARÂMETROS — Alavancagem Patrimonial */}
              <div>
                <Label>% do Aluguel (ao mês, sobre o crédito líquido)</Label>
                <Input defaultValue={formatPercentFraction(params.aluguel_pct)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p)=>({ ...p, aluguel_pct: v })); }} />
              </div>
              <div>
                <Label>Taxa Airbnb (sobre o aluguel)</Label>
                <Input defaultValue={formatPercentFraction(params.airbnb_pct)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p)=>({ ...p, airbnb_pct: v })); }} />
              </div>
              <div>
                <Label>Taxa de Condomínio (sobre o aluguel)</Label>
                <Input defaultValue={formatPercentFraction(params.condominio_pct)} onBlur={(e) => { const v = parsePercentInput(e.target.value); e.currentTarget.value = formatPercentFraction(v); setParams((p)=>({ ...p, condominio_pct: v })); }} />
              </div>
            </div>

            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <Button variant="secondary" className="rounded-2xl" onClick={() => setParamOpen(false)}>Cancelar</Button>
              <Button className="rounded-2xl" onClick={() => saveParams(params)}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
