import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  Layers3,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

type ProjectStatus = "planejamento" | "andamento" | "aguardando" | "concluido" | "pausado";
type Priority = "baixa" | "media" | "alta" | "critica";

type TaskItem = {
  id: string;
  title: string;
  description?: string;
  done: boolean;
  responsible?: string;
  dueDate?: string;
};

type Checklist = {
  id: string;
  title: string;
  items: TaskItem[];
};

type PhaseProject = {
  id: string;
  title: string;
  description?: string;
  expectedResult?: string;
  status: ProjectStatus;
  responsible?: string;
  dueDate?: string;
  priority: Priority;
  checklists: Checklist[];
};

type Phase = {
  id: string;
  title: string;
  objective?: string;
  sortOrder: number;
  projects: PhaseProject[];
};

type StrategicProject = {
  id: string;
  title: string;
  objective: string;
  description?: string;
  owner?: string;
  startDate?: string;
  dueDate?: string;
  status: ProjectStatus;
  priority: Priority;
  area?: string;
  phases: Phase[];
};

const STORAGE_KEY = "@consulmax:central-projetos:v1";

function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeChecklist(title: string, items: string[]): Checklist {
  return {
    id: uid("checklist"),
    title,
    items: items.map((item) => ({ id: uid("task"), title: item, done: false })),
  };
}

const initialProject: StrategicProject = {
  id: uid("project"),
  title: "Programa de Parceiros Consulmax",
  objective: "Estruturar, implantar e operar uma rede comercial de parceiros com fases, projetos, checklists e tarefas acompanháveis.",
  description:
    "Projeto inicial criado para substituir o controle em ferramentas externas e centralizar a gestão da implantação dentro do CRM Consulmax.",
  owner: "Wesley",
  status: "planejamento",
  priority: "alta",
  area: "Comercial",
  phases: [
    {
      id: uid("phase"),
      title: "Planejamento",
      objective: "Definir o modelo do programa antes de produzir materiais, contratos ou iniciar a implantação.",
      sortOrder: 1,
      projects: [
        {
          id: uid("phase-project"),
          title: "Diagnóstico",
          status: "andamento",
          priority: "critica",
          responsible: "Wesley",
          expectedResult: "Base atual classificada por produção, potencial, engajamento, categoria futura e plano de ação.",
          checklists: [
            makeChecklist("Checklist", [
              "Levantar os parceiros atuais",
              "Verificar produção dos últimos 12 meses",
              "Verificar produção dos últimos 90 dias",
              "Classificar por potencial (Alto / Médio / Baixo)",
              "Avaliar engajamento",
              "Definir categoria futura",
              "Elaborar plano de ação individual",
            ]),
          ],
        },
        {
          id: uid("phase-project"),
          title: "Segmentação da Base",
          status: "planejamento",
          priority: "alta",
          responsible: "Wesley",
          expectedResult: "Parceiros separados por grupos estratégicos e com plano de atuação por grupo.",
          checklists: [
            makeChecklist("Checklist", [
              "Definir Grupo A - parceiros estratégicos",
              "Definir Grupo B - parceiros em desenvolvimento",
              "Definir Grupo C - parceiros em integração / recuperação",
              "Definir Grupo D - parceiros para descredenciamento ou indicador",
              "Definir estratégia por grupo",
              "Definir cronograma de acompanhamento por grupo",
            ]),
          ],
        },
        {
          id: uid("phase-project"),
          title: "Estrutura do Programa",
          status: "planejamento",
          priority: "critica",
          responsible: "Wesley",
          expectedResult: "Modelo oficial do Programa de Parceiros Consulmax validado.",
          checklists: [
            makeChecklist("Checklist", [
              "Definir objetivo do programa",
              "Definir público-alvo",
              "Definir níveis de parceria",
              "Definir responsabilidades de cada nível",
              "Definir benefícios de cada nível",
              "Definir critérios de evolução",
              "Validar estrutura geral",
            ]),
          ],
        },
        {
          id: uid("phase-project"),
          title: "Política de Categorias",
          status: "planejamento",
          priority: "alta",
          responsible: "Wesley",
          expectedResult: "Regras claras para Indicador, Associado Júnior, Pleno, Sênior e Partner.",
          checklists: [
            makeChecklist("Checklist", [
              "Definir categoria Indicador",
              "Definir categoria Associado Júnior",
              "Definir categoria Associado Pleno",
              "Definir categoria Associado Sênior",
              "Definir categoria Partner",
              "Definir regras de progressão",
              "Definir regras de regressão",
              "Definir regras de descredenciamento",
            ]),
          ],
        },
        {
          id: uid("phase-project"),
          title: "Plano de Comissão",
          status: "planejamento",
          priority: "alta",
          responsible: "Wesley",
          expectedResult: "Ranges de comissão e regras de pagamento definidos por categoria.",
          checklists: [
            makeChecklist("Checklist", [
              "Definir comissão do Indicador",
              "Definir comissão do Associado Júnior",
              "Definir comissão do Associado Pleno",
              "Definir comissão do Associado Sênior",
              "Definir comissão do Partner",
              "Definir fluxo de pagamento",
              "Definir regras para cancelamentos",
              "Definir regras para estornos",
            ]),
          ],
        },
        {
          id: uid("phase-project"),
          title: "KPIs e Metas",
          status: "planejamento",
          priority: "media",
          responsible: "Wesley",
          expectedResult: "Indicadores, metas mínimas e critérios de recuperação definidos.",
          checklists: [
            makeChecklist("Checklist", [
              "Definir indicadores de produção",
              "Definir indicadores de atividade",
              "Definir indicadores de conversão",
              "Definir indicadores de retenção",
              "Definir meta mínima mensal",
              "Definir meta trimestral",
              "Definir critérios de recuperação",
              "Definir dashboard de acompanhamento",
            ]),
          ],
        },
      ],
    },
  ],
};

function statusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    planejamento: "Planejamento",
    andamento: "Em andamento",
    aguardando: "Aguardando",
    concluido: "Concluído",
    pausado: "Pausado",
  };
  return labels[status];
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

function statusClasses(status: ProjectStatus) {
  if (status === "concluido") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "andamento") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "aguardando") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "pausado") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-[#F5F5F5] text-[#1E293F] border-slate-200";
}

function priorityClasses(priority: Priority) {
  if (priority === "critica") return "bg-[#A11C27]/10 text-[#A11C27] border-[#A11C27]/20";
  if (priority === "alta") return "bg-orange-50 text-orange-700 border-orange-200";
  if (priority === "media") return "bg-[#B5A573]/15 text-[#7a6e43] border-[#B5A573]/30";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function countProjectItems(project: StrategicProject) {
  const phaseProjects = project.phases.flatMap((phase) => phase.projects);
  const checklistItems = phaseProjects.flatMap((p) => p.checklists.flatMap((c) => c.items));
  const doneItems = checklistItems.filter((item) => item.done).length;
  return {
    phases: project.phases.length,
    phaseProjects: phaseProjects.length,
    totalItems: checklistItems.length,
    doneItems,
    progress: checklistItems.length ? Math.round((doneItems / checklistItems.length) * 100) : 0,
    delayed: phaseProjects.filter((p) => p.dueDate && p.status !== "concluido" && new Date(p.dueDate) < new Date()).length,
  };
}

export default function CentralProjetos() {
  const [projects, setProjects] = useState<StrategicProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as StrategicProject[];
    } catch {}
    return [initialProject];
  });

  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseProjectName, setNewPhaseProjectName] = useState<Record<string, string>>({});
  const [newChecklistItem, setNewChecklistItem] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {}
  }, [projects]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const stats = useMemo(() => (selectedProject ? countProjectItems(selectedProject) : null), [selectedProject]);

  function updateSelected(mutator: (project: StrategicProject) => StrategicProject) {
    if (!selectedProject) return;
    setProjects((prev) => prev.map((p) => (p.id === selectedProject.id ? mutator(p) : p)));
  }

  function addProject() {
    const project: StrategicProject = {
      id: uid("project"),
      title: "Novo Projeto Estratégico",
      objective: "Descreva o objetivo do projeto.",
      owner: "Wesley",
      status: "planejamento",
      priority: "media",
      area: "Geral",
      phases: [],
    };
    setProjects((prev) => [project, ...prev]);
    setSelectedProjectId(project.id);
  }

  function addPhase() {
    const title = newPhaseName.trim();
    if (!title || !selectedProject) return;
    const phase: Phase = {
      id: uid("phase"),
      title,
      sortOrder: selectedProject.phases.length + 1,
      projects: [],
    };
    updateSelected((project) => ({ ...project, phases: [...project.phases, phase] }));
    setExpandedPhases((prev) => ({ ...prev, [phase.id]: true }));
    setNewPhaseName("");
  }

  function addPhaseProject(phaseId: string) {
    const title = (newPhaseProjectName[phaseId] || "").trim();
    if (!title) return;
    const phaseProject: PhaseProject = {
      id: uid("phase-project"),
      title,
      status: "planejamento",
      priority: "media",
      responsible: "Wesley",
      checklists: [makeChecklist("Checklist", ["Descrever o que precisa ser feito"])],
    };
    updateSelected((project) => ({
      ...project,
      phases: project.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, projects: [...phase.projects, phaseProject] } : phase
      ),
    }));
    setNewPhaseProjectName((prev) => ({ ...prev, [phaseId]: "" }));
  }

  function toggleTask(phaseId: string, phaseProjectId: string, checklistId: string, itemId: string) {
    updateSelected((project) => ({
      ...project,
      phases: project.phases.map((phase) =>
        phase.id !== phaseId
          ? phase
          : {
              ...phase,
              projects: phase.projects.map((phaseProject) =>
                phaseProject.id !== phaseProjectId
                  ? phaseProject
                  : {
                      ...phaseProject,
                      checklists: phaseProject.checklists.map((checklist) =>
                        checklist.id !== checklistId
                          ? checklist
                          : {
                              ...checklist,
                              items: checklist.items.map((item) =>
                                item.id === itemId ? { ...item, done: !item.done } : item
                              ),
                            }
                      ),
                    }
              ),
            }
      ),
    }));
  }

  function addChecklistItem(phaseId: string, phaseProjectId: string, checklistId: string) {
    const key = `${phaseProjectId}-${checklistId}`;
    const title = (newChecklistItem[key] || "").trim();
    if (!title) return;
    updateSelected((project) => ({
      ...project,
      phases: project.phases.map((phase) =>
        phase.id !== phaseId
          ? phase
          : {
              ...phase,
              projects: phase.projects.map((phaseProject) =>
                phaseProject.id !== phaseProjectId
                  ? phaseProject
                  : {
                      ...phaseProject,
                      checklists: phaseProject.checklists.map((checklist) =>
                        checklist.id !== checklistId
                          ? checklist
                          : { ...checklist, items: [...checklist.items, { id: uid("task"), title, done: false }] }
                      ),
                    }
              ),
            }
      ),
    }));
    setNewChecklistItem((prev) => ({ ...prev, [key]: "" }));
  }

  function removePhaseProject(phaseId: string, phaseProjectId: string) {
    updateSelected((project) => ({
      ...project,
      phases: project.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, projects: phase.projects.filter((p) => p.id !== phaseProjectId) } : phase
      ),
    }));
  }

  if (!selectedProject || !stats) {
    return (
      <div className="p-6">
        <button onClick={addProject} className="rounded-2xl bg-[#A11C27] px-4 py-2 text-white">
          Criar primeiro projeto
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B5A573]/30 bg-[#B5A573]/10 px-3 py-1 text-xs font-semibold text-[#7a6e43]">
              <FolderKanban className="h-3.5 w-3.5" /> Central de Projetos
            </div>
            <h1 className="mt-3 text-2xl font-bold text-[#1E293F] md:text-3xl">Gestão estratégica de projetos</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Organize cada iniciativa da Consulmax em Projeto → Fases → Projetos da Fase → Checklists → Tarefas.
            </p>
          </div>
          <button
            onClick={addProject}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A11C27] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Novo projeto
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Layers3} label="Fases" value={stats.phases} />
        <MetricCard icon={ClipboardList} label="Projetos da fase" value={stats.phaseProjects} />
        <MetricCard icon={CheckCircle2} label="Tarefas concluídas" value={`${stats.doneItems}/${stats.totalItems}`} />
        <MetricCard icon={BarChart3} label="Progresso" value={`${stats.progress}%`} />
        <MetricCard icon={AlertTriangle} label="Atrasados" value={stats.delayed} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-[#1E293F]">Projetos</h2>
            <span className="text-xs text-slate-500">{projects.length}</span>
          </div>
          <div className="space-y-2">
            {projects.map((project) => {
              const s = countProjectItems(project);
              const active = project.id === selectedProject.id;
              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active ? "border-[#A11C27]/30 bg-[#A11C27]/5" : "border-slate-200 bg-white/60 hover:bg-white"
                  }`}
                >
                  <div className="font-semibold text-[#1E293F]">{project.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{project.area || "Geral"} • {s.progress}% concluído</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#A11C27]" style={{ width: `${s.progress}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-4">
          <section className="rounded-[24px] border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-700">Nome do projeto</span>
                <input
                  value={selectedProject.title}
                  onChange={(e) => updateSelected((p) => ({ ...p, title: e.target.value }))}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#A11C27]/50"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-700">Status</span>
                <select
                  value={selectedProject.status}
                  onChange={(e) => updateSelected((p) => ({ ...p, status: e.target.value as ProjectStatus }))}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#A11C27]/50"
                >
                  <option value="planejamento">Planejamento</option>
                  <option value="andamento">Em andamento</option>
                  <option value="aguardando">Aguardando</option>
                  <option value="pausado">Pausado</option>
                  <option value="concluido">Concluído</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-700">Prioridade</span>
                <select
                  value={selectedProject.priority}
                  onChange={(e) => updateSelected((p) => ({ ...p, priority: e.target.value as Priority }))}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#A11C27]/50"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-sm">
              <span className="font-semibold text-slate-700">Objetivo</span>
              <textarea
                value={selectedProject.objective}
                onChange={(e) => updateSelected((p) => ({ ...p, objective: e.target.value }))}
                className="min-h-[78px] rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#A11C27]/50"
              />
            </label>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Save className="h-3.5 w-3.5" /> Salvamento automático neste navegador.
            </div>
          </section>

          <section className="rounded-[24px] border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1E293F]">Fases do projeto</h2>
                <p className="text-sm text-slate-500">Cada projeto pode ter fases próprias. Ex.: Planejamento, Jurídico, Materiais, Implantação.</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  placeholder="Nome da nova fase"
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#A11C27]/50"
                />
                <button onClick={addPhase} className="rounded-2xl bg-[#1E293F] px-4 py-2 text-sm font-semibold text-white">
                  Adicionar
                </button>
              </div>
            </div>
          </section>

          {selectedProject.phases
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((phase) => {
              const isOpen = expandedPhases[phase.id] ?? true;
              return (
                <section key={phase.id} className="rounded-[24px] border border-white/60 bg-white/70 shadow-sm backdrop-blur">
                  <button
                    onClick={() => setExpandedPhases((prev) => ({ ...prev, [phase.id]: !isOpen }))}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <h3 className="text-lg font-bold text-[#1E293F]">{phase.title}</h3>
                      </div>
                      {phase.objective && <p className="mt-1 pl-6 text-sm text-slate-500">{phase.objective}</p>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {phase.projects.length} projetos
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-white/70 p-4">
                      <div className="flex gap-2">
                        <input
                          value={newPhaseProjectName[phase.id] || ""}
                          onChange={(e) => setNewPhaseProjectName((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                          placeholder="Novo projeto dentro desta fase"
                          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#A11C27]/50"
                        />
                        <button onClick={() => addPhaseProject(phase.id)} className="rounded-2xl bg-[#A11C27] px-4 py-2 text-sm font-semibold text-white">
                          Criar
                        </button>
                      </div>

                      {phase.projects.map((phaseProject) => {
                        const total = phaseProject.checklists.flatMap((c) => c.items).length;
                        const done = phaseProject.checklists.flatMap((c) => c.items).filter((i) => i.done).length;
                        const progress = total ? Math.round((done / total) * 100) : 0;
                        return (
                          <div key={phaseProject.id} className="rounded-[22px] border border-slate-200 bg-white/75 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h4 className="font-bold text-[#1E293F]">{phaseProject.title}</h4>
                                {phaseProject.expectedResult && <p className="mt-1 text-sm text-slate-500">{phaseProject.expectedResult}</p>}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(phaseProject.status)}`}>
                                    {statusLabel(phaseProject.status)}
                                  </span>
                                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClasses(phaseProject.priority)}`}>
                                    {priorityLabel(phaseProject.priority)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="min-w-[110px] text-right text-xs text-slate-500">{progress}% concluído</div>
                                <button
                                  onClick={() => removePhaseProject(phase.id, phaseProject.id)}
                                  className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:text-[#A11C27]"
                                  title="Excluir projeto da fase"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[#A11C27]" style={{ width: `${progress}%` }} />
                            </div>

                            <div className="mt-4 space-y-4">
                              {phaseProject.checklists.map((checklist) => (
                                <div key={checklist.id}>
                                  <div className="mb-2 font-semibold text-slate-700">{checklist.title}</div>
                                  <div className="space-y-2">
                                    {checklist.items.map((item) => (
                                      <label key={item.id} className="flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={item.done}
                                          onChange={() => toggleTask(phase.id, phaseProject.id, checklist.id, item.id)}
                                          className="mt-1 h-4 w-4 accent-[#A11C27]"
                                        />
                                        <span className={item.done ? "text-slate-400 line-through" : "text-slate-700"}>{item.title}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex gap-2">
                                    <input
                                      value={newChecklistItem[`${phaseProject.id}-${checklist.id}`] || ""}
                                      onChange={(e) =>
                                        setNewChecklistItem((prev) => ({ ...prev, [`${phaseProject.id}-${checklist.id}`]: e.target.value }))
                                      }
                                      placeholder="Adicionar tarefa ao checklist"
                                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#A11C27]/50"
                                    />
                                    <button
                                      onClick={() => addChecklistItem(phase.id, phaseProject.id, checklist.id)}
                                      className="rounded-2xl border border-[#A11C27]/20 px-4 py-2 text-sm font-semibold text-[#A11C27] hover:bg-[#A11C27]/5"
                                    >
                                      Adicionar
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
        </main>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="rounded-[22px] border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-[#1E293F]">{value}</div>
        </div>
        <div className="rounded-2xl bg-[#A11C27]/10 p-3 text-[#A11C27]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
