import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

type AnyRow = Record<string, any>;
type StepStatus = "pending" | "running" | "done" | "error";
type MedianSort = "none" | "asc" | "desc";
type SyncMode = "bb" | "bb_segment" | "bb_assemblies" | null;
type SyncReadDetail = {
  segmento?: string;
  venda?: string | null;
  linhas?: number;
  grupos?: number;
  paginas?: number;
};
type SyncStep = {
  key: string;
  label: string;
  status: StepStatus;
  found?: number;
  message?: string;
  rawRows?: number;
  readDetails?: SyncReadDetail[];
};
type AssemblyProgress = {
  total: number;
  done: number;
  success: number;
  error: number;
  currentGroup: string;
  running: boolean;
};
type GrupoCentral = {
  id: string;
  origem: "bb" | "maggi";
  administradora: string;
  grupo: string;
  nome: string;
  segmento: string;
  creditoMin: number;
  creditoMax: number;
  prazoMax: number;
  maiorPct: number | null;
  menorPct: number | null;
  medianaPct: number | null;
  lanceEmbutidoMaxPct: number | null;
  ativo: boolean;
};

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };
const BB_SEGMENTS = [
  { key: "auto_ipca", label: "Auto IPCA" },
  { key: "auto_fipe", label: "Auto FIPE" },
  { key: "outros_bens", label: "Outros Bens" },
  { key: "pesados", label: "Pesados" },
  { key: "motocicleta", label: "Motocicleta" },
  { key: "imoveis", label: "Imóveis" },
];
const MAGGI_SEGMENTS = [
  { key: "automoveis", label: "Automóveis" },
  { key: "imoveis", label: "Imóveis" },
];

function brMoney(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}
function brPct(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const value = Number(v) <= 1 ? Number(v) * 100 : Number(v);
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function formatSyncDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", " às");
}
function n(v: unknown) {
  const value = Number(v || 0);
  return Number.isFinite(value) ? value : 0;
}
function normalizePct(v: unknown) {
  const value = n(v);
  if (!value) return null;
  return value <= 1 ? value * 100 : value;
}
function normalizeSegmento(value: unknown) {
  const raw = String(value || "").trim();
  const map: Record<string, string> = {
    auto_ipca: "Auto IPCA",
    auto_fipe: "Auto FIPE",
    automoveis: "Automóveis",
    imoveis: "Imóveis",
    pesados: "Pesados",
    outros_bens: "Outros Bens",
    motocicleta: "Motocicleta",
  };
  return map[raw] || raw || "Não informado";
}
function creditRangeFromConfig(row: AnyRow) {
  const ranges = Array.isArray(row?.config?.creditRanges)
    ? row.config.creditRanges
    : [];
  const values = ranges
    .map((r: AnyRow) => n(r.valor))
    .filter((v: number) => v > 0);
  const legacyMin = n(row.credito_min);
  const legacyMax = n(row.credito_max);
  if (values.length)
    return { min: Math.min(...values), max: Math.max(...values) };
  return { min: legacyMin || legacyMax || 0, max: legacyMax || legacyMin || 0 };
}
function prazoMaxFrom(row: AnyRow) {
  const rules = Array.isArray(row?.config?.prazoRules)
    ? row.config.prazoRules
    : [];
  const prazos = rules
    .map((r: AnyRow) => n(r.prazo))
    .filter((v: number) => v > 0);
  if (prazos.length) return Math.max(...prazos);
  return n(
    row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min,
  );
}
function lanceLivreFromConfig(row: AnyRow) {
  const opts = Array.isArray(row?.config?.lanceOptions)
    ? row.config.lanceOptions
    : [];
  const livre = opts.find((o: AnyRow) => String(o.key || "").includes("livre"));
  return normalizePct(livre?.pct);
}
function assemblyValue(
  row: AnyRow,
  field: "maiorPct" | "menorPct" | "medianaPct",
) {
  const fromConfig = row?.config?.assemblyResult?.[field];
  if (fromConfig !== undefined && fromConfig !== null)
    return normalizePct(fromConfig);
  if (field === "maiorPct")
    return normalizePct(
      row.maior_pct_contemplado ||
        row.maior_pct_lance_livre ||
        row.maior_lance_livre,
    );
  if (field === "menorPct")
    return normalizePct(
      row.menor_pct_contemplado ||
        row.menor_pct_lance_livre ||
        row.menor_lance_livre,
    );
  return normalizePct(
    row.mediana_pct_contemplado ||
      row.mediana_pct_lance_livre ||
      row.mediana_lance_livre,
  );
}

function detailText(step: SyncStep) {
  const details = step.readDetails || [];
  if (!details.length && step.rawRows === undefined) return null;
  const base =
    step.rawRows !== undefined ? `${step.rawRows} linha(s) lida(s)` : null;
  const byDetail = details.map(
    (d) =>
      `${d.venda ? `${d.venda}: ` : ""}${Number(d.linhas || 0)} linha(s), ${Number(d.grupos || 0)} grupo(s), ${Number(d.paginas || 0)} pág.`,
  );
  return [base, ...byDetail].filter(Boolean).join(" • ");
}

function toBBGroup(row: AnyRow): GrupoCentral {
  const credit = creditRangeFromConfig(row);
  const minCont = lanceLivreFromConfig(row);
  const maior = assemblyValue(row, "maiorPct");
  const menor = assemblyValue(row, "menorPct") || minCont;
  const medianaFromRobot = assemblyValue(row, "medianaPct");
  const mediana =
    medianaFromRobot ||
    (maior && menor ? (maior + menor) / 2 : maior || menor || minCont || null);
  return {
    id: `bb-${row.id}`,
    origem: "bb",
    administradora: "BB Consórcios",
    grupo: String(row.grupo || "—"),
    nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`),
    segmento: normalizeSegmento(row.segmento),
    creditoMin: credit.min,
    creditoMax: credit.max,
    prazoMax: prazoMaxFrom(row),
    maiorPct: maior,
    menorPct: menor,
    medianaPct: mediana,
    lanceEmbutidoMaxPct: normalizePct(
      row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct,
    ),
    ativo: row.is_active !== false,
  };
}
function toMaggiGroup(row: AnyRow): GrupoCentral {
  const credit = creditRangeFromConfig(row);
  const maior = normalizePct(
    row.maior_pct_contemplado ||
      row.maior_pct_lance_livre ||
      row.maior_lance_livre,
  );
  const menor = normalizePct(
    row.menor_pct_contemplado ||
      row.menor_pct_lance_livre ||
      row.menor_lance_livre,
  );
  const mediana =
    maior && menor
      ? (maior + menor) / 2
      : maior || menor || lanceLivreFromConfig(row) || null;
  return {
    id: `maggi-${row.id}`,
    origem: "maggi",
    administradora: "Maggi",
    grupo: String(row.grupo || "—"),
    nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`),
    segmento: normalizeSegmento(row.segmento),
    creditoMin: credit.min,
    creditoMax: credit.max,
    prazoMax: prazoMaxFrom(row),
    maiorPct: maior,
    menorPct: menor,
    medianaPct: mediana,
    lanceEmbutidoMaxPct: normalizePct(
      row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct,
    ),
    ativo: row.is_active !== false,
  };
}
function newSteps(): SyncStep[] {
  return BB_SEGMENTS.map((s) => ({ ...s, status: "pending" }));
}
function newMaggiSteps(): SyncStep[] {
  return MAGGI_SEGMENTS.map((s) => ({ ...s, status: "pending" }));
}

export default function CentralGrupos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bb, setBb] = useState<AnyRow[]>([]);
  const [maggi, setMaggi] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState("todas");
  const [status, setStatus] = useState("ativos");
  const [segmento, setSegmento] = useState("todos");
  const [medianSort, setMedianSort] = useState<MedianSort>("none");
  const [syncing, setSyncing] = useState<SyncMode>(null);
  const [maggiSyncing, setMaggiSyncing] = useState(false);
  const [syncingSegment, setSyncingSegment] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{
    type: "ok" | "warn" | "error";
    text: string;
  } | null>(null);
  const [syncSteps, setSyncSteps] = useState<SyncStep[]>([]);
  const [assemblyProgress, setAssemblyProgress] = useState<AssemblyProgress>({
    total: 0,
    done: 0,
    success: 0,
    error: 0,
    currentGroup: "",
    running: false,
  });
  const [assemblyErrors, setAssemblyErrors] = useState<string[]>([]);
  const [lastBBCronSuccess, setLastBBCronSuccess] = useState<string | null>(
    null,
  );
  const [lastMaggiCronSuccess, setLastMaggiCronSuccess] = useState<
    string | null
  >(null);
  const [activeBBJob, setActiveBBJob] = useState<AnyRow | null>(null);
  const [activeMaggiJob, setActiveMaggiJob] = useState<AnyRow | null>(null);
  const [maggiSteps, setMaggiSteps] = useState<SyncStep[]>([]);

  async function load() {
    setLoading(true);
    const [
      bbRes,
      maggiRes,
      bbStatusRes,
      maggiStatusRes,
      bbJobRes,
      maggiJobRes,
    ] = await Promise.all([
      supabase
        .from("sim_bb_groups")
        .select("*")
        .order("grupo", { ascending: true }),
      supabase
        .from("sim_maggi_groups")
        .select("*")
        .order("grupo", { ascending: true }),
      supabase
        .from("robot_sync_status")
        .select("last_success_at")
        .eq("key", "bb_groups_cron")
        .maybeSingle(),
      supabase
        .from("robot_sync_status")
        .select("last_success_at")
        .eq("key", "maggi_groups_cron")
        .maybeSingle(),
      supabase
        .from("robot_sync_jobs")
        .select("*")
        .eq("administradora", "bb")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("robot_sync_jobs")
        .select("*")
        .eq("administradora", "maggi")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setBb((bbRes.data || []) as AnyRow[]);
    setMaggi((maggiRes.data || []) as AnyRow[]);
    setLastBBCronSuccess(bbStatusRes.data?.last_success_at || null);
    setLastMaggiCronSuccess(maggiStatusRes.data?.last_success_at || null);
    if (bbJobRes.data) applyBBJob(bbJobRes.data);
    if (maggiJobRes.data) applyMaggiJob(maggiJobRes.data);
    setLoading(false);
  }

  async function callRobot(
    administradora: "bb" | "maggi",
    payload: Record<string, any> = {},
  ) {
    const { data } = await supabase.auth.getSession();
    const sessionToken = data.session?.access_token;
    if (!sessionToken)
      throw new Error("Sessão expirada. Faça login novamente.");
    const response = await fetch("/api/robots/sync-groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ administradora, ...payload }),
    });
    const rawText = await response.text();
    let json: any = {};
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch {
      json = {};
    }
    const rawPreview = rawText
      ? rawText
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 600)
      : "";
    const message =
      json?.message ||
      json?.error ||
      rawPreview ||
      `Robô retornou HTTP ${response.status} sem mensagem em JSON.`;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${message}`);
    return { json, message };
  }

  function applyBBJob(job: AnyRow) {
    setActiveBBJob(job);
    const jobProgress =
      job.progress && typeof job.progress === "object" ? job.progress : {};
    const segmentProgress =
      jobProgress.segments && typeof jobProgress.segments === "object"
        ? jobProgress.segments
        : {};
    const relevantSegments =
      job.mode === "segment"
        ? new Set([job.segment])
        : new Set(BB_SEGMENTS.map((item) => item.key));

    if (job.mode === "assemblies") {
      setSyncSteps([]);
    } else {
      setSyncSteps(
        newSteps()
          .filter((step) => relevantSegments.has(step.key))
          .map((step) => {
            const item = segmentProgress[step.key] || {};
            return {
              ...step,
              status: item.status || "pending",
              found: Number(item.found || 0),
              rawRows:
                item.rawRows === undefined
                  ? undefined
                  : Number(item.rawRows || 0),
              readDetails: Array.isArray(item.readDetails)
                ? item.readDetails
                : [],
              message:
                item.message ||
                (job.status === "pending"
                  ? job.current_stage || "Aguardando GitHub Actions"
                  : "Aguardando"),
            } as SyncStep;
          }),
      );
    }

    const assemblies = jobProgress.assemblies || {};
    setAssemblyProgress({
      total: Number(assemblies.total || 0),
      done: Number(assemblies.done || 0),
      success: Number(assemblies.success || 0),
      error: Number(assemblies.error || 0),
      currentGroup: String(assemblies.currentGroup || ""),
      running:
        job.status === "running" &&
        (job.mode === "full" || job.mode === "assemblies") &&
        String(job.current_stage || "")
          .toLowerCase()
          .includes("assemble"),
    });
    setAssemblyErrors(
      Array.isArray(assemblies.errors) ? assemblies.errors.slice(0, 6) : [],
    );

    const isActive = job.status === "pending" || job.status === "running";
    if (isActive) {
      const mode: SyncMode =
        job.mode === "segment"
          ? "bb_segment"
          : job.mode === "assemblies"
            ? "bb_assemblies"
            : "bb";
      setSyncing(mode);
      setSyncingSegment(job.mode === "segment" ? job.segment : null);
      setSyncMessage({
        type: "warn",
        text:
          job.status === "pending"
            ? `${job.current_stage || "GitHub Actions acionado"}. A execução começará assim que o GitHub disponibilizar a máquina.`
            : `${job.current_stage || "Sincronização BB em andamento"}${job.current_item ? `: ${job.current_item}` : ""}.`,
      });
      return;
    }

    setSyncing(null);
    setSyncingSegment(null);
    const summary = job.summary || {};
    if (job.status === "success") {
      setSyncMessage({
        type: "ok",
        text: `Sincronização BB concluída pelo GitHub Actions: ${Number(summary.groupsFound || 0)} grupo(s) processado(s) e ${Number(summary.assembliesSuccess || 0)}/${Number(summary.assembliesTotal || 0)} assembleia(s) atualizada(s).`,
      });
    } else if (job.status === "partial_error") {
      setSyncMessage({
        type: "warn",
        text:
          job.error_message || "Sincronização BB concluída com erros parciais.",
      });
    } else if (job.status === "error") {
      setSyncMessage({
        type: "error",
        text:
          job.error_message || "A sincronização BB falhou no GitHub Actions.",
      });
    }
  }

  async function refreshBBJob(jobId?: string) {
    let query = supabase
      .from("robot_sync_jobs")
      .select("*")
      .eq("administradora", "bb");
    query = jobId
      ? query.eq("id", jobId)
      : query.order("requested_at", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) applyBBJob(data);
    return data;
  }

  function applyMaggiJob(job: AnyRow) {
    setActiveMaggiJob(job);
    const jobProgress =
      job.progress && typeof job.progress === "object" ? job.progress : {};
    const segmentProgress =
      jobProgress.segments && typeof jobProgress.segments === "object"
        ? jobProgress.segments
        : {};
    const relevantSegments =
      job.mode === "segment"
        ? new Set([job.segment])
        : new Set(MAGGI_SEGMENTS.map((item) => item.key));
    setMaggiSteps(
      newMaggiSteps()
        .filter((step) => relevantSegments.has(step.key))
        .map((step) => {
          const item = segmentProgress[step.key] || {};
          return {
            ...step,
            status: item.status || "pending",
            found: Number(item.found || 0),
            rawRows:
              item.rawRows === undefined
                ? undefined
                : Number(item.rawRows || 0),
            message:
              item.message ||
              (job.status === "pending"
                ? job.current_stage || "Aguardando GitHub Actions"
                : "Aguardando"),
          } as SyncStep;
        }),
    );

    const isActive = job.status === "pending" || job.status === "running";
    setMaggiSyncing(isActive);
    if (isActive) {
      setSyncMessage({
        type: "warn",
        text:
          job.status === "pending"
            ? `${job.current_stage || "GitHub Actions acionado"}. A execução começará assim que o GitHub disponibilizar a máquina.`
            : `${job.current_stage || "Sincronização Maggi em andamento"}${job.current_item ? `: ${job.current_item}` : ""}.`,
      });
      return;
    }

    const summary = job.summary || {};
    if (job.status === "success") {
      setSyncMessage({
        type: "ok",
        text: `Sincronização Maggi concluída pelo GitHub Actions: ${Number(summary.groupsFound || 0)} grupo(s) disponível(is) em ${Number(summary.segmentsSuccess || 0)} segmento(s).`,
      });
    } else if (job.status === "error") {
      setSyncMessage({
        type: "error",
        text:
          job.error_message ||
          "A sincronização Maggi falhou no GitHub Actions.",
      });
    }
  }

  async function refreshMaggiJob(jobId?: string) {
    let query = supabase
      .from("robot_sync_jobs")
      .select("*")
      .eq("administradora", "maggi");
    query = jobId
      ? query.eq("id", jobId)
      : query.order("requested_at", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) applyMaggiJob(data);
    return data;
  }

  async function queueBB(
    payload: Record<string, any>,
    mode: Exclude<SyncMode, null>,
    segmentKey?: string,
  ) {
    setSyncing(mode);
    setSyncingSegment(segmentKey || null);
    setSyncMessage(null);
    setAssemblyErrors([]);
    if (mode !== "bb_assemblies")
      setSyncSteps(
        mode === "bb_segment"
          ? newSteps().filter((step) => step.key === segmentKey)
          : newSteps(),
      );
    else setSyncSteps([]);
    setAssemblyProgress({
      total: 0,
      done: 0,
      success: 0,
      error: 0,
      currentGroup: "",
      running: false,
    });

    try {
      const { json, message } = await callRobot("bb", payload);
      const job = json?.details?.job;
      if (job) applyBBJob(job);
      else if (json?.details?.job_id) await refreshBBJob(json.details.job_id);
      setSyncMessage({ type: "warn", text: message });
    } catch (err: any) {
      setSyncing(null);
      setSyncingSegment(null);
      setSyncMessage({
        type: "error",
        text: err?.message || "Erro ao adicionar a sincronização BB à fila.",
      });
    }
  }

  async function syncBBFullQueue() {
    await queueBB({}, "bb");
  }

  async function syncBBSegment(item: { key: string; label: string }) {
    await queueBB({ segmento: item.key }, "bb_segment", item.key);
  }

  async function syncBBAssembliesOnly() {
    await queueBB({ tipo: "assembleia" }, "bb_assemblies");
  }

  async function queueMaggi(payload: Record<string, any> = {}) {
    setMaggiSyncing(true);
    setSyncMessage(null);
    setMaggiSteps(newMaggiSteps());
    try {
      const { json, message } = await callRobot("maggi", payload);
      const job = json?.details?.job;
      if (job) applyMaggiJob(job);
      else if (json?.details?.job_id)
        await refreshMaggiJob(json.details.job_id);
      setSyncMessage({ type: "warn", text: message });
    } catch (err: any) {
      setMaggiSyncing(false);
      setSyncMessage({
        type: "error",
        text: err?.message || "Erro ao adicionar a sincronização Maggi à fila.",
      });
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!activeBBJob || !["pending", "running"].includes(activeBBJob.status))
      return;
    const interval = window.setInterval(async () => {
      try {
        const job = await refreshBBJob(activeBBJob.id);
        if (job && !["pending", "running"].includes(job.status)) await load();
      } catch (error) {
        console.error("Erro ao acompanhar sincronização BB:", error);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeBBJob?.id, activeBBJob?.status]);
  useEffect(() => {
    if (
      !activeMaggiJob ||
      !["pending", "running"].includes(activeMaggiJob.status)
    )
      return;
    const interval = window.setInterval(async () => {
      try {
        const job = await refreshMaggiJob(activeMaggiJob.id);
        if (job && !["pending", "running"].includes(job.status)) await load();
      } catch (error) {
        console.error("Erro ao acompanhar sincronização Maggi:", error);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeMaggiJob?.id, activeMaggiJob?.status]);
  const grupos = useMemo(
    () => [...bb.map(toBBGroup), ...maggi.map(toMaggiGroup)],
    [bb, maggi],
  );
  const segmentos = useMemo(
    () =>
      Array.from(new Set(grupos.map((g) => g.segmento).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [grupos],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = grupos.filter((g) => {
      if (admin !== "todas" && g.origem !== admin) return false;
      if (status === "ativos" && !g.ativo) return false;
      if (status === "inativos" && g.ativo) return false;
      if (segmento !== "todos" && g.segmento !== segmento) return false;
      if (!q) return true;
      return `${g.administradora} ${g.grupo} ${g.nome} ${g.segmento}`
        .toLowerCase()
        .includes(q);
    });
    if (medianSort === "none") return list;
    return [...list].sort((a, b) => {
      const av = a.medianaPct ?? Number.POSITIVE_INFINITY;
      const bv = b.medianaPct ?? Number.POSITIVE_INFINITY;
      return medianSort === "asc" ? av - bv : bv - av;
    });
  }, [grupos, query, admin, status, segmento, medianSort]);

  const ativos = grupos.filter((g) => g.ativo).length;
  const comMediana = grupos.filter((g) => g.medianaPct !== null).length;
  const finished = syncSteps.filter(
    (s) => s.status === "done" || s.status === "error",
  ).length;
  const progress = syncSteps.length
    ? Math.round((finished / syncSteps.length) * 100)
    : 0;
  const assemblyPercent = assemblyProgress.total
    ? Math.round((assemblyProgress.done / assemblyProgress.total) * 100)
    : 0;
  const maggiFinished = maggiSteps.filter(
    (step) => step.status === "done" || step.status === "error",
  ).length;
  const maggiProgress = maggiSteps.length
    ? Math.round((maggiFinished / maggiSteps.length) * 100)
    : 0;
  const lastBBCronSuccessLabel = formatSyncDate(lastBBCronSuccess);
  const lastMaggiCronSuccessLabel = formatSyncDate(lastMaggiCronSuccess);
  function toggleMedianSort() {
    setMedianSort((current) =>
      current === "none" ? "asc" : current === "asc" ? "desc" : "none",
    );
  }
  if (loading)
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Central de
        Grupos...
      </div>
    );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="rounded-[30px] border p-6 md:p-8 text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
          <Database className="h-3.5 w-3.5" /> Central de Grupos
        </div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tight">
          Grupos ativos e disponíveis para o Radar de Ofertas
        </h1>
        <p className="mt-3 max-w-3xl text-sm md:text-base text-white/80">
          Base consolidada dos grupos BB Consórcios e Maggi para uso no Radar de
          Ofertas.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          title="Total de grupos"
          value={String(grupos.length)}
          hint="BB + Maggi cadastrados"
        />
        <Metric
          title="Grupos ativos"
          value={String(ativos)}
          hint="Entram no Radar de Ofertas"
        />
        <Metric
          title="Com mediana/média"
          value={String(comMediana)}
          hint="Base para ranquear lance livre"
        />
      </div>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-start">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: C.navy }}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-black" style={{ color: C.navy }}>
              Robô das administradoras
            </h2>
            <p className="text-sm text-slate-600">
              As sincronizações BB e Maggi são executadas com Chrome e
              Playwright no GitHub Actions. Cada administradora possui sua fila
              e seu acompanhamento independente. A atualização automática ocorre
              diariamente às 7h30, no horário de Rondônia; os comandos manuais
              são enviados imediatamente pela API.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${lastBBCronSuccessLabel ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {lastBBCronSuccessLabel
                  ? `Último sucesso automático BB: ${lastBBCronSuccessLabel} (RO)`
                  : "BB ainda sem sincronização automática concluída"}
              </div>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${lastMaggiCronSuccessLabel ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {lastMaggiCronSuccessLabel
                  ? `Último sucesso automático Maggi: ${lastMaggiCronSuccessLabel} (RO)`
                  : "Maggi ainda sem sincronização automática concluída"}
              </div>
            </div>
            {activeBBJob &&
              ["pending", "running"].includes(activeBBJob.status) && (
                <div className="mr-2 mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  BB:{" "}
                  {activeBBJob.status === "pending"
                    ? activeBBJob.current_stage || "aguardando GitHub Actions"
                    : activeBBJob.current_stage || "em execução"}
                </div>
              )}
            {activeMaggiJob &&
              ["pending", "running"].includes(activeMaggiJob.status) && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Maggi:{" "}
                  {activeMaggiJob.status === "pending"
                    ? activeMaggiJob.current_stage ||
                      "aguardando GitHub Actions"
                    : activeMaggiJob.current_stage || "em execução"}
                </div>
              )}
            {syncSteps.length > 0 && (
              <div className="mt-4 rounded-3xl border bg-white p-4">
                <div
                  className="mb-3 flex justify-between text-sm font-semibold"
                  style={{ color: C.navy }}
                >
                  <span>1. Grupos BB por segmento</span>
                  <span>{progress}%</span>
                </div>
                <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: C.ruby }}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {syncSteps.map((step) => (
                    <div
                      key={step.key}
                      className="flex items-start gap-2 rounded-2xl border bg-slate-50 px-3 py-2 text-xs"
                    >
                      {step.status === "running" && (
                        <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-600" />
                      )}
                      {step.status === "done" && (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      )}
                      {step.status === "error" && (
                        <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                      )}
                      {step.status === "pending" && (
                        <span className="mt-1 h-3 w-3 rounded-full border border-slate-300" />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">
                          {step.label}
                        </div>
                        <div className="text-slate-500">
                          {step.status === "done"
                            ? `${step.found || 0} grupo(s) processado(s)`
                            : step.message || "Aguardando"}
                        </div>
                        {step.status === "done" && detailText(step) && (
                          <div className="mt-1 text-[11px] leading-snug text-slate-500">
                            {detailText(step)}
                          </div>
                        )}
                        {step.status === "error" && (
                          <div className="mt-1 max-w-[420px] break-words text-[11px] leading-snug text-red-600">
                            {step.message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {assemblyProgress.total > 0 && (
              <div className="mt-4 rounded-3xl border bg-white p-4">
                <div
                  className="mb-3 flex justify-between text-sm font-semibold"
                  style={{ color: C.navy }}
                >
                  <span>2. Resultado de assembleias BB</span>
                  <span>
                    {assemblyProgress.done}/{assemblyProgress.total} •{" "}
                    {assemblyPercent}%
                  </span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${assemblyPercent}%`, background: C.gold }}
                  />
                </div>
                <div className="text-xs text-slate-600">
                  {assemblyProgress.running
                    ? `Sincronizando grupo ${assemblyProgress.currentGroup}...`
                    : "Fila de assembleias concluída."}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs">
                  <div className="rounded-2xl border bg-slate-50 px-3 py-2">
                    Total: <strong>{assemblyProgress.total}</strong>
                  </div>
                  <div className="rounded-2xl border bg-emerald-50 px-3 py-2 text-emerald-700">
                    Sucesso: <strong>{assemblyProgress.success}</strong>
                  </div>
                  <div className="rounded-2xl border bg-red-50 px-3 py-2 text-red-700">
                    Erros: <strong>{assemblyProgress.error}</strong>
                  </div>
                </div>
                {assemblyErrors.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <div className="mb-1 font-bold">Últimos erros:</div>
                    {assemblyErrors.map((error, index) => (
                      <div key={`${index}-${error}`} className="truncate">
                        {error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {maggiSteps.length > 0 && (
              <div className="mt-4 rounded-3xl border bg-white p-4">
                <div
                  className="mb-3 flex justify-between text-sm font-semibold"
                  style={{ color: C.navy }}
                >
                  <span>Grupos Maggi disponíveis</span>
                  <span>{maggiProgress}%</span>
                </div>
                <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${maggiProgress}%`, background: C.gold }}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {maggiSteps.map((step) => (
                    <div
                      key={step.key}
                      className="flex items-start gap-2 rounded-2xl border bg-slate-50 px-3 py-2 text-xs"
                    >
                      {step.status === "running" && (
                        <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-600" />
                      )}
                      {step.status === "done" && (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      )}
                      {step.status === "error" && (
                        <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                      )}
                      {step.status === "pending" && (
                        <span className="mt-1 h-3 w-3 rounded-full border border-slate-300" />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">
                          {step.label}
                        </div>
                        <div
                          className={
                            step.status === "error"
                              ? "break-words text-red-600"
                              : "text-slate-500"
                          }
                        >
                          {step.status === "done"
                            ? `${step.found || 0} grupo(s) disponível(is)`
                            : step.message || "Aguardando"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {syncMessage && (
              <div
                className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${syncMessage.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : syncMessage.type === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}`}
              >
                {syncMessage.text}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 md:min-w-[220px]">
            <Button
              variant="outline"
              className="rounded-2xl"
              disabled={!!syncing}
              onClick={syncBBFullQueue}
            >
              {syncing === "bb" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Sincronizar BB completo
            </Button>
            <div className="rounded-2xl border bg-slate-50 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Grupos BB 1 a 1
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BB_SEGMENTS.map((item) => (
                  <Button
                    key={item.key}
                    variant="outline"
                    className="h-auto rounded-xl px-2 py-2 text-[11px] leading-tight"
                    disabled={!!syncing}
                    onClick={() => syncBBSegment(item)}
                  >
                    {syncing === "bb_segment" && syncingSegment === item.key ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-2xl"
              disabled={!!syncing}
              onClick={syncBBAssembliesOnly}
            >
              {syncing === "bb_assemblies" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Só Assembleias BB
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl"
              disabled={maggiSyncing}
              onClick={() => queueMaggi()}
            >
              {maggiSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Sincronizar Maggi
            </Button>
            <Button
              className="rounded-2xl text-white"
              style={{ background: C.ruby }}
              onClick={() => navigate("/radar-ofertas")}
            >
              Abrir Radar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" style={{ color: C.ruby }} />
            <h2 className="font-black" style={{ color: C.navy }}>
              Filtros
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.5fr_.8fr_.8fr_.8fr_auto]">
            <label className="relative block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-2xl border py-2 pl-9 pr-3 text-sm"
                placeholder="Buscar por grupo, segmento ou administradora"
              />
            </label>
            <select
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
              className="rounded-2xl border px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="bb">BB Consórcios</option>
              <option value="maggi">Maggi</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-2xl border px-3 py-2 text-sm"
            >
              <option value="ativos">Ativos</option>
              <option value="todos">Todos</option>
              <option value="inativos">Inativos</option>
            </select>
            <select
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              className="rounded-2xl border px-3 py-2 text-sm"
            >
              <option value="todos">Todos segmentos</option>
              {segmentos.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button variant="outline" className="rounded-2xl" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Administradora</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">Segmento</th>
                <th className="px-4 py-3">Faixa de crédito</th>
                <th className="px-4 py-3">Prazo máx.</th>
                <th className="px-4 py-3">Maior %</th>
                <th className="px-4 py-3">Menor %</th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={toggleMedianSort}
                    className="font-bold underline-offset-2 hover:underline"
                  >
                    Mediana{" "}
                    {medianSort === "asc"
                      ? "↑"
                      : medianSort === "desc"
                        ? "↓"
                        : "↕"}
                  </button>
                </th>
                <th className="px-4 py-3">Embutido máx.</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="border-t hover:bg-slate-50/70">
                  <td
                    className="px-4 py-3 font-semibold"
                    style={{ color: C.navy }}
                  >
                    {g.administradora}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold">{g.grupo}</div>
                    <div className="max-w-[220px] truncate text-xs text-slate-500">
                      {g.nome}
                    </div>
                  </td>
                  <td className="px-4 py-3">{g.segmento}</td>
                  <td className="px-4 py-3">
                    {brMoney(g.creditoMin)} até {brMoney(g.creditoMax)}
                  </td>
                  <td className="px-4 py-3">{g.prazoMax || "—"} meses</td>
                  <td className="px-4 py-3">{brPct(g.maiorPct)}</td>
                  <td className="px-4 py-3">{brPct(g.menorPct)}</td>
                  <td className="px-4 py-3 font-bold" style={{ color: C.ruby }}>
                    {brPct(g.medianaPct)}
                  </td>
                  <td className="px-4 py-3">{brPct(g.lanceEmbutidoMaxPct)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${g.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {g.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Nenhum grupo encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
      <CardContent className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <div className="mt-1 text-3xl font-black" style={{ color: C.navy }}>
          {value}
        </div>
        <div className="mt-1 text-xs text-slate-500">{hint}</div>
      </CardContent>
    </Card>
  );
}
