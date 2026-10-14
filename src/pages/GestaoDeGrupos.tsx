// src/pages/GestaoDeGrupos.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import GroupBidModalitySettings from "@/components/gestao-grupos/GroupBidModalitySettings";
import GroupMedianHistory from "@/components/gestao-grupos/GroupMedianHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Filter as FilterIcon,
  Percent,
  Pencil,
  Save,
  Settings,
  X,
  Target,
  ChevronUp,
  ChevronDown,
  Bell,
  CalendarCheck2,
  Info,
  Layers3,
  CalendarDays,
  BarChart3,
  ExternalLink,
  FileDown,
} from "lucide-react";

/* =========================================================
   TIPOS
   ========================================================= */

type Administradora = "Embracon" | "HS" | "Maggi" | string;

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
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
  prazo_encerramento_meses: number | null;
};

type BidModality = { key: string; label: string; percentage?: number | null };
type BidRule = {
  administradora: string;
  scope: string;
  segmento: string;
  group_id: string | null;
  modalities: BidModality[];
};
type BidOutcome = { offers: number; deliveries: number };
type BidOutcomeMap = Record<string, BidOutcome>;

function normBid(value: string) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/consorcios?|holding|s\/?a|s\.?a\.?/g, "").replace(/[^a-z0-9]/g, "");
  if (normalized === "bb" || normalized === "bancodobrasil" || normalized === "bbcons") return "bancodobrasil";
  return normalized;
}
function modesForGroup(group: Pick<Grupo, "id" | "administradora" | "segmento">, rules: BidRule[]): BidModality[] {
  const own = rules.find(r => r.scope === "grupo" && r.group_id === group.id);
  const relevant = rules.filter(r => normBid(r.administradora) === normBid(group.administradora));
  const active = own || relevant.find(r => r.scope === "segmento" && normBid(r.segmento) === normBid(group.segmento))
    || relevant.find(r => r.scope === "administradora");
  // Apenas quando não há configuração definida: compatibilidade com grupos legados.
  return active ? active.modalities : [
    { key: "fixo_25", label: "Fixo 25%" },
    { key: "fixo_50", label: normBid(group.administradora).includes("maggi") ? "Fixo 35%" : "Fixo 50%" },
    { key: "livre", label: "Lance Livre" },
  ];
}
function legacyBidSlot(group: Pick<Grupo, "administradora">, mode: BidModality): "ll" | "fix25" | "fix50" | null {
  const key = String(mode.key).toLowerCase();
  const label = String(mode.label).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const percentage = mode.percentage;
  if (key === "livre" || /lance\s*livre/.test(label)) return "ll";
  if (key === "fixo_25" || (percentage === 25 && /fixo/.test(label)) || /fixo\s*25\s*%/.test(label)) return "fix25";
  const maggi = normBid(group.administradora).includes("maggi");
  if (key === "fixo_50" || (maggi && (key === "fixo_35" || (percentage === 35 && /fixo/.test(label)) || /fixo\s*35\s*%/.test(label)))) return "fix50";
  return null;
}
function sanitizeBidResults(data: unknown): BidOutcomeMap {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const result: BidOutcomeMap = {};
  Object.entries(data).forEach(([key, row]) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const r = row as Record<string, unknown>;
    const offers = Number(r.offers), deliveries = Number(r.deliveries);
    if (Number.isFinite(offers) && Number.isFinite(deliveries)) {
      result[key] = { offers, deliveries };
    }
  });
  return result;
}

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
  reference_number?: number | null;
};

/* =========================================================
   HELPERS
   ========================================================= */

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
  const min = Math.max(0, alvo * 0.7);
  const max = alvo * 1.3;
  return mediana >= min && mediana <= max;
}

function toYMD(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const s = typeof d === "string" ? d.trim() : (d as Date).toISOString();

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const isoHead = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoHead) return `${isoHead[1]}-${isoHead[2]}-${isoHead[3]}`;

  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  const A = toYMD(a);
  const B = toYMD(b);
  return !!A && !!B && A === B;
}

function formatBR(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function toPct4(v: number | null | undefined): string {
  if (v == null) return "—";
  const str = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${str}%`;
}

function todayYMDLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAdmin(raw?: string | null): string {
  const s = stripAccents(String(raw ?? "")).toLowerCase();
  const cleaned = s
    .replace(/consorcios?|consorcio|holding|sa|s\/a|s\.a\.?/g, "")
    .replace(/[^\w]/g, "")
    .trim();
  if (cleaned.includes("embracon")) return "Embracon";
  if (cleaned.includes("hs")) return "HS";
  if (cleaned.includes("maggi")) return "Maggi";
  return (raw ?? "").toString().trim();
}

function normalizeGroupDigits(g?: string | number | null): string {
  const s = String(g ?? "").trim();
  const first = s.split(/[\/\-\s]/)[0] || s;
  const m = first.match(/\d+/);
  if (m) return m[0];
  return s.replace(/\D/g, "");
}

function keyDigits(adm?: string | null, grp?: string | number | null) {
  return `${normalizeAdmin(adm)}::${normalizeGroupDigits(grp)}`;
}

function isStubId(id: string) {
  return id.startsWith("stub:");
}

function makeStubId(adm?: string | null, grp?: string | number | null) {
  return `stub:${keyDigits(adm, grp)}`;
}

/* =========================================================
   REFERÊNCIA POR BILHETES
   ========================================================= */

function referenciaPorAdministradora(params: {
  administradora: Administradora;
  participantes: number | null | undefined;
  bilhetes: LoteriaFederal | null;
}): number | null {
  const { administradora, participantes, bilhetes } = params;
  if (!participantes || participantes <= 0 || !bilhetes) return null;

  const adm = normalizeAdmin(administradora).toLowerCase();

  function reduceByCap(n: number, cap: number): number {
    if (cap <= 0) return 0;
    let v = n;
    while (v > cap) v -= cap;
    if (v === 0) v = cap;
    return v;
  }

  function tryEmbraconAte1000(num5: string, cap: number): number | null {
    const ult3 = parseInt(num5.slice(-3), 10);
    if (ult3 >= 1 && ult3 <= cap) return ult3;

    const centenaSeguinte = parseInt(num5.slice(1, 4), 10);
    if (centenaSeguinte >= 1 && centenaSeguinte <= cap) return centenaSeguinte;

    return null;
  }

  if (adm === "maggi") {
    const p5 = sanitizeBilhete5(bilhetes.primeiro);
    const milhar = parseInt(p5.slice(-4), 10);
    return reduceByCap(milhar, participantes);
  }

  if (adm === "hs") {
    const p5 = sanitizeBilhete5(bilhetes.primeiro);
    const milhar = parseInt(p5.slice(-4), 10);
    return reduceByCap(milhar, participantes);
  }

  if (adm === "embracon") {
    if (participantes <= 1000) {
      const premios = [bilhetes.primeiro, bilhetes.segundo, bilhetes.terceiro, bilhetes.quarto, bilhetes.quinto];

      for (const premio of premios) {
        const p5 = sanitizeBilhete5(premio);
        const tentativa = tryEmbraconAte1000(p5, participantes);
        if (tentativa != null) return tentativa;
      }
      return null;
    }

    const p5 = sanitizeBilhete5(bilhetes.primeiro);
    const milhar = parseInt(p5.slice(-4), 10);
    return reduceByCap(milhar, participantes);
  }

  const p5 = sanitizeBilhete5(bilhetes.primeiro);
  const tres = parseInt(p5.slice(-3), 10);
  return reduceByCap(tres, participantes);
}

/* =========================================================
   OVERLAY: LOTERIA FEDERAL
   ========================================================= */

function OverlayLoteria({
  onClose,
  onSaved,
  initialDate,
}: {
  onClose: () => void;
  onSaved: (lf: LoteriaFederal) => void;
  initialDate?: string;
}) {
  const [data, setData] = useState<string>(initialDate || "");
  const [form, setForm] = useState<LoteriaFederal>({
    data_sorteio: initialDate || "",
    primeiro: "",
    segundo: "",
    terceiro: "",
    quarto: "",
    quinto: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existing, setExisting] = useState(false);
  const [readError, setReadError] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    setSaveError("");
    setReadError("");
    setExisting(false);
    if (!data) {
      setForm({ data_sorteio: "", primeiro: "", segundo: "", terceiro: "", quarto: "", quinto: "" });
      setLoadingExisting(false);
      return;
    }
    setLoadingExisting(true);
    setForm({ data_sorteio: data, primeiro: "", segundo: "", terceiro: "", quarto: "", quinto: "" });
    void (async () => {
      const { data: result, error } = await supabase.from("lottery_draws")
        .select("draw_date,first,second,third,fourth,fifth").eq("draw_date", data).maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setReadError("Não foi possível verificar os resultados já registrados. Tente novamente.");
      } else if (result) {
        setExisting(true);
        setForm({
          data_sorteio: data,
          primeiro: String(result.first ?? ""),
          segundo: String(result.second ?? ""),
          terceiro: String(result.third ?? ""),
          quarto: String(result.fourth ?? ""),
          quinto: String(result.fifth ?? ""),
        });
      }
      setLoadingExisting(false);
    })();
    return () => { active = false; };
  }, [data]);

  const prizes = [
    ["primeiro", "1º prêmio"],
    ["segundo", "2º prêmio"],
    ["terceiro", "3º prêmio"],
    ["quarto", "4º prêmio"],
    ["quinto", "5º prêmio"],
  ] as const;
  const canSave = Boolean(data) && !loadingExisting && !readError &&
    prizes.every(([key]) => /^\d{5}$/.test(form[key]));

  const handleSave = async () => {
    if (!canSave || loading) return;
    setSaveError("");
    try {
      setLoading(true);
      const { error } = await supabase.from("lottery_draws").upsert({
        draw_date: data,
        first: form.primeiro,
        second: form.segundo,
        third: form.terceiro,
        fourth: form.quarto,
        fifth: form.quinto,
      });
      if (error) throw error;
      onSaved({ ...form, data_sorteio: data });
      onClose();
    } catch (error) {
      console.error("Falha ao salvar Loteria Federal:", error);
      setSaveError("Não foi possível salvar os resultados. Confira a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="federal-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-[#1E293F] to-[#33445D] px-5 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10">
                <Percent className="h-5 w-5 text-[#E5CF9B]" />
              </span>
              <div>
                <h2 id="federal-title" className="text-lg font-extrabold tracking-tight sm:text-xl">Resultados da Loteria Federal</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-200">Confira os cinco prêmios oficiais antes de registrar a referência dos grupos.</p>
              </div>
            </div>
            <button type="button" aria-label="Fechar resultados da Loteria Federal" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B5A573]/30 bg-amber-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#1E293F]">Consultar resultado oficial</p>
              <p className="mt-0.5 text-xs text-slate-600">Acesse a Caixa em outra aba e confira os números deste sorteio.</p>
            </div>
            <a href="https://loterias.caixa.gov.br/Paginas/Federal.aspx" target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B5A573]/60 bg-white px-4 text-xs font-extrabold text-[#1E293F] transition-colors hover:bg-amber-50">
              <ExternalLink className="h-4 w-4" /> Abrir Caixa
            </a>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="federal-data-sorteio" className="text-xs font-extrabold text-[#1E293F]">Data do sorteio</Label>
              {loadingExisting ? <span className="text-xs text-slate-500">Consultando registros…</span> :
                existing ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Resultado já registrado</span> : null}
            </div>
            <Input id="federal-data-sorteio" type="date" value={data} onChange={(event) => setData(event.target.value)}
              className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold" />
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#1E293F]">Bilhetes premiados</h3>
              <span className="text-[11px] text-slate-500">Cinco dígitos por prêmio</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {prizes.map(([key, label], index) => (
                <div key={key} className={"rounded-xl border p-3.5 " + (index === 0 ? "border-rose-200 bg-rose-50/40 sm:col-span-2" : "border-slate-200 bg-slate-50/40")}>
                  <Label htmlFor={"federal-" + key} className="mb-2 flex items-center gap-2 text-xs font-bold text-[#1E293F]">
                    <span className={"grid h-6 w-6 place-items-center rounded-lg text-[11px] font-extrabold " + (index === 0 ? "bg-[#A11C27] text-white" : "bg-[#1E293F]/10 text-[#1E293F]")}>{index + 1}</span>
                    {label}
                  </Label>
                  <Input id={"federal-" + key} inputMode="numeric" maxLength={6} placeholder="00000" autoComplete="off"
                    disabled={!data || loadingExisting || loading || !!readError}
                    value={form[key]} className="h-11 rounded-lg border-slate-200 bg-white text-center font-mono text-lg font-extrabold tracking-[0.2em] tabular-nums text-[#1E293F]"
                    onChange={(event) => setForm(current => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(-5) }))}
                    onBlur={() => setForm(current => ({
                      ...current,
                      [key]: current[key] ? current[key].padStart(5, "0") : "",
                    }))} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Bilhetes com menos de cinco dígitos são completados com zeros à esquerda ao sair do campo.</p>
          </div>
          {readError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{readError}</p>}
          {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{saveError}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
          <span className="text-xs text-slate-500">Os valores só serão atualizados ao salvar.</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>Cancelar</Button>
            <Button type="button" disabled={!canSave || loading} onClick={handleSave} className="gap-2 rounded-xl bg-[#A11C27] font-semibold text-white hover:bg-[#831622]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar resultados
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/* =========================================================
   OVERLAY: ASSEMBLEIAS
   ========================================================= */

type LinhaAsm = {
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
  prazo_enc_meses: number | null;
  modality_results: BidOutcomeMap;
};

function OverlayAssembleias({
  gruposBase,
  bidRules,
  bidRulesReady,
  onClose,
  onSaved,
}: {
  gruposBase: Grupo[];
  bidRules: BidRule[];
  bidRulesReady: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [date, setDate] = useState<string>("");
  const [adminSel, setAdminSel] = useState<string>("");
  const [nextDue, setNextDue] = useState<string>("");
  const [nextDraw, setNextDraw] = useState<string>("");
  const [nextAsm, setNextAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaAsm[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const prazoAtualById = useMemo(() => {
    const m = new Map<string, number | null>();
    gruposBase.forEach((g) => m.set(g.id, g.prazo_encerramento_meses ?? null));
    return m;
  }, [gruposBase]);

  const administradoras = useMemo(() => Array.from(new Set(gruposBase.map((g) => g.administradora))).sort(), [gruposBase]);

  const groupsMap = useMemo(() => new Map(gruposBase.map(g => [g.id, g])), [gruposBase]);

  useEffect(() => {
    let canceled = false;
    setHistoryError("");
    if (!date) {
      setLinhas([]);
      setLoadingExisting(false);
      return;
    }
    const relevant = gruposBase
      .filter(g => !isStubId(g.id))
      .filter(g => sameDay(g.prox_assembleia, date) && (!adminSel || g.administradora === adminSel));
    if (!relevant.length) {
      setLinhas([]);
      setLoadingExisting(false);
      return;
    }
    // Reabrir uma assembleia não pode zerar os valores já registrados, inclusive modalidades ocultas.
    setLoadingExisting(true);
    void (async () => {
      const { data, error } = await supabase.from("assembly_results")
        .select("group_id,fixed25_deliveries,fixed25_offers,fixed50_deliveries,fixed50_offers,ll_deliveries,ll_offers,ll_high,ll_low,modality_results")
        .eq("date", date).in("group_id", relevant.map(g => g.id));
      if (canceled) return;
      if (error) {
        setHistoryError("Não foi possível carregar resultados já cadastrados. Para evitar sobrescrever históricos, o salvamento está bloqueado.");
        setLinhas([]);
      } else {
        const existing = new Map((data || []).map((item: any) => [item.group_id, item]));
        setLinhas(relevant.map(g => {
          const row = (existing.get(g.id) || {}) as Record<string, any>;
          return {
            group_id: g.id,
            codigo: g.codigo,
            fix25_entregas: Number(row.fixed25_deliveries || 0),
            fix25_ofertas: Number(row.fixed25_offers || 0),
            fix50_entregas: Number(row.fixed50_deliveries || 0),
            fix50_ofertas: Number(row.fixed50_offers || 0),
            ll_entregas: Number(row.ll_deliveries || 0),
            ll_ofertas: Number(row.ll_offers || 0),
            ll_maior: row.ll_high == null ? null : Number(row.ll_high),
            ll_menor: row.ll_low == null ? null : Number(row.ll_low),
            prazo_enc_meses: g.prazo_encerramento_meses ?? null,
            modality_results: sanitizeBidResults(row.modality_results),
          };
        }));
      }
      setLoadingExisting(false);
    })();
    return () => { canceled = true; };
  }, [date, adminSel, gruposBase]);

  function modeResult(row: LinhaAsm, group: Grupo, mode: BidModality): BidOutcome {
    const stored = row.modality_results[mode.key];
    if (stored) return stored;
    const slot = legacyBidSlot(group, mode);
    if (slot === "ll") return { offers: row.ll_ofertas, deliveries: row.ll_entregas };
    if (slot === "fix25") return { offers: row.fix25_ofertas, deliveries: row.fix25_entregas };
    if (slot === "fix50") return { offers: row.fix50_ofertas, deliveries: row.fix50_entregas };
    return { offers: 0, deliveries: 0 };
  }
  function updateMode(id: string, mode: BidModality, field: keyof BidOutcome, val: number) {
    setLinhas(current => current.map(row => {
      if (row.group_id !== id) return row;
      const group = groupsMap.get(id);
      if (!group) return row;
      const outcome = { ...modeResult(row, group, mode), [field]: val };
      const slot = legacyBidSlot(group, mode);
      return {
        ...row,
        modality_results: { ...row.modality_results, [mode.key]: outcome },
        ...(slot === "ll" ? { ll_ofertas: outcome.offers, ll_entregas: outcome.deliveries } : {}),
        ...(slot === "fix25" ? { fix25_ofertas: outcome.offers, fix25_entregas: outcome.deliveries } : {}),
        ...(slot === "fix50" ? { fix50_ofertas: outcome.offers, fix50_entregas: outcome.deliveries } : {}),
      };
    }));
  }
  function updateValue(id: string, key: "ll_maior" | "ll_menor" | "prazo_enc_meses", val: number | null) {
    setLinhas(current => current.map(row => row.group_id === id ? { ...row, [key]: val } : row));
  }
  const podeSalvar = Boolean(date) && linhas.length > 0 && Boolean(nextDue) && Boolean(nextDraw) && Boolean(nextAsm);
  const bloqueadoPeloHistorico = loadingExisting || Boolean(historyError) || !bidRulesReady;

  function buildPreSaveWarnings() {
    const issuesLL: { codigo: string; maior: number; menor: number }[] = [];
    const issuesPrazo: { codigo: string; atual: number; novo: number }[] = [];
    const blanks: { codigo: string; campos: string[] }[] = [];

    linhas.forEach((l) => {
      const group = groupsMap.get(l.group_id);
      const hasLL = !!group && modesForGroup(group, bidRules).some(mode => legacyBidSlot(group, mode) === "ll");
      if (hasLL && l.ll_maior != null && l.ll_menor != null && l.ll_maior < l.ll_menor) {
        issuesLL.push({ codigo: l.codigo, maior: l.ll_maior, menor: l.ll_menor });
      }

      const atual = prazoAtualById.get(l.group_id);
      if (atual != null && l.prazo_enc_meses != null) {
        const diff = atual - l.prazo_enc_meses;
        if (diff >= 2) issuesPrazo.push({ codigo: l.codigo, atual, novo: l.prazo_enc_meses });
      }

      const campos: string[] = [];
      if (hasLL && l.ll_maior == null) campos.push("LL Maior %");
      if (hasLL && l.ll_menor == null) campos.push("LL Menor %");
      if (l.prazo_enc_meses == null) campos.push("Pz Enc (meses)");
      if (campos.length > 0) blanks.push({ codigo: l.codigo, campos });
    });

    const parts: string[] = [];
    if (issuesLL.length > 0) {
      parts.push(
        `• Suspeita (LL): há grupo(s) onde "LL Maior %" < "LL Menor %":\n` +
          issuesLL
            .slice(0, 12)
            .map((x) => `  - Grupo ${x.codigo}: maior=${x.maior} | menor=${x.menor}`)
            .join("\n") +
          (issuesLL.length > 12 ? `\n  ... +${issuesLL.length - 12} grupo(s)` : "")
      );
    }
    if (issuesPrazo.length > 0) {
      parts.push(
        `• Suspeita (Prazo): prazo foi reduzido em 2 ou mais meses:\n` +
          issuesPrazo
            .slice(0, 12)
            .map((x) => `  - Grupo ${x.codigo}: atual=${x.atual} → novo=${x.novo}`)
            .join("\n") +
          (issuesPrazo.length > 12 ? `\n  ... +${issuesPrazo.length - 12} grupo(s)` : "")
      );
    }
    if (blanks.length > 0) {
      parts.push(
        `• Campos em branco: alguns grupos têm campos sem valor (vai ficar "—" no relatório):\n` +
          blanks
            .slice(0, 12)
            .map((x) => `  - Grupo ${x.codigo}: ${x.campos.join(", ")}`)
            .join("\n") +
          (blanks.length > 12 ? `\n  ... +${blanks.length - 12} grupo(s)` : "")
      );
    }

    if (parts.length === 0) return null;

    return `Antes de salvar, encontrei possíveis inconsistências:\n\n${parts.join("\n\n")}\n\nDeseja salvar mesmo assim?`;
  }

  const handleSave = async () => {
    if (loadingExisting || historyError || !bidRulesReady) {
      alert("Aguarde a consulta dos históricos e da configuração das modalidades antes de salvar.");
      return;
    }
    if (!date) {
      alert("Informe a data da Assembleia (Ocorrida em).");
      return;
    }
    if (!nextDue || !nextDraw || !nextAsm) {
      alert("Para salvar, é obrigatório informar: Próximo Vencimento, Próximo Sorteio e Próxima Assembleia.");
      return;
    }
    if (linhas.length === 0) {
      alert("Nenhum grupo encontrado para essa data/filtro.");
      return;
    }

    const warn = buildPreSaveWarnings();
    if (warn) {
      const ok = window.confirm(warn);
      if (!ok) return;
    }

    try {
      setLoading(true);

      const { data: assem, error: errAsm } = await supabase
        .from("assemblies")
        .upsert(
          {
            date,
            next_due_date: nextDue || null,
            next_draw_date: nextDraw || null,
            next_assembly_date: nextAsm || null,
            remaining_meetings: null,
          },
          { onConflict: "date" }
        )
        .select()
        .single();

      if (errAsm) throw errAsm;

      const groupsById = new Map<string, Grupo>();
      gruposBase.forEach((g) => groupsById.set(g.id, g));

      const sorteioDates = Array.from(
        new Set(
          linhas
            .map((l) => toYMD(groupsById.get(l.group_id)?.prox_sorteio))
            .filter(Boolean) as string[]
        )
      );

      const drawsMap = new Map<string, LoteriaFederal>();

      if (sorteioDates.length > 0) {
        const { data: draws, error: drawErr } = await supabase
          .from("lottery_draws")
          .select("*")
          .in("draw_date", sorteioDates);

        if (drawErr) throw drawErr;

        (draws || []).forEach((d: any) => {
          drawsMap.set(d.draw_date, {
            data_sorteio: d.draw_date,
            primeiro: d.first,
            segundo: d.second,
            terceiro: d.third,
            quarto: d.fourth,
            quinto: d.fifth,
          });
        });
      }

      const payload = linhas.map((r) => {
        const grupo = groupsById.get(r.group_id);
        const sorteioYMD = toYMD(grupo?.prox_sorteio);
        const bilhetes = sorteioYMD ? drawsMap.get(sorteioYMD) ?? null : null;

        const referenceNumber = grupo
          ? referenciaPorAdministradora({
              administradora: grupo.administradora,
              participantes: grupo.participantes,
              bilhetes,
            })
          : null;

        return {
          assembly_id: assem!.id,
          group_id: r.group_id,
          date,
          fixed25_offers: r.fix25_ofertas ?? 0,
          fixed25_deliveries: r.fix25_entregas ?? 0,
          fixed50_offers: r.fix50_ofertas ?? 0,
          fixed50_deliveries: r.fix50_entregas ?? 0,
          ll_offers: r.ll_ofertas ?? 0,
          ll_deliveries: r.ll_entregas ?? 0,
          ll_high: r.ll_maior,
          ll_low: r.ll_menor,
          median: calcMediana(r.ll_maior, r.ll_menor),
          reference_number: referenceNumber,
          modality_results: {
            ...r.modality_results,
            ...(grupo ? Object.fromEntries(modesForGroup(grupo, bidRules).map(mode => [mode.key, modeResult(r, grupo, mode)])) : {}),
          },
        };
      });

      const { error: errRes } = await supabase.from("assembly_results").upsert(payload, { onConflict: "assembly_id,group_id" });
      if (errRes) throw errRes;

      await Promise.all(
        linhas.map((l) =>
          supabase
            .from("groups")
            .update({
              prox_vencimento: nextDue || null,
              prox_sorteio: nextDraw || null,
              prox_assembleia: nextAsm || null,
              prazo_encerramento_meses: l.prazo_enc_meses ?? null,
            })
            .eq("id", l.group_id)
        )
      );

      try {
        await supabase.rpc("refresh_gestao_mv");
      } catch {}

      await onSaved();
      alert("Resultados salvos com sucesso!");
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Erro ao salvar os resultados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-xl font-semibold inline-flex items-center gap-2">
            <Settings className="h-5 w-5" /> Informar resultados da Assembleia
          </h2>
          <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Data da Assembleia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label>Ocorrida em</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <Label>Administradora (opcional)</Label>
                <select
                  value={adminSel}
                  onChange={(e) => setAdminSel(e.target.value)}
                  className="w-full h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {administradoras.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Selecione para reduzir a lista (opcional).</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Informe os dados da próxima assembleia <span className="text-red-600">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>
                  Próximo Vencimento <span className="text-red-600">*</span>
                </Label>
                <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
              </div>
              <div>
                <Label>
                  Próximo Sorteio <span className="text-red-600">*</span>
                </Label>
                <Input type="date" value={nextDraw} onChange={(e) => setNextDraw(e.target.value)} />
              </div>
              <div>
                <Label>
                  Próxima Assembleia <span className="text-red-600">*</span>
                </Label>
                <Input type="date" value={nextAsm} onChange={(e) => setNextAsm(e.target.value)} />
              </div>
              <div className="md:col-span-3 text-xs text-muted-foreground">
                Obrigatório para salvar: Próximo vencimento, sorteio e assembleia.
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grupos dessa assembleia</CardTitle>
            </CardHeader>
            <CardContent className="h-full flex flex-col">
              {!bidRulesReady ? (
                <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Não foi possível confirmar as modalidades configuradas. Atualize a página antes de informar resultados, para evitar lançamentos incorretos.</p>
              ) : loadingExisting ? (
                <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consultando resultados existentes…
                </p>
              ) : historyError ? (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{historyError}</div>
              ) : !date || linhas.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {date ? "Nenhum grupo encontrado com os filtros selecionados." : "Informe a data para listar os grupos."}
                </div>
              ) : (
                <div className="max-h-[46vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                  {linhas.map((line) => {
                    const group = groupsMap.get(line.group_id);
                    if (!group) return null;
                    const modes = modesForGroup(group, bidRules);
                    const hasLL = modes.some(mode => legacyBidSlot(group, mode) === "ll");
                    return (
                      <section key={line.group_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={"Resultados grupo " + line.codigo}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-base font-extrabold text-[#1E293F]">Grupo {line.codigo}</h3>
                            <p className="mt-0.5 text-xs text-slate-500">{group.administradora} · {group.segmento}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {modes.length} modalidade(s) configurada(s)
                          </span>
                        </div>

                        {modes.length === 0 ? (
                          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nenhuma modalidade foi habilitada para este grupo. Revise a configuração de modalidades.</p>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {modes.map(mode => {
                              const outcome = modeResult(line, group, mode);
                              const free = legacyBidSlot(group, mode) === "ll";
                              return (
                                <div key={mode.key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                                  <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
                                    <span className="h-2 w-2 rounded-full bg-[#A11C27]" />
                                    <h4 className="min-w-0 text-sm font-bold text-[#1E293F]">{mode.label}</h4>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label htmlFor={"entregas-" + line.group_id + "-" + mode.key} className="mb-1 block text-xs font-semibold">Entregas</Label>
                                      <Input id={"entregas-" + line.group_id + "-" + mode.key} type="number" min={0} step={1} className="h-10 bg-white text-center tabular-nums" value={outcome.deliveries}
                                        onChange={(event) => updateMode(line.group_id, mode, "deliveries", Number(event.target.value))} />
                                    </div>
                                    <div>
                                      <Label htmlFor={"ofertas-" + line.group_id + "-" + mode.key} className="mb-1 block text-xs font-semibold">Ofertas</Label>
                                      <Input id={"ofertas-" + line.group_id + "-" + mode.key} type="number" min={0} step={1} className="h-10 bg-white text-center tabular-nums" value={outcome.offers}
                                        onChange={(event) => updateMode(line.group_id, mode, "offers", Number(event.target.value))} />
                                    </div>
                                  </div>
                                  {free && (
                                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                                      <div>
                                        <Label htmlFor={"ll-maior-" + line.group_id} className="mb-1 block text-xs font-semibold">Lance maior (%)</Label>
                                        <Input id={"ll-maior-" + line.group_id} type="number" min={0} step="0.01" className="h-10 bg-white text-center" value={line.ll_maior ?? ""}
                                          onChange={(event) => updateValue(line.group_id, "ll_maior", event.target.value === "" ? null : Number(event.target.value))} />
                                      </div>
                                      <div>
                                        <Label htmlFor={"ll-menor-" + line.group_id} className="mb-1 block text-xs font-semibold">Lance menor (%)</Label>
                                        <Input id={"ll-menor-" + line.group_id} type="number" min={0} step="0.01" className="h-10 bg-white text-center" value={line.ll_menor ?? ""}
                                          onChange={(event) => updateValue(line.group_id, "ll_menor", event.target.value === "" ? null : Number(event.target.value))} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
                          <p className="text-xs text-slate-500">Prazo de encerramento do grupo (meses)</p>
                          <Input type="number" min={0} aria-label={"Prazo do grupo " + line.codigo} className="h-9 w-28 text-center tabular-nums"
                            value={line.prazo_enc_meses ?? ""}
                            onChange={(event) => updateValue(line.group_id, "prazo_enc_meses", event.target.value === "" ? null : Number(event.target.value))} />
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end pt-3">
                <Button disabled={!podeSalvar || loading || bloqueadoPeloHistorico} onClick={handleSave} className="inline-flex items-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" /> Salvar Resultados
                </Button>
              </div>
              {!podeSalvar && !bloqueadoPeloHistorico && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Para salvar: informe a data da assembleia, e as datas obrigatórias (próx. vencimento, sorteio e assembleia) e tenha grupos listados.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY: OFERTA DE LANCE
   ========================================================= */

type OfertaRow = {
  administradora: string;
  grupo: string;
  cota: string | null;
  referencia: number | null;
  participantes: number | null;
  mediana: number | null;
  contemplados: number | null;
  cliente: string | null;
  descricao: string | null;
  contemplada: boolean;
};

function OverlayOfertaLance({
  onClose,
  gruposBase,
  drawsByDate,
  lastAsmByGroup,
}: {
  onClose: () => void;
  gruposBase: Grupo[];
  drawsByDate: Record<string, LoteriaFederal>;
  lastAsmByGroup: Map<string, UltimoResultado>;
}) {
  const [dataAsm, setDataAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<OfertaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const listar = async () => {
    const ymd = toYMD(dataAsm);
    if (!ymd) {
      setLinhas([]);
      return;
    }

    try {
      setLoading(true);

      const elegiveis = gruposBase.filter((g) => !isStubId(g.id) && sameDay(g.prox_assembleia, ymd));
      if (elegiveis.length === 0) {
        setLinhas([]);
        setLoading(false);
        return;
      }

      const mapByKey = new Map<string, Grupo>();
      const gruposDigits = new Set<string>();
      elegiveis.forEach((g) => {
        const k = keyDigits(g.administradora, g.codigo);
        mapByKey.set(k, g);
        gruposDigits.add(normalizeGroupDigits(g.codigo));
      });

      type VendasRow = { [key: string]: any };

      const { data: vds, error } = await supabase
        .from("vendas")
        .select("*")
        .eq("status", "encarteirada")
        .eq("codigo", "00")
        .in("grupo", Array.from(gruposDigits));

      if (error) throw error;

      const sample: VendasRow = (vds ?? [])[0] ?? {};
      const leadCandidates = ["lead_id", "cliente_id", "id_lead", "id_cliente", "leadId", "clienteId"];
      const descCandidates = [
        "vendas_descrecao",
        "vendas_descricao",
        "descricao",
        "descrição",
        "descricao_venda",
        "descricaoVenda",
        "venda_descricao",
        "obs",
        "observacao",
        "observação",
      ];

      const leadKey: string | null = leadCandidates.find((k) => k in sample) ?? null;
      const descKey: string | null = descCandidates.find((k) => k in sample) ?? null;

      let nomesById = new Map<string, string>();
      if (leadKey) {
        const leadIds = Array.from(new Set((vds ?? []).map((v: VendasRow) => v?.[leadKey!]).filter((x: any) => x !== null && x !== undefined)));

        if (leadIds.length > 0) {
          const { data: leadsData, error: errLeads } = await supabase.from("leads").select("id, nome").in("id", leadIds);
          if (errLeads) throw errLeads;
          (leadsData ?? []).forEach((l: any) => nomesById.set(String(l.id), l.nome ?? ""));
        }
      }

      const out: OfertaRow[] = [];
      (vds ?? []).forEach((v: VendasRow) => {
        const adm = normalizeAdmin(v.administradora);
        const grpDigits = normalizeGroupDigits(v.grupo);
        const k = keyDigits(adm, grpDigits);
        const g = mapByKey.get(k);
        if (!g) return;

        const asm = lastAsmByGroup.get(g.id);
        const med = asm?.median ?? calcMediana(asm?.ll_high ?? null, asm?.ll_low ?? null);
        const contem = (asm?.fixed25_deliveries || 0) + (asm?.fixed50_deliveries || 0) + (asm?.ll_deliveries || 0);

        const bilhetes = g.prox_sorteio ? drawsByDate[toYMD(g.prox_sorteio)!] ?? null : null;
        const ref = referenciaPorAdministradora({
          administradora: g.administradora,
          participantes: g.participantes,
          bilhetes,
        });

        const leadVal = leadKey ? v?.[leadKey] : null;
        const cliente = leadVal != null ? nomesById.get(String(leadVal)) ?? null : null;

        const descVal = descKey ? v?.[descKey] : null;
        const descricao = descVal ?? v?.vendas_descrecao ?? v?.vendas_descricao ?? v?.descricao ?? null;

        out.push({
          administradora: g.administradora,
          grupo: normalizeGroupDigits(g.codigo),
          cota: v.cota != null ? String(v.cota) : null,
          referencia: ref,
          participantes: g.participantes,
          mediana: med,
          contemplados: contem,
          cliente,
          descricao,
          contemplada: Boolean(v?.contemplada === true),
        });
      });

      function normName(s?: string | null) {
        return stripAccents(String(s ?? "")).toLowerCase().trim();
      }
      function cmpNumLike(a: string | number | null, b: string | number | null) {
        const sa = String(a ?? "");
        const sb = String(b ?? "");
        const na = parseInt(sa.replace(/\D+/g, ""), 10);
        const nb = parseInt(sb.replace(/\D+/g, ""), 10);
        const aIsNum = !Number.isNaN(na);
        const bIsNum = !Number.isNaN(nb);
        if (aIsNum && bIsNum && na !== nb) return na - nb;
        return sa.localeCompare(sb);
      }

      out.sort((a, b) => {
        const ca = normName(a.cliente);
        const cb = normName(b.cliente);
        if (ca && cb) {
          const c = ca.localeCompare(cb);
          if (c !== 0) return c;
        } else if (ca && !cb) return -1;
        else if (!ca && cb) return 1;

        const adm = String(a.administradora).localeCompare(String(b.administradora));
        if (adm !== 0) return adm;

        const grp = cmpNumLike(a.grupo, b.grupo);
        if (grp !== 0) return grp;

        return cmpNumLike(a.cota, b.cota);
      });

      setLinhas(out);
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Falha ao listar oferta de lance.");
    } finally {
      setLoading(false);
    }
  };

  const exportarPDF = () => {
    const body = document.getElementById("oferta-grid-body");
    if (!body) return;

    const total = linhas.length;
    const ymd = toYMD(dataAsm);
    const dataLegivel = formatBR(ymd);
    const geradoEm = new Date().toLocaleString("pt-BR");

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    const css = `<style>
      @page { size: A4 landscape; margin: 12mm; }
      @media print {
        html, body { height: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .footer { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 11px; color: #666; }
      }
      body{font-family: Arial, Helvetica, sans-serif; padding: 18px 24px}
      h1{margin: 0 0 6px; font-size: 22px}
      .meta{margin: 0 0 8px; font-size: 12px; color: #555}
      .brand{display:flex; align-items:center; gap:12px; margin-bottom:8px}
      .brand img{height:28px}
      table{width:100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed}
      th,td{border:1px solid #e6e6e6; padding: 7px 8px; font-size: 12px; vertical-align: top; word-wrap: break-word}
      th{text-align:left; background:#f6f8fb; border-color:#e1e1e1}
      tbody tr:nth-child(4n+1), tbody tr:nth-child(4n+3) { background:#fbfbfb; }
      th:nth-child(1), td:nth-child(1) { width: 15%; }
      th:nth-child(2), td:nth-child(2) { width: 10%; }
      th:nth-child(3), td:nth-child(3) { width: 8%;  }
      th:nth-child(4), td:nth-child(4) { width: 20%; }
      th:nth-child(5), td:nth-child(5) { width: 10%; text-align: right; }
      th:nth-child(6), td:nth-child(6) { width: 10%; text-align: right; }
      th:nth-child(7), td:nth-child(7) { width: 10%; text-align: right; }
      th:nth-child(8), td:nth-child(8) { width: 10%; text-align: right; }
      .descricao-row td { font-size: 11px; color:#444; border-top-color:#f0f0f0; }
      .descricao-label { font-weight:600; color:#111; margin-right:6px; }
      .tag-contemplada { display:inline-block; padding:2px 6px; font-size:10px; border-radius:999px; border:1px solid #d4f1d6; background:#f0fbf1; color:#0f6b1b; margin-left:6px }
    </style>`;

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th>Administradora</th>
            <th>Grupo</th>
            <th>Cota</th>
            <th>Cliente</th>
            <th>Referência</th>
            <th>Participantes</th>
            <th>Mediana</th>
            <th>Contemplados</th>
          </tr>
        </thead>
        <tbody>${body.innerHTML}</tbody>
      </table>
    `;

    win.document.write(
      `<html>
        <head><title>Oferta de Lance</title>${css}</head>
        <body>
          <div class="brand">
            <img src="/logo-consulmax.png" alt="Consulmax" />
            <h1>Oferta de Lance</h1>
          </div>
          <div class="meta">Data da Assembleia: <b>${dataLegivel}</b> • Total de cotas: <b>${total}</b></div>
          ${tableHTML}
          <div class="footer">Gerado em ${geradoEm}</div>
          <script>
            Array.from(document.querySelectorAll("tbody tr.descricao-row td")).forEach(function(td){
              var txt = (td.textContent || "").trim();
              if (/^Descrição:\\s*—\\s*$/.test(txt)) {
                td.parentElement.style.display = "none";
              } else {
                td.innerHTML = td.innerHTML.replace(/^\\s*Descrição:\\s*/,'<span class="descricao-label">Descrição:</span>');
              }
            });
            window.addEventListener('load', function () {
              window.print();
              setTimeout(function(){ window.close(); }, 300);
            });
          </script>
        </body>
      </html>`
    );
    win.document.close();
  };

  const total = linhas.length;
  const distinctGroups = new Set(linhas.map(item => item.administradora + ":" + item.grupo)).size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="oferta-lance-title"
        className="flex max-h-[94vh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl max-sm:max-w-[98vw]">
        <header className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-[#1E293F] to-[#33445D] px-5 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10">
                <Target className="h-5 w-5 text-[#E5CF9B]" />
              </span>
              <div>
                <h2 id="oferta-lance-title" className="text-lg font-extrabold tracking-tight sm:text-xl">Oferta de Lance</h2>
                <p className="mt-1 text-xs text-slate-200">Confira as cotas encarteiradas, referências e estratégias para a assembleia selecionada.</p>
              </div>
            </div>
            <button type="button" aria-label="Fechar oferta de lance" onClick={onClose}
              className="rounded-lg border border-white/20 p-2 text-white transition-colors hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/50 px-4 py-5 sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[200px] flex-1 sm:max-w-[330px]">
                <Label htmlFor="oferta-data-assembleia" className="mb-2 block text-xs font-extrabold text-[#1E293F]">
                  Data da assembleia
                </Label>
                <Input id="oferta-data-assembleia" type="date" className="h-11 rounded-xl border-slate-200 bg-white font-semibold"
                  value={dataAsm} onChange={(event) => { setDataAsm(event.target.value); setLinhas([]); }} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={listar} disabled={!dataAsm || loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#A11C27] px-5 font-semibold text-white hover:bg-[#831622]">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                  {loading ? "Buscando..." : "Buscar cotas"}
                </Button>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <Button variant="secondary" onClick={exportarPDF} disabled={total === 0} className="inline-flex items-center gap-2">
                    Exportar PDF
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Selecione a data e busque os grupos com assembleia cadastrada. A consulta não altera as cotas.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Data consultada</p>
              <p className="mt-1 text-base font-extrabold tabular-nums text-[#1E293F]">{dataAsm ? formatBR(toYMD(dataAsm)) : "—"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cotas listadas</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#1E293F]">{loading ? "..." : total}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3.5 sm:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grupos encontrados</p>
              <p className="mt-1 text-xl font-black tabular-nums text-[#1E293F]">{loading ? "..." : distinctGroups}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#1E293F]">Relação de cotas</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Ordenada por cliente, administradora, grupo e cota.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">{total} registros</span>
            </div>
            <div className="rounded-xl border overflow-auto max-h-[52vh] border-0 rounded-none">
                          <table className="min-w-[1080px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Cota</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-left">Mediana</th>
                  <th className="p-2 text-left">Contemplados</th>
                </tr>
              </thead>
              <tbody id="oferta-grid-body">
                {loading ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={8}>
                      <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                      Carregando…
                    </td>
                  </tr>
                ) : total === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={8}>
                      {dataAsm ? "Nenhuma cota encontrada para essa assembleia." : "—"}
                    </td>
                  </tr>
                ) : (
                  linhas.map((o, i) => (
                    <React.Fragment key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`}>
                      <tr className="odd:bg-muted/30">
                        <td className="p-2">{o.administradora}</td>
                        <td className="p-2">{o.grupo}</td>
                        <td className="p-2">{o.cota ?? "—"}</td>
                        <td className="p-2">
                          {o.cliente ?? "—"}
                          {o.contemplada && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                              Contemplada
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">{o.referencia ?? "—"}</td>
                        <td className="p-2 text-right">{o.participantes ?? "—"}</td>
                        <td className="p-2 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>
                        <td className="p-2 text-right">{o.contemplados ?? "—"}</td>
                      </tr>
                      <tr className="odd:bg-muted/30 descricao-row">
                        <td className="p-2 text-xs text-muted-foreground" colSpan={8}>
                          <span className="font-medium text-foreground">Descrição: </span>
                          {o.descricao?.trim() ? o.descricao : "—"}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
          <p className="text-xs text-slate-500">Os dados são informativos. As referências seguem a apuração cadastrada para cada grupo.</p>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   PÁGINA PRINCIPAL
   ========================================================= */

type LinhaUI = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
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
  modality_results: BidOutcomeMap;
};

type SortKey = "mediana" | "prox_assembleia" | "prox_sorteio" | "prox_vencimento" | "prazo_encerramento_meses";

export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [rows, setRows] = useState<LinhaUI[]>([]);
  const [loteria, setLoteria] = useState<LoteriaFederal | null>(null);
  const [drawsByDate, setDrawsByDate] = useState<Record<string, LoteriaFederal>>({});
  const [lastAsmByGroup, setLastAsmByGroup] = useState<Map<string, UltimoResultado>>(new Map());
  const [lastModalityResults, setLastModalityResults] = useState<Map<string, BidOutcomeMap>>(new Map());
  const [fAdmin, setFAdmin] = useState("");
  const [adminScope, setAdminScope] = useState<string>("");
  const [bidRules, setBidRules] = useState<BidRule[]>([]);
  const [bidRulesReady, setBidRulesReady] = useState(false);
  const loadBidRules = useCallback(async () => {
    const { data, error } = await supabase.from("group_bid_modality_rules").select("administradora,scope,segmento,group_id,modalities");
    if (error) { console.warn("Configurações de lance indisponíveis:", error.message); setBidRulesReady(false); return; }
    setBidRules((data || []).map((v: any) => ({
      administradora: String(v.administradora || ""), scope: String(v.scope || ""),
      segmento: String(v.segmento || ""), group_id: v.group_id ?? null,
      modalities: Array.isArray(v.modalities) ? v.modalities.filter((m: any) => m && typeof m.key === "string" && typeof m.label === "string") : []
    })));
    setBidRulesReady(true);
  }, []);
  useEffect(() => { void loadBidRules(); }, [loadBidRules]);
  const normalizeBidScope = normBid;
  const modesForRow = (r: Pick<Grupo, "id" | "administradora" | "segmento">) => modesForGroup(r, bidRules);
  const [fSeg, setFSeg] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fFaixa, setFFaixa] = useState("");
  const [fMedianaAlvo, setFMedianaAlvo] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [asmOpen, setAsmOpen] = useState<boolean>(false);
  const [lfOpen, setLfOpen] = useState<boolean>(false);
  const [ofertaOpen, setOfertaOpen] = useState<boolean>(false);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorPrefill, setEditorPrefill] = useState<Partial<Grupo> | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("prox_assembleia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const notifiedKeys = useRef<Set<string>>(new Set());
  const [todayBadge, setTodayBadge] = useState<string>("");

  const rebuildRows = useCallback(() => {
    const linhas: LinhaUI[] = grupos.map((g) => {
      const r = lastAsmByGroup.get(g.id);
      const t25 = r?.fixed25_deliveries || 0;
      const t50 = r?.fixed50_deliveries || 0;
      const tLL = r?.ll_deliveries || 0;
      const custom = lastModalityResults.get(g.id) || {};
      const additional = modesForGroup(g, bidRules).filter(mode => !legacyBidSlot(g, mode))
        .reduce((sum, mode) => sum + (custom[mode.key]?.deliveries || 0), 0);
      const total = t25 + t50 + tLL + additional;
      const med = r?.median ?? calcMediana(r?.ll_high ?? null, r?.ll_low ?? null);
      const key = toYMD(g.prox_sorteio) as string | null;
      const bilhetes = key ? drawsByDate[key] ?? null : null;

      return {
        id: g.id,
        administradora: g.administradora,
        segmento: g.segmento,
        codigo: g.codigo,
        participantes: g.participantes,
        faixa_min: g.faixa_min,
        faixa_max: g.faixa_max,
        total_entregas: total,
        modality_results: custom,
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
          bilhetes,
        }),
      };
    });

    setRows(linhas);
  }, [grupos, lastAsmByGroup, lastModalityResults, bidRules, drawsByDate]);

  const carregar = async () => {
    setLoading(true);

    const { data: g, error: gErr } = await supabase
      .from("groups")
      .select("id, administradora, segmento, codigo, participantes, faixa_min, faixa_max, prox_vencimento, prox_sorteio, prox_assembleia, prazo_encerramento_meses");
    if (gErr) console.error(gErr);

    const groupsAll: Grupo[] =
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

    const byKey = new Map<string, Grupo>();
    for (const gr of groupsAll) byKey.set(keyDigits(gr.administradora, gr.codigo), gr);

    const { data: vend, error: vErr } = await supabase
      .from("vendas")
      .select("administradora, segmento, grupo, status, contemplada")
      .or("and(status.eq.encarteirada,contemplada.eq.false),contemplada.eq.true");
    if (vErr) console.error(vErr);

    const distinct = new Map<string, { administradora: string; segmento: string; grupo: string }>();
    (vend || []).forEach((v: any) => {
      const adm = (v.administradora ?? "").toString();
      const seg = (v.segmento ?? "").toString();
      const grp = (v.grupo ?? "").toString();
      const k = keyDigits(adm, grp);
      if (!k) return;
      if (!distinct.has(k)) distinct.set(k, { administradora: normalizeAdmin(adm), segmento: seg, grupo: grp });
    });

    const gruposBase: Grupo[] = [];
    for (const { administradora, segmento, grupo } of distinct.values()) {
      const k = keyDigits(administradora, grupo);
      const hit = byKey.get(k);
      if (hit) gruposBase.push(hit);
      else {
        gruposBase.push({
          id: makeStubId(administradora, grupo),
          administradora,
          segmento: segmento === "Imóvel Estendido" ? "Imóvel" : (segmento as SegmentoUI),
          codigo: String(grupo),
          participantes: null,
          faixa_min: null,
          faixa_max: null,
          prox_vencimento: null,
          prox_sorteio: null,
          prox_assembleia: null,
          prazo_encerramento_meses: null,
        });
      }
    }

    const reais = gruposBase.filter((g) => !isStubId(g.id)).map((g) => g.id);
    let byGroup = new Map<string, UltimoResultado>();
    if (reais.length > 0) {
      const { data: ar, error: arErr } = await supabase
        .from("v_group_last_assembly")
        .select("group_id, date, fixed25_offers, fixed25_deliveries, fixed50_offers, fixed50_deliveries, ll_offers, ll_deliveries, ll_high, ll_low, median")
        .in("group_id", reais);
      if (arErr) console.error(arErr);
      byGroup = new Map<string, UltimoResultado>();
      (ar || []).forEach((r: any) => byGroup.set(r.group_id, r));
    }
    setLastAsmByGroup(byGroup);

    const customByGroup = new Map<string, BidOutcomeMap>();
    if (reais.length > 0) {
      const { data: customRows, error: customError } = await supabase.from("assembly_results")
        .select("group_id,date,modality_results")
        .in("group_id", reais)
        .order("date", { ascending: false })
        .limit(1000);
      if (customError) console.warn("Não foi possível carregar apuração das modalidades adicionais:", customError.message);
      else (customRows || []).forEach((row: any) => {
        if (customByGroup.has(row.group_id)) return;
        // Mesmo registro exibido como última assembleia pela view legada.
        if (toYMD(row.date) !== toYMD(byGroup.get(row.group_id)?.date)) return;
        customByGroup.set(row.group_id, sanitizeBidResults(row.modality_results));
      });
    }
    setLastModalityResults(customByGroup);

    const dateSet = new Set<string>();
    for (const gRow of gruposBase) {
      const ymd = toYMD(gRow.prox_sorteio);
      if (ymd) dateSet.add(ymd);
    }
    const want = Array.from(dateSet);
    const newDraws: Record<string, LoteriaFederal> = {};
    if (want.length > 0) {
      const { data: ld, error: ldErr } = await supabase.from("lottery_draws").select("*").in("draw_date", want);
      if (ldErr) console.error(ldErr);
      (ld || []).forEach((d: any) => {
        newDraws[d.draw_date] = {
          data_sorteio: d.draw_date,
          primeiro: d.first,
          segundo: d.second,
          terceiro: d.third,
          quarto: d.fourth,
          quinto: d.fifth,
        };
      });
    }
    setDrawsByDate(newDraws);
    setGrupos(gruposBase);
    setLoading(false);
  };

  useEffect(() => rebuildRows(), [rebuildRows]);

  useEffect(() => {
    carregar();
  }, []);

  const adminOptions = useMemo(() => Array.from(new Set(rows.map((r) => normalizeAdmin(r.administradora)))).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  const filtered = useMemo(() => {
    const alvo = fMedianaAlvo ? Number(fMedianaAlvo) : null;
    return rows.filter((r) => {
      const faixaStr = `${r.faixa_min ?? ""}-${r.faixa_max ?? ""}`;
      return (
        (!adminScope || normalizeAdmin(r.administradora) === adminScope) &&
        (!fAdmin || r.administradora.toLowerCase().includes(fAdmin.toLowerCase())) &&
        (!fSeg || r.segmento.toLowerCase().includes(fSeg.toLowerCase())) &&
        (!fGrupo || r.codigo.toLowerCase().includes(fGrupo.toLowerCase())) &&
        (!fFaixa || faixaStr.includes(fFaixa)) &&
        withinLLMedianFilter(r.mediana, alvo)
      );
    });
  }, [rows, adminScope, fAdmin, fSeg, fGrupo, fFaixa, fMedianaAlvo]);

  const totalEntregas = useMemo(() => filtered.reduce((acc, r) => acc + r.total_entregas, 0), [filtered]);
  const registeredGroups = filtered.filter(r => !isStubId(r.id)).length;
  const configuredGroups = filtered.filter(r => !isStubId(r.id) && bidRules.some(rule => rule.scope === "grupo" && rule.group_id === r.id)).length;
  const nextAssembly = filtered.map(r => toYMD(r.prox_assembleia))
    .filter((v): v is string => Boolean(v) && v >= todayYMDLocal()).sort()[0] || null;

  function cmpDateNearestToToday(a?: string | null, b?: string | null): number {
    const today = new Date(todayYMDLocal() + "T00:00:00");
    const pa = a ? Date.parse(a) : NaN;
    const pb = b ? Date.parse(b) : NaN;
    const isFutureA = !isNaN(pa) && pa >= today.getTime();
    const isFutureB = !isNaN(pb) && pb >= today.getTime();
    if (isFutureA && !isFutureB) return -1;
    if (!isFutureA && isFutureB) return 1;
    const diffA = isNaN(pa) ? Number.POSITIVE_INFINITY : Math.abs(pa - today.getTime());
    const diffB = isNaN(pb) ? Number.POSITIVE_INFINITY : Math.abs(pb - today.getTime());
    return diffA - diffB;
  }

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === "prox_assembleia") return cmpDateNearestToToday(toYMD(a.prox_assembleia), toYMD(b.prox_assembleia));
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "mediana") return ((a.mediana ?? -9999) - (b.mediana ?? -9999)) * dir;
      if (sortKey === "prazo_encerramento_meses") return ((a.prazo_encerramento_meses ?? -9999) - (b.prazo_encerramento_meses ?? -9999)) * dir;
      const da = toYMD(sortKey === "prox_sorteio" ? a.prox_sorteio : a.prox_vencimento);
      const db = toYMD(sortKey === "prox_sorteio" ? b.prox_sorteio : b.prox_vencimento);
      const na = da ? Date.parse(da) : -1;
      const nb = db ? Date.parse(db) : -1;
      return (na - nb) * dir;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  function pushBrowser(title: string, body: string) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/logo-consulmax.png" });
      } catch {}
    }
  }

  function codesByAdm(items: LinhaUI[]) {
    const map = new Map<string, string[]>();
    items.forEach((r) => {
      const adm = r.administradora;
      const code = normalizeGroupDigits(r.codigo);
      if (!code) return;
      if (!map.has(adm)) map.set(adm, []);
      map.get(adm)!.push(code);
    });
    const parts: string[] = [];
    map.forEach((codes, adm) => parts.push(`${adm} ${codes.join("; ")}`));
    return parts.join("; ");
  }

  useEffect(() => {
    const today = todayYMDLocal();
    const isToday = (d?: string | null) => !!d && toYMD(d) === today;
    const venc = sorted.filter((r) => isToday(r.prox_vencimento));
    const sort = sorted.filter((r) => isToday(r.prox_sorteio));
    const asm = sorted.filter((r) => isToday(r.prox_assembleia));
    const keyV = `venc-${today}`;
    const keyS = `sorteio-${today}`;
    const keyA = `asm-${today}`;

    if (venc.length > 0 && !notifiedKeys.current.has(keyV)) {
      notifiedKeys.current.add(keyV);
      pushBrowser("Vencimento hoje", `Vencimento ${codesByAdm(venc)}.`);
    }
    if (sort.length > 0 && !notifiedKeys.current.has(keyS)) {
      notifiedKeys.current.add(keyS);
      pushBrowser("Sorteio hoje", `Sorteio ${codesByAdm(sort)}.`);
    }
    if (asm.length > 0 && !notifiedKeys.current.has(keyA)) {
      notifiedKeys.current.add(keyA);
      pushBrowser("Assembleia hoje", `Assembleia ${codesByAdm(asm)}.`);
    }

    const parts: string[] = [];
    if (sort.length > 0) parts.push(`Sorteio ${codesByAdm(sort)}`);
    if (venc.length > 0) parts.push(`Vencimento ${codesByAdm(venc)}`);
    if (asm.length > 0) parts.push(`Assembleia ${codesByAdm(asm)}`);
    setTodayBadge(parts.length > 0 ? `Hoje: ${parts.join(" • ")}` : "");
  }, [sorted]);

  function headerSort(label: string, key: SortKey) {
    const active = sortKey === key;
    const dirIcon = active ? sortDir === "asc" ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" /> : null;
    return (
      <button
        type="button"
        className={`inline-flex items-center justify-center gap-1 whitespace-nowrap ${active ? "text-white" : "text-slate-200"} hover:text-white`}
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
        title="Ordenar"
      >
        {label} {dirIcon}
      </button>
    );
  }

  const editGroup = (id: string) => {
    const group = grupos.find((item) => item.id === id);
    if (!group || isStubId(id)) return;
    setEditingGroupId(id);
    setEditorPrefill(null);
    setEditorOpen(true);
  };

  const toggleDetails = (id: string) => {
    setExpandedGroupId((current) => current === id ? null : id);
  };

  // Destaca o calendário sem alterar a data original persistida nem o fuso do CRM.
  const calendarCell = (value: string | null, emphasize = false, primary = false) => {
    const ymd = toYMD(value);
    if (!ymd) return <span className="text-slate-400">—</span>;
    const days = Math.round((Date.parse(ymd + "T12:00:00Z") - Date.parse(todayYMDLocal() + "T12:00:00Z")) / 86400000);
    const upcoming = days >= 0 && days <= 5;
    const classes = primary && upcoming
      ? "border-rose-200 bg-rose-50 text-[#A11C27]"
      : upcoming && emphasize ? "border-amber-200 bg-amber-50 text-amber-800"
      : emphasize ? "border-slate-200 bg-slate-50 text-[#1E293F]"
      : "border-transparent bg-transparent text-slate-700";
    return (
      <span className={"inline-flex whitespace-nowrap items-center rounded-lg border px-2 py-1 text-xs font-bold tabular-nums " + classes}>
        {formatBR(ymd)}
      </span>
    );
  };

  return (
    <div className="min-h-full space-y-5 bg-gradient-to-b from-slate-50/70 via-background to-background p-4 md:p-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-7 md:py-6">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-rose-100/80 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-rose-700"><Layers3 className="h-4 w-4" /> Pós-vendas · Inteligência operacional</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Gestão de Grupos</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Datas, apurações e modalidades de lance em uma visão objetiva e organizada.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-800">
            <CalendarCheck2 className="h-4 w-4" /> Controle de assembleias e vencimentos
          </div>
        </div>
      </div>
      {todayBadge && (
        <div className="flex">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            <Bell className="h-3 w-3" />
            <span className="font-medium">🔔 {todayBadge}</span>
          </div>
        </div>
      )}

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900"><Layers3 className="h-4 w-4 text-rose-700" /> Visão por administradora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar administradora">
            <Button type="button" size="sm" variant={!adminScope ? "default" : "outline"} className={!adminScope ? "rounded-full bg-rose-700 text-white hover:bg-rose-800" : "rounded-full border-slate-200"} onClick={() => setAdminScope("")}>
              Todas ({rows.length})
            </Button>
            {adminOptions.map((adm) => (
              <Button key={adm} type="button" size="sm" variant={adminScope === adm ? "default" : "outline"} className={adminScope === adm ? "rounded-full bg-rose-700 text-white hover:bg-rose-800" : "rounded-full border-slate-200"} onClick={() => setAdminScope(adm)}>
                {adm} ({rows.filter((r) => normalizeAdmin(r.administradora) === adm).length})
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A seleção organiza a consulta sem modificar grupos, datas, resultados históricos ou disparos.
            Os lançamentos de assembleia seguem o fluxo atual até a validação das modalidades específicas de cada administradora.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Layers3 className="h-4 w-4 text-rose-600" /> Grupos na visão</span>
          <p className="mt-2 text-2xl font-bold text-slate-950">{registeredGroups}</p>
          <p className="mt-1 text-xs text-slate-500">Grupos cadastrados no filtro</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><BarChart3 className="h-4 w-4 text-rose-600" /> Entregas na última apuração</span>
          <p className="mt-2 text-2xl font-bold text-slate-950">{totalEntregas.toLocaleString("pt-BR")}</p>
          <p className="mt-1 text-xs text-slate-500">Soma dos grupos exibidos</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><CalendarDays className="h-4 w-4 text-rose-600" /> Próxima assembleia</span>
          <p className="mt-2 text-2xl font-bold text-slate-950">{nextAssembly ? formatBR(nextAssembly) : "—"}</p>
          <p className="mt-1 text-xs text-slate-500">Data mais próxima no filtro</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Settings className="h-4 w-4 text-rose-600" /> Regras por grupo</span>
          <p className="mt-2 text-2xl font-bold text-slate-950">{configuredGroups}</p>
          <p className="mt-1 text-xs text-slate-500">Personalizações individuais</p>
        </div>
      </div>

      <GroupBidModalitySettings groups={grupos.filter((g) => !isStubId(g.id))} onSaved={loadBidRules} />

      <section aria-labelledby="operacoes-assembleias" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 id="operacoes-assembleias" className="text-base font-extrabold tracking-tight text-[#1E293F]">Operações das assembleias</h2>
            <p className="mt-1 text-xs text-slate-500">Acesse os lançamentos e acompanhe os resultados dos grupos.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="h-1 w-full bg-[#A11C27]" />
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 px-5 pb-3 pt-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-[#A11C27]">
                <Percent className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wide text-[#1E293F]">Loteria Federal</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Referência oficial dos sorteios.</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5 pb-5 pt-0">
              <div className="min-h-[54px] rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                {loteria?.data_sorteio ? (
                  <>
                    <p className="mb-2 text-[11px] font-semibold text-slate-500">Sorteio de {formatBR(toYMD(loteria.data_sorteio))}</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {([loteria.primeiro, loteria.segundo, loteria.terceiro, loteria.quarto, loteria.quinto] as string[]).map((numero, index) => (
                        <span key={index} className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center font-mono text-xs font-bold tabular-nums text-slate-800">{numero || "—"}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="flex min-h-7 items-center text-xs text-slate-500">Nenhum resultado selecionado.</p>
                )}
              </div>
              <Button type="button" variant="outline" className="h-10 w-full justify-center gap-2 rounded-xl border-rose-200 bg-white font-semibold text-[#A11C27] hover:bg-rose-50 hover:text-[#831622]" onClick={() => setLfOpen(true)}>
                <Percent className="h-4 w-4" /> Informar resultados
              </Button>
            </CardContent>
          </Card>

          <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="h-1 w-full bg-[#B5A573]" />
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 px-5 pb-3 pt-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wide text-[#1E293F]">Assembleias</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Apuração e próximas datas.</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5 pb-5 pt-0">
              <div className="flex min-h-[54px] items-center rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                <p className="text-xs leading-relaxed text-slate-600">Registre os resultados da assembleia e atualize as datas dos grupos.</p>
              </div>
              <Button type="button" variant="outline" className="h-10 w-full justify-center gap-2 rounded-xl border-amber-200 bg-white font-semibold text-amber-900 hover:bg-amber-50 hover:text-amber-950" onClick={() => setAsmOpen(true)}>
                <Settings className="h-4 w-4" /> Informar resultados
              </Button>
            </CardContent>
          </Card>

          <Card className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md md:col-span-2 xl:col-span-1">
            <div className="h-1 w-full bg-[#1E293F]" />
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 px-5 pb-3 pt-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#1E293F]">
                <Target className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wide text-[#1E293F]">Oferta de Lance</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Cotas ativas e referências.</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5 pb-5 pt-0">
              <div className="flex min-h-[54px] items-center rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                <p className="text-xs leading-relaxed text-slate-600">Consulte cotas encarteiradas com assembleia na data informada e referência calculada.</p>
              </div>
              <Button type="button" variant="outline" className="h-10 w-full justify-center gap-2 rounded-xl border-slate-300 bg-white font-semibold text-[#1E293F] hover:bg-slate-100 hover:text-[#1E293F]" onClick={() => setOfertaOpen(true)}>
                <Target className="h-4 w-4" /> Abrir oferta de lance
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1E293F]/[0.07] text-[#1E293F]">
              <FilterIcon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-[#1E293F]">Filtros de grupos</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Encontre grupos por administradora, segmento, crédito ou mediana.</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900" disabled={!adminScope && !fAdmin && !fSeg && !fGrupo && !fFaixa && !fMedianaAlvo}
            onClick={() => { setAdminScope(""); setFAdmin(""); setFSeg(""); setFGrupo(""); setFFaixa(""); setFMedianaAlvo(""); }}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Limpar filtros
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-5">
          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="filtro-grupo-admin" className="text-xs font-bold text-slate-700">Administradora</Label>
              <Input id="filtro-grupo-admin" className="h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-[#A11C27]/20" value={fAdmin} onChange={(e) => setFAdmin(e.target.value)} placeholder="Buscar administradora" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-grupo-segmento" className="text-xs font-bold text-slate-700">Segmento</Label>
              <Input id="filtro-grupo-segmento" className="h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-[#A11C27]/20" value={fSeg} onChange={(e) => setFSeg(e.target.value)} placeholder="Ex.: Imóvel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-grupo-codigo" className="text-xs font-bold text-slate-700">Grupo</Label>
              <Input id="filtro-grupo-codigo" className="h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-[#A11C27]/20" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Número do grupo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-grupo-credito" className="text-xs font-bold text-slate-700">Faixa de crédito</Label>
              <Input id="filtro-grupo-credito" className="h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-[#A11C27]/20" value={fFaixa} onChange={(e) => setFFaixa(e.target.value)} placeholder="Ex.: 80000-120000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-grupo-mediana" className="text-xs font-bold text-slate-700">Mediana do lance livre (%)</Label>
              <Input id="filtro-grupo-mediana" className="h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-[#A11C27]/20" type="number" step="0.01" value={fMedianaAlvo} onChange={(e) => setFMedianaAlvo(e.target.value)} placeholder="Ex.: 45" />
              <p className="text-[11px] leading-snug text-slate-500">Margem de ±30% do valor informado.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Os filtros são combinados automaticamente.</span>
            <span className="font-semibold tabular-nums text-slate-700">{filtered.length} grupo(s) encontrado(s)</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">Relação de Grupos</h3>
          <p className="text-xs text-slate-500">{filtered.length} grupo(s) nesta seleção. Abra Mais detalhes para conferir modalidades, próxima assembleia e editar.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="bg-[#1E293F] text-[10px] uppercase tracking-[0.07em] text-slate-100">
              <tr>
                <th scope="col" className="px-3 py-4 text-left font-semibold">Administradora</th>
                <th scope="col" className="px-3 py-4 text-left font-semibold">Segmento</th>
                <th scope="col" className="px-3 py-4 text-left font-semibold">Grupo</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">Participantes</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">Tot. Entr.</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">Última Assemb.</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">{headerSort("Pz Enc", "prazo_encerramento_meses")}</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">{headerSort("Vencimento", "prox_vencimento")}</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">{headerSort("Sorteio", "prox_sorteio")}</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">{headerSort("Próx. Assemb.", "prox_assembleia")}</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">REF</th>
                <th scope="col" className="px-3 py-4 text-center font-semibold">Mais detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="px-6 py-12 text-center text-slate-500"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Carregando grupos…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={12} className="px-6 py-12 text-center text-slate-500">Sem grupos para os filtros selecionados.</td></tr>
              ) : sorted.map((r) => {
                const expanded = expandedGroupId === r.id;
                const stub = isStubId(r.id);
                const availableModes = modesForRow(r);
                return (
                  <React.Fragment key={r.id}>
                    <tr className={expanded ? "bg-rose-50/50" : "bg-white hover:bg-slate-50/80"}>
                      <td className="px-3 py-3.5 text-left font-semibold text-slate-700">{r.administradora}</td>
                      <td className="px-3 py-3.5 text-left text-slate-600">{r.segmento}</td>
                      <td className="px-3 py-3.5 text-left">
                        <button type="button" className="inline-flex rounded-lg bg-[#1E293F]/5 px-2.5 py-1.5 font-extrabold text-[#1E293F] transition-colors hover:bg-rose-50 hover:text-rose-800" onClick={() => toggleDetails(r.id)} aria-expanded={expanded} title={"Ver detalhes do grupo " + r.codigo}>{r.codigo}</button>
                      </td>
                      <td className="px-3 py-3.5 text-center font-medium tabular-nums text-slate-700">{r.participantes == null ? "—" : r.participantes.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-3.5 text-center"><span className="inline-flex min-w-9 items-center justify-center rounded-lg bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-700">{r.total_entregas}</span></td>
                      <td className="px-2 py-3.5 text-center">{calendarCell(r.apuracao_dia)}</td>
                      <td className="px-3 py-3.5 text-center font-medium tabular-nums text-slate-700">{r.prazo_encerramento_meses == null ? "—" : r.prazo_encerramento_meses + " meses"}</td>
                      <td className="px-2 py-3.5 text-center">{calendarCell(r.prox_vencimento, true)}</td>
                      <td className="px-2 py-3.5 text-center">{calendarCell(r.prox_sorteio, true)}</td>
                      <td className="px-2 py-3.5 text-center">{calendarCell(r.prox_assembleia, true, true)}</td>
                      <td className="px-3 py-3.5 text-center font-bold tabular-nums text-[#1E293F]">{r.referencia ?? "—"}</td>
                      <td className="px-3 py-3.5 text-center">
                        <button type="button" onClick={() => toggleDetails(r.id)} aria-expanded={expanded} aria-controls={"group-details-" + r.id} className={"inline-flex whitespace-nowrap items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all " + (expanded ? "border-rose-200 bg-rose-100 text-rose-800" : "border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:text-rose-800")}>
                          <span>{expanded ? "Recolher" : "Detalhes"}</span>
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={"group-details-" + r.id}>
                        <td colSpan={12} className="border-t border-rose-100 bg-gradient-to-b from-rose-50/45 to-slate-50/60 p-0">
                          <div className="space-y-5 px-5 py-5 md:px-7">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h4 className="text-base font-extrabold text-[#1E293F]">Grupo {r.codigo} <span className="text-sm font-medium text-slate-500">• {r.administradora} / {r.segmento}</span></h4>
                                <p className="mt-1 text-xs text-slate-500">Informações completas do grupo e resultados da última assembleia registrada.</p>
                              </div>
                              {stub ? (
                                <Button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#A11C27] text-white hover:bg-[#831622]" onClick={() => {
                                  setEditingGroupId(null);
                                  setEditorPrefill({
                                    administradora: r.administradora, segmento: r.segmento, codigo: r.codigo,
                                    participantes: r.participantes, faixa_min: r.faixa_min, faixa_max: r.faixa_max,
                                    prox_vencimento: r.prox_vencimento, prox_sorteio: r.prox_sorteio,
                                    prox_assembleia: r.prox_assembleia, prazo_encerramento_meses: r.prazo_encerramento_meses,
                                  });
                                  setEditorOpen(true);
                                }}><Pencil className="h-4 w-4" /> Cadastrar grupo</Button>
                              ) : (
                                <Button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#A11C27] text-white hover:bg-[#831622]" onClick={() => editGroup(r.id)}><Pencil className="h-4 w-4" /> Editar informações do grupo</Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Próxima assembleia</p>
                                <p className="flex items-center gap-2 text-base font-extrabold tabular-nums text-[#A11C27]"><CalendarDays className="h-4 w-4" /> {formatBR(toYMD(r.prox_assembleia))}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Faixa de crédito</p>
                                <p className="text-xs font-extrabold leading-6 text-[#1E293F]">{r.faixa_min == null ? "—" : r.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} <span className="text-slate-400">a</span> {r.faixa_max == null ? "—" : r.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Lance livre • mediana</p>
                                <p className="text-base font-extrabold text-[#1E293F]">{toPct4(r.mediana)}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Última assembleia</p>
                                <p className="text-base font-extrabold tabular-nums text-[#1E293F]">{formatBR(toYMD(r.apuracao_dia))}</p>
                              </div>
                            </div>
                            <section aria-label={"Modalidades do grupo " + r.codigo}>
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h5 className="text-sm font-extrabold text-[#1E293F]">Modalidades de lance</h5>
                                  <p className="mt-1 text-xs text-slate-500">São exibidas somente as modalidades vinculadas às configurações do grupo, segmento ou administradora.</p>
                                </div>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">{availableModes.length} modalidade(s)</span>
                              </div>
                              {availableModes.length ? (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {availableModes.map((mode) => {
                                    const slot = legacyBidSlot(r, mode);
                                    const custom = r.modality_results[mode.key];
                                    const known = Boolean(slot || custom);
                                    const offers = custom?.offers ?? (slot === "fix25" ? r.fix25_ofertas : slot === "fix50" ? r.fix50_ofertas : r.ll_ofertas);
                                    const deliveries = custom?.deliveries ?? (slot === "fix25" ? r.fix25_entregas : slot === "fix50" ? r.fix50_entregas : r.ll_entregas);
                                    const isFree = slot === "ll";
                                    return (
                                      <div key={mode.key} className="flex min-h-[124px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="mb-3 flex items-center gap-2">
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#B5A573]" />
                                          <h6 className="text-sm font-extrabold text-[#1E293F]">{mode.label}</h6>
                                        </div>
                                        {integrated ? (
                                          <>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ofertas</p>
                                                <p className="mt-1 text-lg font-black tabular-nums text-slate-800">{offers}</p>
                                              </div>
                                              <div className="rounded-lg bg-rose-50/70 px-3 py-2">
                                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Entregas</p>
                                                <p className="mt-1 text-lg font-black tabular-nums text-[#A11C27]">{deliveries}</p>
                                              </div>
                                            </div>
                                            {isFree && <p className="mt-3 text-xs font-semibold text-slate-600">Mediana: <span className="font-extrabold text-[#1E293F]">{toPct4(r.mediana)}</span></p>}
                                          </>
                                        ) : (
                                          <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600">
                                            <Info className="h-4 w-4 shrink-0 text-slate-400" />
                                            <span>Modalidade configurada. Resultados ainda não integrados ao histórico.</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">Nenhuma modalidade configurada para este grupo.</p>
                              )}
                            </section>
                            {!stub && <GroupMedianHistory group={{ id: r.id, codigo: r.codigo, administradora: r.administradora, segmento: r.segmento, modalities: availableModes }} />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Total de entregas (linhas filtradas): <span className="font-semibold text-foreground">{totalEntregas}</span>
      </div>

      {asmOpen && <OverlayAssembleias gruposBase={grupos} bidRules={bidRules} bidRulesReady={bidRulesReady} onClose={() => setAsmOpen(false)} onSaved={async () => await carregar()} />}
      {lfOpen && (
        <OverlayLoteria
          onClose={() => setLfOpen(false)}
          onSaved={(lf) => {
            setLoteria(lf);
            setDrawsByDate((prev) => ({ ...prev, [lf.data_sorteio]: lf }));
          }}
        />
      )}
      {ofertaOpen && <OverlayOfertaLance onClose={() => setOfertaOpen(false)} gruposBase={grupos} drawsByDate={drawsByDate} lastAsmByGroup={lastAsmByGroup} />}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) { setEditorOpen(false); setEditorPrefill(null); setEditingGroupId(null); } }}>
          <div role="dialog" aria-modal="true" aria-label={editingGroupId ? "Editar grupo" : "Cadastrar grupo"} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#1E293F]">{editingGroupId ? "Editar informações do grupo" : "Cadastrar grupo"}</h3>
                <p className="text-xs text-slate-500">Confira os dados e datas antes de salvar.</p>
              </div>
              <button type="button" aria-label="Fechar" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" onClick={() => { setEditorOpen(false); setEditorPrefill(null); setEditingGroupId(null); }}><X className="h-4 w-4" /></button>
            </div>
            <EditorGrupo
              group={editingGroupId ? grupos.find((item) => item.id === editingGroupId) || null : null}
              prefill={editorPrefill ?? {}}
              onClose={() => { setEditorOpen(false); setEditorPrefill(null); setEditingGroupId(null); }}
              onSaved={async () => { await carregar(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   EDITOR DE GRUPO
   ========================================================= */

type EditorGrupoProps = {
  group?: Grupo | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  prefill?: Partial<Grupo>;
};

function EditorGrupo(props: EditorGrupoProps) {
  const { group, onClose, onSaved, prefill } = props;

  const [form, setForm] = useState<Partial<Grupo>>(
    group || {
      administradora: (prefill?.administradora as Administradora) ?? ("" as Administradora),
      segmento: (prefill?.segmento as SegmentoUI) ?? ("" as SegmentoUI),
      codigo: prefill?.codigo ?? "",
      participantes: prefill?.participantes ?? null,
      faixa_min: prefill?.faixa_min ?? null,
      faixa_max: prefill?.faixa_max ?? null,
      prox_vencimento: prefill?.prox_vencimento ?? null,
      prox_sorteio: prefill?.prox_sorteio ?? null,
      prox_assembleia: prefill?.prox_assembleia ?? null,
      prazo_encerramento_meses: prefill?.prazo_encerramento_meses ?? null,
    }
  );

  const isNew = !group?.id;

  const handleSave = async () => {
    if (!form.codigo || !form.administradora || !form.segmento) {
      alert("Preencha Administradora, Segmento e Código do Grupo.");
      return;
    }
    if (isNew) {
      const { error } = await supabase.from("groups").insert({
        administradora: form.administradora,
        segmento: form.segmento,
        codigo: form.codigo,
        participantes: form.participantes,
        faixa_min: form.faixa_min,
        faixa_max: form.faixa_max,
        prox_vencimento: form.prox_vencimento,
        prox_sorteio: form.prox_sorteio,
        prox_assembleia: form.prox_assembleia,
        prazo_encerramento_meses: form.prazo_encerramento_meses,
      });
      if (error) {
        console.error(error);
        alert("Erro ao inserir grupo.");
        return;
      }
    } else {
      const { error } = await supabase
        .from("groups")
        .update({
          administradora: form.administradora,
          segmento: form.segmento,
          codigo: form.codigo,
          participantes: form.participantes,
          faixa_min: form.faixa_min,
          faixa_max: form.faixa_max,
          prox_vencimento: form.prox_vencimento,
          prox_sorteio: form.prox_sorteio,
          prox_assembleia: form.prox_assembleia,
          prazo_encerramento_meses: form.prazo_encerramento_meses,
        })
        .eq("id", group!.id);
      if (error) {
        console.error(error);
        alert("Erro ao atualizar grupo.");
        return;
      }
    }
    await onSaved();
    onClose();
  };

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Administradora</Label>
          <Input value={form.administradora ?? ""} onChange={(e) => setForm((f) => ({ ...f, administradora: e.target.value as Administradora }))} placeholder="Ex.: Embracon" />
        </div>
        <div>
          <Label>Segmento</Label>
          <Input value={form.segmento ?? ""} onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value as SegmentoUI }))} placeholder="Ex.: Imóvel" />
        </div>
        <div>
          <Label>Código do Grupo</Label>
          <Input value={form.codigo ?? ""} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="Ex.: 1234/5" />
        </div>
        <div>
          <Label>Participantes</Label>
          <Input type="number" min={1} value={form.participantes ?? ""} onChange={(e) => setForm((f) => ({ ...f, participantes: Number(e.target.value) || null }))} />
        </div>
        <div>
          <Label>Faixa Mínima</Label>
          <Input type="number" step="0.01" value={form.faixa_min ?? ""} onChange={(e) => setForm((f) => ({ ...f, faixa_min: Number(e.target.value) || null }))} />
        </div>
        <div>
          <Label>Faixa Máxima</Label>
          <Input type="number" step="0.01" value={form.faixa_max ?? ""} onChange={(e) => setForm((f) => ({ ...f, faixa_max: Number(e.target.value) || null }))} />
        </div>
        <div>
          <Label>Próx. Vencimento</Label>
          <Input type="date" value={form.prox_vencimento ?? ""} onChange={(e) => setForm((f) => ({ ...f, prox_vencimento: e.target.value || null }))} />
        </div>
        <div>
          <Label>Próx. Sorteio</Label>
          <Input type="date" value={form.prox_sorteio ?? ""} onChange={(e) => setForm((f) => ({ ...f, prox_sorteio: e.target.value || null }))} />
        </div>
        <div>
          <Label>Próx. Assembleia</Label>
          <Input type="date" value={form.prox_assembleia ?? ""} onChange={(e) => setForm((f) => ({ ...f, prox_assembleia: e.target.value || null }))} />
        </div>
        <div>
          <Label>Prazo Enc. (meses)</Label>
          <Input type="number" min={0} value={form.prazo_encerramento_meses ?? ""} onChange={(e) => setForm((f) => ({ ...f, prazo_encerramento_meses: Number(e.target.value) || null }))} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2">
          <X className="h-4 w-4" /> Cancelar
        </Button>
        <Button onClick={handleSave} className="inline-flex items-center gap-2">
          <Save className="h-4 w-4" /> Salvar Grupo
        </Button>
      </div>
    </div>
  );
}
