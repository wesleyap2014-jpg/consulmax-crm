import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  FileSpreadsheet,
  Handshake,
  Loader2,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Users,
  UserRoundSearch,
} from "lucide-react";

type NewsletterRef = {
  id: string;
  title: string;
  subject: string;
};

type SourceCounts = {
  clientes: { total: number; valid: number; invalid: number };
  parceiros: { total: number; valid: number; invalid: number };
};

type Preview = {
  total_unique: number;
  duplicates_removed: number;
  invalid_removed: number;
  sample: Array<{ name: string; email: string; source_type: string }>;
};

type Dispatch = {
  id: string;
  status: string;
  source_types: string[];
  hourly_limit: number;
  daily_limit: number;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count?: number;
  duplicate_count: number;
  invalid_count: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  last_run_at?: string | null;
};

const DISPATCH_LABEL: Record<string, string> = {
  preparando: "Preparando",
  pronta: "Pronta para iniciar",
  em_envio: "Em envio",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  erro: "Erro",
};

export default function MarketingNewsletterAudienceDialog({
  newsletter,
  open,
  onOpenChange,
}: {
  newsletter: NewsletterRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [counts, setCounts] = useState<SourceCounts | null>(null);
  const [selected, setSelected] = useState({ clientes: true, parceiros: true });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSources = useMemo(() => [
    selected.clientes ? "clientes" : null,
    selected.parceiros ? "parceiros" : null,
  ].filter(Boolean) as string[], [selected]);

  useEffect(() => {
    if (!open || !newsletter) return;
    setPreview(null);
    setNotice(null);
    setError(null);
    void loadCounts();
  }, [open, newsletter?.id]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function api(path: string, init?: RequestInit) {
    const accessToken = await token();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(body?.message || "Não foi possível carregar o público.");
    return body;
  }

  async function loadCounts() {
    if (!newsletter) return;
    setLoading(true);
    setError(null);
    try {
      const body = await api(`/api/marketing/newsletter-audience?newsletter_id=${encodeURIComponent(newsletter.id)}`);
      setCounts(body.sources as SourceCounts);
      setDispatch(body.latest_dispatch || null);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar as listas.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(source: "clientes" | "parceiros") {
    setSelected((current) => ({ ...current, [source]: !current[source] }));
    setPreview(null);
  }

  async function previewAudience() {
    if (!selectedSources.length) return setError("Selecione pelo menos uma lista.");
    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await api("/api/marketing/newsletter-audience", {
        method: "POST",
        body: JSON.stringify({ action: "preview", sources: selectedSources }),
      });
      setPreview(body as Preview);
    } catch (err: any) {
      setError(err?.message || "Não foi possível preparar a prévia.");
    } finally {
      setPreviewing(false);
    }
  }

  async function prepareQueue() {
    if (!newsletter || !preview) return;
    setQueueing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await api("/api/marketing/newsletter-audience", {
        method: "POST",
        body: JSON.stringify({ action: "queue", newsletter_id: newsletter.id, sources: selectedSources }),
      });
      setDispatch(body.dispatch as Dispatch);
      setPreview((current) => current ? { ...current, total_unique: body.total_unique } : current);
      setNotice("Fila preparada. Revise os números e clique em Iniciar disparo.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível criar a fila de envio.");
    } finally {
      setQueueing(false);
    }
  }

  async function runNow() {
    return api("/api/marketing/newsletter-dispatch-run", { method: "POST", body: JSON.stringify({}) });
  }

  async function changeDispatch(action: "start" | "pause" | "resume") {
    if (!newsletter || !dispatch) return;
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await api("/api/marketing/newsletter-audience", {
        method: "POST",
        body: JSON.stringify({
          action,
          newsletter_id: newsletter.id,
          dispatch_id: dispatch.id,
        }),
      });
      setDispatch(body.dispatch as Dispatch);

      if (action === "pause") {
        setNotice("Disparo pausado. Nenhum novo destinatário será processado até a retomada.");
      } else {
        const result = await runNow();
        setNotice(result.sent > 0
          ? `Disparo iniciado. ${result.sent} e-mail${result.sent === 1 ? "" : "s"} enviado${result.sent === 1 ? "" : "s"} nesta execução.`
          : result.reason === "daily_limit"
            ? "Fila ativa. O limite de 100 envios em 24h já foi atingido e o CRM retomará automaticamente quando houver cota."
            : result.reason === "hourly_limit"
              ? "Fila ativa. O limite da hora já foi atingido e o CRM retomará automaticamente na próxima janela."
              : "Fila ativa. O CRM continuará processando os destinatários automaticamente.");
        await loadCounts();
      }
    } catch (err: any) {
      setError(err?.message || "Não foi possível alterar o disparo.");
    } finally {
      setActing(false);
    }
  }

  const activeQueue = dispatch && ["em_envio", "pausada"].includes(dispatch.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar público da newsletter</DialogTitle>
        </DialogHeader>

        {newsletter && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#A11C27]">Newsletter</p>
            <p className="mt-1 font-bold text-[#1E293F]">{newsletter.title}</p>
            <p className="mt-1 text-sm text-slate-500">{newsletter.subject}</p>
          </div>
        )}

        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-[#1E293F]">De onde virão os destinatários?</h3>
            <p className="mt-1 text-sm text-slate-500">Nesta primeira versão, a lista vem de Clientes e Meus Parceiros. E-mails repetidos são removidos automaticamente.</p>
          </div>

          {loading ? (
            <div className="flex min-h-[150px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando listas…</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <SourceCard
                icon={Users}
                title="Clientes"
                description="Cadastros da guia Clientes"
                checked={selected.clientes}
                onClick={() => toggle("clientes")}
                count={counts?.clientes.valid || 0}
                invalid={counts?.clientes.invalid || 0}
              />
              <SourceCard
                icon={Handshake}
                title="Meus Parceiros"
                description="Parceiros amigos e institucionais"
                checked={selected.parceiros}
                onClick={() => toggle("parceiros")}
                count={counts?.parceiros.valid || 0}
                invalid={counts?.parceiros.invalid || 0}
              />
              <FutureCard icon={UserRoundSearch} title="Leads / Oportunidades" description="Entrará na próxima etapa da segmentação." />
              <FutureCard icon={FileSpreadsheet} title="Importar arquivo" description="CSV/XLSX com uma lista externa de e-mails." />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#B5A573]/35 bg-[#B5A573]/10 p-4 text-sm text-[#1E293F]">
          <div className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" />Regra de disparo definida</div>
          <p className="mt-2 text-slate-600">Cada destinatário receberá um e-mail individual. A fila trabalhará com <strong>até 50 envios por hora</strong> e nunca ultrapassará <strong>100 envios em 24 horas</strong>.</p>
        </div>

        {preview && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Lista conferida</div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Metric label="Destinatários" value={preview.total_unique} />
              <Metric label="Duplicados removidos" value={preview.duplicates_removed} />
              <Metric label="E-mails inválidos" value={preview.invalid_removed} />
            </div>
            {preview.sample?.length > 0 && (
              <div className="mt-4 max-h-36 overflow-y-auto rounded-xl border border-emerald-100 bg-white/80">
                {preview.sample.map((person) => (
                  <div key={`${person.source_type}-${person.email}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                    <span className="truncate font-medium text-slate-700">{person.name || "Sem nome"}</span>
                    <span className="truncate text-slate-500">{person.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dispatch && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Fila de envio</div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-700">{DISPATCH_LABEL[dispatch.status] || dispatch.status}</p>
              </div>
              <div className="text-right text-xs text-blue-700">
                <strong className="text-lg text-[#1E293F]">{dispatch.sent_count}</strong> / {dispatch.total_recipients} enviados
                {dispatch.failed_count > 0 && <p className="text-red-600">{dispatch.failed_count} falha{dispatch.failed_count === 1 ? "" : "s"}</p>}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full rounded-full bg-[#A11C27] transition-all" style={{ width: `${dispatch.total_recipients ? Math.min(100, (dispatch.sent_count / dispatch.total_recipients) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-blue-700">Limite operacional: {dispatch.hourly_limit}/hora • {dispatch.daily_limit}/24h.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {dispatch.status === "pronta" && (
                <Button size="sm" disabled={acting} onClick={() => void changeDispatch("start")}>
                  {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Iniciar disparo
                </Button>
              )}
              {dispatch.status === "em_envio" && (
                <Button size="sm" variant="outline" disabled={acting} onClick={() => void changeDispatch("pause")}>
                  {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}Pausar
                </Button>
              )}
              {dispatch.status === "pausada" && (
                <Button size="sm" disabled={acting} onClick={() => void changeDispatch("resume")}>
                  {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Retomar
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button variant="outline" disabled={loading || previewing || !selectedSources.length || Boolean(activeQueue)} onClick={() => void previewAudience()}>
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conferir lista
          </Button>
          <Button disabled={!preview || queueing || Boolean(activeQueue)} onClick={() => void prepareQueue()}>
            {queueing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Preparar fila de envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({ icon: Icon, title, description, checked, onClick, count, invalid }: {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  onClick: () => void;
  count: number;
  invalid: number;
}) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${checked ? "border-[#A11C27] bg-[#A11C27]/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${checked ? "bg-[#A11C27] text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div>
        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-[#A11C27] bg-[#A11C27] text-white" : "border-slate-300"}`}>{checked && <CheckCircle2 className="h-4 w-4" />}</span>
      </div>
      <h4 className="mt-3 font-bold text-[#1E293F]">{title}</h4>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-3 flex items-center justify-between text-xs"><span className="font-semibold text-emerald-700">{count} com e-mail válido</span>{invalid > 0 && <span className="text-amber-600">{invalid} inválidos</span>}</div>
    </button>
  );
}

function FutureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 opacity-70">
      <div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Icon className="h-5 w-5" /></div><span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Em breve</span></div>
      <h4 className="mt-3 font-bold text-slate-600">{title}</h4>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-white/80 px-3 py-2"><p className="text-xl font-bold text-[#1E293F]">{value}</p><p className="text-[11px] text-slate-500">{label}</p></div>;
}
