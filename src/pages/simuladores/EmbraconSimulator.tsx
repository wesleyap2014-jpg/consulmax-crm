// src/pages/simuladores/EmbraconSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Banknote,
  Bike,
  Calculator,
  Car,
  ChevronsUpDown,
  Copy,
  FileText,
  Home,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
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
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

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
  const [lanceOfertPct, setLanceOfertPct] = useState(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState(0);
  const [prazoOriginalGrupo, setPrazoOriginalGrupo] = useState(0);
  const [lanceOfertParcelas, setLanceOfertParcelas] = useState(0);
  const [lanceEmbutParcelas, setLanceEmbutParcelas] = useState(0);
  const [parcContemplacao, setParcContemplacao] = useState(1);
  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);
  const [userPhone, setUserPhone] = useState("");

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
        supabase.from("leads").select("id, nome, telefone").limit(300).order("created_at", { ascending: false }),
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
      const { data } = await supabase.from("users").select("phone, telefone").eq("auth_user_id", uid).maybeSingle();
      setUserPhone((data?.phone || data?.telefone || "").toString());
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

  const embutCapPct = adminRules?.embut_cap_adm_pct ?? 0.25;

  useEffect(() => {
    if (lanceEmbutPct > embutCapPct) setLanceEmbutPct(embutCapPct);
  }, [lanceEmbutPct, embutCapPct]);

  const prazoAviso = prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada." : null;
  const podeCalcular = !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }

    const modeloLance = adminRules?.modelo_lance ?? "percentual";
    const lanceBase = (adminRules?.modelo_lance_base ?? (modeloLance === "parcela" ? "parcela_termo" : "credito")) as "credito" | "parcela_termo";

    setCalc(
      calcularSimulacao({
        credito,
        prazoVenda,
        forma,
        seguro: seguroPrest,
        segmento: tabelaSelecionada.segmento,
        taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
        frPct: tabelaSelecionada.fundo_reserva_pct,
        antecipPct: tabelaSelecionada.antecip_pct,
        antecipParcelas: (tabelaSelecionada.antecip_parcelas as any) ?? 0,
        limitadorPct: tabelaSelecionada.limitador_parcela_pct,
        seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
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
      })
    );
  }, [tabelaSelecionada, credito, prazoVenda, forma, seguroPrest, lanceOfertPct, lanceEmbutPct, parcContemplacao, adminRules, prazoOriginalGrupo, lanceOfertParcelas, lanceEmbutParcelas, podeCalcular, embutCapPct]);

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
      lance_modelo: adminRules?.modelo_lance ?? "percentual",
      lance_base: adminRules?.modelo_lance_base ?? (adminRules?.modelo_lance === "parcela" ? "parcela_termo" : "credito"),
      prazo_original_grupo: prazoOriginalGrupo || null,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: Math.min(lanceEmbutPct, embutCapPct),
      lance_ofertado_parcelas: lanceOfertParcelas,
      lance_embutido_parcelas: lanceEmbutParcelas,
      parcela_contemplacao: parcContemplacao,
      antecip_parcelas: tabelaSelecionada.antecip_parcelas,
      valor_categoria: calc.valorCategoria,
      parcela_termo: calc.parcelaTermo,
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
      adm_tax_pct: tabelaSelecionada.taxa_adm_pct,
      fr_tax_pct: tabelaSelecionada.fundo_reserva_pct,
    };

    const { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();
    setSalvando(false);

    if (error) {
      alert("Erro ao salvar simulação: " + error.message);
      return;
    }

    setSimCode(data?.code ?? null);
  }

  function handleTableCreatedOrUpdated(newTable: SimTable) {
    setTables((prev) => (prev.find((t) => t.id === newTable.id) ? prev.map((t) => (t.id === newTable.id ? newTable : t)) : [newTable, ...prev]));
  }

  function handleTableDeleted(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";

    const segmentoLabel = segmentMeta(segmento || tabelaSelecionada.segmento).label;
    const grupoInfo = grupo.trim() ? ` - Grupo ${grupo.trim()}` : "";
    const primeiraParcelaLabel = labelAntecipacao(tabelaSelecionada.antecip_parcelas);
    const telDigits = onlyDigits(userPhone);
    const telComPais = telDigits ? (telDigits.startsWith("55") ? telDigits : `55${telDigits}`) : "";
    const wa = `https://wa.me/${telComPais}`;

    const segundaParcExtra =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? `\n⚠️ Parcela com antecipação da taxa de administração: ${brMoney(calc.segundaParcelaComAntecipacao)}`
        : "";

    return `🎯 *Simulação Embracon ${segmentoLabel}${grupoInfo}*

💰 Crédito contratado: ${brMoney(credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (Primeira parcela em até 3x sem juros no cartão)

💵 Demais parcelas até a contemplação: ${brMoney(calc.parcelaDemais)}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${brMoney(calc.parcelaEscolhida)}${segundaParcExtra}

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
        className="relative overflow-hidden rounded-[28px] border p-6 shadow-sm md:p-8"
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
            <h1 className="text-2xl font-black tracking-tight md:text-4xl">Tabelas com personalidade própria</h1>
            <p className="mt-3 text-sm text-white/82 md:text-base">
              Cada tabela mantém suas regras de prazo, taxa, fundo reserva, antecipação, limitador, seguro e modalidade de lance.
            </p>
          </div>

          {activeAdmin && (
            <Button className="h-11 rounded-2xl bg-white text-slate-900 hover:bg-white/90" onClick={() => setMgrOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Gerenciar tabelas
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
                <LeadAndGroupBlock leads={leads} leadId={leadId} setLeadId={setLeadId} leadInfo={leadInfo} grupo={grupo} setGrupo={setGrupo} adminName={activeAdmin.name} />
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

                    <div className="grid gap-4 md:grid-cols-[1fr_1.35fr_1fr]">
                      <div>
                        <Label>Tabela</Label>
                        <select
                          className="h-10 w-full rounded-md border px-3"
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
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <Label>Prazo até</Label>
                          <span className="text-xs font-semibold" style={{ color: C.ruby }}>
                            {prazoRangeSelecionado ? `${prazoRangeSelecionado.prazo_limite} meses` : "—"}
                          </span>
                        </div>

                        <div className="mt-2 rounded-2xl border bg-slate-50/70 px-4 py-3">
                          <input
                            type="range"
                            className="w-full accent-[#A11C27]"
                            min={0}
                            max={Math.max(0, variantesDaTabela.length - 1)}
                            step={1}
                            value={prazoRangeIndex}
                            disabled={!nomeTabela || variantesDaTabela.length === 0}
                            onChange={(e) => {
                              const idx = Number(e.target.value);
                              const next = variantesDaTabela[idx];
                              if (next) setTabelaId(next.id);
                            }}
                          />

                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span>{variantesDaTabela[0] ? `${variantesDaTabela[0].prazo_limite}m` : "—"}</span>
                            <span>{variantesDaTabela.length} faixa(s) de prazo</span>
                            <span>{variantesDaTabela[variantesDaTabela.length - 1] ? `${variantesDaTabela[variantesDaTabela.length - 1].prazo_limite}m` : "—"}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label>Faixa de crédito</Label>
                        <Input value={faixa ? `${brMoney(faixa.min)} a ${brMoney(faixa.max)}` : ""} readOnly />
                        {prazoRangeSelecionado && (
                          <p className="mt-1 text-xs text-slate-500">
                            Adm {pctHuman(prazoRangeSelecionado.taxa_adm_pct)} • FR {pctHuman(prazoRangeSelecionado.fundo_reserva_pct)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {tabelaSelecionada && <TablePersonalityCard tabela={tabelaSelecionada} adminRules={adminRules} />}
                </CardContent>
              </Card>

              <Card className={glassCardClass()}>
                <CardHeader>
                  <SectionTitle icon={Banknote} title="Configuração da venda" subtitle="Informe crédito, prazo, forma de contratação e seguro." />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label>Valor do crédito</Label>
                      <MoneyInput value={credito || 0} onChange={setCredito} />
                      {faixa && credito > 0 && (credito < faixa.min || credito > faixa.max) && (
                        <p className="mt-1 text-xs text-amber-600">Crédito fora da faixa cadastrada.</p>
                      )}
                    </div>

                    <div>
                      <Label>Prazo da venda</Label>
                      <Input type="number" value={prazoVenda || ""} onChange={(e) => {
                        const n = Number(e.target.value);
                        setPrazoVenda(n);
                        if (!prazoOriginalGrupo) setPrazoOriginalGrupo(n);
                      }} />
                      {prazoAviso && <p className="mt-1 text-xs text-amber-600">{prazoAviso}</p>}
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard title={labelAntecipacao(tabelaSelecionada?.antecip_parcelas)} value={calc ? brMoney(calc.parcelaAte) : "—"} hint="Antes da contemplação" />
                    <MetricCard title="Demais parcelas" value={calc ? brMoney(calc.parcelaDemais) : "—"} hint="Antes da contemplação" />
                  </div>
                </CardContent>
              </Card>

              <Card className={glassCardClass()}>
                <CardHeader>
                  <SectionTitle icon={TrendingUp} title="Estratégia de lance" subtitle="Respeita o modelo configurado nas regras da administradora." />
                </CardHeader>
                <CardContent className="space-y-4">
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
                          <Label>Lance ofertado (%)</Label>
                          <PercentInput valueDecimal={lanceOfertPct} onChangeDecimal={setLanceOfertPct} />
                          <p className="mt-1 text-xs text-slate-500">Base: {adminRules?.lance_ofert_base === "valor_categoria" ? "Crédito + taxas" : "Crédito"}.</p>
                        </div>
                        <div>
                          <Label>Lance embutido (%)</Label>
                          <PercentInput valueDecimal={lanceEmbutPct} onChangeDecimal={(d) => setLanceEmbutPct(Math.min(d, embutCapPct))} maxDecimal={embutCapPct} />
                          <p className="mt-1 text-xs text-slate-500">Base: {adminRules?.lance_embut_base === "valor_categoria" ? "Categoria" : "Crédito"} • Teto {pctHuman(embutCapPct)}.</p>
                        </div>
                      </>
                    )}

                    <div>
                      <Label>Parcela da contemplação</Label>
                      <Input type="number" value={parcContemplacao} onChange={(e) => setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                      <p className="mt-1 text-xs text-slate-500">Deve ser menor que o prazo da venda.</p>
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
              {!calc ? (
                <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Preencha os dados da simulação para visualizar o resultado.</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard title="Crédito contratado" value={brMoney(credito)} />
                    <MetricCard title="Crédito líquido" value={brMoney(calc.novoCredito)} hint="Após embutido" />
                    <MetricCard title="Lance próprio" value={brMoney(calc.lanceProprioValor)} />
                    <MetricCard title="Lance embutido" value={brMoney(calc.lanceEmbutidoValor)} />
                    <MetricCard title="Parcela escolhida" value={brMoney(calc.parcelaEscolhida)} hint={calc.aplicouLimitador ? "Limitador aplicado" : "Sem limitador maior"} />
                    <MetricCard title="Novo prazo" value={`${calc.novoPrazo} meses`} />
                  </div>

                  {calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      2ª parcela com antecipação: <strong>{brMoney(calc.segundaParcelaComAntecipacao)}</strong>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button className="h-10 rounded-2xl" onClick={salvarSimulacao} disabled={!calc || salvando} style={{ background: C.ruby }}>
                      {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar Simulação
                    </Button>
                    {simCode && <div className="flex items-center rounded-2xl border bg-slate-50 px-3 text-sm">✅ Salvo como <strong className="ml-1">#{simCode}</strong></div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={glassCardClass()}>
            <CardHeader><CardTitle className="text-base" style={{ color: C.navy }}>Memória de cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
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
                    <div>Parcela termo</div><div className="text-right">{calc ? brMoney(calc.parcelaTermo) : "—"}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className={glassCardClass()}>
            <CardHeader><CardTitle className="text-base" style={{ color: C.navy }}>Resumo para WhatsApp</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="h-64 w-full rounded-md border p-3 text-sm leading-relaxed" style={{ lineHeight: "1.6" }} readOnly value={resumoTexto} placeholder="Preencha os campos para gerar o resumo." />
              <div className="flex justify-end">
                <Button onClick={copiarResumo} disabled={!resumoTexto} variant="secondary" className="rounded-2xl">
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {mgrOpen && activeAdmin && (
        <TableManagerModal
          admin={activeAdmin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onCreatedOrUpdated={handleTableCreatedOrUpdated}
          onDeleted={handleTableDeleted}
        />
      )}
    </div>
  );
}

function LeadAndGroupBlock({
  leads,
  leadId,
  setLeadId,
  leadInfo,
  grupo,
  setGrupo,
  adminName,
}: {
  leads: Lead[];
  leadId: string;
  setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string;
  setGrupo: (v: string) => void;
  adminName: string;
}) {
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");

  const filteredLeads = useMemo(() => {
    const qRaw = leadQuery.trim();
    const q = normalizeText(qRaw);
    const qDigits = onlyDigits(qRaw);

    return leads
      .filter((l) => normalizeText(l.nome || "").includes(q) || (!!qDigits && onlyDigits(l.telefone).includes(qDigits)))
      .slice(0, 60);
  }, [leads, leadQuery]);

  useEffect(() => {
    if (!leadOpen) setLeadQuery("");
  }, [leadOpen]);

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
              <Input placeholder="Buscar lead por nome ou telefone..." value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)} className="h-8" />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((l) => (
                  <PopoverClose asChild key={l.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => {
                        setLeadId(l.id);
                        setLeadQuery("");
                      }}
                    >
                      <div className="text-sm font-medium">{l.nome}</div>
                      {l.telefone && <div className="text-xs text-muted-foreground">{formatPhoneBR(l.telefone)}</div>}
                    </button>
                  </PopoverClose>
                ))
              ) : (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum lead encontrado</div>
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
  return (
    <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
      <div className="mb-3 flex items-center gap-2 font-black" style={{ color: C.navy }}>
        <Settings className="h-4 w-4" /> Personalidade da tabela selecionada
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>Taxa Adm: <strong>{pctHuman(tabela.taxa_adm_pct)}</strong></div>
        <div>Fundo Reserva: <strong>{pctHuman(tabela.fundo_reserva_pct)}</strong></div>
        <div>Antecipação: <strong>{pctHuman(tabela.antecip_pct)}</strong> • {tabela.antecip_parcelas}x</div>
        <div>Limitador: <strong>{pctHuman(tabela.limitador_parcela_pct)}</strong></div>
        <div>Seguro: <strong>{pctHuman(tabela.seguro_prest_pct)}</strong></div>
        <div>Índice: <strong>{(tabela.indice_correcao || []).join(", ") || "—"}</strong></div>
        <div>Base ofertado: <strong>{adminRules?.lance_ofert_base === "valor_categoria" ? "Crédito + taxas" : "Crédito"}</strong></div>
        <div>Base embutido: <strong>{adminRules?.lance_embut_base === "valor_categoria" ? "Crédito + taxas" : "Crédito"}</strong></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {tabela.contrata_parcela_cheia && <span className="rounded-full bg-white px-3 py-1">Parcela Cheia</span>}
        {tabela.contrata_reduzida_25 && <span className="rounded-full bg-white px-3 py-1">Reduzida 25%</span>}
        {tabela.contrata_reduzida_50 && <span className="rounded-full bg-white px-3 py-1">Reduzida 50%</span>}
        {tabela.permite_lance_embutido && <span className="rounded-full bg-white px-3 py-1">Embutido</span>}
        {tabela.permite_lance_livre && <span className="rounded-full bg-white px-3 py-1">Livre</span>}
        {tabela.permite_lance_fixo_25 && <span className="rounded-full bg-white px-3 py-1">Fixo 25%</span>}
        {tabela.permite_lance_fixo_50 && <span className="rounded-full bg-white px-3 py-1">Fixo 50%</span>}
      </div>
    </div>
  );
}

function ModalBase({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="font-black" style={{ color: C.navy }}>{title}</div>
            <div className="text-sm text-slate-500">Gerencie as personalidades de cada tabela sem alterar o cálculo principal.</div>
          </div>
          <button onClick={onClose} className="rounded-2xl border p-2 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  const [query, setQuery] = useState("");

  const pageSize = 10;

  const grouped = useMemo(() => {
    const q = normalizeText(query);
    return [...allTables]
      .filter((t) => !q || normalizeText(`${t.segmento} ${t.nome_tabela} ${t.prazo_limite}`).includes(q))
      .sort((a, b) => (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase().localeCompare((b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase()));
  }, [allTables, query]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(() => grouped.slice((page - 1) * pageSize, page * pageSize), [grouped, page]);

  useEffect(() => setPage(1), [allTables.length, query]);

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
    <ModalBase onClose={onClose} title="Gerenciador de Tabelas Embracon">
      <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">Admin ativa: <strong>{admin.name}</strong> • {allTables.length} tabela(s)</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tabela..." />
            </div>
            <Button onClick={() => { setEditing(null); setShowForm(true); }} className="h-10 rounded-2xl px-4" style={{ background: C.ruby }}>
              <Plus className="mr-1 h-4 w-4" /> Nova Tabela
            </Button>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">Segmento</th>
                <th className="p-3 text-left">Tabela</th>
                <th className="p-3 text-left">Prazo</th>
                <th className="p-3 text-left">% Adm</th>
                <th className="p-3 text-left">% FR</th>
                <th className="p-3 text-left">% Antecip</th>
                <th className="p-3 text-left">Parc Ant.</th>
                <th className="p-3 text-left">% Limite</th>
                <th className="p-3 text-left">% Seguro</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">{t.segmento}</td>
                  <td className="p-3 font-semibold" style={{ color: C.navy }}>{t.nome_tabela}</td>
                  <td className="p-3">{t.prazo_limite}</td>
                  <td className="p-3">{pctHuman(t.taxa_adm_pct)}</td>
                  <td className="p-3">{pctHuman(t.fundo_reserva_pct)}</td>
                  <td className="p-3">{pctHuman(t.antecip_pct)}</td>
                  <td className="p-3">{t.antecip_parcelas}</td>
                  <td className="p-3">{pctHuman(t.limitador_parcela_pct)}</td>
                  <td className="p-3">{pctHuman(t.seguro_prest_pct)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setEditing(t); setShowForm(true); }} className="h-9 rounded-xl px-3">
                        <Pencil className="mr-1 h-4 w-4" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" disabled={busyId === t.id} onClick={() => deletar(t.id)} className="h-9 rounded-xl px-3">
                        {busyId === t.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Sem tabelas para esta administradora.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <div>{grouped.length > 0 && <>Mostrando <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, grouped.length)}</strong> de <strong>{grouped.length}</strong></>}</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            <span>Página {page} de {totalPages}</span>
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={() => setShowForm(false)}
          onSaved={(t) => {
            onCreatedOrUpdated(t);
            setShowForm(false);
          }}
        />
      )}
    </ModalBase>
  );
}

function TableFormOverlay({ adminId, initial, onSaved, onClose }: { adminId: string; initial?: SimTable; onSaved: (t: SimTable) => void; onClose: () => void }) {
  const [segmento, setSegmento] = useState(initial?.segmento || "Imóvel Estendido");
  const [nome, setNome] = useState(initial?.nome_tabela || "Select Estendido");
  const [faixaMin, setFaixaMin] = useState(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState(initial?.prazo_limite ?? 240);

  function fmtPct(d: number) { return (d * 100).toFixed(4).replace(".", ","); }
  function parsePct(s: string) {
    const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num / 100;
  }

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(fmtPct(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(fmtPct(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(fmtPct(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(fmtPct(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(fmtPct(initial?.seguro_prest_pct ?? 0.00061));
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
      taxa_adm_pct: parsePct(taxaAdmHuman),
      fundo_reserva_pct: parsePct(frHuman),
      antecip_pct: parsePct(antecipHuman),
      antecip_parcelas: Number(antecipParcelas) || 0,
      limitador_parcela_pct: parsePct(limHuman),
      seguro_prest_pct: parsePct(seguroHuman),
      permite_lance_embutido: perEmbutido,
      permite_lance_fixo_25: perFixo25,
      permite_lance_fixo_50: perFixo50,
      permite_lance_livre: perLivre,
      contrata_parcela_cheia: cParcelaCheia,
      contrata_reduzida_25: cRed25,
      contrata_reduzida_50: cRed50,
      indice_correcao: indices.split(",").map((s) => s.trim()).filter(Boolean),
    };

    const res = initial
      ? await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single()
      : await supabase.from("sim_tables").insert(payload).select("*").single();

    setSaving(false);

    if (res.error) {
      alert("Erro ao salvar tabela: " + res.error.message);
      return;
    }

    onSaved(res.data as SimTable);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="font-black" style={{ color: C.navy }}>{initial ? "Editar Tabela" : "Nova Tabela"}</div>
            <div className="text-sm text-slate-500">Configure a personalidade da tabela.</div>
          </div>
          <button onClick={onClose} className="rounded-2xl border p-2 hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div><Label>Segmento</Label><Input value={segmento} onChange={(e) => setSegmento(e.target.value)} /></div>
            <div><Label>Nome da Tabela</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div><Label>Faixa mínima</Label><Input type="number" value={faixaMin} onChange={(e) => setFaixaMin(Number(e.target.value))} /></div>
            <div><Label>Faixa máxima</Label><Input type="number" value={faixaMax} onChange={(e) => setFaixaMax(Number(e.target.value))} /></div>
            <div><Label>Prazo Limite</Label><Input type="number" value={prazoLimite} onChange={(e) => setPrazoLimite(Number(e.target.value))} /></div>
            <div><Label>% Taxa Adm</Label><Input value={taxaAdmHuman} onChange={(e) => setTaxaAdmHuman(e.target.value)} /></div>
            <div><Label>% Fundo Reserva</Label><Input value={frHuman} onChange={(e) => setFrHuman(e.target.value)} /></div>
            <div><Label>% Antecipação Adm</Label><Input value={antecipHuman} onChange={(e) => setAntecipHuman(e.target.value)} /></div>
            <div><Label>Parcelas Antecipação</Label><Input type="number" value={antecipParcelas} onChange={(e) => setAntecipParcelas(Number(e.target.value))} /></div>
            <div><Label>% Limitador Parcela</Label><Input value={limHuman} onChange={(e) => setLimHuman(e.target.value)} /></div>
            <div><Label>% Seguro por parcela</Label><Input value={seguroHuman} onChange={(e) => setSeguroHuman(e.target.value)} /></div>
            <div><Label>Índice de Correção</Label><Input value={indices} onChange={(e) => setIndices(e.target.value)} placeholder="IPCA, INCC, IGP-M" /></div>

            <div className="rounded-3xl border p-4 md:col-span-2">
              <Label>Lances Permitidos</Label>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={perEmbutido} onChange={(e) => setPerEmbutido(e.target.checked)} /> Embutido</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo25} onChange={(e) => setPerFixo25(e.target.checked)} /> Fixo 25%</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo50} onChange={(e) => setPerFixo50(e.target.checked)} /> Fixo 50%</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={perLivre} onChange={(e) => setPerLivre(e.target.checked)} /> Livre</label>
              </div>
            </div>

            <div className="rounded-3xl border p-4 md:col-span-2">
              <Label>Formas de Contratação</Label>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={cParcelaCheia} onChange={(e) => setCParcelaCheia(e.target.checked)} /> Parcela Cheia</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={cRed25} onChange={(e) => setCRed25(e.target.checked)} /> Reduzida 25%</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={cRed50} onChange={(e) => setCRed50(e.target.checked)} /> Reduzida 50%</label>
              </div>
            </div>

            <div className="flex gap-2 md:col-span-4">
              <Button onClick={salvar} disabled={saving} className="h-10 rounded-2xl px-4" style={{ background: C.ruby }}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initial ? "Salvar alterações" : "Salvar Tabela"}
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={saving} className="h-10 rounded-2xl px-4">Cancelar</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
