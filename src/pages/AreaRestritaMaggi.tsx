import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileSearch,
  Loader2,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type AnyRow = Record<string, any>;

type WorkerEnvelope = {
  ok?: boolean;
  error?: string;
  workerOnline?: boolean;
  syncRunning?: boolean;
  syncPid?: number | null;
  remoteUrl?: string;
  startedAt?: string;
  weeklySchedule?: {
    enabled?: boolean;
    hour?: number;
    timeZone?: string;
    lastWeeklyKey?: string | null;
    next?: { date?: string; hour?: number; timeZone?: string; label?: string } | null;
  };
  status?: {
    ok?: boolean;
    state?: string;
    message?: string;
    updatedAt?: string;
    currentUrl?: string | null;
    syncProgress?: Record<string, any>;
    priceTableSync?: {
      summary?: Record<string, any>;
      groups?: AnyRow[];
      ignoredTables?: string[];
    };
    priceTableSyncError?: string;
  } | null;
  manifest?: {
    startedAt?: string;
    finishedAt?: string;
    activeGroups?: string[];
    selectedEntries?: AnyRow[];
    ignoredEntries?: AnyRow[];
    summary?: Record<string, any>;
    groups?: Record<string, AnyRow>;
  } | null;
};

type MaggiGroup = {
  id: string;
  grupo: string;
  segmento: string | null;
  credito_min: number | null;
  credito_max: number | null;
  prazo_original: number | null;
  prazo_restante: number | null;
  taxa_adm_pct: number | null;
  fundo_reserva_pct: number | null;
  lance_embutido_max_pct: number | null;
  config: AnyRow | null;
  is_active: boolean | null;
  updated_at: string | null;
};

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

function money(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return "—";
  return parsed.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function pct(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "—";
  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return `${normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function stateInfo(state?: string, running?: boolean) {
  if (running || state === "price_tables_syncing") {
    return { label: "Sincronizando", tone: "amber", icon: Loader2 };
  }
  if (state === "waiting_cloudflare") {
    return { label: "Aguardando Cloudflare", tone: "amber", icon: ShieldCheck };
  }
  if (state === "cloudflare_rejected" || state === "login_not_confirmed") {
    return { label: "Ação necessária", tone: "red", icon: AlertTriangle };
  }
  if (state === "price_tables_error" || state === "error") {
    return { label: "Erro", tone: "red", icon: XCircle };
  }
  if (state === "price_tables_synced") {
    return { label: "Concluído", tone: "green", icon: CheckCircle2 };
  }
  if (state === "price_tables_found" || state === "opening_documents" || state === "opening_price_tables") {
    return { label: "Processando", tone: "blue", icon: FileSearch };
  }
  return { label: "Pronto", tone: "slate", icon: Bot };
}

function toneClasses(tone: string) {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function creditRange(group: MaggiGroup) {
  const values = Array.isArray(group.config?.creditRanges)
    ? group.config!.creditRanges.map((item: AnyRow) => Number(item?.valor || 0)).filter((value: number) => value > 0)
    : [];
  const min = values.length ? Math.min(...values) : Number(group.credito_min || 0);
  const max = values.length ? Math.max(...values) : Number(group.credito_max || 0);
  if (!min && !max) return "—";
  if (min === max) return money(min);
  return `${money(min)} a ${money(max)}`;
}

function groupTerm(group: MaggiGroup) {
  const rules = Array.isArray(group.config?.prazoRules) ? group.config!.prazoRules : [];
  const terms = rules.map((item: AnyRow) => Number(item?.prazo || 0)).filter((value: number) => value > 0);
  return terms.length ? Math.max(...terms) : Number(group.prazo_original || group.prazo_restante || 0);
}

function groupFee(group: MaggiGroup, key: "taxaAdmPct" | "fundoReservaPct", direct: unknown) {
  const rules = Array.isArray(group.config?.prazoRules) ? group.config!.prazoRules : [];
  const found = rules.map((item: AnyRow) => Number(item?.[key] || 0)).find((value: number) => value > 0);
  return found || Number(direct || 0);
}

export default function AreaRestritaMaggi() {
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerEnvelope | null>(null);
  const [groups, setGroups] = useState<MaggiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Faça login novamente.");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadGroups = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("sim_maggi_groups")
      .select(
        "id,grupo,segmento,credito_min,credito_max,prazo_original,prazo_restante,taxa_adm_pct,fundo_reserva_pct,lance_embutido_max_pct,config,is_active,updated_at",
      )
      .eq("is_active", true)
      .order("grupo", { ascending: true });
    if (queryError) throw queryError;
    setGroups((data || []) as MaggiGroup[]);
  }, []);

  const loadWorker = useCallback(async () => {
    const headers = await authHeaders();
    const response = await fetch("/api/robots/area-restrita-maggi", {
      headers,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as WorkerEnvelope;
    if (!response.ok) throw new Error(payload.error || `Worker retornou HTTP ${response.status}.`);
    setWorker(payload);
  }, [authHeaders]);

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        await Promise.all([loadWorker(), loadGroups()]);
        setError(null);
      } catch (loadError) {
        setError(String((loadError as Error)?.message || loadError));
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [loadGroups, loadWorker],
  );

  useEffect(() => {
    refreshAll();
    const timer = window.setInterval(() => refreshAll(true), 7000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  async function executeNow() {
    setStarting(true);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/robots/area-restrita-maggi", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      }
      setNotice(payload?.message || "Sincronização solicitada.");
      await refreshAll(true);
    } catch (startError) {
      setError(String((startError as Error)?.message || startError));
    } finally {
      setStarting(false);
    }
  }

  const status = worker?.status || null;
  const syncRunning = Boolean(worker?.syncRunning || status?.state === "price_tables_syncing");
  const info = stateInfo(status?.state, syncRunning);
  const StateIcon = info.icon;
  const progress = status?.syncProgress || {};
  const position = Number(progress.position || 0);
  const total = Number(progress.total || worker?.manifest?.summary?.selectedEntries || 0);
  const progressPct = total > 0 ? Math.min(100, Math.max(0, (position / total) * 100)) : 0;

  const syncedGroups = useMemo(
    () => groups.filter((group) => Boolean(group.config?.detailsSyncedAt)),
    [groups],
  );
  const completeGroups = useMemo(
    () => groups.filter((group) => group.config?.needsDetailsSync === false),
    [groups],
  );
  const latestDetailsSync = useMemo(() => {
    const values = groups
      .map((group) => group.config?.detailsSyncedAt)
      .filter(Boolean)
      .map((value) => new Date(String(value)).getTime())
      .filter(Number.isFinite);
    return values.length ? new Date(Math.max(...values)).toISOString() : status?.updatedAt || null;
  }, [groups, status?.updatedAt]);

  const errors = useMemo(() => {
    const result: { group: string; message: string }[] = [];
    const manifestGroups = worker?.manifest?.groups || {};
    Object.entries(manifestGroups).forEach(([group, value]) => {
      const groupErrors = Array.isArray(value?.errors) ? value.errors : [];
      groupErrors.forEach((item: AnyRow) => {
        result.push({ group, message: String(item?.error || item?.message || "Erro não detalhado") });
      });
    });
    if (status?.priceTableSyncError) result.unshift({ group: "Execução", message: status.priceTableSyncError });
    return result.slice(0, 12);
  }, [status?.priceTableSyncError, worker?.manifest?.groups]);

  const remoteUrl = worker?.remoteUrl || "https://consulmax-crm-production.up.railway.app";

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-8">
      <div className="overflow-hidden rounded-[28px] border border-white/60 bg-white/85 shadow-xl backdrop-blur-xl">
        <div
          className="relative overflow-hidden px-5 py-6 md:px-8"
          style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #263653 55%, ${C.ruby} 130%)` }}
        >
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4 text-white">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-3 shadow-inner">
                <Bot className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">Central de Robôs</p>
                <h1 className="mt-1 text-2xl font-bold md:text-3xl">Área Restrita Maggi</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
                  Acompanhamento da sessão, leitura das tabelas de preços e atualização automática dos grupos disponíveis para venda.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => refreshAll()}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
              <Button
                className="bg-white text-slate-900 hover:bg-white/90"
                onClick={executeNow}
                disabled={starting || syncRunning}
              >
                {starting || syncRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {syncRunning ? "Em execução" : "Executar agora"}
              </Button>
              <Button
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => window.open(remoteUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Navegador remoto
              </Button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o worker</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      {status?.state === "waiting_cloudflare" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">O Cloudflare precisa da sua confirmação</p>
              <p className="mt-1 text-sm text-amber-800">Abra o navegador remoto e marque “Verify you are human”. O robô continuará sozinho depois disso.</p>
            </div>
          </div>
          <Button onClick={() => window.open(remoteUrl, "_blank", "noopener,noreferrer")} className="bg-amber-700 hover:bg-amber-800">
            Abrir navegador
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/60 bg-white/85 shadow-lg backdrop-blur-xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`rounded-2xl border p-3 ${worker?.workerOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              <Server className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Worker Railway</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{worker?.workerOnline ? "Online" : loading ? "Consultando" : "Offline"}</p>
              <p className="mt-1 text-xs text-slate-500">Serviço dedicado da Área Restrita</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85 shadow-lg backdrop-blur-xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`rounded-2xl border p-3 ${toneClasses(info.tone)}`}>
              <StateIcon className={`h-6 w-6 ${syncRunning ? "animate-spin" : ""}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado atual</p>
              <p className="mt-1 truncate text-xl font-bold text-slate-900">{info.label}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{status?.message || "Aguardando informações do worker"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85 shadow-lg backdrop-blur-xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-700">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos detalhados</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{completeGroups.length} de {groups.length}</p>
              <p className="mt-1 text-xs text-slate-500">Com crédito, prazo, taxas e lance</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85 shadow-lg backdrop-blur-xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-violet-700">
              <Clock3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Última atualização</p>
              <p className="mt-1 text-base font-bold text-slate-900">{dateTime(latestDetailsSync)}</p>
              <p className="mt-1 text-xs text-slate-500">Próxima: {worker?.weeklySchedule?.next?.label || "sexta-feira"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="border-white/60 bg-white/90 shadow-lg backdrop-blur-xl">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900">Execução do robô</CardTitle>
                <p className="mt-1 text-sm text-slate-500">A tela é atualizada automaticamente a cada sete segundos.</p>
              </div>
              <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses(info.tone)}`}>
                <StateIcon className={`h-3.5 w-3.5 ${syncRunning ? "animate-spin" : ""}`} />
                {info.label}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-slate-700">{progress.currentTable || status?.message || "Aguardando execução"}</span>
                <span className="shrink-0 font-semibold text-slate-900">{total > 0 ? `${position}/${total}` : "—"}</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.ruby}, ${C.gold})` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <span>Grupo atual: <strong className="text-slate-700">{progress.currentGroup || "—"}</strong></span>
                <span>PDFs selecionados: <strong className="text-slate-700">{Number(worker?.manifest?.summary?.selectedEntries || 0)}</strong></span>
                <span>Grupos atualizados: <strong className="text-slate-700">{Number(worker?.manifest?.summary?.updatedGroups || syncedGroups.length)}</strong></span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agendamento</p>
                <p className="mt-2 font-semibold text-slate-900">{worker?.weeklySchedule?.next?.label || "Sexta-feira"}</p>
                <p className="mt-1 text-sm text-slate-500">Fuso horário: {worker?.weeklySchedule?.timeZone || "America/Porto_Velho"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos ignorados</p>
                <p className="mt-2 font-semibold text-slate-900">{Number(worker?.manifest?.summary?.ignoredEntries || 0)} tabela(s)</p>
                <p className="mt-1 text-sm text-slate-500">Grupos que não estão ativos para venda</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/90 shadow-lg backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-slate-900">Pendências e erros</CardTitle>
          </CardHeader>
          <CardContent>
            {errors.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
                <p className="mt-3 font-semibold text-emerald-800">Nenhum erro registrado</p>
                <p className="mt-1 text-sm text-emerald-700">O último relatório não possui falhas de leitura.</p>
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {errors.map((item, index) => (
                  <div key={`${item.group}-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-semibold">Grupo {item.group}</p>
                    <p className="mt-1 break-words text-xs leading-5">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/60 bg-white/90 shadow-lg backdrop-blur-xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg text-slate-900">Grupos Maggi disponíveis para venda</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Dados gravados pelo leitor das Tabelas de Preços.</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/central-grupos")}>
              <Database className="mr-2 h-4 w-4" />
              Abrir Central de Grupos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Segmento</th>
                  <th className="px-4 py-3">Faixa de crédito</th>
                  <th className="px-4 py-3">Prazo máx.</th>
                  <th className="px-4 py-3">Taxa Adm.</th>
                  <th className="px-4 py-3">FR</th>
                  <th className="px-4 py-3">Lance embutido</th>
                  <th className="px-4 py-3">Leitura PDF</th>
                  <th className="px-4 py-3">Atualizado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {groups.map((group) => {
                  const complete = group.config?.needsDetailsSync === false;
                  const syncedAt = group.config?.detailsSyncedAt;
                  return (
                    <tr key={group.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-bold text-slate-900">{group.grupo}</td>
                      <td className="px-4 py-3 text-slate-700">{group.segmento === "imoveis" ? "Imóveis" : "Automóveis"}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{creditRange(group)}</td>
                      <td className="px-4 py-3 text-slate-700">{groupTerm(group) || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{pct(groupFee(group, "taxaAdmPct", group.taxa_adm_pct))}</td>
                      <td className="px-4 py-3 text-slate-700">{pct(groupFee(group, "fundoReservaPct", group.fundo_reserva_pct))}</td>
                      <td className="px-4 py-3 text-slate-700">{pct(group.config?.maxLanceEmbutidoPct || group.lance_embutido_max_pct)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : syncedAt ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : syncedAt ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                          {complete ? "Completa" : syncedAt ? "Parcial" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{dateTime(syncedAt || group.updated_at)}</td>
                    </tr>
                  );
                })}
                {!loading && groups.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">Nenhum grupo Maggi ativo foi encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
