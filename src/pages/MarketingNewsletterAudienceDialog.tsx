import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Upload,
  UserCog,
  Users,
  UserRoundSearch,
} from "lucide-react";

type NewsletterRef = {
  id: string;
  title: string;
  subject: string;
};

type SourceCount = { total: number; valid: number; invalid: number };
type SourceCounts = {
  clientes: SourceCount;
  parceiros: SourceCount;
  leads: SourceCount;
  usuarios: SourceCount;
};

type SourceKey = keyof SourceCounts;
type ImportedRecipient = { name: string; email: string };

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

const SOURCE_LABEL: Record<string, string> = {
  cliente: "Cliente",
  parceiro: "Parceiro indicador",
  lead: "Lead / Oportunidade",
  usuario: "Usuário / Vendedor",
  arquivo: "Arquivo importado",
  manual: "Teste",
};

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function normalizedKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

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
  const [selected, setSelected] = useState<Record<SourceKey, boolean>>({
    clientes: true,
    parceiros: true,
    leads: false,
    usuarios: false,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [acting, setActing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedRecipients, setImportedRecipients] = useState<ImportedRecipient[]>([]);
  const [importedFileName, setImportedFileName] = useState("");
  const [importedInvalid, setImportedInvalid] = useState(0);
  const [testEmail, setTestEmail] = useState("");
  const [testName, setTestName] = useState("");
  const [testOnly, setTestOnly] = useState(false);

  const selectedSources = useMemo(() => (
    (Object.keys(selected) as SourceKey[]).filter((source) => selected[source])
  ), [selected]);

  useEffect(() => {
    if (!open || !newsletter) return;
    setPreview(null);
    setNotice(null);
    setError(null);
    setTestOnly(false);
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
      if (!testEmail && body.current_user_email) setTestEmail(String(body.current_user_email));
      if (!testName && body.current_user_name) setTestName(String(body.current_user_name));
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar as listas.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(source: SourceKey) {
    setSelected((current) => ({ ...current, [source]: !current[source] }));
    setTestOnly(false);
    setPreview(null);
  }

  function audiencePayload(forceTestOnly = testOnly) {
    if (forceTestOnly) {
      return {
        sources: [],
        imported_recipients: [],
        manual_recipient: { name: testName.trim(), email: normalizeEmail(testEmail) },
      };
    }
    return {
      sources: selectedSources,
      imported_recipients: importedRecipients,
      manual_recipient: null,
    };
  }

  async function previewAudience(forceTestOnly = testOnly) {
    if (forceTestOnly && !validEmail(normalizeEmail(testEmail))) {
      return setError("Informe um e-mail válido para o teste.");
    }
    if (!forceTestOnly && !selectedSources.length && !importedRecipients.length) {
      return setError("Selecione pelo menos uma lista ou importe um arquivo.");
    }

    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await api("/api/marketing/newsletter-audience", {
        method: "POST",
        body: JSON.stringify({ action: "preview", ...audiencePayload(forceTestOnly) }),
      });
      setPreview(body as Preview);
      setTestOnly(forceTestOnly);
      if (forceTestOnly) setNotice(`Modo teste ativo: somente ${normalizeEmail(testEmail)} será colocado na fila.`);
    } catch (err: any) {
      setError(err?.message || "Não foi possível preparar a prévia.");
    } finally {
      setPreviewing(false);
    }
  }

  async function prepareQueue() {
    if (!newsletter || !preview) return;
    if (testOnly && !validEmail(normalizeEmail(testEmail))) return setError("Informe um e-mail válido para o teste.");

    setQueueing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await api("/api/marketing/newsletter-audience", {
        method: "POST",
        body: JSON.stringify({
          action: "queue",
          newsletter_id: newsletter.id,
          ...audiencePayload(testOnly),
        }),
      });
      setDispatch(body.dispatch as Dispatch);
      setPreview((current) => current ? { ...current, total_unique: body.total_unique } : current);
      setNotice(testOnly
        ? `Fila de teste preparada somente para ${normalizeEmail(testEmail)}. Clique em Iniciar disparo.`
        : "Fila preparada. Revise os números e clique em Iniciar disparo.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível criar a fila de envio.");
    } finally {
      setQueueing(false);
    }
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const XLSX = await import("xlsx");
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("O arquivo não possui nenhuma planilha.");
      const sheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!rows.length) throw new Error("Nenhum registro foi encontrado no arquivo.");

      const recipients: ImportedRecipient[] = [];
      let invalid = 0;
      const seen = new Set<string>();

      for (const row of rows.slice(0, 5000)) {
        const entries = Object.entries(row);
        const emailEntry = entries.find(([key]) => ["email", "emailprincipal", "correioeletronico"].includes(normalizedKey(key)));
        const nameEntry = entries.find(([key]) => ["nome", "nomecompleto", "cliente", "contato", "name"].includes(normalizedKey(key)));
        const fallbackEmail = entries.map(([, value]) => normalizeEmail(value)).find(validEmail) || "";
        const email = normalizeEmail(emailEntry?.[1] || fallbackEmail);
        const name = String(nameEntry?.[1] || "").trim();

        if (!validEmail(email)) {
          invalid += 1;
          continue;
        }
        if (seen.has(email)) continue;
        seen.add(email);
        recipients.push({ name, email });
      }

      if (rows.length > 5000) invalid += rows.length - 5000;
      if (!recipients.length) throw new Error("Não encontrei nenhum e-mail válido no arquivo. Use uma coluna chamada E-mail ou Email.");

      setImportedRecipients(recipients);
      setImportedInvalid(invalid);
      setImportedFileName(file.name);
      setTestOnly(false);
      setPreview(null);
      setNotice(`${recipients.length} e-mail${recipients.length === 1 ? "" : "s"} válido${recipients.length === 1 ? "" : "s"} importado${recipients.length === 1 ? "" : "s"} de ${file.name}.`);
    } catch (err: any) {
      setImportedRecipients([]);
      setImportedInvalid(0);
      setImportedFileName("");
      setError(err?.message || "Não foi possível ler o arquivo.");
    } finally {
      setImporting(false);
    }
  }

  function clearImport() {
    setImportedRecipients([]);
    setImportedInvalid(0);
    setImportedFileName("");
    setPreview(null);
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
  const canPreview = testOnly ? validEmail(normalizeEmail(testEmail)) : selectedSources.length > 0 || importedRecipients.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
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
            <p className="mt-1 text-sm text-slate-500">Você pode combinar as listas. E-mails repetidos são removidos automaticamente antes da fila ser criada.</p>
          </div>

          {loading ? (
            <div className="flex min-h-[150px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando listas…</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SourceCard
                icon={Users}
                title="Clientes"
                description="Cadastros da guia Clientes"
                checked={selected.clientes && !testOnly}
                onClick={() => toggle("clientes")}
                count={counts?.clientes.valid || 0}
                invalid={counts?.clientes.invalid || 0}
              />
              <SourceCard
                icon={Handshake}
                title="Meus Parceiros"
                description="Parceiros amigos e institucionais"
                checked={selected.parceiros && !testOnly}
                onClick={() => toggle("parceiros")}
                count={counts?.parceiros.valid || 0}
                invalid={counts?.parceiros.invalid || 0}
              />
              <SourceCard
                icon={UserRoundSearch}
                title="Leads / Oportunidades"
                description="Leads cadastrados no funil comercial"
                checked={selected.leads && !testOnly}
                onClick={() => toggle("leads")}
                count={counts?.leads.valid || 0}
                invalid={counts?.leads.invalid || 0}
              />
              <SourceCard
                icon={UserCog}
                title="Usuários / Vendedores"
                description="Usuários ativos da guia Usuários"
                checked={selected.usuarios && !testOnly}
                onClick={() => toggle("usuarios")}
                count={counts?.usuarios.valid || 0}
                invalid={counts?.usuarios.invalid || 0}
              />

              <div className={`rounded-2xl border p-4 ${importedRecipients.length && !testOnly ? "border-[#A11C27] bg-[#A11C27]/5 shadow-sm" : "border-slate-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${importedRecipients.length && !testOnly ? "bg-[#A11C27] text-white" : "bg-slate-100 text-slate-500"}`}><FileSpreadsheet className="h-5 w-5" /></div>
                  {importedRecipients.length > 0 && !testOnly && <CheckCircle2 className="h-5 w-5 text-[#A11C27]" />}
                </div>
                <h4 className="mt-3 font-bold text-[#1E293F]">Importar arquivo</h4>
                <p className="mt-1 text-xs text-slate-500">CSV ou XLSX com nome e e-mail. Aceita até 5.000 linhas.</p>
                {importedFileName && (
                  <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs">
                    <p className="truncate font-semibold text-slate-700">{importedFileName}</p>
                    <p className="mt-1 text-emerald-700">{importedRecipients.length} e-mails válidos</p>
                    {importedInvalid > 0 && <p className="text-amber-600">{importedInvalid} linhas sem e-mail válido</p>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {importedRecipients.length ? "Trocar arquivo" : "Selecionar arquivo"}
                    <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importing} onChange={(event) => void handleImport(event.target.files?.[0] || null)} />
                  </label>
                  {importedRecipients.length > 0 && <Button size="sm" variant="ghost" type="button" onClick={clearImport}>Remover</Button>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border p-4 ${testOnly ? "border-[#A11C27] bg-[#A11C27]/5" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-2 font-semibold text-[#1E293F]"><Mail className="h-4 w-4" />Teste com um único e-mail</div>
          <p className="mt-1 text-xs text-slate-500">Use esta opção antes do primeiro disparo. Ao ativar, nenhuma das listas acima será incluída.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
            <Input value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="Nome (opcional)" />
            <Input type="email" value={testEmail} onChange={(event) => { setTestEmail(event.target.value); setPreview(null); }} placeholder="seuemail@exemplo.com" />
            <Button type="button" variant={testOnly ? "default" : "outline"} disabled={previewing || !validEmail(normalizeEmail(testEmail)) || Boolean(activeQueue)} onClick={() => void previewAudience(true)}>
              {previewing && testOnly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Somente este e-mail
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#B5A573]/35 bg-[#B5A573]/10 p-4 text-sm text-[#1E293F]">
          <div className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" />Regra de disparo definida</div>
          <p className="mt-2 text-slate-600">Cada destinatário receberá um e-mail individual. A fila trabalhará com <strong>até 50 envios por hora</strong> e nunca ultrapassará <strong>100 envios em 24 horas</strong>.</p>
        </div>

        {preview && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Lista conferida</div>
              {testOnly && <span className="rounded-full bg-[#A11C27]/10 px-2.5 py-1 text-[11px] font-semibold text-[#A11C27]">TESTE • 1 DESTINATÁRIO</span>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Metric label="Destinatários" value={preview.total_unique} />
              <Metric label="Duplicados removidos" value={preview.duplicates_removed} />
              <Metric label="E-mails inválidos" value={preview.invalid_removed} />
            </div>
            {preview.sample?.length > 0 && (
              <div className="mt-4 max-h-44 overflow-y-auto rounded-xl border border-emerald-100 bg-white/80">
                {preview.sample.map((person) => (
                  <div key={`${person.source_type}-${person.email}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-slate-700">{person.name || "Sem nome"}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{SOURCE_LABEL[person.source_type] || person.source_type}</span>
                    </div>
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
          <Button variant="outline" disabled={loading || previewing || !canPreview || Boolean(activeQueue)} onClick={() => void previewAudience(testOnly)}>
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conferir lista
          </Button>
          <Button disabled={!preview || queueing || Boolean(activeQueue)} onClick={() => void prepareQueue()}>
            {queueing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {testOnly ? "Preparar teste" : "Preparar fila de envio"}
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
      <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-emerald-700">{count} com e-mail válido</span>{invalid > 0 && <span className="text-amber-600">{invalid} inválidos</span>}</div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-white/80 px-3 py-2"><p className="text-xl font-bold text-[#1E293F]">{value}</p><p className="text-[11px] text-slate-500">{label}</p></div>;
}
