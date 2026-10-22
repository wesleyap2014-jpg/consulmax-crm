import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogIn,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type PocEnvelope = {
  ok?: boolean;
  error?: string;
  running?: boolean;
  remoteUrl?: string | null;
  githubRunUrl?: string | null;
  startedAt?: string | null;
  status?: {
    state?: string;
    message?: string;
    updatedAt?: string | null;
  };
};

function stateMeta(state?: string) {
  if (state === "returned_to_convert") {
    return { label: "POC concluído", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 };
  }
  if (state === "waiting_mfa") {
    return { label: "Aguardando MFA", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: ShieldCheck };
  }
  if (state === "waiting_microsoft_login" || state === "submitting_login") {
    return { label: state === "submitting_login" ? "Autenticando" : "Aguardando login", className: "border-blue-200 bg-blue-50 text-blue-700", Icon: LogIn };
  }
  if (state === "credentials_rejected" || state === "password_expired" || state === "convert_access_denied" || state === "error") {
    return { label: "Falha no POC", className: "border-red-200 bg-red-50 text-red-700", Icon: XCircle };
  }
  if (["queued", "starting", "starting_browser", "browser_ready", "monitor_warning"].includes(String(state || ""))) {
    return { label: "Preparando", className: "border-slate-200 bg-slate-50 text-slate-700", Icon: Loader2 };
  }
  return { label: "Pronto", className: "border-slate-200 bg-white text-slate-700", Icon: ShieldCheck };
}

export default function EmbraconPoc() {
  const navigate = useNavigate();
  const [data, setData] = useState<PocEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Faça login novamente.");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/robots/embracon-poc", { headers, cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as PocEnvelope;
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function execute() {
    setStarting(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/robots/embracon-poc", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      }
      setData(payload);
      await load(true);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setStarting(false);
    }
  }

  const state = data?.status?.state || "idle";
  const meta = useMemo(() => stateMeta(state), [state]);
  const StateIcon = meta.Icon;
  const remoteReady = Boolean(data?.remoteUrl);
  const busy = Boolean(data?.running || starting);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button variant="ghost" className="mb-2 -ml-3" onClick={() => navigate("/central-grupos")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Central de Grupos
          </Button>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">POC Embracon · Convert+</h1>
          <p className="mt-1 text-sm text-slate-500">
            Prova de acesso via GitHub Runner. Este POC não altera o Simulador nem a Gestão de Grupos.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm font-semibold ${meta.className}`}>
          <StateIcon className={`h-4 w-4 ${busy && state !== "returned_to_convert" ? "animate-spin" : ""}`} />
          {meta.label}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-slate-700" />
            Autenticação Microsoft
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">{data?.status?.message || "POC pronto para iniciar."}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ao abrir o navegador remoto, use o usuário de acesso remoto <strong>consulmax</strong>.
              Depois, faça o login Microsoft da Embracon diretamente na tela. Se houver MFA, aprove normalmente.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={execute} disabled={busy}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {busy ? "POC em andamento" : "Executar POC"}
            </Button>

            <Button variant="outline" onClick={() => load()} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            <Button
              variant="outline"
              disabled={!remoteReady}
              onClick={() => data?.remoteUrl && window.open(data.remoteUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {remoteReady ? "Abrir navegador remoto" : "Aguardando navegador"}
            </Button>
          </div>

          {state === "returned_to_convert" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              A autenticação Microsoft retornou ao Convert+. O primeiro POC de acesso está validado.
            </div>
          )}

          {state === "convert_access_denied" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              A Microsoft devolveu a sessão ao Convert+, mas o portal recusou o acesso do runner. Esse resultado separa autenticação de bloqueio de origem/IP.
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando estado do POC…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
