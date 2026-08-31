import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Palette,
  RefreshCcw,
  Settings2,
  Sparkles,
  Unplug,
  UploadCloud,
  WandSparkles,
} from "lucide-react";

type CanvaStatus = {
  configured: boolean;
  missing: string[];
  callback_url: string;
  scopes: string[];
  connection: any | null;
  mappings: any[];
  mapped_count: number;
  total_mappings: number;
};

type Props = {
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onChanged?: () => Promise<void> | void;
};

const FAMILY_LABEL: Record<string, string> = {
  educativo_premium: "Carrossel — Educativo Premium",
  comparacao: "Carrossel — Comparação",
  storytelling: "Carrossel — Storytelling",
  educativo: "Stories — Educativo",
  conversa: "Stories — Conversa / Enquete",
  autoridade: "Post — Autoridade",
  thumbnail: "Thumbnail / Capa",
};

async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.message || payload?.detail?.message || "Falha na integração Canva.") as Error & { payload?: any };
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function CanvaProductionStatusBar({ onNotice, onError, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const payload = await authFetch("/api/marketing/canva-connect");
      const next = payload as CanvaStatus;
      setStatus(next);
      setValues(Object.fromEntries((next.mappings || []).map((mapping: any) => [
        mapping.id,
        mapping.canva_brand_template_id || mapping.canva_source_design_id || "",
      ])));
    } catch (error: any) {
      onError?.(error?.message || "Erro ao carregar a integração Canva.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function connect() {
    setBusy(true);
    try {
      const payload = await authFetch("/api/marketing/canva-connect", {
        method: "POST",
        body: JSON.stringify({ action: "connect" }),
      });
      if (!payload.auth_url) throw new Error("O Canva não retornou a URL de autorização.");
      window.location.href = payload.auth_url;
    } catch (error: any) {
      const missing = error?.payload?.missing;
      if (Array.isArray(missing) && missing.length) {
        onError?.(`Canva ainda não configurado no backend. Faltam: ${missing.join(", ")}.`);
      } else {
        onError?.(error?.message || "Não foi possível conectar o Canva.");
      }
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar o Canva do CRM? Os designs já criados não serão apagados do Canva.")) return;
    setBusy(true);
    try {
      await authFetch("/api/marketing/canva-connect", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      onNotice?.("Canva desconectado do CRM.");
      await load();
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao desconectar o Canva.");
    } finally {
      setBusy(false);
    }
  }

  async function loadTemplates() {
    setBusy(true);
    try {
      const payload = await authFetch("/api/marketing/canva-production", {
        method: "POST",
        body: JSON.stringify({ action: "list_templates" }),
      });
      const list = payload?.templates?.items || payload?.templates?.brand_templates || [];
      setTemplates(Array.isArray(list) ? list : []);
      setShowSetup(true);
    } catch (error: any) {
      onError?.(error?.message || "Erro ao listar templates do Canva.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping(mapping: any) {
    const value = String(values[mapping.id] || "").trim();
    setBusy(true);
    try {
      await authFetch("/api/marketing/canva-production", {
        method: "POST",
        body: JSON.stringify({
          action: "map_template",
          mapping_id: mapping.id,
          canva_brand_template_id: value.startsWith("BTM") ? value : "",
          canva_source_design_id: value && !value.startsWith("BTM") ? value : "",
        }),
      });
      onNotice?.(`${FAMILY_LABEL[mapping.template_family] || mapping.template_family} atualizado.`);
      await load();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao mapear o template Canva.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#B5A573]/25 bg-white p-4 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando Canva…</div>;
  }

  const connected = status?.connection?.status === "connected";

  return (
    <div className="rounded-2xl border border-[#1E293F]/15 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#1E293F] p-2 text-white"><Palette className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#1E293F]">Canva · Estúdio visual oficial</p>
              {connected ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">CONECTADO</span> : null}
              {!status?.configured ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">CONFIGURAÇÃO PENDENTE</span> : null}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">O Max prepara a tese, copy e direção criativa. O Canva passa a ser a camada oficial de composição e acabamento. O renderizador local continua apenas como fallback/prévia rápida.</p>
            {connected ? <p className="mt-2 text-xs text-slate-500">{status?.connection?.display_name || "Conta Canva"} · {status?.mapped_count || 0}/{status?.total_mappings || 0} famílias de templates mapeadas.</p> : null}
            {!status?.configured ? <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><strong>Para ativar no CRM:</strong> configure {status?.missing?.join(" e ") || "as credenciais Canva"} na Vercel e cadastre o callback <code className="break-all">{status?.callback_url}</code> no app Canva.</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.configured && !connected ? <Button disabled={busy} onClick={connect} className="bg-[#1E293F] hover:bg-[#26344f]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Conectar Canva</Button> : null}
          {connected ? <>
            <Button variant="outline" disabled={busy} onClick={loadTemplates}><Settings2 className="mr-2 h-4 w-4" />Templates</Button>
            <Button variant="outline" disabled={busy} onClick={load}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
            <Button variant="outline" disabled={busy} onClick={disconnect}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>
          </> : null}
        </div>
      </div>

      {showSetup && connected ? <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-[#1E293F]">Templates-mãe</p><p className="mt-1 text-xs leading-5 text-slate-500">Use um Brand Template (ID iniciado em BTM) para automação completa. Também é possível mapear um Design ID como referência/cópia. Campos de Autofill recomendados: P1_TITLE, P1_BODY, P1_BULLET_1, P1_CTA, P2_TITLE…</p></div>
          <button type="button" onClick={() => setShowSetup(false)} className="text-xs text-slate-500 hover:text-[#1E293F]">Fechar</button>
        </div>
        {templates.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-[#B5A573]/40 bg-[#E0CE8C]/10 px-3 py-3 text-xs text-slate-600">Nenhum Brand Template foi retornado pela conta Canva. Você pode criar os modelos-mãe no Canva ou mapear temporariamente um Design ID existente.</div> : null}
        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {(status?.mappings || []).map((mapping: any) => (
            <div key={mapping.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[#1E293F]">{mapping.metadata?.label || FAMILY_LABEL[mapping.template_family] || mapping.template_family}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">{mapping.format}</p></div>{mapping.canva_brand_template_id || mapping.canva_source_design_id ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}</div>
              <input list="canva-brand-templates" className="mt-2 h-9 w-full rounded-md border border-slate-200 px-2.5 text-xs" value={values[mapping.id] || ""} onChange={(event) => setValues((current) => ({ ...current, [mapping.id]: event.target.value }))} placeholder="BTM... ou Design ID D..." />
              <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => saveMapping(mapping)}>Salvar mapeamento</Button>
            </div>
          ))}
        </div>
        <datalist id="canva-brand-templates">{templates.map((template: any) => <option key={template.id} value={template.id}>{template.title || template.name || template.id}</option>)}</datalist>
      </div> : null}
    </div>
  );
}

export function CanvaOrderActions({ order, onNotice, onError, onChanged }: { order: any } & Props) {
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [instructions, setInstructions] = useState("");

  const supported = useMemo(() => ["carrossel", "stories", "status", "post", "reel", "short", "youtube_long", "video"].includes(String(order?.format || "")), [order?.format]);
  if (!supported) return null;

  async function getCreativeSpec(refineInstructions?: string) {
    const current = order.metadata?.canva_creative_spec || order.metadata?.visual_spec_v2 || null;
    const assetKind = ["reel", "short", "youtube_long", "video"].includes(String(order.format)) ? "thumbnail" : "static";
    if (current && !refineInstructions) return current;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada.");
    const response = await fetch("/api/marketing/production-visual", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        production_order_id: order.id,
        action: current && refineInstructions ? "refine" : "create",
        asset_kind: assetKind,
        current_spec: current,
        instructions: refineInstructions || "",
        target: "all",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "Falha ao preparar a direção criativa.");
    return payload.result;
  }

  async function createInCanva(refineInstructions?: string) {
    setBusy(true);
    try {
      const spec = await getCreativeSpec(refineInstructions);
      const payload = await authFetch("/api/marketing/canva-production", {
        method: "POST",
        body: JSON.stringify({ action: "create", production_order_id: order.id, creative_spec: spec }),
      });
      const suffix = payload?.mode === "autofill" ? "com conteúdo preenchido automaticamente" : "como cópia editável do template";
      onNotice?.(`Design Canva ${payload?.revision ? `V${String(payload.revision).padStart(2, "0")}` : ""} criado ${suffix}.`);
      setAdjusting(false);
      setInstructions("");
      await onChanged?.();
    } catch (error: any) {
      if (error?.payload?.code === "template_not_configured") {
        onError?.("Esta família ainda não possui template Canva mapeado. Abra Templates no topo da Produção e associe um Brand Template ou Design ID.");
      } else {
        onError?.(error?.message || "Erro ao produzir no Canva.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await authFetch("/api/marketing/canva-production", { method: "POST", body: JSON.stringify({ action: "refresh", production_order_id: order.id }) });
      onNotice?.("Design Canva sincronizado.");
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao sincronizar o Canva.");
    } finally { setBusy(false); }
  }

  async function importFinal() {
    setBusy(true);
    try {
      const payload = await authFetch("/api/marketing/canva-production", { method: "POST", body: JSON.stringify({ action: "import", production_order_id: order.id }) });
      onNotice?.(`${payload.count || 0} arquivo(s) final(is) importado(s) do Canva para esta Ordem de Produção.`);
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao importar a versão final do Canva.");
    } finally { setBusy(false); }
  }

  const designId = order.metadata?.canva_design_id;
  const editUrl = order.metadata?.canva_edit_url;

  return <div className="contents">
    {!designId ? <Button disabled={busy} onClick={() => createInCanva()} className="bg-[#7D2AE8] text-white hover:bg-[#6b22c8]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}Produzir no Canva</Button> : <>
      {editUrl ? <Button variant="outline" disabled={busy} onClick={() => window.open(editUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Abrir no Canva</Button> : null}
      <Button variant="outline" disabled={busy} onClick={refresh}><RefreshCcw className="mr-2 h-4 w-4" />Sincronizar Canva</Button>
      <Button disabled={busy} onClick={importFinal} className="bg-[#7D2AE8] text-white hover:bg-[#6b22c8]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Importar versão final</Button>
      <Button variant="outline" disabled={busy} onClick={() => setAdjusting((value) => !value)}><WandSparkles className="mr-2 h-4 w-4" />Ajustar via Max</Button>
    </>}
    {adjusting ? <div className="basis-full w-full rounded-xl border border-[#7D2AE8]/20 bg-[#7D2AE8]/[0.025] p-3"><p className="text-xs font-semibold text-[#1E293F]">Nova versão Canva orientada pelo Max</p><p className="mt-1 text-[11px] text-slate-500">O design atual é preservado. O Max refaz a direção criativa com sua orientação e cria uma nova revisão no Canva.</p><Textarea rows={3} className="mt-2" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Ex.: quero a capa com menos texto, mais impacto e uma comparação visual no card 3." /><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAdjusting(false)}>Cancelar</Button><Button size="sm" disabled={busy || !instructions.trim()} onClick={() => createInCanva(instructions.trim())} className="bg-[#7D2AE8] text-white hover:bg-[#6b22c8]"><Sparkles className="mr-2 h-3.5 w-3.5" />Criar nova versão</Button></div></div> : null}
  </div>;
}