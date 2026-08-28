import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Loader2,
  MessageCircle,
  Megaphone,
  Palette,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
  Workflow,
  X,
} from "lucide-react";

type ModuleKey = "brand_kit" | "persona" | "editorial_line" | "autonomy" | "community_manager";

type SettingRow = {
  id: string;
  setting_type: ModuleKey;
  name: string;
  payload: Record<string, any>;
  active: boolean;
  updated_at: string | null;
};

type Draft = {
  name: string;
  active: boolean;
  mode: string;
  field1: string;
  field2: string;
  field3: string;
  field4: string;
  field5: string;
};

const MODULES: Array<{
  key: ModuleKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "brand_kit",
    label: "Brand Kit",
    description: "Identidade visual, voz, cores, fontes e regras da marca.",
    icon: Palette,
  },
  {
    key: "persona",
    label: "Personas",
    description: "Quem queremos atingir, dores, objetivos, objeções e linguagem.",
    icon: Users,
  },
  {
    key: "editorial_line",
    label: "Linha Editorial",
    description: "Pilares, temas, formatos, cadência e regras de conteúdo.",
    icon: Megaphone,
  },
  {
    key: "autonomy",
    label: "Autonomia",
    description: "Até onde a IA pode decidir, aprovar, agendar e publicar.",
    icon: Workflow,
  },
  {
    key: "community_manager",
    label: "Community Manager",
    description: "Tom de respostas, escalonamento e transformação de conversas em pauta.",
    icon: MessageCircle,
  },
];

function moduleLabel(key: ModuleKey) {
  return MODULES.find((item) => item.key === key)?.label || key;
}

function blankDraft(type: ModuleKey): Draft {
  return {
    name:
      type === "autonomy"
        ? "Política de autonomia"
        : type === "community_manager"
          ? "Política do Community Manager"
          : "",
    active: true,
    mode: type === "community_manager" ? "sugerir" : "assistido",
    field1: "",
    field2: "",
    field3: "",
    field4: "",
    field5: "",
  };
}

function payloadFromDraft(type: ModuleKey, draft: Draft) {
  if (type === "brand_kit") {
    return {
      scope: draft.field1.trim(),
      voice: draft.field2.trim(),
      colors: draft.field3.split(",").map((v) => v.trim()).filter(Boolean),
      fonts: draft.field4.trim(),
      visual_rules: draft.field5.trim(),
    };
  }
  if (type === "persona") {
    return {
      profile: draft.field1.trim(),
      pains: draft.field2.trim(),
      goals: draft.field3.trim(),
      objections: draft.field4.trim(),
      products_and_tone: draft.field5.trim(),
    };
  }
  if (type === "editorial_line") {
    return {
      objective: draft.field1.trim(),
      themes: draft.field2.trim(),
      formats: draft.field3.trim(),
      cadence: draft.field4.trim(),
      rules: draft.field5.trim(),
    };
  }
  if (type === "autonomy") {
    return {
      mode: draft.mode,
      approval_rules: draft.field1.trim(),
      auto_publish_rules: draft.field2.trim(),
      sensitive_content_rules: draft.field3.trim(),
      limits: draft.field4.trim(),
      notes: draft.field5.trim(),
    };
  }
  return {
    mode: draft.mode,
    response_tone: draft.field1.trim(),
    escalation_rules: draft.field2.trim(),
    idea_capture_rules: draft.field3.trim(),
    auto_reply_rules: draft.field4.trim(),
    notes: draft.field5.trim(),
  };
}

function draftFromRow(row: SettingRow): Draft {
  const base = blankDraft(row.setting_type);
  const p = row.payload || {};

  if (row.setting_type === "brand_kit") {
    return {
      ...base,
      name: row.name,
      active: row.active,
      field1: p.scope || "",
      field2: p.voice || "",
      field3: Array.isArray(p.colors) ? p.colors.join(", ") : p.colors || "",
      field4: p.fonts || "",
      field5: p.visual_rules || "",
    };
  }
  if (row.setting_type === "persona") {
    return {
      ...base,
      name: row.name,
      active: row.active,
      field1: p.profile || "",
      field2: p.pains || "",
      field3: p.goals || "",
      field4: p.objections || "",
      field5: p.products_and_tone || "",
    };
  }
  if (row.setting_type === "editorial_line") {
    return {
      ...base,
      name: row.name,
      active: row.active,
      field1: p.objective || "",
      field2: p.themes || "",
      field3: p.formats || "",
      field4: p.cadence || "",
      field5: p.rules || "",
    };
  }
  if (row.setting_type === "autonomy") {
    return {
      ...base,
      name: row.name,
      active: row.active,
      mode: p.mode || "assistido",
      field1: p.approval_rules || "",
      field2: p.auto_publish_rules || "",
      field3: p.sensitive_content_rules || "",
      field4: p.limits || "",
      field5: p.notes || "",
    };
  }
  return {
    ...base,
    name: row.name,
    active: row.active,
    mode: p.mode || "sugerir",
    field1: p.response_tone || "",
    field2: p.escalation_rules || "",
    field3: p.idea_capture_rules || "",
    field4: p.auto_reply_rules || "",
    field5: p.notes || "",
  };
}

function fmtDate(value?: string | null) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function ContentSettingsEditor() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft("brand_kit"));
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: authData }, settingsRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("marketing_content_settings")
          .select("id,setting_type,name,payload,active,updated_at")
          .order("setting_type")
          .order("created_at", { ascending: true }),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      setUserId(authData?.user?.id || null);
      setRows((settingsRes.data || []) as SettingRow[]);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar as configurações do cérebro editorial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const activeCounts = useMemo(() => {
    const counts = new Map<ModuleKey, number>();
    rows.forEach((row) => {
      if (row.active) counts.set(row.setting_type, (counts.get(row.setting_type) || 0) + 1);
    });
    return counts;
  }, [rows]);

  function openModule(type: ModuleKey) {
    setActiveModule(type);
    setEditingId(null);
    setDraft(blankDraft(type));
    setError(null);
    setNotice(null);
  }

  function editRow(row: SettingRow) {
    setActiveModule(row.setting_type);
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!activeModule || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const values = {
        setting_type: activeModule,
        name: draft.name.trim(),
        payload: payloadFromDraft(activeModule, draft),
        active: draft.active,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from("marketing_content_settings")
          .update(values)
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("marketing_content_settings")
          .insert({ ...values, created_by: userId });
        if (insertError) throw insertError;
      }

      setNotice(`${moduleLabel(activeModule)} salvo. Configurações ativas já entram no contexto do Max Content.`);
      setEditingId(null);
      setDraft(blankDraft(activeModule));
      await loadSettings();
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row: SettingRow) {
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("marketing_content_settings")
        .update({ active: !row.active, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateError) throw updateError;
      await loadSettings();
    } catch (err: any) {
      setError(err?.message || "Erro ao alterar configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SettingRow) {
    if (!window.confirm(`Excluir a configuração “${row.name}”?`)) return;
    setSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("marketing_content_settings").delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      if (editingId === row.id && activeModule) {
        setEditingId(null);
        setDraft(blankDraft(activeModule));
      }
      await loadSettings();
    } catch (err: any) {
      setError(err?.message || "Erro ao excluir configuração.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[#B5A573]/20 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando cérebro editorial…
      </div>
    );
  }

  return (
    <>
      {error ? <div className="rounded-xl border border-[#A11C27]/30 bg-[#A11C27]/5 px-4 py-3 text-sm text-[#A11C27]">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-4 py-3 text-sm text-[#1E293F]">{notice}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((module) => {
          const Icon = module.icon;
          const count = activeCounts.get(module.key) || 0;
          return (
            <button key={module.key} type="button" onClick={() => openModule(module.key)} className="text-left">
              <Card className="h-full border-[#B5A573]/20 transition hover:-translate-y-0.5 hover:border-[#A11C27]/40 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Icon className="h-5 w-5 text-[#A11C27]" />
                    <span className="rounded-full bg-[#E0CE8C]/20 px-2 py-1 text-xs font-medium text-[#1E293F]">
                      {count} ativa(s)
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-[#1E293F]">{module.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{module.description}</p>
                  <p className="mt-3 text-xs font-medium text-[#A11C27]">Clique para configurar →</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {activeModule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#A11C27]">
                  <Bot className="h-4 w-4" /> Cérebro editorial
                </div>
                <h3 className="mt-1 text-xl font-semibold text-[#1E293F]">{moduleLabel(activeModule)}</h3>
                <p className="mt-1 text-sm text-slate-500">Tudo que estiver ativo aqui passa a orientar o Max Content.</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => setActiveModule(null)} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[.9fr_1.1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#1E293F]">Configurações salvas</p>
                    <p className="text-xs text-slate-500">Você pode manter mais de uma ativa quando fizer sentido.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(blankDraft(activeModule)); }}>
                    <Plus className="mr-1.5 h-4 w-4" /> Nova
                  </Button>
                </div>

                {rows.filter((row) => row.setting_type === activeModule).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[#1E293F]">{row.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.active ? "Ativa e sendo usada pelo Max" : "Inativa"}
                          {row.updated_at ? ` · ${fmtDate(row.updated_at)}` : ""}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {row.active ? "ATIVA" : "INATIVA"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => editRow(row)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => toggle(row)}>
                        <Power className="mr-1.5 h-3.5 w-3.5" /> {row.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving} className="text-[#A11C27]" onClick={() => remove(row)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}

                {!rows.some((row) => row.setting_type === activeModule) ? (
                  <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-[#E0CE8C]/5 p-6 text-center">
                    <p className="font-medium text-[#1E293F]">Ainda não configurado</p>
                    <p className="mt-1 text-sm text-slate-500">Preencha o formulário ao lado e salve a primeira configuração.</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[#B5A573]/25 bg-[#F5F5F5]/60 p-4">
                <p className="font-semibold text-[#1E293F]">{editingId ? "Editar configuração" : "Nova configuração"}</p>
                <div className="mt-4 space-y-3">
                  <Input placeholder="Nome da configuração" value={draft.name} onChange={(e) => setDraft((old) => ({ ...old, name: e.target.value }))} />

                  {activeModule === "brand_kit" ? (
                    <>
                      <Input placeholder="Escopo: Consulmax, marca pessoal Wesley, campanha..." value={draft.field1} onChange={(e) => setDraft((old) => ({ ...old, field1: e.target.value }))} />
                      <Textarea rows={3} placeholder="Tom e voz da marca" value={draft.field2} onChange={(e) => setDraft((old) => ({ ...old, field2: e.target.value }))} />
                      <Input placeholder="Cores oficiais separadas por vírgula" value={draft.field3} onChange={(e) => setDraft((old) => ({ ...old, field3: e.target.value }))} />
                      <Input placeholder="Tipografia / fontes" value={draft.field4} onChange={(e) => setDraft((old) => ({ ...old, field4: e.target.value }))} />
                      <Textarea rows={5} placeholder="Regras visuais: logos, fotografia, composição, proibições..." value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />
                    </>
                  ) : null}

                  {activeModule === "persona" ? (
                    <>
                      <Textarea rows={3} placeholder="Quem é essa persona? Perfil, profissão, renda, contexto..." value={draft.field1} onChange={(e) => setDraft((old) => ({ ...old, field1: e.target.value }))} />
                      <Textarea rows={3} placeholder="Dores e problemas" value={draft.field2} onChange={(e) => setDraft((old) => ({ ...old, field2: e.target.value }))} />
                      <Textarea rows={3} placeholder="Objetivos e desejos" value={draft.field3} onChange={(e) => setDraft((old) => ({ ...old, field3: e.target.value }))} />
                      <Textarea rows={3} placeholder="Objeções, medos e dúvidas" value={draft.field4} onChange={(e) => setDraft((old) => ({ ...old, field4: e.target.value }))} />
                      <Textarea rows={3} placeholder="Soluções mais aderentes + linguagem/tom para falar com ela" value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />
                    </>
                  ) : null}

                  {activeModule === "editorial_line" ? (
                    <>
                      <Textarea rows={3} placeholder="Objetivo deste pilar/linha editorial" value={draft.field1} onChange={(e) => setDraft((old) => ({ ...old, field1: e.target.value }))} />
                      <Textarea rows={3} placeholder="Temas e subtemas" value={draft.field2} onChange={(e) => setDraft((old) => ({ ...old, field2: e.target.value }))} />
                      <Textarea rows={3} placeholder="Formatos e canais prioritários" value={draft.field3} onChange={(e) => setDraft((old) => ({ ...old, field3: e.target.value }))} />
                      <Input placeholder="Cadência / frequência desejada" value={draft.field4} onChange={(e) => setDraft((old) => ({ ...old, field4: e.target.value }))} />
                      <Textarea rows={4} placeholder="Regras: o que fazer, o que evitar, CTA, profundidade..." value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />
                    </>
                  ) : null}

                  {activeModule === "autonomy" ? (
                    <>
                      <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.mode} onChange={(e) => setDraft((old) => ({ ...old, mode: e.target.value }))}>
                        <option value="assistido">Assistido — aprovação humana sempre</option>
                        <option value="semiautomatico">Semiautomático — regras por tipo</option>
                        <option value="autonomo">Autônomo — dentro das regras definidas</option>
                      </select>
                      <Textarea rows={3} placeholder="Quando aprovação humana é obrigatória" value={draft.field1} onChange={(e) => setDraft((old) => ({ ...old, field1: e.target.value }))} />
                      <Textarea rows={3} placeholder="O que pode ser auto-publicado e em quais condições" value={draft.field2} onChange={(e) => setDraft((old) => ({ ...old, field2: e.target.value }))} />
                      <Textarea rows={3} placeholder="Regras para conteúdo financeiro, ofertas e temas sensíveis" value={draft.field3} onChange={(e) => setDraft((old) => ({ ...old, field3: e.target.value }))} />
                      <Input placeholder="Limites: quantidade/dia, horários, redes..." value={draft.field4} onChange={(e) => setDraft((old) => ({ ...old, field4: e.target.value }))} />
                      <Textarea rows={3} placeholder="Observações adicionais" value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />
                    </>
                  ) : null}

                  {activeModule === "community_manager" ? (
                    <>
                      <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.mode} onChange={(e) => setDraft((old) => ({ ...old, mode: e.target.value }))}>
                        <option value="sugerir">Somente sugerir respostas</option>
                        <option value="assistido">Responder após aprovação</option>
                        <option value="automatico">Responder automaticamente dentro das regras</option>
                      </select>
                      <Textarea rows={3} placeholder="Tom das respostas e postura da marca" value={draft.field1} onChange={(e) => setDraft((old) => ({ ...old, field1: e.target.value }))} />
                      <Textarea rows={3} placeholder="Quando escalar para uma pessoa: reclamação, jurídico, lead quente..." value={draft.field2} onChange={(e) => setDraft((old) => ({ ...old, field2: e.target.value }))} />
                      <Textarea rows={3} placeholder="Como transformar comentários/perguntas em novas ideias e pautas" value={draft.field3} onChange={(e) => setDraft((old) => ({ ...old, field3: e.target.value }))} />
                      <Textarea rows={3} placeholder="Quais respostas simples poderão ser automáticas" value={draft.field4} onChange={(e) => setDraft((old) => ({ ...old, field4: e.target.value }))} />
                      <Textarea rows={3} placeholder="Observações adicionais" value={draft.field5} onChange={(e) => setDraft((old) => ({ ...old, field5: e.target.value }))} />
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        A configuração já pode ser definida agora. A execução de comentários/mensagens só será ativada quando a conta social conceder essas permissões.
                      </div>
                    </>
                  ) : null}

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#1E293F]">
                    <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((old) => ({ ...old, active: e.target.checked }))} />
                    Ativa — usar esta configuração no cérebro do Max
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setEditingId(null); setDraft(blankDraft(activeModule)); }}>Limpar</Button>
                  <Button disabled={saving || !draft.name.trim()} onClick={save} className="bg-[#A11C27] hover:bg-[#8b1822]">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
