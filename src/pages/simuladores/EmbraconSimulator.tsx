// src/pages/simuladores/EmbraconSimulator.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Banknote,
  Bike,
  Calculator,
  Car,
  ChevronsUpDown,
  Copy,
  FileText,
  Eye,
  Home,
  Loader2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import EmbraconTableManager from "./EmbraconTableManager";
import EmbraconCommercialTable from "./EmbraconCommercialTable";
import { Popover, PopoverButton, PopoverContent, PopoverClose } from "@/components/ui/popover";

/* ========================= Tipos ========================= */
type UUID = string;

type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string; rules?: any };

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
  faixas_credito?: number[] | null;
  reajusta_cada_meses?: number | null;
  permite_sorteio?: boolean | null;
  permite_troca_chaves?: boolean | null;
  permite_fgts?: boolean | null;
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";
type LanceTipo = "sorteio" | "livre" | "fixo_25" | "fixo_50";


/* ======================= Helpers ========================= */
const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const brMoney = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const pctHuman = (v: number) => `${((Number(v) || 0) * 100).toFixed(4).replace(".", ",")}%`;

function formatBRLInputFromNumber(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatPhoneBR(s?: string | null) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

function onlyDigits(s?: string | null) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeText(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}


function segmentMeta(seg?: string | null) {
  const raw = String(seg || "").trim();
  const n = normalizeText(raw);

  if (n.includes("imovel estendido")) {
    return { label: "Imóvel Estendido", bem: "imóvel", emoji: "🏘️" };
  }

  if (n.includes("imovel") || n.includes("imoveis")) {
    return { label: "Imóveis", bem: "imóvel", emoji: "🏠" };
  }

  if (n.includes("moto")) {
    return { label: "Motocicletas", bem: "motocicleta", emoji: "🏍️" };
  }

  if (n.includes("serv")) {
    return { label: "Serviços", bem: "serviço", emoji: "✈️" };
  }

  if (n.includes("pesad")) {
    return { label: "Pesados", bem: "bem pesado", emoji: "🚚" };
  }

  if (n.includes("auto")) {
    return { label: "Automóveis", bem: "veículo", emoji: "🚗" };
  }

  return { label: raw || "Consórcio", bem: "bem", emoji: "📌" };
}

function labelAntecipacao(antecipParcelas?: number | null) {
  if (!antecipParcelas || antecipParcelas <= 0) return "Parcela inicial";
  if (antecipParcelas === 1) return "Parcela 1";
  if (antecipParcelas === 2) return "Parcelas 1 e 2";
  return `Parcelas 1 a ${antecipParcelas}`;
}

function normalizarSegmento(seg?: string) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó") || s.includes("imo")) return "Imóvel";
  if (s.includes("auto")) return "Automóvel";
  if (s.includes("moto")) return "Motocicleta";
  if (s.includes("serv")) return "Serviços";
  if (s.includes("pesad")) return "Pesados";
  return seg || "Automóvel";
}

function emojiDoSegmento(seg?: string) {
  const s = (seg || "").toLowerCase();
  if (s.includes("imó") || s.includes("imo")) return "🏠";
  if (s.includes("moto")) return "🏍️";
  if (s.includes("serv")) return "✈️";
  if (s.includes("pesad")) return "🚚";
  return "🚗";
}

function glassCardClass(extra = "") {
  return `rounded-[28px] border bg-white/75 shadow-sm backdrop-blur ${extra}`;
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border bg-white/80 p-4 shadow-sm backdrop-blur" style={{ borderColor: "rgba(30,41,63,.10)" }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-xl font-black" style={{ color: C.navy }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(161,28,39,.10)", color: C.ruby }}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-black" style={{ color: C.navy }}>{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ========== Percent Input (cursor estável) ========== */
function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  placeholder,
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string>(() => (valueDecimal * 100 || 0).toString().replace(".", ","));

  useEffect(() => {
    const target = (valueDecimal * 100).toString().replace(".", ",");
    if (target !== raw) setRaw(target);
  }, [valueDecimal]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(val: string) {
    const clean = val.trim().replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(clean);
    let dec = isNaN(num) ? 0 : num / 100;
    if (typeof maxDecimal === "number") dec = clamp(dec, 0, maxDecimal);
    onChangeDecimal(dec);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={raw}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className="text-right"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}


function labelParcelasRangeCliente(inicio: number, fim: number) {
  if (inicio === fim) return `Parcela ${inicio}`;
  return `Parcelas ${inicio} a ${fim}`;
}


function buildParcelasAteContemplacaoCliente(input: {
  calc: ReturnType<typeof calcularSimulacao>;
  antecipParcelas?: number | null;
  parcContemplacao: number;
}) {
  const { calc, antecipParcelas, parcContemplacao } = input;

  const nCont = Math.max(0, Math.round(Number(parcContemplacao || 0)));
  const antecipAteParcela = Math.max(0, Math.round(Number(antecipParcelas || 0)));
  const parcelaComAntecipacao = Math.max(0, Number(calc.parcelaAte || 0));
  const parcelaNormal = Math.max(0, Number(calc.parcelaDemais || 0));

  if (nCont <= 0) return "";

  const linhas: string[] = [];

  const qtdComAntecipacao = Math.min(nCont, antecipAteParcela > 0 ? antecipAteParcela : nCont);

  if (qtdComAntecipacao > 0) {
    linhas.push(
      `💳 ${labelParcelasRangeCliente(1, qtdComAntecipacao)}: ${brMoney(
        parcelaComAntecipacao
      )} (Primeira parcela em até 3x sem juros no cartão)`
    );
  }

  if (nCont > qtdComAntecipacao) {
    const inicioDemais = qtdComAntecipacao + 1;
    const fimDemais = nCont;
    linhas.push(
      `💵 ${labelParcelasRangeCliente(
        inicioDemais,
        fimDemais
      )}  (Ou até a contemplação): ${brMoney(parcelaNormal)}`
    );
  }

  return linhas.join("\n\n");
}

function buildParcelasRestantesCliente(input: {
  calc: ReturnType<typeof calcularSimulacao>;
  antecipParcelas?: number | null;
  parcContemplacao: number;
}) {
  const { calc, antecipParcelas, parcContemplacao } = input;

  const totalPrazoRestante = Math.max(0, Math.round(Number(calc.novoPrazo || 0)));
  const parcelaNormal = Math.max(0, Number(calc.parcelaEscolhida || 0));
  const antecipAteParcela = Math.max(0, Math.round(Number(antecipParcelas || 0)));
  const primeiraParcelaDepoisContemplacao = Math.max(1, Math.round(Number(parcContemplacao || 0)) + 1);
  const adicionalAntecipacao = Math.max(0, Number(calc.antecipAdicionalCada || 0));

  const aindaTemAntecipacao =
    totalPrazoRestante > 0 &&
    antecipAteParcela > 0 &&
    primeiraParcelaDepoisContemplacao <= antecipAteParcela &&
    adicionalAntecipacao > 0;

  if (!aindaTemAntecipacao) {
    return `📆 Parcelas restantes:
+ ${totalPrazoRestante} x de ${brMoney(parcelaNormal)}`;
  }

  const ultimaParcelaComAntecipacao = Math.min(
    antecipAteParcela,
    primeiraParcelaDepoisContemplacao + totalPrazoRestante - 1
  );

  const qtdParcelasComAntecipacao = Math.max(
    0,
    ultimaParcelaComAntecipacao - primeiraParcelaDepoisContemplacao + 1
  );

  const qtdParcelasNormais = Math.max(
    0,
    totalPrazoRestante - qtdParcelasComAntecipacao
  );

  const parcelaComAntecipacao = parcelaNormal + adicionalAntecipacao;

  const linhas = [
    `📆 Parcelas restantes:`,
    `${labelParcelasRangeCliente(
      primeiraParcelaDepoisContemplacao,
      ultimaParcelaComAntecipacao
    )}: ${brMoney(parcelaComAntecipacao)}`,
  ];

  if (qtdParcelasNormais > 0) {
    linhas.push(`+ ${qtdParcelasNormais} x de ${brMoney(parcelaNormal)}`);
  }

  return linhas.join("\n");
}

function MoneyInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
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

export type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;
  taxaAdmFull: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: number;
  limitadorPct: number;
  seguroPrestPct: number;
  modeloLance: "percentual" | "parcela";
  lanceBase: "credito" | "parcela_termo";
  prazoOriginalGrupo?: number;
  lanceOfertParcelas?: number;
  lanceEmbutParcelas?: number;
  lanceOfertPct?: number;
  lanceEmbutPct?: number;
  embutCapPct?: number | null;
  embutCapBase?: "credito" | "parcela_termo";
  ofertBaseKind?: "credito" | "valor_categoria";
  embutBaseKind?: "credito" | "valor_categoria";
  limitEnabled?: boolean;
  redutorPreEnabled?: boolean;
  redutorBase?: "credito" | "valor_categoria";
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
    limitadorPct,
    seguroPrestPct,
    modeloLance,
    lanceBase,
    prazoOriginalGrupo,
    lanceOfertParcelas = 0,
    lanceEmbutParcelas = 0,
    lanceOfertPct = 0,
    lanceEmbutPct = 0,
    embutCapPct = 0.25,
    embutCapBase = "credito",
    ofertBaseKind = "credito",
    embutBaseKind = "credito",
    limitEnabled = true,
    redutorPreEnabled = false,
    redutorBase = "valor_categoria",
    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);
  const valorCategoria = C * (1 + taxaAdmFull + frPct);
  const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
  const parcelaTermo = valorCategoria / prazoTermo;

  let fatorForma = 1;
  if (forma === "Reduzida 25%") fatorForma = 0.75;
  if (forma === "Reduzida 50%") fatorForma = 0.5;

  const creditoReduzido = C * fatorForma;
  const fundoReservaReduzido = C * frPct * fatorForma;
  const taxaAdmLiquida = C * Math.max(0, taxaAdmFull - antecipPct);

  const baseMensalPre =
    redutorPreEnabled && redutorBase === "valor_categoria"
      ? (valorCategoria / prazo) * fatorForma
      : (creditoReduzido + taxaAdmLiquida + fundoReservaReduzido) / prazo;

  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;
  const antParc = Math.max(0, Number(antecipParcelas) || 0);
  const antecipCada = antParc > 0 ? (C * antecipPct) / antParc : 0;
  const parcelaAte = baseMensalPre + (antParc > 0 ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalPre + seguroMensal;
  const totalPagoSemSeguro = baseMensalPre * parcelasPagas + antecipCada * Math.min(parcelasPagas, antParc);

  let lanceOfertadoValor = 0;
  let lanceEmbutidoValor = 0;

  const embutLimitValorBase = embutCapBase === "parcela_termo" ? parcelaTermo * prazoTermo : C;
  const embutValorMaximo = (embutCapPct ?? 0.25) * embutLimitValorBase;

  if (modeloLance === "parcela" && lanceBase === "parcela_termo") {
    const ofertValor = Math.max(0, parcelaTermo * Math.max(0, lanceOfertParcelas));
    const embutValor = Math.max(0, parcelaTermo * Math.max(0, lanceEmbutParcelas));
    lanceOfertadoValor = ofertValor;
    lanceEmbutidoValor = Math.min(embutValor, embutValorMaximo);
  } else {
    const baseOfert = ofertBaseKind === "valor_categoria" ? valorCategoria : C;
    const baseEmbut = embutBaseKind === "valor_categoria" ? valorCategoria : C;
    lanceOfertadoValor = baseOfert * Math.max(0, lanceOfertPct);
    const embutPct = Math.min(Math.max(0, lanceEmbutPct), embutCapPct ?? 0.25);
    lanceEmbutidoValor = Math.min(baseEmbut * embutPct, embutValorMaximo);
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);
  const saldoDevedorFinal = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);
  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;
  const parcelaLimitante = limitEnabled ? valorCategoria * limitadorPct : 0;
  const isServicos = (segmento || "").toLowerCase().includes("serv");

  let aplicouLimitador = false;
  let parcelaEscolhida = novaParcelaSemLimite;

  if (!isServicos) {
    if (limitEnabled && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    }
  } else {
    parcelaEscolhida = parcelaDemais;
  }

  const has2aAntecipDepois = antParc >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois ? parcelaEscolhida + antecipCada : null;

  let saldoParaPrazo = saldoDevedorFinal;
  if (has2aAntecipDepois) saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipCada));

  const novoPrazo = Math.max(1, Math.ceil(saldoParaPrazo / Math.max(1, parcelaEscolhida)));

  return {
    valorCategoria,
    parcelaTermo,
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
    TA_efetiva: Math.max(0, taxaAdmFull - antecipPct),
    antecipAdicionalCada: antecipCada,
    has2aAntecipDepois,
    segundaParcelaComAntecipacao,
    aplicouLimitador,
  } as const;
}

function normalizeRules(raw: any) {
  const r = raw || {};
  const modelo_lance: "percentual" | "parcela" = r?.lance?.modelo ?? r?.modelo_lance ?? "percentual";
  const ofertBaseKind: "credito" | "valor_categoria" =
    r?.lance?.base_ofertado === "categoria" ? "valor_categoria" : r?.lance_ofert_base ?? "credito";
  const embutBaseKind: "credito" | "valor_categoria" =
    r?.lance_embutido?.base === "categoria" ? "valor_categoria" : r?.lance_embut_base ?? "credito";
  const embut_base: "credito" | "parcela_termo" = r?.embut_base ?? "credito";
  const embut_cap_adm_pct: number = r?.lance_embutido?.cap_pct ?? r?.embut_cap_adm_pct ?? 0.25;
  const modelo_lance_base: "credito" | "parcela_termo" = r?.modelo_lance_base ?? "credito";
  const limit_enabled = r?.limitador_parcela?.existe === false ? false : r?.limit_enabled ?? true;
  const redutor_pre_contemplacao_enabled =
    r?.redutor_pre_contratacao?.permite === true ? true : r?.redutor_pre_contemplacao_enabled === true;
  const redutor_base: "valor_categoria" | "credito" =
    r?.redutor_base ?? (r?.limitador_parcela?.base === "categoria" ? "valor_categoria" : "valor_categoria");

  return {
    modelo_lance,
    lance_ofert_base: ofertBaseKind,
    lance_embut_base: embutBaseKind,
    embut_base,
    embut_cap_adm_pct,
    modelo_lance_base,
    limit_enabled,
    redutor_pre_contemplacao_enabled,
    redutor_base,
  };
}

const SEGMENT_CARD_ORDER = [
  "automoveis",
  "automovel",
  "motocicletas",
  "motocicleta",
  "imoveis",
  "imovel",
  "servicos",
  "servico",
  "pesados",
  "pesado",
  "imovel estendido",
];

function normalizeSegmentForCardOrder(seg?: string | null) {
  return String(seg || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortSegmentsLikeCards(a: string, b: string) {
  const aa = normalizeSegmentForCardOrder(a);
  const bb = normalizeSegmentForCardOrder(b);

  const ia = SEGMENT_CARD_ORDER.findIndex((x) => x === aa);
  const ib = SEGMENT_CARD_ORDER.findIndex((x) => x === bb);

  const safeA = ia >= 0 ? ia : 999;
  const safeB = ib >= 0 ? ib : 999;

  if (safeA !== safeB) return safeA - safeB;
  return aa.localeCompare(bb, "pt-BR");
}

function segmentVisual(seg?: string | null) {
  const key = normalizeSegmentForCardOrder(seg);

  if (key.includes("moto")) {
    return { label: "Motocicletas", Icon: Bike };
  }

  if (key.includes("imovel estendido")) {
    return { label: "Imóvel Estendido", Icon: Sparkles };
  }

  if (key.includes("imovel")) {
    return { label: "Imóveis", Icon: Home };
  }

  if (key.includes("serv")) {
    return { label: "Serviços", Icon: Wrench };
  }

  if (key.includes("pesad")) {
    return { label: "Pesados", Icon: Truck };
  }

  if (key.includes("auto")) {
    return { label: "Automóveis", Icon: Car };
  }

  return { label: String(seg || "Segmento"), Icon: Sparkles };
}

function lanceTipoLabel(tipo: LanceTipo) {
  if (tipo === "sorteio") return "Sorteio";
  if (tipo === "fixo_50") return "Fixo de 50%";
  if (tipo === "fixo_25") return "Fixo de 25%";
  return "Lance Livre";
}

function lancePctFromTipo(tipo: LanceTipo) {
  if (tipo === "fixo_50") return 0.5;
  if (tipo === "fixo_25") return 0.25;
  return 0;
}

function allowedLanceTipos(tabela?: SimTable | null): LanceTipo[] {
  if (!tabela) return [];

  const opts: LanceTipo[] = [];
  if (tabela.permite_sorteio !== false) opts.push("sorteio");
  if (tabela.permite_lance_livre) opts.push("livre");
  if (tabela.permite_lance_fixo_50) opts.push("fixo_50");
  if (tabela.permite_lance_fixo_25) opts.push("fixo_25");

  return opts;
}

/* ========================= Página ======================== */
export default function EmbraconPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const setup = searchParams.get("setup") === "1";
  const routeAdminId = id ?? null;

  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(routeAdminId);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(false);

  const [leadId, setLeadId] = useState("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState("");
  const [segmento, setSegmento] = useState("");
  const [nomeTabela, setNomeTabela] = useState("");
  const [tabelaId, setTabelaId] = useState("");
  const [prazoAte, setPrazoAte] = useState(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState(0);
  const [prazoVenda, setPrazoVenda] = useState(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState(false);
  const [lanceTipo, setLanceTipo] = useState<LanceTipo>("livre");
  const [lanceOfertPct, setLanceOfertPct] = useState(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState(0);
  const [prazoOriginalGrupo, setPrazoOriginalGrupo] = useState(0);
  const [lanceOfertParcelas, setLanceOfertParcelas] = useState(0);
  const [lanceEmbutParcelas, setLanceEmbutParcelas] = useState(0);
  const [parcContemplacao, setParcContemplacao] = useState(1);
  const [simulacaoSalva, setSimulacaoSalva] = useState<{
    assinatura: string;
    codigo: number;
    calculo: ReturnType<typeof calcularSimulacao>;
  } | null>(null);
  const [erroSalvamento, setErroSalvamento] = useState<{ assinatura: string; mensagem: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [userPhone, setUserPhone] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => setActiveAdminId(routeAdminId), [routeAdminId]);
  useEffect(() => {
    if (!routeAdminId && !activeAdminId && admins.length) setActiveAdminId(admins[0].id);
  }, [routeAdminId, activeAdminId, admins]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name,rules").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id, nome, telefone").limit(80).order("created_at", { ascending: false }),
      ]);

      setAdmins((a ?? []) as Admin[]);
      setTables((t ?? []) as SimTable[]);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));

      const embr = (a ?? []).find((ad: any) => String(ad.name || "").toLowerCase() === "embracon");
      let nextActiveId = embr?.id ?? (a?.[0]?.id ?? null);
      if (routeAdminId && (a ?? []).some((ad: any) => ad.id === routeAdminId)) nextActiveId = routeAdminId;
      setActiveAdminId(nextActiveId);

      setLoading(false);
      if (setup) setTimeout(() => setMgrOpen(true), 0);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone, telefone, role, user_role")
        .eq("auth_user_id", uid)
        .maybeSingle();

      setUserPhone((data?.phone || data?.telefone || "").toString());
      const role = String(data?.role || data?.user_role || "").toLowerCase();
      setIsAdmin(role === "admin");
    })();
  }, []);

  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const activeAdmin = useMemo(() => admins.find((a) => a.id === activeAdminId) || null, [admins, activeAdminId]);
  const adminRulesRaw = (activeAdmin?.rules || {}) as any;
  const adminRules = useMemo(() => normalizeRules(adminRulesRaw), [adminRulesRaw]);
  const adminTables = useMemo(() => tables.filter((t) => t.admin_id === activeAdminId), [tables, activeAdminId]);
  const segmentosDisponiveis = useMemo(
    () => Array.from(new Set(adminTables.map((t) => t.segmento))).sort(sortSegmentsLikeCards),
    [adminTables]
  );
  const nomesTabelaSegmento = useMemo(
    () => Array.from(new Set(adminTables.filter((t) => (segmento ? t.segmento === segmento : true)).map((t) => t.nome_tabela))).sort(),
    [adminTables, segmento]
  );
  const variantesDaTabela = useMemo(
    () => adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela).sort((a, b) => a.prazo_limite - b.prazo_limite),
    [adminTables, segmento, nomeTabela]
  );
  const tabelaSelecionada = useMemo(() => tables.find((t) => t.id === tabelaId) || null, [tables, tabelaId]);
  const prazoRangeIndex = useMemo(() => {
    const idx = variantesDaTabela.findIndex((t) => t.id === tabelaId);
    return idx >= 0 ? idx : 0;
  }, [variantesDaTabela, tabelaId]);
  const prazoRangeSelecionado = variantesDaTabela[prazoRangeIndex] || null;

  useEffect(() => {
    if (!nomeTabela) return;
    if (!variantesDaTabela.length) return;
    if (!tabelaId || !variantesDaTabela.some((t) => t.id === tabelaId)) {
      setTabelaId(variantesDaTabela[0].id);
    }
  }, [nomeTabela, variantesDaTabela, tabelaId]);

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada, forma]);

  const embutCapPct = Math.min(Number(adminRules?.embut_cap_adm_pct ?? 0.25), 0.25);
  const tiposLancePermitidos = useMemo(() => allowedLanceTipos(tabelaSelecionada), [tabelaSelecionada]);
  const permiteEmbutido = !!tabelaSelecionada?.permite_lance_embutido;

  useEffect(() => {
    if (lanceEmbutPct > embutCapPct) setLanceEmbutPct(embutCapPct);
  }, [lanceEmbutPct, embutCapPct]);

  useEffect(() => {
    if (!tabelaSelecionada) return;

    const permitidos = allowedLanceTipos(tabelaSelecionada);
    const nextTipo = permitidos.includes(lanceTipo) ? lanceTipo : permitidos[0] || "livre";

    if (nextTipo !== lanceTipo) setLanceTipo(nextTipo);

    if (!tabelaSelecionada.permite_lance_embutido && lanceEmbutPct !== 0) {
      setLanceEmbutPct(0);
    }
  }, [tabelaSelecionada, lanceTipo, lanceEmbutPct]);

  useEffect(() => {
    if (lanceTipo === "sorteio") {
      setLanceOfertPct(0);
      setLanceEmbutPct(0);
    } else if (lanceTipo === "fixo_50" || lanceTipo === "fixo_25") {
      setLanceOfertPct(lancePctFromTipo(lanceTipo));
    }
  }, [lanceTipo]);

  const prazoAviso = tabelaSelecionada && prazoVenda > tabelaSelecionada.prazo_limite
    ? `O prazo de ${prazoVenda} meses ultrapassa o limite de ${tabelaSelecionada.prazo_limite} meses da faixa escolhida. O cálculo foi bloqueado.`
    : null;
  const creditosDisponiveis = (tabelaSelecionada?.faixas_credito || [])
    .map(Number).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const faixaResumo = creditosDisponiveis.length
    ? { min: creditosDisponiveis[0], max: creditosDisponiveis[creditosDisponiveis.length - 1] }
    : faixa;
  const creditoForaFaixa = !!faixaResumo && credito > 0 &&
    (credito < faixaResumo.min || credito > faixaResumo.max);
  const prazoValido = !!tabelaSelecionada && prazoVenda > 0 && prazoVenda <= tabelaSelecionada.prazo_limite;
  const podeCalcular = prazoValido && Number.isFinite(credito) && credito > 0 && Number.isInteger(prazoVenda) && Number.isInteger(parcContemplacao) && parcContemplacao > 0 && parcContemplacao < prazoVenda;


  // O resultado só existe depois que esta configuração exata for salva no banco.
  // A alteração de qualquer campo invalida imediatamente o resultado anterior.
  const assinaturaAtual = JSON.stringify({
    admin: activeAdminId,
    tabela: tabelaSelecionada?.id,
    lead: leadId,
    nomeLead: leadInfo?.nome,
    telefoneLead: leadInfo?.telefone,
    grupo,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceTipo,
    lanceOfertPct,
    lanceEmbutPct,
    prazoOriginalGrupo,
    lanceOfertParcelas,
    lanceEmbutParcelas,
    parcContemplacao,
    regras: adminRules,
    embutCapPct,
  });
  const calc = simulacaoSalva?.assinatura === assinaturaAtual && podeCalcular ? simulacaoSalva.calculo : null;
  const simCode = calc ? simulacaoSalva?.codigo ?? null : null;
  const erroAtual = erroSalvamento?.assinatura === assinaturaAtual ? erroSalvamento.mensagem : null;

  function calcularResultado(tabela: SimTable) {
    const modeloLance = adminRules?.modelo_lance ?? "percentual";
    const lanceBase = (adminRules?.modelo_lance_base ?? (modeloLance === "parcela" ? "parcela_termo" : "credito")) as "credito" | "parcela_termo";

    return calcularSimulacao({
        credito,
        prazoVenda,
        forma,
        seguro: seguroPrest,
        segmento: tabela.segmento,
        taxaAdmFull: tabela.taxa_adm_pct,
        frPct: tabela.fundo_reserva_pct,
        antecipPct: tabela.antecip_pct,
        antecipParcelas: (tabela.antecip_parcelas as any) ?? 0,
        limitadorPct: tabela.limitador_parcela_pct,
        seguroPrestPct: tabela.seguro_prest_pct,
        modeloLance,
        lanceBase,
        prazoOriginalGrupo: Number(prazoOriginalGrupo || prazoVenda),
        embutCapPct,
        embutCapBase: adminRules?.embut_base ?? "credito",
        ofertBaseKind: adminRules?.lance_ofert_base ?? "credito",
        embutBaseKind: adminRules?.lance_embut_base ?? "credito",
        limitEnabled: adminRules?.limit_enabled !== false,
        redutorPreEnabled: adminRules?.redutor_pre_contemplacao_enabled === true,
        redutorBase: (adminRules?.redutor_base ?? "valor_categoria") as any,
        parcContemplacao,
        lanceOfertParcelas,
        lanceEmbutParcelas,
        lanceOfertPct,
        lanceEmbutPct,
      });
  }


  async function calcularESalvar() {
    // Nunca liberar uma simulação sem código persistido no CRM.
    if (salvandoRef.current || !tabelaSelecionada || !leadId || !podeCalcular) return;
    salvandoRef.current = true;
    setSalvando(true);
    setSimulacaoSalva(null);
    setErroSalvamento(null);
    const assinaturaDoClique = assinaturaAtual;

    try {
      const resultado = calcularResultado(tabelaSelecionada);
      if (![resultado.parcelaAte, resultado.parcelaDemais, resultado.valorCategoria,
        resultado.saldoDevedorFinal, resultado.novoCredito, resultado.parcelaEscolhida]
        .every(Number.isFinite)) {
        throw new Error("Os valores calculados são inválidos. Confira os parâmetros antes de tentar novamente.");
      }

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
      lance_modelo: adminRules?.modelo_lance ?? "percentual",
      lance_base: adminRules?.modelo_lance_base ?? (adminRules?.modelo_lance === "parcela" ? "parcela_termo" : "credito"),
      modelo_lance: lanceModoParcela ? "parcela" : lanceTipoLabel(lanceTipo),
      prazo_original_grupo: prazoOriginalGrupo || null,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: Math.min(lanceEmbutPct, embutCapPct),
      lance_ofertado_parcelas: lanceOfertParcelas,
      lance_embutido_parcelas: lanceEmbutParcelas,
      parcela_contemplacao: parcContemplacao,
      antecip_parcelas: tabelaSelecionada.antecip_parcelas,
      valor_categoria: resultado.valorCategoria,
      parcela_termo: resultado.parcelaTermo,
      parcela_ate_1_ou_2: resultado.parcelaAte,
      parcela_demais: resultado.parcelaDemais,
      lance_ofertado_valor: resultado.lanceOfertadoValor,
      lance_embutido_valor: resultado.lanceEmbutidoValor,
      lance_proprio_valor: resultado.lanceProprioValor,
      lance_percebido_pct: resultado.lancePercebidoPct,
      novo_credito: resultado.novoCredito,
      nova_parcela_sem_limite: resultado.novaParcelaSemLimite,
      parcela_limitante: resultado.parcelaLimitante,
      parcela_escolhida: resultado.parcelaEscolhida,
      saldo_devedor_final: resultado.saldoDevedorFinal,
      novo_prazo: resultado.novoPrazo,
      adm_tax_pct: tabelaSelecionada.taxa_adm_pct,
      fr_tax_pct: tabelaSelecionada.fundo_reserva_pct,
    };


      const { data, error } = await supabase
        .from("sim_simulations")
        .insert(payload)
        .select("id,code")
        .single();
      if (error) throw error;
      if (!data?.id || !Number.isInteger(Number(data.code)) || Number(data.code) < 1) {
        throw new Error("O CRM não confirmou o código da simulação gravada.");
      }

      setSimulacaoSalva({
        assinatura: assinaturaDoClique,
        codigo: Number(data.code),
        calculo: resultado,
      });
    } catch (err: any) {
      setErroSalvamento({
        assinatura: assinaturaDoClique,
        mensagem: err?.message || "Não foi possível salvar a simulação. Tente novamente.",
      });
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  async function refreshTableData() {
    const { data, error } = await supabase.from("sim_tables").select("*");
    if (error) throw error;
    setTables((data || []) as SimTable[]);
  }

  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";

    const segmentoLabel = segmentMeta(segmento || tabelaSelecionada.segmento).label;
    const grupoInfo = grupo.trim() ? ` - Grupo ${grupo.trim()}` : "";
    const telDigits = onlyDigits(userPhone);
    const telComPais = telDigits ? (telDigits.startsWith("55") ? telDigits : `55${telDigits}`) : "";
    const wa = `https://wa.me/${telComPais}`;

    const parcelasAteContemplacaoTexto = buildParcelasAteContemplacaoCliente({
      calc,
      antecipParcelas: tabelaSelecionada.antecip_parcelas,
      parcContemplacao,
    });

    const parcelasRestantesTexto = buildParcelasRestantesCliente({
      calc,
      antecipParcelas: tabelaSelecionada.antecip_parcelas,
      parcContemplacao,
    });

    return `🎯 *Simulação Embracon ${segmentoLabel}${grupoInfo}*

💰 Crédito contratado: ${brMoney(credito)}

${parcelasAteContemplacaoTexto}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

${parcelasRestantesTexto}

⏳ Prazo restante: ${calc.novoPrazo} meses

Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`;
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone, grupo]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simulador Embracon...
      </div>
    );
  }

  const lanceModoParcela = (adminRules?.modelo_lance ?? "percentual") === "parcela";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section
        className="relative overflow-hidden rounded-[24px] border p-4 shadow-sm md:p-5"
        style={{
          background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))",
          borderColor: "rgba(255,255,255,.22)",
        }}
      >
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.28)" }} />

        <div className="relative z-[1] flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Calculator className="h-3.5 w-3.5" /> Simulador Embracon
            </div>
            <h1 className="text-xl font-black tracking-tight md:text-2xl">Simulação de consórcio Embracon</h1>
            <p className="mt-1 text-sm text-white/85">
              Preencha as condições, clique em Calcular e gere automaticamente uma simulação numerada.
            </p>
          </div>

          {activeAdmin && isAdmin && (
            <Button className="h-11 rounded-2xl bg-white text-slate-900 hover:bg-white/90" onClick={() => setMgrOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Configurar tabelas
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_.95fr]">
        <div className="space-y-4">
          <Card className={glassCardClass()}>
            <CardHeader>
              <SectionTitle icon={UserRound} title="Lead e grupo" subtitle="Selecione o cliente antes de montar a proposta." />
            </CardHeader>
            <CardContent>
              {activeAdmin ? (
                <LeadAndGroupBlock
                  leads={leads}
                  leadInfo={leadInfo}
                  grupo={grupo}
                  setGrupo={setGrupo}
                  adminName={activeAdmin.name}
                  onLeadSelected={(lead) => {
                    setLeads((prev) => (prev.some((x) => x.id === lead.id) ? prev : [lead, ...prev]));
                    setLeadId(lead.id);
                    setLeadInfo({ nome: lead.nome, telefone: lead.telefone });
                  }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Nenhuma administradora encontrada.</div>
              )}
            </CardContent>
          </Card>

          {leadId ? (
            <>
              <Card className={glassCardClass()}>
                <CardHeader>
                  <SectionTitle icon={FileText} title="Plano e tabela" subtitle="Escolha segmento, tabela e prazo. A personalidade vem da tabela selecionada." />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-5">
                    <div>
                      <Label>Segmento</Label>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                        {segmentosDisponiveis.map((seg) => {
                          const { label, Icon } = segmentVisual(seg);
                          const active = segmento === seg;

                          return (
                            <button
                              key={seg}
                              type="button"
                              onClick={() => {
                                setSegmento(seg);
                                setNomeTabela("");
                                setTabelaId("");
                              }}
                              className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-white text-center text-[11px] font-black uppercase tracking-wide transition hover:-translate-y-0.5"
                              style={{
                                borderColor: active ? C.ruby : "rgba(161,28,39,.55)",
                                color: C.ruby,
                                background: active ? "rgba(161,28,39,.08)" : "#fff",
                                boxShadow: active ? "0 10px 24px rgba(161,28,39,.16)" : "none",
                              }}
                              title={seg}
                            >
                              <Icon className="h-8 w-8" />
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <Label className="text-xs font-bold text-[#1E293F]">Tabela</Label>
                        <div className="relative mt-2">
                          <select
                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-10 text-sm font-semibold text-[#1E293F] outline-none transition focus:border-[#A11C27] focus:ring-2 focus:ring-[#A11C27]/10 disabled:cursor-not-allowed disabled:opacity-60"
                            value={nomeTabela}
                            disabled={!segmento}
                            onChange={(e) => {
                              setNomeTabela(e.target.value);
                              setTabelaId("");
                            }}
                          >
                            <option value="">{segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}</option>
                            {nomesTabelaSegmento.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <ChevronsUpDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <Label className="text-xs font-bold text-[#1E293F]">Prazo até</Label>
                          {!!variantesDaTabela.length && (
                            <span className="text-[11px] font-medium text-slate-500">
                              {variantesDaTabela.length} {variantesDaTabela.length === 1 ? "opção disponível" : "opções disponíveis"}
                            </span>
                          )}
                        </div>
                        {variantesDaTabela.length ? (
                          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Escolher prazo máximo da tabela">
                            {variantesDaTabela.map((opcao) => {
                              const selecionada = prazoRangeSelecionado?.id === opcao.id;
                              return (
                                <button
                                  key={opcao.id}
                                  type="button"
                                  aria-pressed={selecionada}
                                  onClick={() => setTabelaId(opcao.id)}
                                  className={
                                    "inline-flex min-h-10 min-w-[94px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A11C27] focus-visible:ring-offset-2 " +
                                    (selecionada
                                      ? "border-[#A11C27] bg-[#A11C27] text-white shadow-[0_4px_12px_rgba(161,28,39,0.18)]"
                                      : "border-slate-200 bg-slate-50 text-[#1E293F] hover:border-[#A11C27]/50 hover:bg-[#A11C27]/5")
                                  }
                                >
                                  {opcao.prazo_limite}
                                  <span className={"text-xs font-medium " + (selecionada ? "text-white/85" : "text-slate-500")}>meses</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-400">Selecione uma tabela para visualizar os prazos.</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-[#B5A573]/35 bg-gradient-to-r from-[#B5A573]/[0.08] to-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Label className="text-xs font-bold text-[#1E293F]">Faixa de crédito</Label>
                            <p className="mt-1 break-words text-[15px] font-extrabold tracking-tight text-[#1E293F] sm:text-base">
                              {faixaResumo
                                ? brMoney(faixaResumo.min) + " a " + brMoney(faixaResumo.max)
                                : "Selecione uma tabela e um prazo"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 shrink-0 rounded-xl border border-[#A11C27]/20 bg-white px-3 text-[#A11C27] hover:border-[#A11C27]/45 hover:bg-[#A11C27]/5"
                            aria-label="Ver tabela comercial"
                            title="Ver créditos e parcelas por prazo"
                            disabled={!nomeTabela || variantesDaTabela.length === 0}
                            onClick={() => setCommercialOpen(true)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver tabela
                          </Button>
                        </div>
                        {prazoRangeSelecionado && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-[#B5A573]/20 pt-3">
                            <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                              Adm {pctHuman(prazoRangeSelecionado.taxa_adm_pct)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                              Fundo de reserva {pctHuman(prazoRangeSelecionado.fundo_reserva_pct)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {tabelaSelecionada && <TablePersonalityCard tabela={tabelaSelecionada} adminRules={adminRules} />}
                </CardContent>
              </Card>

              <Card className={glassCardClass()}>
                <CardHeader>
                  <SectionTitle icon={Banknote} title="Configurações da venda e contemplação" subtitle="Informe crédito, prazo, modalidade e condições de contemplação." />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label>Valor do crédito</Label>
                      <MoneyInput value={credito || 0} onChange={setCredito} />
                      {creditoForaFaixa && (
                        <p className="mt-1 text-xs text-amber-700">
                          Fora da faixa de referência cadastrada; o cálculo continua liberado.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Prazo da venda</Label>
                      <Input type="number" value={prazoVenda || ""} onChange={(e) => {
                        const n = Number(e.target.value);
                        setPrazoVenda(n);
                        if (!prazoOriginalGrupo) setPrazoOriginalGrupo(n);
                      }} />
                      {prazoAviso && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{prazoAviso}</p>}
                    </div>

                    <div>
                      <Label>Forma de contratação</Label>
                      <select className="h-10 w-full rounded-md border px-3" value={forma} disabled={!tabelaSelecionada} onChange={(e) => setForma(e.target.value as FormaContratacao)}>
                        {tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                        {tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                        {tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                      </select>
                    </div>

                    <div>
                      <Label>Seguro prestamista</Label>
                      <div className="flex gap-2">
                        <Button type="button" className={seguroPrest ? "bg-[#A11C27] text-white hover:bg-[#A11C27]/90" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={() => setSeguroPrest(true)}>Sim</Button>
                        <Button type="button" className={!seguroPrest ? "bg-[#A11C27] text-white hover:bg-[#A11C27]/90" : "bg-muted text-foreground/60 hover:bg-muted"} onClick={() => setSeguroPrest(false)}>Não</Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <SectionTitle icon={TrendingUp} title="Contemplação e lance" subtitle="Selecione a modalidade e informe o lance para a simulação." />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {lanceModoParcela ? (
                      <>
                        <div>
                          <Label>Prazo original do grupo</Label>
                          <Input type="number" value={prazoOriginalGrupo || prazoVenda || 0} onChange={(e) => setPrazoOriginalGrupo(Math.max(1, Number(e.target.value)))} />
                          <p className="mt-1 text-xs text-slate-500">Base para a parcela termo.</p>
                        </div>
                        <div>
                          <Label>Qtde parcelas — lance ofertado</Label>
                          <Input type="number" value={lanceOfertParcelas} onChange={(e) => setLanceOfertParcelas(Math.max(0, Number(e.target.value)))} />
                        </div>
                        <div>
                          <Label>Qtde parcelas — lance embutido</Label>
                          <Input type="number" value={lanceEmbutParcelas} onChange={(e) => setLanceEmbutParcelas(Math.max(0, Number(e.target.value)))} />
                          <p className="mt-1 text-xs text-slate-500">Teto: {pctHuman(embutCapPct)} do {adminRules?.embut_base === "parcela_termo" ? "total de parcelas-termo" : "crédito"}.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label>Tipo de contemplação</Label>
                          <select
                            className="h-10 w-full rounded-md border px-3"
                            value={lanceTipo}
                            disabled={!tabelaSelecionada || tiposLancePermitidos.length === 0}
                            onChange={(e) => setLanceTipo(e.target.value as LanceTipo)}
                          >
                            {tiposLancePermitidos.length === 0 && <option value="livre">Nenhum lance permitido</option>}
                            {tiposLancePermitidos.map((tipo) => (
                              <option key={tipo} value={tipo}>{lanceTipoLabel(tipo)}</option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-slate-500">
                            Permitidos conforme a tabela selecionada. Base: {adminRules?.lance_ofert_base === "valor_categoria" ? "Crédito + taxas" : "Crédito"}.
                          </p>
                        </div>

                        {lanceTipo === "sorteio" ? (
                          <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            Sorteio: sem lance ofertado.
                          </div>
                        ) : lanceTipo === "livre" ? (
                          <div>
                            <Label>Lance livre (%)</Label>
                            <PercentInput valueDecimal={lanceOfertPct} onChangeDecimal={setLanceOfertPct} />
                            <p className="mt-1 text-xs text-slate-500">Informe o percentual que será ofertado.</p>
                          </div>
                        ) : (
                          <div>
                            <Label>Percentual aplicado</Label>
                            <Input value={pctHuman(lancePctFromTipo(lanceTipo))} readOnly className="text-right" />
                            <p className="mt-1 text-xs text-slate-500">Percentual fixo da modalidade selecionada.</p>
                          </div>
                        )}

                        {permiteEmbutido && lanceTipo !== "sorteio" ? (
                          <div>
                            <Label>Lance embutido (%)</Label>
                            <PercentInput
                              valueDecimal={lanceEmbutPct}
                              onChangeDecimal={(d) => setLanceEmbutPct(Math.min(d, embutCapPct))}
                              maxDecimal={embutCapPct}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              Base: {adminRules?.lance_embut_base === "valor_categoria" ? "Categoria" : "Crédito"} • Teto {pctHuman(embutCapPct)}.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border bg-slate-50 p-3 text-sm text-slate-500">
                            {lanceTipo === "sorteio" ? "Sorteio não utiliza lance embutido." : "Esta tabela não permite lance embutido."}
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <Label>Parcela da contemplação</Label>
                      <Input type="number" value={parcContemplacao} onChange={(e) => setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                      <p className="mt-1 text-xs text-slate-500">Deve ser menor que o prazo da venda.</p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-md text-xs text-slate-500">
                        Cada clique em Calcular gera um novo código e grava a simulação no CRM antes de exibir os resultados.
                      </p>
                      <Button
                        type="button"
                        className="h-11 min-w-[190px] rounded-xl bg-[#A11C27] font-bold text-white hover:bg-[#8c1822]"
                        disabled={!leadId || !podeCalcular || salvando}
                        onClick={calcularESalvar}
                      >
                        {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                        {salvando ? "Calculando e salvando..." : "Calcular"}
                      </Button>
                    </div>
                    {prazoAviso && <p role="alert" className="text-sm font-semibold text-red-700">{prazoAviso}</p>}
                    {erroAtual && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      O cálculo não foi liberado porque o salvamento falhou: {erroAtual}
                    </p>}
                    {simCode && (
                      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                        Simulação nº {simCode} gerada e salva no CRM para apresentação.
                      </p>
                    )}
                  </div>
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#1E293F]">Cálculo da tabela</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetricCard title={labelAntecipacao(tabelaSelecionada?.antecip_parcelas)} value={calc ? brMoney(calc.parcelaAte) : "—"} hint="Antes da contemplação" />
                      <MetricCard title="Demais parcelas" value={calc ? brMoney(calc.parcelaDemais) : "—"} hint="Antes da contemplação" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className={glassCardClass()}>
              <CardContent className="p-8 text-center text-sm text-slate-500">Selecione um lead para abrir o simulador.</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className={glassCardClass()}>
            <CardHeader>
              <SectionTitle icon={ShieldCheck} title="Resultado da simulação" subtitle="Resumo dos principais números." />
            </CardHeader>
            <CardContent>
              {!calc || !podeCalcular ? (
                <div className={`rounded-3xl border border-dashed p-8 text-center text-sm ${prazoAviso ? "border-red-200 bg-red-50 text-red-700" : "text-slate-500"}`}>
                  {prazoAviso || (salvando ? "Salvando a simulação no CRM..." : "Clique em Calcular para gerar o código e visualizar o resultado.")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard title="Crédito contratado" value={brMoney(credito)} />
                    <MetricCard title="Crédito líquido" value={brMoney(calc.novoCredito)} hint="Após embutido" />
                    <MetricCard title="Lance total" value={brMoney(calc.lanceOfertadoValor)} />
                    <MetricCard title="Lance próprio" value={brMoney(calc.lanceProprioValor)} />
                    <MetricCard title="Parcela escolhida" value={brMoney(calc.parcelaEscolhida)} hint={calc.aplicouLimitador ? "Limitador aplicado" : "Sem limitador maior"} />
                    <MetricCard title="Novo prazo" value={`${calc.novoPrazo} meses`} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#1E293F]">Parcelas e prazos</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                        <span>1ª parcela (na contratação)</span>
                        <strong>{brMoney(calc.parcelaAte)}</strong>
                      </div>
                      {calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                          <span>2ª parcela diferenciada</span>
                          <strong>{brMoney(calc.segundaParcelaComAntecipacao)}</strong>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>+ {calc.novoPrazo} parcelas pós-contemplação</span>
                        <strong>{brMoney(calc.parcelaEscolhida)}</strong>
                      </div>
                    </div>
                  </div>

                  {simCode && (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>Simulação <strong>nº {simCode}</strong> salva automaticamente.</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={glassCardClass()}>
            <CardHeader><CardTitle className="text-base" style={{ color: C.navy }}>Memória de cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada || !calc || !podeCalcular ? (
                <div className="text-muted-foreground">
                  {prazoAviso || "Clique em Calcular para salvar e liberar a memória de cálculo."}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div><div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da venda</div><div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div><div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div><div className="text-right">{seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}</div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Taxa Adm</div><div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div><div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div><div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div><div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Valor de categoria</div><div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                    <div>Parcela termo</div><div className="text-right">{brMoney(calc.parcelaTermo)}</div>
                    <div className="font-semibold">Saldo devedor pós-contemplação</div>
                    <div className="text-right font-semibold">{brMoney(calc.saldoDevedorFinal)}</div>
                    <div className="col-span-2 text-xs text-slate-500">
                      Valor da categoria menos parcelas pagas (sem seguro) e lance ofertado (próprio + embutido).
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className={glassCardClass()}>
            <CardHeader><CardTitle className="text-base" style={{ color: C.navy }}>Resumo para WhatsApp</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="h-64 w-full rounded-md border p-3 text-sm leading-relaxed" style={{ lineHeight: "1.6" }} readOnly value={resumoTexto} placeholder="Calcule e salve a simulação para liberar o resumo." />
              <div className="flex justify-end">
                <Button onClick={copiarResumo} disabled={!resumoTexto} variant="secondary" className="rounded-2xl">
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {commercialOpen && nomeTabela && variantesDaTabela.length > 0 && (
        <EmbraconCommercialTable
          segmento={segmento}
          nomeTabela={nomeTabela}
          variantes={variantesDaTabela}
          rules={adminRules}
          onClose={() => setCommercialOpen(false)}
        />
      )}
      {mgrOpen && activeAdmin && isAdmin && (
        <EmbraconTableManager
          admin={activeAdmin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onChanged={refreshTableData}
        />
      )}
    </div>
  );
}

function LeadAndGroupBlock({
  leads,
  leadInfo,
  grupo,
  setGrupo,
  adminName,
  onLeadSelected,
}: {
  leads: Lead[];
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string;
  setGrupo: (v: string) => void;
  adminName: string;
  onLeadSelected: (lead: Lead) => void;
}) {
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [remoteLeads, setRemoteLeads] = useState<Lead[]>([]);
  const [searchingLead, setSearchingLead] = useState(false);

  useEffect(() => {
    if (!leadOpen) {
      setLeadQuery("");
      setRemoteLeads([]);
      setSearchingLead(false);
    }
  }, [leadOpen]);

  useEffect(() => {
    if (!leadOpen) return;

    const qRaw = leadQuery.trim();
    const qDigits = onlyDigits(qRaw);

    if (qRaw.length < 2 && qDigits.length < 4) {
      setRemoteLeads([]);
      setSearchingLead(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingLead(true);

      const nameQuery = supabase
        .from("leads")
        .select("id, nome, telefone")
        .ilike("nome", `%${qRaw}%`)
        .limit(50)
        .order("nome", { ascending: true });

      const phoneQuery =
        qDigits.length >= 4
          ? supabase
              .from("leads")
              .select("id, nome, telefone")
              .ilike("telefone", `%${qDigits}%`)
              .limit(50)
              .order("nome", { ascending: true })
          : Promise.resolve({ data: [], error: null } as any);

      const [nameRes, phoneRes] = await Promise.all([nameQuery, phoneQuery]);

      const rows = [...(nameRes.data ?? []), ...(phoneRes.data ?? [])];
      const unique = new Map<string, Lead>();

      rows.forEach((x: any) => {
        if (!x?.id) return;
        unique.set(x.id, {
          id: x.id,
          nome: x.nome,
          telefone: x.telefone,
        });
      });

      setRemoteLeads(Array.from(unique.values()));
      setSearchingLead(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [leadOpen, leadQuery]);

  const filteredLeads = useMemo(() => {
    const qRaw = leadQuery.trim();
    const q = normalizeText(qRaw);
    const qDigits = onlyDigits(qRaw);

    const local = leads
      .filter((l) => {
        if (!q && !qDigits) return true;
        return normalizeText(l.nome || "").includes(q) || (!!qDigits && onlyDigits(l.telefone).includes(qDigits));
      })
      .slice(0, 60);

    const source = qRaw.length >= 2 || qDigits.length >= 4 ? [...remoteLeads, ...local] : local;

    const unique = new Map<string, Lead>();
    source.forEach((l) => unique.set(l.id, l));

    return Array.from(unique.values()).slice(0, 60);
  }, [leads, remoteLeads, leadQuery]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-2">
        <Label>Selecionar lead</Label>
        <Popover onOpenChange={setLeadOpen}>
          <PopoverButton className="h-10 w-full justify-between">
            {leadInfo?.nome || "Escolher lead"}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </PopoverButton>
          <PopoverContent className="z-50 min-w-[320px] p-2">
            <div className="mb-2 flex items-center gap-2">
              <Search className="h-4 w-4 opacity-60" />
              <Input
                placeholder="Buscar lead por nome ou telefone..."
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                className="h-8"
              />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {searchingLead && (
                <div className="flex items-center justify-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando no banco...
                </div>
              )}

              {filteredLeads.length > 0 ? (
                filteredLeads.map((l) => (
                  <PopoverClose asChild key={l.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => {
                        onLeadSelected(l);
                        setLeadQuery("");
                        setRemoteLeads([]);
                      }}
                    >
                      <div className="text-sm font-medium">{l.nome}</div>
                      {l.telefone && <div className="text-xs text-muted-foreground">{formatPhoneBR(l.telefone)}</div>}
                    </button>
                  </PopoverClose>
                ))
              ) : (
                !searchingLead && (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {leadQuery.trim().length > 0
                      ? "Nenhum lead encontrado"
                      : "Digite ao menos 2 letras do nome ou 4 números do telefone"}
                  </div>
                )
              )}
            </div>
          </PopoverContent>
        </Popover>
        {leadInfo && <p className="mt-1 text-xs text-muted-foreground">{leadInfo.nome} • {formatPhoneBR(leadInfo.telefone) || "sem telefone"}</p>}
      </div>

      <div>
        <Label>Nº do grupo</Label>
        <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="ex.: 9957" />
        <p className="mt-1 text-xs text-slate-500">Admin: {adminName}</p>
      </div>
    </div>
  );
}

function TablePersonalityCard({ tabela, adminRules }: { tabela: SimTable; adminRules: any }) {
  const embutidoMaxPct = Math.min(Math.max(Number(adminRules?.embut_cap_adm_pct ?? 0.25), 0), 0.25);
  const chip = (label: string, enabled: boolean) => enabled ? (
    <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-[#1E293F]">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span>{label}</span>
    </div>
  ) : null;
  const labelResumo = (valor: string, detalhe: string) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="text-xs text-slate-500">{valor}</span>
      <strong className="text-right text-xs font-bold text-[#1E293F]">{detalhe}</strong>
    </div>
  );
  const temLances = !!(tabela.permite_lance_livre || tabela.permite_lance_fixo_50 || tabela.permite_lance_fixo_25);
  const temPagamento = !!(tabela.permite_lance_embutido || tabela.permite_troca_chaves || tabela.permite_fgts);
  const temParcelas = !!(tabela.contrata_parcela_cheia || tabela.contrata_reduzida_25 || tabela.contrata_reduzida_50);
  const baseCalculo = adminRules?.lance_ofert_base === "valor_categoria" ? "Crédito + taxas" : "Crédito";
  const baseEmbutido = adminRules?.lance_embut_base === "valor_categoria" ? "Crédito + taxas" : "Crédito";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm" aria-label="Personalidade da tabela selecionada">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1E293F]/10 text-[#1E293F]">
            <Settings className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-[#1E293F]">Personalidade da tabela selecionada</h3>
            <p className="text-[11px] text-slate-500">Condições específicas da faixa de {tabela.prazo_limite} meses</p>
          </div>
        </div>
        <span className="rounded-full border border-[#B5A573]/40 bg-[#B5A573]/10 px-3 py-1 text-[11px] font-bold text-[#1E293F]">
          {tabela.nome_tabela}
        </span>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[#A11C27]">
            <Banknote className="h-4 w-4 shrink-0" />
            <h4 className="text-[11px] font-black uppercase tracking-wide">Taxas</h4>
          </div>
          {labelResumo("Taxa Adm.", pctHuman(tabela.taxa_adm_pct))}
          {labelResumo("Fundo Reserva", pctHuman(tabela.fundo_reserva_pct))}
          {labelResumo("Antecipação", pctHuman(tabela.antecip_pct) + " em " + (tabela.antecip_parcelas || 0) + "x")}
          {labelResumo("Seguro", pctHuman(tabela.seguro_prest_pct))}
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[#A11C27]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <h4 className="text-[11px] font-black uppercase tracking-wide">Lances permitidos</h4>
          </div>
          <div className="space-y-1.5">
            {chip("Lance Livre", tabela.permite_lance_livre)}
            {chip("Lance Fixo 50%", tabela.permite_lance_fixo_50)}
            {chip("Lance Fixo 25%", tabela.permite_lance_fixo_25)}
            {!temLances && <p className="text-xs text-slate-500">Nenhum lance habilitado.</p>}
            {tabela.permite_sorteio !== false && (
              <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-600">
                <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#B5A573]" />
                Sorteio disponível
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[#A11C27]">
            <TrendingUp className="h-4 w-4 shrink-0" />
            <h4 className="text-[11px] font-black uppercase tracking-wide">Pgto. do lance</h4>
          </div>
          <div className="space-y-1.5">
            {chip("Lance Embutido até " + pctHuman(embutidoMaxPct), tabela.permite_lance_embutido)}
            {chip("Troca de Chaves", !!tabela.permite_troca_chaves)}
            {chip("FGTS", !!tabela.permite_fgts)}
            {!temPagamento && <p className="text-xs text-slate-500">Nenhuma opção habilitada.</p>}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[#A11C27]">
            <FileText className="h-4 w-4 shrink-0" />
            <h4 className="text-[11px] font-black uppercase tracking-wide">Parcelas</h4>
          </div>
          <div className="space-y-1.5">
            {chip("Parcela Cheia", tabela.contrata_parcela_cheia)}
            {chip("Reduzida 25%", tabela.contrata_reduzida_25)}
            {chip("Reduzida 50%", tabela.contrata_reduzida_50)}
            {!temParcelas && <p className="text-xs text-slate-500">Nenhuma modalidade habilitada.</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-[#1E293F]/[0.04] px-4 py-3 text-xs text-slate-600">
        <span><strong className="text-[#1E293F]">Base de cálculo:</strong> {baseCalculo}</span>
        {tabela.permite_lance_embutido && baseEmbutido !== baseCalculo && (
          <span><strong className="text-[#1E293F]">Base do embutido:</strong> {baseEmbutido}</span>
        )}
        <span><strong className="text-[#1E293F]">Correção:</strong> {(tabela.indice_correcao || []).join(", ") || "Não configurado"}</span>
        <span><strong className="text-[#1E293F]">Limitador de parcela:</strong> {pctHuman(tabela.limitador_parcela_pct)}</span>
        <span><strong className="text-[#1E293F]">Reajusta a cada:</strong> {tabela.reajusta_cada_meses ? tabela.reajusta_cada_meses + " meses" : "Não configurado"}</span>
      </div>
    </section>
  );
}

