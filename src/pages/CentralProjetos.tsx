import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";

type Status = "ativo" | "planejamento" | "andamento" | "aguardando" | "pausado" | "concluido" | "cancelado";
type Priority = "baixa" | "media" | "alta" | "critica";

type Space = {
  id: string;
  name: string;
  objective: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Phase = {
  id: string;
  space_id: string;
  name: string;
  objective: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  status: Status;
};

type Step = {
  id: string;
  phase_id: string;
  name: string;
  objective: string | null;
  description: string | null;
  responsible_id: string | null;
  priority: Priority;
  status: Status;
  sort_order: number;
  due_date: string | null;
};

type Checklist = {
  id: string;
  step_id: string;
  title: string;
  sort_order: number;
};

type ChecklistItem = {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  is_done: boolean;
  responsible_id: string | null;
  priority: Priority;
  sort_order: number;
  due_date: string | null;
  completed_at: string | null;
};

type ModalKind = "space" | "phase" | "step" | "ai" | null;

const BRAND = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
  neutral: "#F5F5F5",
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ativo: "Ativo",
    planejamento: "Planejamento",
    andamento: "Em andamento",
    aguardando: "Aguardando",
    pausado: "Pausado",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  return labels[status] || status;
}

function priorityLabel(priority: Priority) {
  const labels: Record<Priority, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
    critica: "Crítica",
  };
  return labels[priority];
}

function priorityClass(priority: Priority) {
  if (priority === "critica") return "border-[#A11C27]/25 bg-[#A11C27]/10 text-[#A11C27]";
  if (priority === "alta") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "media") return "border-[#B5A573]/30 bg-[#B5A573]/15 text-[#7a6e43]";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusClass(status: string) {
  if (status === "concluido") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "andamento") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "aguardando") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "pausado") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "cancelado") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-white text-[#1E293F]";
}

function progress(done: number, total: number) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function defaultAiPhases(description: string) {
  const lower = description.toLowerCase();
  if (lower.includes("parceir")) {
    return [
      {
        name: "Planejamento",
        objective: "Definir o modelo estratégico antes da execução.",
        steps: [
          ["Diagnóstico", ["Levantar parceiros atuais", "Verificar produção dos últimos 12 meses", "Verificar produção dos últimos 90 dias", "Classificar potencial", "Definir categoria futura", "Elaborar plano individual"]],
          ["Segmentação da Base", ["Definir Grupo A", "Definir Grupo B", "Definir Grupo C", "Definir Grupo D", "Definir estratégia por grupo"]],
          ["Estrutura do Programa", ["Definir objetivo", "Definir níveis", "Definir responsabilidades", "Definir benefícios", "Validar estrutura"]],
        ],
      },
      {
        name: "Jurídico e Processos",
        objective: "Formalizar regras, contratos e governança.",
        steps: [
          ["Contrato de Parceria", ["Definir escopo", "Definir cláusulas de comissão", "Definir uso da marca", "Revisão jurídica"]],
          ["Política Comercial", ["Definir padrão de atendimento", "Definir regras de CRM", "Definir conflitos entre parceiros"]],
        ],
      },
      {
        name: "Materiais",
        objective: "Criar biblioteca comercial e institucional.",
        steps: [
          ["Apresentação Institucional", ["Estruturar conteúdo", "Criar no Canva", "Revisar identidade visual", "Aprovar versão final"]],
          ["Kit do Parceiro", ["Criar scripts", "Criar FAQ", "Criar materiais de WhatsApp", "Criar materiais de Instagram"]],
        ],
      },
      {
        name: "Implantação",
        objective: "Colocar o programa em funcionamento com a base atual.",
        steps: [
          ["Relançamento", ["Agendar reunião", "Apresentar novo modelo", "Coletar aceite", "Definir primeiros planos individuais"]],
          ["Integração", ["Liberar acessos", "Adicionar ao grupo", "Treinamento inicial", "Primeira reunião individual"]],
        ],
      },
      {
        name: "Operação",
        objective: "Manter o programa vivo e mensurável.",
        steps: [
          ["Rotina Semanal", ["Reunião comercial", "Acompanhamento de pipeline", "Revisão de metas", "Ranking"]],
          ["Desenvolvimento", ["Plano de recuperação", "Mentorias", "Promoções de categoria", "Avaliação trimestral"]],
        ],
      },
    ];
  }

  return [
    { name: "Planejamento", objective: "Definir escopo, objetivos e entregáveis.", steps: [["Escopo do Projeto", ["Definir objetivo", "Definir responsáveis", "Definir prazos", "Validar entregáveis"]]] },
    { name: "Execução", objective: "Executar as etapas principais do projeto.", steps: [["Execução Inicial", ["Criar primeira entrega", "Validar funcionamento", "Ajustar pontos pendentes"]]] },
    { name: "Implantação", objective: "Colocar o projeto em funcionamento.", steps: [["Go-live", ["Realizar testes", "Publicar versão final", "Comunicar envolvidos"]]] },
    { name: "Operação", objective: "Acompanhar resultados e melhorias.", steps: [["Acompanhamento", ["Medir indicadores", "Coletar feedback", "Criar melhorias"]]] },
  ];
}

export default function CentralProjetos() {
  const [userId, setUserId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Record<string, boolean>>({});
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalPhaseId, setModalPhaseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [spaceForm, setSpaceForm] = useState({ name: "", objective: "", description: "", icon: "📁", color: BRAND.red });
  const [phaseForm, setPhaseForm] = useState({ name: "", objective: "", icon: "📌", color: BRAND.navy });
  const [stepForm, setStepForm] = useState({ name: "", objective: "", description: "", priority: "media" as Priority, due_date: "" });
  const [aiForm, setAiForm] = useState({ description: "", includeSteps: true });
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data.user?.id ?? null);
      await loadSpaces(data.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSpaceId) loadProjectTree(selectedSpaceId);
    else {
      setPhases([]);
      setSteps([]);
      setChecklists([]);
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpaceId]);

  const selectedSpace = useMemo(() => spaces.find((s) => s.id === selectedSpaceId) || null, [spaces, selectedSpaceId]);
  const selectedStep = useMemo(() => steps.find((s) => s.id === selectedStepId) || null, [steps, selectedStepId]);

  const filteredSpaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spaces;
    return spaces.filter((s) => `${s.name} ${s.objective || ""}`.toLowerCase().includes(q));
  }, [spaces, search]);

  const phaseStats = useMemo(() => {
    const map: Record<string, { total: number; done: number; progress: number }> = {};
    for (const phase of phases) {
      const phaseStepIds = steps.filter((s) => s.phase_id === phase.id).map((s) => s.id);
      const checklistIds = checklists.filter((c) => phaseStepIds.includes(c.step_id)).map((c) => c.id);
      const phaseItems = items.filter((i) => checklistIds.includes(i.checklist_id));
      const done = phaseItems.filter((i) => i.is_done).length;
      map[phase.id] = { total: phaseItems.length, done, progress: progress(done, phaseItems.length) };
    }
    return map;
  }, [phases, steps, checklists, items]);

  const spaceStats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.is_done).length;
    const delayed = items.filter((i) => i.due_date && !i.is_done && new Date(i.due_date) < new Date()).length;
    return {
      phases: phases.length,
      steps: steps.length,
      checklists: checklists.length,
      total,
      done,
      delayed,
      progress: progress(done, total),
    };
  }, [phases, steps, checklists, items]);

  async function loadSpaces(currentUserId = userId) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("project_spaces")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as Space[];
    setSpaces(rows);
    if (!selectedSpaceId && rows.length) setSelectedSpaceId(rows[0].id);
    setLoading(false);
  }

  async function loadProjectTree(spaceId: string) {
    setLoading(true);
    setError(null);

    const { data: phaseRows, error: phaseError } = await supabase
      .from("project_phases")
      .select("*")
      .eq("space_id", spaceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (phaseError) {
      setError(phaseError.message);
      setLoading(false);
      return;
    }

    const phaseList = (phaseRows || []) as Phase[];
    setPhases(phaseList);

    const phaseIds = phaseList.map((p) => p.id);
    if (!phaseIds.length) {
      setSteps([]);
      setChecklists([]);
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: stepRows, error: stepError } = await supabase
      .from("project_steps")
      .select("*")
      .in("phase_id", phaseIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (stepError) {
      setError(stepError.message);
      setLoading(false);
      return;
    }

    const stepList = (stepRows || []) as Step[];
    setSteps(stepList);

    const stepIds = stepList.map((s) => s.id);
    if (!stepIds.length) {
      setChecklists([]);
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: checklistRows, error: checklistError } = await supabase
      .from("project_checklists")
      .select("*")
      .in("step_id", stepIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (checklistError) {
      setError(checklistError.message);
      setLoading(false);
      return;
    }

    const checklistList = (checklistRows || []) as Checklist[];
    setChecklists(checklistList);

    const checklistIds = checklistList.map((c) => c.id);
    if (!checklistIds.length) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: itemRows, error: itemError } = await supabase
      .from("project_checklist_items")
      .select("*")
      .in("checklist_id", checklistIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemError) {
      setError(itemError.message);
      setLoading(false);
      return;
    }

    setItems((itemRows || []) as ChecklistItem[]);
    setLoading(false);
  }

  function resetForms() {
    setSpaceForm({ name: "", objective: "", description: "", icon: "📁", color: BRAND.red });
    setPhaseForm({ name: "", objective: "", icon: "📌", color: BRAND.navy });
    setStepForm({ name: "", objective: "", description: "", priority: "media", due_date: "" });
    setAiForm({ description: "", includeSteps: true });
    setModalPhaseId(null);
  }

  function closeModal() {
    setModal(null);
    resetForms();
  }

  async function createSpace() {
    const name = spaceForm.name.trim();
    if (!name) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("project_spaces")
      .insert({
        name,
        objective: spaceForm.objective.trim() || null,
        description: spaceForm.description.trim() || null,
        icon: spaceForm.icon || "📁",
        color: spaceForm.color || BRAND.red,
        status: "ativo",
        owner_id: userId,
        created_by: userId,
      })
      .select("*")
      .single();

    setSaving(false);
    if (error) return setError(error.message);
    setSpaces((prev) => [data as Space, ...prev]);
    setSelectedSpaceId((data as Space).id);
    closeModal();
  }

  async function createPhase() {
    if (!selectedSpaceId) return;
    const name = phaseForm.name.trim();
    if (!name) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("project_phases")
      .insert({
        space_id: selectedSpaceId,
        name,
        objective: phaseForm.objective.trim() || null,
        icon: phaseForm.icon || "📌",
        color: phaseForm.color || BRAND.navy,
        sort_order: phases.length + 1,
        status: "planejamento",
        created_by: userId,
      })
      .select("*")
      .single();

    setSaving(false);
    if (error) return setError(error.message);
    setPhases((prev) => [...prev, data as Phase]);
    setExpandedPhaseIds((prev) => ({ ...prev, [(data as Phase).id]: true }));
    closeModal();
  }

  async function createStep() {
    const phaseId = modalPhaseId;
    const name = stepForm.name.trim();
    if (!phaseId || !name) return;
    setSaving(true);
    const phaseSteps = steps.filter((s) => s.phase_id === phaseId);
    const { data, error } = await supabase
      .from("project_steps")
      .insert({
        phase_id: phaseId,
        name,
        objective: stepForm.objective.trim() || null,
        description: stepForm.description.trim() || null,
        priority: stepForm.priority,
        status: "planejamento",
        sort_order: phaseSteps.length + 1,
        due_date: stepForm.due_date || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error) {
      setSaving(false);
      return setError(error.message);
    }

    const step = data as Step;
    const { data: checklist, error: checklistError } = await supabase
      .from("project_checklists")
      .insert({ step_id: step.id, title: "Checklist", sort_order: 1, created_by: userId })
      .select("*")
      .single();

    setSaving(false);
    if (checklistError) return setError(checklistError.message);

    setSteps((prev) => [...prev, step]);
    setChecklists((prev) => [...prev, checklist as Checklist]);
    setSelectedStepId(step.id);
    closeModal();
  }

  async function createChecklist() {
    if (!selectedStepId) return;
    const title = newChecklistTitle.trim() || "Checklist";
    const existing = checklists.filter((c) => c.step_id === selectedStepId);
    const { data, error } = await supabase
      .from("project_checklists")
      .insert({ step_id: selectedStepId, title, sort_order: existing.length + 1, created_by: userId })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setChecklists((prev) => [...prev, data as Checklist]);
    setNewChecklistTitle("");
  }

  async function createChecklistItem(checklistId: string) {
    const title = (newItemTitle[checklistId] || "").trim();
    if (!title) return;
    const existing = items.filter((i) => i.checklist_id === checklistId);
    const { data, error } = await supabase
      .from("project_checklist_items")
      .insert({ checklist_id: checklistId, title, sort_order: existing.length + 1, created_by: userId })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setItems((prev) => [...prev, data as ChecklistItem]);
    setNewItemTitle((prev) => ({ ...prev, [checklistId]: "" }));
  }

  async function toggleItem(item: ChecklistItem) {
    const nextDone = !item.is_done;
    const { data, error } = await supabase
      .from("project_checklist_items")
      .update({ is_done: nextDone, completed_at: nextDone ? new Date().toISOString() : null })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error) return setError(error.message);
    setItems((prev) => prev.map((i) => (i.id === item.id ? (data as ChecklistItem) : i)));
  }

  async function removeSpace(spaceId: string) {
    if (!confirm("Deseja excluir este espaço e tudo dentro dele?")) return;
    const { error } = await supabase.from("project_spaces").delete().eq("id", spaceId);
    if (error) return setError(error.message);
    setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
    if (selectedSpaceId === spaceId) setSelectedSpaceId(null);
  }

  async function removePhase(phaseId: string) {
    if (!confirm("Excluir esta fase e todas as etapas dentro dela?")) return;
    const { error } = await supabase.from("project_phases").delete().eq("id", phaseId);
    if (error) return setError(error.message);
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
    setSteps((prev) => prev.filter((s) => s.phase_id !== phaseId));
  }

  async function removeStep(stepId: string) {
    if (!confirm("Excluir esta etapa e seus checklists?")) return;
    const { error } = await supabase.from("project_steps").delete().eq("id", stepId);
    if (error) return setError(error.message);
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    if (selectedStepId === stepId) setSelectedStepId(null);
  }

  async function createWithAiPlan() {
    if (!selectedSpaceId) return;
    const description = aiForm.description.trim() || selectedSpace?.objective || selectedSpace?.name || "Projeto";
    const plan = defaultAiPhases(description);
    setSaving(true);

    for (let pIndex = 0; pIndex < plan.length; pIndex += 1) {
      const phasePlan = plan[pIndex];
      const { data: phaseData, error: phaseError } = await supabase
        .from("project_phases")
        .insert({
          space_id: selectedSpaceId,
          name: phasePlan.name,
          objective: phasePlan.objective,
          icon: "📌",
          color: [BRAND.navy, BRAND.gold, BRAND.red, "#2563eb", "#059669"][pIndex % 5],
          sort_order: phases.length + pIndex + 1,
          status: "planejamento",
          created_by: userId,
        })
        .select("*")
        .single();
      if (phaseError) {
        setSaving(false);
        return setError(phaseError.message);
      }

      const phase = phaseData as Phase;
      if (aiForm.includeSteps) {
        for (let sIndex = 0; sIndex < phasePlan.steps.length; sIndex += 1) {
          const [stepName, checklistItems] = phasePlan.steps[sIndex] as [string, string[]];
          const { data: stepData, error: stepError } = await supabase
            .from("project_steps")
            .insert({
              phase_id: phase.id,
              name: stepName,
              priority: sIndex === 0 ? "alta" : "media",
              status: "planejamento",
              sort_order: sIndex + 1,
              created_by: userId,
            })
            .select("*")
            .single();
          if (stepError) {
            setSaving(false);
            return setError(stepError.message);
          }

          const step = stepData as Step;
          const { data: checklistData, error: checklistError } = await supabase
            .from("project_checklists")
            .insert({ step_id: step.id, title: "Checklist", sort_order: 1, created_by: userId })
            .select("*")
            .single();
          if (checklistError) {
            setSaving(false);
            return setError(checklistError.message);
          }

          const checklist = checklistData as Checklist;
          if (checklistItems.length) {
            const { error: itemsError } = await supabase.from("project_checklist_items").insert(
              checklistItems.map((title, index) => ({
                checklist_id: checklist.id,
                title,
                sort_order: index + 1,
                created_by: userId,
              }))
            );
            if (itemsError) {
              setSaving(false);
              return setError(itemsError.message);
            }
          }
        }
      }
    }

    setSaving(false);
    closeModal();
    await loadProjectTree(selectedSpaceId);
  }

  const stepChecklists = selectedStep ? checklists.filter((c) => c.step_id === selectedStep.id) : [];

  return (
    <div className="min-h-[calc(100vh-96px)] overflow-hidden rounded-[30px] border border-white/60 bg-white/55 shadow-sm backdrop-blur-xl">
      <div className="grid min-h-[calc(100vh-96px)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-r border-white/70 bg-white/70 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#B5A573]/30 bg-[#B5A573]/10 px-3 py-1 text-xs font-semibold text-[#7a6e43]">
                <FolderKanban className="h-3.5 w-3.5" /> Central de Projetos
              </div>
              <h1 className="mt-3 text-xl font-bold text-[#1E293F]">Espaços</h1>
            </div>
            <button
              onClick={() => setModal("space")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#A11C27] text-white shadow-sm hover:opacity-95"
              title="Criar espaço"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar espaço..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {loading && !spaces.length ? (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {filteredSpaces.map((space) => {
                const active = selectedSpaceId === space.id;
                return (
                  <button
                    key={space.id}
                    onClick={() => setSelectedSpaceId(space.id)}
                    className={`group w-full rounded-3xl border p-3 text-left transition ${
                      active ? "border-[#A11C27]/25 bg-[#A11C27]/7 shadow-sm" : "border-white/70 bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white"
                        style={{ background: space.color || BRAND.red }}
                      >
                        {space.icon || "📁"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-[#1E293F]">{space.name}</span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-slate-500">{space.objective || "Sem objetivo definido"}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="relative min-w-0 bg-gradient-to-br from-white/70 via-[#F5F5F5]/55 to-white/70 p-4 md:p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="rounded-lg p-1 hover:bg-red-100"><X className="h-4 w-4" /></button>
            </div>
          )}

          {!selectedSpace ? (
            <EmptyState onCreate={() => setModal("space")} />
          ) : (
            <>
              <section className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl text-2xl text-white shadow-sm"
                        style={{ background: selectedSpace.color || BRAND.red }}
                      >
                        {selectedSpace.icon || "📁"}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-bold text-[#1E293F] md:text-3xl">{selectedSpace.name}</h2>
                        <p className="mt-1 max-w-4xl text-sm text-slate-600">{selectedSpace.objective || "Defina o objetivo deste espaço para orientar as fases e etapas."}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setModal("phase")}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#A11C27] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                    >
                      <Plus className="h-4 w-4" /> Criar fase
                    </button>
                    <button
                      onClick={() => setModal("ai")}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#B5A573]/35 bg-[#B5A573]/15 px-4 py-2 text-sm font-semibold text-[#7a6e43] hover:bg-[#B5A573]/20"
                    >
                      <Sparkles className="h-4 w-4" /> Planejar com IA
                    </button>
                    <button
                      onClick={() => removeSpace(selectedSpace.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:text-[#A11C27]"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Metric icon={Layers3} label="Fases" value={spaceStats.phases} />
                  <Metric icon={Target} label="Etapas" value={spaceStats.steps} />
                  <Metric icon={ClipboardCheck} label="Checklists" value={spaceStats.checklists} />
                  <Metric icon={CheckCircle2} label="Concluído" value={`${spaceStats.progress}%`} />
                  <Metric icon={AlertTriangle} label="Atrasos" value={spaceStats.delayed} />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Barra de status do espaço</span>
                    <span>{spaceStats.done}/{spaceStats.total} tarefas</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#A11C27] via-[#B5A573] to-[#1E293F]" style={{ width: `${spaceStats.progress}%` }} />
                  </div>
                </div>
              </section>

              <section className="mt-5 space-y-4">
                {phases.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-[#B5A573]/50 bg-white/70 p-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#A11C27]/10 text-[#A11C27]">
                      <Layers3 className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-[#1E293F]">Crie a primeira fase</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Cada espaço nasce limpo. Você pode criar as fases manualmente ou pedir para a IA montar uma estrutura inicial.</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button onClick={() => setModal("phase")} className="rounded-2xl bg-[#A11C27] px-4 py-2 text-sm font-semibold text-white">Criar fase</button>
                      <button onClick={() => setModal("ai")} className="rounded-2xl border border-[#B5A573]/35 bg-[#B5A573]/15 px-4 py-2 text-sm font-semibold text-[#7a6e43]">Planejar com IA</button>
                    </div>
                  </div>
                ) : (
                  phases.map((phase) => {
                    const open = expandedPhaseIds[phase.id] ?? true;
                    const phaseSteps = steps.filter((s) => s.phase_id === phase.id);
                    const stat = phaseStats[phase.id] || { total: 0, done: 0, progress: 0 };
                    return (
                      <div key={phase.id} className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-sm backdrop-blur">
                        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                          <button
                            onClick={() => setExpandedPhaseIds((prev) => ({ ...prev, [phase.id]: !open }))}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white" style={{ background: phase.color || BRAND.navy }}>
                              {phase.icon || "📌"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                <span className="truncate text-lg font-bold text-[#1E293F]">{phase.name}</span>
                              </span>
                              <span className="mt-0.5 block line-clamp-1 text-sm text-slate-500">{phase.objective || "Sem objetivo definido"}</span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{phaseSteps.length} etapas</span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{stat.progress}%</span>
                            <button
                              onClick={() => {
                                setModalPhaseId(phase.id);
                                setModal("step");
                              }}
                              className="rounded-2xl bg-[#1E293F] px-3 py-2 text-xs font-semibold text-white"
                            >
                              + Etapa
                            </button>
                            <button onClick={() => removePhase(phase.id)} className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-400 hover:text-[#A11C27]">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="px-4 pb-4">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${stat.progress}%`, background: phase.color || BRAND.navy }} />
                          </div>
                        </div>

                        {open && (
                          <div className="border-t border-white/70 bg-slate-50/40 p-4">
                            {phaseSteps.length === 0 ? (
                              <button
                                onClick={() => {
                                  setModalPhaseId(phase.id);
                                  setModal("step");
                                }}
                                className="w-full rounded-3xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm font-semibold text-slate-500 hover:border-[#A11C27]/30 hover:text-[#A11C27]"
                              >
                                + Criar primeira etapa nesta fase
                              </button>
                            ) : (
                              <div className="grid gap-3 xl:grid-cols-2">
                                {phaseSteps.map((step) => {
                                  const stepChecklistIds = checklists.filter((c) => c.step_id === step.id).map((c) => c.id);
                                  const stepItems = items.filter((i) => stepChecklistIds.includes(i.checklist_id));
                                  const done = stepItems.filter((i) => i.is_done).length;
                                  const pct = progress(done, stepItems.length);
                                  return (
                                    <button
                                      key={step.id}
                                      onClick={() => setSelectedStepId(step.id)}
                                      className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                                        selectedStepId === step.id ? "border-[#A11C27]/35" : "border-white/80"
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <h4 className="truncate font-bold text-[#1E293F]">{step.name}</h4>
                                          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{step.objective || step.description || "Clique para adicionar checklists."}</p>
                                        </div>
                                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(step.priority)}`}>{priorityLabel(step.priority)}</span>
                                      </div>
                                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                        <span>{done}/{stepItems.length} tarefas</span>
                                        <span>{pct}%</span>
                                      </div>
                                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-[#A11C27]" style={{ width: `${pct}%` }} />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {selectedStep && (
        <StepDrawer
          step={selectedStep}
          checklists={stepChecklists}
          items={items}
          onClose={() => setSelectedStepId(null)}
          onDelete={() => removeStep(selectedStep.id)}
          newChecklistTitle={newChecklistTitle}
          setNewChecklistTitle={setNewChecklistTitle}
          onCreateChecklist={createChecklist}
          newItemTitle={newItemTitle}
          setNewItemTitle={setNewItemTitle}
          onCreateItem={createChecklistItem}
          onToggleItem={toggleItem}
        />
      )}

      {modal === "space" && (
        <Overlay title="Criar Espaço" subtitle="Um espaço é o projeto principal. Ex.: Programa de Parceiros, CRM Consulmax, Robô Maggi." onClose={closeModal}>
          <div className="grid gap-3">
            <Field label="Nome do espaço">
              <input value={spaceForm.name} onChange={(e) => setSpaceForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="Programa de Parceiros Consulmax" />
            </Field>
            <Field label="Objetivo">
              <textarea value={spaceForm.objective} onChange={(e) => setSpaceForm((p) => ({ ...p, objective: e.target.value }))} className="input min-h-[90px]" placeholder="Descreva o objetivo central do projeto" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ícone">
                <input value={spaceForm.icon} onChange={(e) => setSpaceForm((p) => ({ ...p, icon: e.target.value }))} className="input" />
              </Field>
              <Field label="Cor">
                <input value={spaceForm.color} onChange={(e) => setSpaceForm((p) => ({ ...p, color: e.target.value }))} className="input" />
              </Field>
            </div>
            <button onClick={createSpace} disabled={saving} className="primaryBtn">{saving ? "Salvando..." : "Salvar espaço"}</button>
          </div>
        </Overlay>
      )}

      {modal === "phase" && (
        <Overlay title="Criar Fase" subtitle="Cada espaço pode ter quantas fases quiser, com nomes livres." onClose={closeModal}>
          <div className="grid gap-3">
            <Field label="Nome da fase">
              <input value={phaseForm.name} onChange={(e) => setPhaseForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="Planejamento" />
            </Field>
            <Field label="Objetivo da fase">
              <textarea value={phaseForm.objective} onChange={(e) => setPhaseForm((p) => ({ ...p, objective: e.target.value }))} className="input min-h-[90px]" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ícone">
                <input value={phaseForm.icon} onChange={(e) => setPhaseForm((p) => ({ ...p, icon: e.target.value }))} className="input" />
              </Field>
              <Field label="Cor">
                <input value={phaseForm.color} onChange={(e) => setPhaseForm((p) => ({ ...p, color: e.target.value }))} className="input" />
              </Field>
            </div>
            <button onClick={createPhase} disabled={saving} className="primaryBtn">{saving ? "Salvando..." : "Salvar fase"}</button>
          </div>
        </Overlay>
      )}

      {modal === "step" && (
        <Overlay title="Criar Etapa" subtitle="A etapa fica dentro da fase selecionada. Ao abrir a etapa, você adiciona checklists e tarefas." onClose={closeModal}>
          <div className="grid gap-3">
            <Field label="Nome da etapa">
              <input value={stepForm.name} onChange={(e) => setStepForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="Diagnóstico dos Parceiros" />
            </Field>
            <Field label="Objetivo">
              <textarea value={stepForm.objective} onChange={(e) => setStepForm((p) => ({ ...p, objective: e.target.value }))} className="input min-h-[80px]" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prioridade">
                <select value={stepForm.priority} onChange={(e) => setStepForm((p) => ({ ...p, priority: e.target.value as Priority }))} className="input">
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </Field>
              <Field label="Prazo">
                <input type="date" value={stepForm.due_date} onChange={(e) => setStepForm((p) => ({ ...p, due_date: e.target.value }))} className="input" />
              </Field>
            </div>
            <button onClick={createStep} disabled={saving} className="primaryBtn">{saving ? "Salvando..." : "Salvar etapa"}</button>
          </div>
        </Overlay>
      )}

      {modal === "ai" && (
        <Overlay title="Planejar com IA" subtitle="Descreva o projeto e a Central cria uma sugestão de fases, etapas e checklists." onClose={closeModal}>
          <div className="grid gap-3">
            <Field label="Descrição do projeto">
              <textarea
                value={aiForm.description}
                onChange={(e) => setAiForm((p) => ({ ...p, description: e.target.value }))}
                className="input min-h-[140px]"
                placeholder="Ex.: Quero implantar um Programa de Parceiros Consulmax para recrutar, treinar e desenvolver vendedores externos..."
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={aiForm.includeSteps} onChange={(e) => setAiForm((p) => ({ ...p, includeSteps: e.target.checked }))} className="accent-[#A11C27]" />
              Criar também etapas e checklists sugeridos
            </label>
            <button onClick={createWithAiPlan} disabled={saving} className="primaryBtn">{saving ? "Criando..." : "Criar planejamento sugerido"}</button>
            <p className="text-xs text-slate-500">Nesta versão inicial, a sugestão usa um modelo interno. Depois conectamos com IA real.</p>
          </div>
        </Overlay>
      )}

      <style>{`
        .input{width:100%;border-radius:1rem;border:1px solid #e2e8f0;background:white;padding:.65rem .8rem;font-size:.875rem;outline:none}
        .input:focus{border-color:rgba(161,28,39,.45);box-shadow:0 0 0 3px rgba(161,28,39,.08)}
        .primaryBtn{display:inline-flex;align-items:center;justify-content:center;border-radius:1rem;background:${BRAND.red};padding:.75rem 1rem;font-size:.875rem;font-weight:700;color:white;box-shadow:0 6px 18px rgba(161,28,39,.18)}
        .primaryBtn:disabled{opacity:.65;cursor:not-allowed}
      `}</style>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
      <div className="max-w-xl rounded-[32px] border border-white/70 bg-white/80 p-8 text-center shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#A11C27]/10 text-[#A11C27]">
          <FolderKanban className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-2xl font-bold text-[#1E293F]">Crie seu primeiro espaço</h2>
        <p className="mt-2 text-sm text-slate-500">O espaço é o projeto principal. Dentro dele você cria fases, etapas, checklists e tarefas.</p>
        <button onClick={onCreate} className="mt-5 rounded-2xl bg-[#A11C27] px-5 py-3 text-sm font-bold text-white shadow-sm">+ Criar espaço</button>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-[#1E293F]">{value}</div>
        </div>
        <div className="rounded-2xl bg-[#A11C27]/10 p-3 text-[#A11C27]"><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Overlay({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-2xl rounded-[30px] border border-white/70 bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#1E293F]">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StepDrawer({
  step,
  checklists,
  items,
  onClose,
  onDelete,
  newChecklistTitle,
  setNewChecklistTitle,
  onCreateChecklist,
  newItemTitle,
  setNewItemTitle,
  onCreateItem,
  onToggleItem,
}: {
  step: Step;
  checklists: Checklist[];
  items: ChecklistItem[];
  onClose: () => void;
  onDelete: () => void;
  newChecklistTitle: string;
  setNewChecklistTitle: (v: string) => void;
  onCreateChecklist: () => void;
  newItemTitle: Record<string, string>;
  setNewItemTitle: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onCreateItem: (checklistId: string) => void;
  onToggleItem: (item: ChecklistItem) => void;
}) {
  const checklistIds = checklists.map((c) => c.id);
  const stepItems = items.filter((i) => checklistIds.includes(i.checklist_id));
  const done = stepItems.filter((i) => i.is_done).length;
  const pct = progress(done, stepItems.length);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/25">
      <button className="hidden flex-1 md:block" onClick={onClose} aria-label="Fechar" />
      <aside className="h-full w-full max-w-[760px] overflow-y-auto border-l border-white/70 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <CalendarDays className="h-3.5 w-3.5" /> Etapa
            </div>
            <h2 className="mt-3 text-2xl font-bold text-[#1E293F]">{step.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{step.objective || step.description || "Adicione checklists e tarefas para executar esta etapa."}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onDelete} className="rounded-2xl border border-slate-200 p-2 text-slate-400 hover:text-[#A11C27]"><Trash2 className="h-5 w-5" /></button>
            <button onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Status da etapa</span>
            <span>{done}/{stepItems.length} tarefas • {pct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-gradient-to-r from-[#A11C27] to-[#B5A573]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <input value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)} placeholder="Nome do novo checklist" className="input" />
          <button onClick={onCreateChecklist} className="rounded-2xl bg-[#1E293F] px-4 py-2 text-sm font-bold text-white">Criar</button>
        </div>

        <div className="mt-5 space-y-4">
          {checklists.map((checklist) => {
            const checklistItems = items.filter((i) => i.checklist_id === checklist.id);
            const key = checklist.id;
            return (
              <div key={checklist.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-[#1E293F]">{checklist.title}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{checklistItems.filter((i) => i.is_done).length}/{checklistItems.length}</span>
                </div>
                <div className="space-y-2">
                  {checklistItems.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={item.is_done} onChange={() => onToggleItem(item)} className="mt-1 h-4 w-4 accent-[#A11C27]" />
                      <span className={item.is_done ? "text-slate-400 line-through" : "text-slate-700"}>{item.title}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newItemTitle[key] || ""}
                    onChange={(e) => setNewItemTitle((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Adicionar tarefa ao checklist"
                    className="input"
                  />
                  <button onClick={() => onCreateItem(checklist.id)} className="rounded-2xl border border-[#A11C27]/20 px-4 py-2 text-sm font-bold text-[#A11C27] hover:bg-[#A11C27]/5">Adicionar</button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
