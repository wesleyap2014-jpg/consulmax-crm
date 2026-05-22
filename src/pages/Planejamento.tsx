// src/pages/Planejamento.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Dog,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */

type UUID = string;

type UserProfile = {
  id: UUID;
  auth_user_id: UUID;
  nome: string;
  email: string;
  user_role: "admin" | "vendedor" | "gestor" | string;
  is_active?: boolean;
};

type WeeklyPlan = {
  id: UUID;
  user_id: UUID;
  role: string;
  date_start: string;
  date_end: string;
  theme: string | null;
  main_goal: string | null;
};

type WeeklyPlanItemStatus =
  | "planejado"
  | "em_andamento"
  | "concluido"
  | "adiado"
  | "cliente_respondeu"
  | "reuniao_agendada"
  | "proposta_enviada"
  | "venda_gerada"
  | "perdido"
  | string;

type WeeklyPlanItem = {
  id: UUID;
  plan_id: UUID;
  date_start: string;
  date_end: string;
  what: string | null;
  why: string | null;
  where_: string | null;
  when_: string | null;
  who: string | null;
  how: string | null;
  how_much: string | null;
  status: WeeklyPlanItemStatus;
};

type SalesPlaybook = {
  id: UUID;
  plan_id: UUID;
  segmento: string | null;
  produto: string | null;
  persona: string | null;
  dor_principal: string | null;
  big_idea: string | null;
  promessa: string | null;
  garantia: string | null;
  cta_principal: string | null;
  script_abertura: string | null;
  script_quebra_gelo: string | null;
  script_diagnostico: string | null;
  script_apresentacao: string | null;
  script_oferta: string | null;
  script_fechamento: string | null;
  script_followup: string | null;
};

type SalesObjection = {
  id: UUID;
  playbook_id: UUID;
  tag: string | null;
  objection_text: string | null;
  answer_text: string | null;
  next_step: string | null;
  priority: number;
};

type PlanQueue = "planejado" | "em_andamento" | "concluido";

type PlanRow = {
  plan: WeeklyPlan;
  itemsCount: number;
  doingCount: number;
  doneCount: number;
  replyCount: number;
  meetingCount: number;
  proposalCount: number;
  saleCount: number;
  hasPlaybook: boolean;
  queue: PlanQueue;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TabKey = "planejamento" | "acoes" | "playbook" | "max" | "revisao";

/* ========================= Constantes & helpers ========================= */

const C = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  lightGold: "#E0CE8C",
};

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: string }> = [
  { value: "planejado", label: "Não iniciado", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "em_andamento", label: "Em execução", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "cliente_respondeu", label: "Cliente respondeu", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "reuniao_agendada", label: "Reunião agendada", tone: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "proposta_enviada", label: "Proposta enviada", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "venda_gerada", label: "Venda gerada", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "concluido", label: "Concluído", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "perdido", label: "Perdido", tone: "bg-red-50 text-red-700 border-red-200" },
  { value: "adiado", label: "Replanejar", tone: "bg-orange-50 text-orange-700 border-orange-200" },
];

const defaultChat: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Sou o Max. Selecione uma ação da semana e me peça abordagem, diagnóstico, objeções, follow-up ou simulação de conversa.",
  },
];

function normalizeStatus(s: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === s);
  if (found) return found.value;
  if (s === "concluido") return "concluido";
  if (s === "em_andamento") return "em_andamento";
  if (s === "adiado") return "adiado";
  return "planejado";
}

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === normalizeStatus(s))?.label || "Não iniciado";
}

function statusTone(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === normalizeStatus(s))?.tone || STATUS_OPTIONS[0].tone;
}

function isDoneStatus(s: string) {
  return ["concluido", "venda_gerada", "perdido"].includes(normalizeStatus(s));
}

function isExecutionStatus(s: string) {
  return ["em_andamento", "cliente_respondeu", "reuniao_agendada", "proposta_enviada"].includes(normalizeStatus(s));
}

function brDate(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function planName(p?: WeeklyPlan | null) {
  if (!p) return "";
  return p.theme?.trim() || `Semana ${brDate(p.date_start)} a ${brDate(p.date_end)}`;
}

function weekStartEnd() {
  const d = new Date();
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const toISO = (x: Date) => x.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
}

function safeJsonExtract(text: string): any | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function cleanText(v: unknown) {
  return String(v ?? "").trim();
}

function actionTitle(item?: WeeklyPlanItem | null) {
  return item?.what?.trim() || "Ação comercial sem título";
}

function isPlaybookFilled(pb: SalesPlaybook | null) {
  if (!pb) return false;
  return [
    pb.segmento,
    pb.produto,
    pb.persona,
    pb.dor_principal,
    pb.big_idea,
    pb.cta_principal,
    pb.script_abertura,
    pb.script_diagnostico,
    pb.script_apresentacao,
    pb.script_oferta,
    pb.script_fechamento,
    pb.script_followup,
  ].some((v) => cleanText(v).length > 0);
}

function queueFor(items: WeeklyPlanItem[], pb: SalesPlaybook | null): PlanQueue {
  if (items.length > 0 && items.every((i) => isDoneStatus(String(i.status)))) return "concluido";
  if (items.some((i) => isExecutionStatus(String(i.status))) || isPlaybookFilled(pb)) return "em_andamento";
  return "planejado";
}

function copyText(text: string) {
  if (!text.trim()) return;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

/* ========================= Página ========================= */

export default function Planejamento() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [maxLoading, setMaxLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("vendedor");

  const initialWeek = useMemo(() => weekStartEnd(), []);
  const [dateStart, setDateStart] = useState(initialWeek.start);
  const [dateEnd, setDateEnd] = useState(initialWeek.end);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [items, setItems] = useState<WeeklyPlanItem[]>([]);
  const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null);
  const [objections, setObjections] = useState<SalesObjection[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("planejamento");
  const [actionOpen, setActionOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(defaultChat);
  const [aiDraft, setAiDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = currentUser?.user_role === "admin";
  const selectedAction = useMemo(
    () => items.find((i) => i.id === selectedActionId) || items[0] || null,
    [items, selectedActionId]
  );

  const kpis = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => isDoneStatus(String(i.status))).length;
    const running = items.filter((i) => isExecutionStatus(String(i.status))).length;
    const replies = items.filter((i) => normalizeStatus(String(i.status)) === "cliente_respondeu").length;
    const meetings = items.filter((i) => normalizeStatus(String(i.status)) === "reuniao_agendada").length;
    const proposals = items.filter((i) => normalizeStatus(String(i.status)) === "proposta_enviada").length;
    const sales = items.filter((i) => normalizeStatus(String(i.status)) === "venda_gerada").length;
    const progress = total ? Math.round((done / total) * 100) : 0;
    return { total, done, running, replies, meetings, proposals, sales, progress };
  }, [items]);

  const plansDoing = useMemo(() => plans.filter((p) => p.queue === "em_andamento"), [plans]);
  const plansPlanned = useMemo(() => plans.filter((p) => p.queue === "planejado"), [plans]);
  const plansDone = useMemo(() => plans.filter((p) => p.queue === "concluido"), [plans]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, maxLoading]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) throw authError || new Error("Usuário não autenticado");

        const { data: profile, error: pErr } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, email, user_role, is_active")
          .eq("auth_user_id", auth.user.id)
          .limit(1);
        if (pErr || !profile?.length) throw pErr || new Error("Perfil não encontrado");

        const me = profile[0] as UserProfile;
        setCurrentUser(me);
        setSelectedUserId(me.id);

        if (me.user_role === "admin") {
          const { data: all, error } = await supabase
            .from("users")
            .select("id, auth_user_id, nome, email, user_role, is_active")
            .eq("is_active", true)
            .order("nome", { ascending: true });
          if (error) throw error;
          setUsers((all || []) as UserProfile[]);
        } else {
          setUsers([me]);
        }
      } catch (err) {
        console.error("Erro ao carregar usuário:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadPlanDetails = useCallback(async (planId: string) => {
    setLoading(true);
    try {
      const { data: pData, error: pErr } = await supabase.from("weekly_plans").select("*").eq("id", planId).single();
      if (pErr) throw pErr;
      const loadedPlan = pData as WeeklyPlan;
      setPlan(loadedPlan);
      setDateStart(loadedPlan.date_start);
      setDateEnd(loadedPlan.date_end);
      setRole(loadedPlan.role);

      const { data: itemsData, error: iErr } = await supabase
        .from("weekly_plan_items")
        .select("*")
        .eq("plan_id", planId)
        .order("date_start", { ascending: true });
      if (iErr) throw iErr;
      const loadedItems = (itemsData || []) as WeeklyPlanItem[];
      setItems(loadedItems);
      setSelectedActionId((prev) => prev || loadedItems[0]?.id || null);

      const { data: pbData, error: pbErr } = await supabase
        .from("sales_playbooks")
        .select("*")
        .eq("plan_id", planId)
        .limit(1);
      if (pbErr) throw pbErr;

      if (pbData?.length) {
        const pb = pbData[0] as SalesPlaybook;
        setPlaybook(pb);
        const { data: objData, error: oErr } = await supabase
          .from("sales_objections")
          .select("*")
          .eq("playbook_id", pb.id)
          .order("priority", { ascending: true });
        if (oErr) throw oErr;
        setObjections((objData || []) as SalesObjection[]);
      } else {
        setPlaybook(null);
        setObjections([]);
      }

      setActiveTab("acoes");
    } catch (err) {
      console.error("Erro ao carregar planejamento:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlansList = useCallback(async () => {
    if (!selectedUserId) return;
    setPlansLoading(true);
    try {
      const { data: pData, error: pErr } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("role", role)
        .order("date_start", { ascending: false })
        .limit(80);
      if (pErr) throw pErr;

      const list = (pData || []) as WeeklyPlan[];
      if (!list.length) {
        setPlans([]);
        return;
      }

      const ids = list.map((p) => p.id);
      const [{ data: iData, error: iErr }, { data: pbData, error: pbErr }] = await Promise.all([
        supabase.from("weekly_plan_items").select("*").in("plan_id", ids),
        supabase.from("sales_playbooks").select("*").in("plan_id", ids),
      ]);
      if (iErr) throw iErr;
      if (pbErr) throw pbErr;

      const itemsByPlan = new Map<string, WeeklyPlanItem[]>();
      for (const item of ((iData || []) as WeeklyPlanItem[])) {
        const arr = itemsByPlan.get(item.plan_id) || [];
        arr.push(item);
        itemsByPlan.set(item.plan_id, arr);
      }
      const pbByPlan = new Map<string, SalesPlaybook>();
      for (const pb of ((pbData || []) as SalesPlaybook[])) pbByPlan.set(pb.plan_id, pb);

      setPlans(
        list.map((p) => {
          const its = itemsByPlan.get(p.id) || [];
          const pb = pbByPlan.get(p.id) || null;
          return {
            plan: p,
            itemsCount: its.length,
            doingCount: its.filter((i) => isExecutionStatus(String(i.status))).length,
            doneCount: its.filter((i) => isDoneStatus(String(i.status))).length,
            replyCount: its.filter((i) => normalizeStatus(String(i.status)) === "cliente_respondeu").length,
            meetingCount: its.filter((i) => normalizeStatus(String(i.status)) === "reuniao_agendada").length,
            proposalCount: its.filter((i) => normalizeStatus(String(i.status)) === "proposta_enviada").length,
            saleCount: its.filter((i) => normalizeStatus(String(i.status)) === "venda_gerada").length,
            hasPlaybook: isPlaybookFilled(pb),
            queue: queueFor(its, pb),
          };
        })
      );
    } catch (err) {
      console.error("Erro ao listar planejamentos:", err);
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, [selectedUserId, role]);

  useEffect(() => {
    loadPlansList();
  }, [loadPlansList]);

  const createOrOpenPlan = async () => {
    if (!selectedUserId || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const { data: existing, error: eErr } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("role", role)
        .eq("date_start", dateStart)
        .eq("date_end", dateEnd)
        .limit(1);
      if (eErr) throw eErr;

      let currentPlan = existing?.[0] as WeeklyPlan | undefined;
      if (!currentPlan) {
        const { data: created, error: cErr } = await supabase
          .from("weekly_plans")
          .insert({
            user_id: selectedUserId,
            role,
            date_start: dateStart,
            date_end: dateEnd,
            theme: "Sala de Guerra Comercial",
            main_goal: "Gerar conversas qualificadas, reuniões e propostas na semana.",
          })
          .select("*")
          .single();
        if (cErr) throw cErr;
        currentPlan = created as WeeklyPlan;
      }

      await loadPlanDetails(currentPlan.id);
      await loadPlansList();
    } catch (err) {
      console.error("Erro ao criar/abrir planejamento:", err);
    } finally {
      setLoading(false);
    }
  };

  const newAction = () => {
    if (!plan) return;
    setEditingItem({
      id: `temp-${Math.random()}`,
      plan_id: plan.id,
      date_start: plan.date_start,
      date_end: plan.date_end,
      what: "",
      why: "",
      where_: "WhatsApp",
      when_: "",
      who: "",
      how: "",
      how_much: "",
      status: "planejado",
    });
    setActionOpen(true);
  };

  const saveAction = async () => {
    if (!plan || !editingItem) return;
    setSaving(true);
    try {
      const payload = {
        plan_id: plan.id,
        date_start: editingItem.date_start,
        date_end: editingItem.date_end,
        what: editingItem.what,
        why: editingItem.why,
        where_: editingItem.where_,
        when_: editingItem.when_,
        who: editingItem.who,
        how: editingItem.how,
        how_much: editingItem.how_much,
        status: normalizeStatus(String(editingItem.status || "planejado")),
      };

      if (String(editingItem.id).startsWith("temp-")) {
        const { data, error } = await supabase.from("weekly_plan_items").insert(payload).select("*").single();
        if (error) throw error;
        setSelectedActionId((data as WeeklyPlanItem).id);
      } else {
        const { error } = await supabase.from("weekly_plan_items").update(payload).eq("id", editingItem.id);
        if (error) throw error;
      }

      await loadPlanDetails(plan.id);
      await loadPlansList();
      setActionOpen(false);
    } catch (err) {
      console.error("Erro ao salvar ação:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (item: WeeklyPlanItem, status: string) => {
    const old = items;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      const { error } = await supabase
        .from("weekly_plan_items")
        .update({ status: normalizeStatus(status) })
        .eq("id", item.id);
      if (error) throw error;
      await loadPlansList();
    } catch (err) {
      console.error("Erro ao alterar status:", err);
      setItems(old);
    }
  };

  const savePlanHeader = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const { id, ...payload } = plan;
      const { error } = await supabase.from("weekly_plans").update(payload).eq("id", id);
      if (error) throw error;
      await loadPlansList();
    } catch (err) {
      console.error("Erro ao salvar cabeçalho:", err);
    } finally {
      setSaving(false);
    }
  };

  const ensurePlaybook = async (): Promise<SalesPlaybook | null> => {
    if (!plan) return null;
    if (playbook?.id) return playbook;
    const { data, error } = await supabase.from("sales_playbooks").insert({ plan_id: plan.id }).select("*").single();
    if (error) {
      console.error("Erro ao criar playbook:", error);
      return null;
    }
    const pb = data as SalesPlaybook;
    setPlaybook(pb);
    return pb;
  };

  const callMax = async (prompt: string): Promise<string | null> => {
    if (!prompt.trim()) return null;
    setMaxLoading(true);
    try {
      const context = {
        screen: "Sala de Guerra Comercial",
        plan,
        selectedAction,
        actions: items,
        playbook,
        objections,
        chatMessages,
      };
      const res = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "estrategia", context }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Erro /api/max-chat:", text);
        return null;
      }
      const data = await res.json();
      return String((data as any)?.answer || "Não consegui responder agora.");
    } catch (err) {
      console.error("Erro ao chamar Max:", err);
      return null;
    } finally {
      setMaxLoading(false);
    }
  };

  const generateActionStrategy = async () => {
    if (!plan || !selectedAction) return;
    const pb = await ensurePlaybook();
    if (!pb) return;

    const prompt = `
Você é o Max, copiloto comercial da Consulmax. Gere uma estratégia de vendas para a ação selecionada.

Ação: ${actionTitle(selectedAction)}
Objetivo comercial: ${selectedAction.why || ""}
Canal: ${selectedAction.where_ || ""}
Público/lista: ${selectedAction.who || ""}
Como executar: ${selectedAction.how || ""}
Meta/esforço: ${selectedAction.how_much || ""}

Responda APENAS em JSON válido, sem markdown:
{
  "playbook": {
    "segmento": "...",
    "produto": "...",
    "persona": "...",
    "dor_principal": "...",
    "big_idea": "...",
    "garantia": "...",
    "cta_principal": "...",
    "script_abertura": "...",
    "script_quebra_gelo": "...",
    "script_diagnostico": "...",
    "script_apresentacao": "...",
    "script_oferta": "...",
    "script_fechamento": "...",
    "script_followup": "..."
  },
  "objections": [
    { "tag":"${actionTitle(selectedAction).slice(0, 42)}", "objection_text":"...", "answer_text":"...", "next_step":"...", "priority":1 }
  ],
  "mensagem_pronta": "Mensagem curta e natural de WhatsApp para iniciar conversa."
}

Regras:
- Tom leve, consultivo e humano.
- Foco em diagnóstico, não em empurrar venda.
- Objeções: no mínimo 8.
- Adeque para consórcio, planejamento patrimonial, agro, empresários ou público descrito na ação.
`;

    const answer = await callMax(prompt);
    if (!answer) return;
    const parsed = safeJsonExtract(answer);

    if (parsed?.playbook) {
      const next: SalesPlaybook = {
        ...pb,
        segmento: cleanText(parsed.playbook.segmento) || pb.segmento || "",
        produto: cleanText(parsed.playbook.produto) || pb.produto || "",
        persona: cleanText(parsed.playbook.persona) || pb.persona || "",
        dor_principal: cleanText(parsed.playbook.dor_principal) || pb.dor_principal || "",
        big_idea: cleanText(parsed.playbook.big_idea) || pb.big_idea || "",
        promessa: pb.promessa || "",
        garantia: cleanText(parsed.playbook.garantia) || pb.garantia || "",
        cta_principal: cleanText(parsed.playbook.cta_principal) || pb.cta_principal || "",
        script_abertura: cleanText(parsed.playbook.script_abertura) || pb.script_abertura || "",
        script_quebra_gelo: cleanText(parsed.playbook.script_quebra_gelo) || pb.script_quebra_gelo || "",
        script_diagnostico: cleanText(parsed.playbook.script_diagnostico) || pb.script_diagnostico || "",
        script_apresentacao: cleanText(parsed.playbook.script_apresentacao) || pb.script_apresentacao || "",
        script_oferta: cleanText(parsed.playbook.script_oferta) || pb.script_oferta || "",
        script_fechamento: cleanText(parsed.playbook.script_fechamento) || pb.script_fechamento || "",
        script_followup: cleanText(parsed.playbook.script_followup) || pb.script_followup || "",
      };
      setPlaybook(next);
    }

    const generatedObjects = Array.isArray(parsed?.objections) ? parsed.objections : [];
    if (generatedObjects.length) {
      setObjections(
        generatedObjects.map((o: any, idx: number) => ({
          id: `temp-${Math.random()}`,
          playbook_id: pb.id,
          tag: cleanText(o.tag) || actionTitle(selectedAction).slice(0, 42),
          objection_text: cleanText(o.objection_text),
          answer_text: cleanText(o.answer_text),
          next_step: cleanText(o.next_step),
          priority: Number(o.priority || idx + 1),
        }))
      );
    }

    setAiDraft(cleanText(parsed?.mensagem_pronta) || answer);
    setStrategyOpen(true);
    setActiveTab("playbook");
  };

  const savePlaybook = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const pb = playbook || (await ensurePlaybook());
      if (!pb) return;
      const { id, ...payload } = pb;
      const { error } = await supabase.from("sales_playbooks").update(payload).eq("id", id);
      if (error) throw error;

      const toInsert = objections.filter((o) => String(o.id).startsWith("temp-"));
      const toUpdate = objections.filter((o) => !String(o.id).startsWith("temp-"));

      if (toInsert.length) {
        const { error: iErr } = await supabase.from("sales_objections").insert(
          toInsert.map((o) => ({
            playbook_id: pb.id,
            tag: o.tag,
            objection_text: o.objection_text,
            answer_text: o.answer_text,
            next_step: o.next_step,
            priority: o.priority,
          }))
        );
        if (iErr) throw iErr;
      }
      for (const obj of toUpdate) {
        const { id: objId, ...objPayload } = obj;
        const { error: uErr } = await supabase.from("sales_objections").update(objPayload).eq("id", objId);
        if (uErr) throw uErr;
      }
      await loadPlanDetails(plan.id);
      await loadPlansList();
    } catch (err) {
      console.error("Erro ao salvar playbook:", err);
    } finally {
      setSaving(false);
    }
  };

  const sendChat = async (text?: string) => {
    const prompt = (text ?? chatInput).trim();
    if (!prompt) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: prompt }]);
    const answer = await callMax(prompt);
    setChatMessages((prev) => [...prev, { role: "assistant", content: answer || "Não consegui responder agora." }]);
  };

  const quickPrompt = (kind: "abordagem" | "diagnostico" | "objeções" | "followup" | "simular") => {
    const title = actionTitle(selectedAction);
    const base = `Considere a ação "${title}" da Sala de Guerra Comercial. `;
    const prompts = {
      abordagem: base + "Crie uma abordagem inicial curta para WhatsApp, uma versão para ligação e uma versão para direct. Seja natural e consultivo.",
      diagnostico: base + "Crie perguntas de diagnóstico para entender objetivo, renda, prazo, lance, urgência e perfil de compra sem parecer interrogatório.",
      objeções: base + "Liste as objeções mais prováveis do cliente e me dê respostas curtas com próximo passo.",
      followup: base + "Crie 3 follow-ups progressivos para cliente que não respondeu, sem parecer insistente.",
      simular: base + "Simule uma conversa em que você é um cliente difícil e eu sou o vendedor. Comece com uma objeção realista.",
    };
    sendChat(prompts[kind]);
  };

  const exportPDF = () => {
    if (!plan) return;
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 63);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Consulmax — Sala de Guerra Comercial", 14, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${planName(plan)} • ${brDate(plan.date_start)} a ${brDate(plan.date_end)} • Cargo: ${plan.role}`, 14, 20);

    doc.setTextColor(30, 41, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Objetivo da semana", 14, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(plan.main_goal || "-", pageW - 28), 14, 42);

    autoTable(doc, {
      startY: 54,
      head: [["Ação", "Objetivo", "Canal", "Público", "Como", "Meta", "Status"]],
      body: items.length
        ? items.map((i) => [
            i.what || "",
            i.why || "",
            i.where_ || "",
            i.who || "",
            i.how || "",
            i.how_much || "",
            statusLabel(String(i.status)),
          ])
        : [["-", "-", "-", "-", "-", "-", "-"]],
      styles: { fontSize: 7, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [30, 41, 63] },
      margin: { left: 14, right: 14 },
    });

    let y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 64;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Playbook de abordagem", 14, y);
    y += 6;

    const pbRows = [
      ["Persona", playbook?.persona || "-"],
      ["Dor principal", playbook?.dor_principal || "-"],
      ["Big Idea", playbook?.big_idea || "-"],
      ["Abertura", playbook?.script_abertura || "-"],
      ["Diagnóstico", playbook?.script_diagnostico || "-"],
      ["Oferta", playbook?.script_oferta || "-"],
      ["Fechamento", playbook?.script_fechamento || "-"],
      ["Follow-up", playbook?.script_followup || "-"],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Campo", "Estratégia"]],
      body: pbRows,
      styles: { fontSize: 8, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [161, 28, 39] },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: pageW - 62 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;
    autoTable(doc, {
      startY: y,
      head: [["#", "Objeção", "Resposta", "Próximo passo"]],
      body: objections.length
        ? objections.map((o) => [String(o.priority || ""), o.objection_text || "", o.answer_text || "", o.next_step || ""])
        : [["-", "-", "-", "-"]],
      styles: { fontSize: 7, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [30, 41, 63] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`sala-de-guerra-${plan.date_start}-a-${plan.date_end}.pdf`);
  };

  const PlanCard = ({ row }: { row: PlanRow }) => (
    <button
      type="button"
      onClick={() => loadPlanDetails(row.plan.id)}
      className="text-left rounded-2xl border bg-white/70 p-4 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate text-[#1E293F]">{planName(row.plan)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {brDate(row.plan.date_start)} a {brDate(row.plan.date_end)} • {row.plan.role}
          </div>
        </div>
        <span className={`text-[11px] px-2 py-1 rounded-full border ${row.queue === "concluido" ? "bg-emerald-50 text-emerald-700" : row.queue === "em_andamento" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700"}`}>
          {row.queue === "concluido" ? "Concluído" : row.queue === "em_andamento" ? "Em execução" : "Planejado"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
        <div className="rounded-xl bg-slate-50 p-2"><b>{row.itemsCount}</b><br />ações</div>
        <div className="rounded-xl bg-blue-50 p-2"><b>{row.meetingCount}</b><br />reuniões</div>
        <div className="rounded-xl bg-amber-50 p-2"><b>{row.proposalCount}</b><br />propostas</div>
        <div className="rounded-xl bg-emerald-50 p-2"><b>{row.saleCount}</b><br />vendas</div>
      </div>
    </button>
  );

  const ActionCard = ({ item }: { item: WeeklyPlanItem }) => {
    const selected = selectedActionId === item.id;
    return (
      <div
        className={`rounded-2xl border p-4 bg-white/75 shadow-sm transition ${selected ? "ring-2 ring-[#A11C27]/30 border-[#A11C27]/40" : "hover:shadow-md"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => setSelectedActionId(item.id)} className="text-left min-w-0">
            <div className="font-semibold text-[#1E293F] truncate">{actionTitle(item)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {brDate(item.date_start)} a {brDate(item.date_end)} • {item.where_ || "Canal não definido"}
            </div>
          </button>
          <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full border ${statusTone(String(item.status))}`}>
            {statusLabel(String(item.status))}
          </span>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <p><b>Objetivo:</b> {item.why || "—"}</p>
          <p><b>Público/lista:</b> {item.who || "—"}</p>
          <p><b>Como:</b> {item.how || "—"}</p>
          <p><b>Meta:</b> {item.how_much || "—"}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          <Select value={normalizeStatus(String(item.status))} onValueChange={(v) => updateStatus(item, v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setEditingItem(item); setActionOpen(true); }}>
            Editar 5W2H
          </Button>
          <Button size="sm" onClick={() => { setSelectedActionId(item.id); generateActionStrategy(); }}>
            <Wand2 className="w-4 h-4 mr-1" /> Estratégia
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-full pb-8">
      <div className="rounded-3xl border overflow-hidden mb-5" style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.rubi} 70%, ${C.gold} 130%)` }}>
        <div className="p-5 md:p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <Dog className="w-5 h-5" /> Max • Planejamento semanal de vendas
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">Sala de Guerra Comercial</h1>
            <p className="text-white/80 mt-1 max-w-3xl">
              Defina as ações da semana, transforme cada 5W2H em abordagem comercial, antecipe objeções e use o Max como copiloto de execução.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={loadPlansList} disabled={plansLoading || !selectedUserId}>
              {plansLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
            <Button variant="secondary" onClick={exportPDF} disabled={!plan}>
              <FileText className="w-4 h-4 mr-2" /> PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-[#A11C27]" /> Criar ou abrir semana</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <Label>Colaborador</Label>
                {isAdmin ? (
                  <Select value={selectedUserId || ""} onValueChange={setSelectedUserId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input value={currentUser?.nome || ""} disabled />}
              </div>
              <div>
                <Label>Cargo</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sdr">SDR</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="pos_venda">Pós-venda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>De</Label><Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} /></div>
              <div><Label>Até</Label><Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} /></div>
              <div className="flex items-end">
                <Button className="w-full" onClick={createOrOpenPlan} disabled={loading || !selectedUserId || !dateStart || !dateEnd}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Abrir semana
                </Button>
              </div>
            </CardContent>
          </Card>

          {plan && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Progresso</div><div className="text-2xl font-bold text-[#1E293F]">{kpis.progress}%</div><div className="h-2 rounded-full bg-slate-100 mt-2"><div className="h-2 rounded-full" style={{ width: `${kpis.progress}%`, background: C.rubi }} /></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Ações</div><div className="text-2xl font-bold text-[#1E293F]">{kpis.total}</div><div className="text-xs text-muted-foreground">{kpis.running} em execução</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Reuniões / Propostas</div><div className="text-2xl font-bold text-[#1E293F]">{kpis.meetings}/{kpis.proposals}</div><div className="text-xs text-muted-foreground">respostas: {kpis.replies}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Vendas geradas</div><div className="text-2xl font-bold text-[#1E293F]">{kpis.sales}</div><div className="text-xs text-muted-foreground">na semana</div></CardContent></Card>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList className="flex flex-wrap h-auto justify-start">
              <TabsTrigger value="planejamento">Planejamento</TabsTrigger>
              <TabsTrigger value="acoes">Ações da semana</TabsTrigger>
              <TabsTrigger value="playbook">Playbook & Objeções</TabsTrigger>
              <TabsTrigger value="max">Max Vendas</TabsTrigger>
              <TabsTrigger value="revisao">Revisão</TabsTrigger>
            </TabsList>

            <TabsContent value="planejamento" className="mt-4 space-y-4">
              <Card>
                <CardHeader><CardTitle>Foco e meta da semana</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {!plan ? (
                    <div className="text-sm text-muted-foreground">Abra ou crie uma semana para começar.</div>
                  ) : (
                    <>
                      <div><Label>Foco da semana</Label><Input value={plan.theme || ""} onChange={(e) => setPlan({ ...plan, theme: e.target.value })} /></div>
                      <div><Label>Meta principal</Label><Textarea rows={3} value={plan.main_goal || ""} onChange={(e) => setPlan({ ...plan, main_goal: e.target.value })} /></div>
                      <Button onClick={savePlanHeader} disabled={saving}><Save className="w-4 h-4 mr-2" /> Salvar foco</Button>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-3">
                <Card><CardHeader><CardTitle className="text-base">Em andamento</CardTitle></CardHeader><CardContent className="space-y-2">{plansDoing.length ? plansDoing.map((r) => <PlanCard key={r.plan.id} row={r} />) : <p className="text-sm text-muted-foreground">Nenhuma semana em andamento.</p>}</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Planejadas</CardTitle></CardHeader><CardContent className="space-y-2">{plansPlanned.length ? plansPlanned.map((r) => <PlanCard key={r.plan.id} row={r} />) : <p className="text-sm text-muted-foreground">Nenhuma semana planejada.</p>}</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Concluídas</CardTitle></CardHeader><CardContent className="space-y-2">{plansDone.length ? plansDone.map((r) => <PlanCard key={r.plan.id} row={r} />) : <p className="text-sm text-muted-foreground">Nenhuma semana concluída.</p>}</CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="acoes" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-[#A11C27]" /> Ações 5W2H da semana</CardTitle>
                  <Button onClick={newAction} disabled={!plan}><Plus className="w-4 h-4 mr-2" /> Nova ação</Button>
                </CardHeader>
                <CardContent>
                  {!plan ? <p className="text-sm text-muted-foreground">Abra uma semana para cadastrar ações.</p> : items.length ? (
                    <div className="grid lg:grid-cols-2 gap-3">{items.map((item) => <ActionCard key={item.id} item={item} />)}</div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                      Nenhuma ação criada. Comece adicionando a primeira missão comercial da semana.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="playbook" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#A11C27]" /> Estratégia de abordagem</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={generateActionStrategy} disabled={!selectedAction || maxLoading}>{maxLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Pedir para o Max</Button>
                    <Button onClick={savePlaybook} disabled={!plan || saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Ação selecionada</Label>
                    <Select value={selectedAction?.id || ""} onValueChange={setSelectedActionId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a ação" /></SelectTrigger>
                      <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{actionTitle(i)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3">
                    <div><Label>Segmento</Label><Input value={playbook?.segmento || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), segmento: e.target.value }))} /></div>
                    <div><Label>Produto</Label><Input value={playbook?.produto || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), produto: e.target.value }))} /></div>
                    <div><Label>Persona</Label><Input value={playbook?.persona || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), persona: e.target.value }))} /></div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div><Label>Dor principal</Label><Textarea rows={3} value={playbook?.dor_principal || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), dor_principal: e.target.value }))} /></div>
                    <div><Label>Big Idea</Label><Textarea rows={3} value={playbook?.big_idea || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), big_idea: e.target.value }))} /></div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div><Label>Abertura</Label><Textarea rows={4} value={playbook?.script_abertura || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_abertura: e.target.value }))} /></div>
                    <div><Label>Perguntas de diagnóstico</Label><Textarea rows={4} value={playbook?.script_diagnostico || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_diagnostico: e.target.value }))} /></div>
                    <div><Label>Apresentação / estratégia</Label><Textarea rows={4} value={playbook?.script_apresentacao || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_apresentacao: e.target.value }))} /></div>
                    <div><Label>Oferta / CTA</Label><Textarea rows={4} value={playbook?.script_oferta || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_oferta: e.target.value }))} /></div>
                    <div><Label>Fechamento</Label><Textarea rows={4} value={playbook?.script_fechamento || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_fechamento: e.target.value }))} /></div>
                    <div><Label>Follow-up</Label><Textarea rows={4} value={playbook?.script_followup || ""} onChange={(e) => setPlaybook((p) => ({ ...(p || ({ id: "", plan_id: plan?.id || "" } as SalesPlaybook)), script_followup: e.target.value }))} /></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Objeções previstas</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => playbook && setObjections((prev) => [...prev, { id: `temp-${Math.random()}`, playbook_id: playbook.id, tag: actionTitle(selectedAction).slice(0, 42), objection_text: "", answer_text: "", next_step: "", priority: prev.length + 1 }])} disabled={!playbook}>Adicionar</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {objections.length ? objections.map((o) => (
                    <div key={o.id} className="rounded-2xl border p-3 grid md:grid-cols-[80px_1fr_1fr_1fr] gap-3 bg-white/70">
                      <div><Label>#</Label><Input type="number" value={o.priority} onChange={(e) => setObjections((prev) => prev.map((x) => x.id === o.id ? { ...x, priority: Number(e.target.value) } : x))} /></div>
                      <div><Label>Objeção</Label><Textarea rows={2} value={o.objection_text || ""} onChange={(e) => setObjections((prev) => prev.map((x) => x.id === o.id ? { ...x, objection_text: e.target.value } : x))} /></div>
                      <div><Label>Resposta</Label><Textarea rows={2} value={o.answer_text || ""} onChange={(e) => setObjections((prev) => prev.map((x) => x.id === o.id ? { ...x, answer_text: e.target.value } : x))} /></div>
                      <div><Label>Próximo passo</Label><Textarea rows={2} value={o.next_step || ""} onChange={(e) => setObjections((prev) => prev.map((x) => x.id === o.id ? { ...x, next_step: e.target.value } : x))} /></div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Peça para o Max prever as objeções dessa ação.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="max" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-[#A11C27]" /> Max Vendas</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">Use o chat ao lado para treinar abordagem, responder objeções e criar follow-ups com base na ação selecionada.</p>
                  <div className="grid md:grid-cols-5 gap-2">
                    <Button variant="outline" onClick={() => quickPrompt("abordagem")} disabled={!selectedAction}>Abordagem</Button>
                    <Button variant="outline" onClick={() => quickPrompt("diagnostico")} disabled={!selectedAction}>Diagnóstico</Button>
                    <Button variant="outline" onClick={() => quickPrompt("objeções")} disabled={!selectedAction}>Objeções</Button>
                    <Button variant="outline" onClick={() => quickPrompt("followup")} disabled={!selectedAction}>Follow-up</Button>
                    <Button variant="outline" onClick={() => quickPrompt("simular")} disabled={!selectedAction}>Simular</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="revisao" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#A11C27]" /> Revisão da semana</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4 bg-white/70"><div className="font-semibold">O que funcionou?</div><p className="text-sm text-muted-foreground mt-1">Use o Max para analisar as ações concluídas e transformar em padrão do time.</p></div>
                  <div className="rounded-2xl border p-4 bg-white/70"><div className="font-semibold">Onde travou?</div><p className="text-sm text-muted-foreground mt-1">Registre objeções reais e transforme em treinamento para a próxima semana.</p></div>
                  <div className="rounded-2xl border p-4 bg-white/70"><div className="font-semibold">O que repetir?</div><p className="text-sm text-muted-foreground mt-1">Identifique canais, listas e abordagens que geraram reunião ou proposta.</p></div>
                  <div className="rounded-2xl border p-4 bg-white/70"><div className="font-semibold">Próximo foco</div><p className="text-sm text-muted-foreground mt-1">Defina a próxima semana com base no aprendizado da execução.</p></div>
                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => sendChat("Analise a semana atual: o que foi planejado, o que foi executado, onde travou e qual deve ser o foco da próxima semana?")} disabled={!plan}>Pedir análise ao Max</Button>
                    <Button variant="outline" onClick={exportPDF} disabled={!plan}>Exportar PDF</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="xl:sticky xl:top-16 h-fit">
          <Card className="overflow-hidden">
            <CardHeader className="py-3 flex flex-row items-center justify-between" style={{ background: C.navy, color: "white" }}>
              <CardTitle className="text-base flex items-center gap-2"><Bot className="w-5 h-5" /> Max Copiloto</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => setChatOpen((v) => !v)}>{chatOpen ? "Ocultar" : "Abrir"}</Button>
            </CardHeader>
            {chatOpen && (
              <CardContent className="p-0">
                <div className="p-3 border-b bg-slate-50 text-xs text-muted-foreground">
                  <b>Ação:</b> {selectedAction ? actionTitle(selectedAction) : "selecione uma ação"}
                </div>
                <div className="h-[430px] overflow-y-auto p-3 space-y-3 bg-white">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={`rounded-2xl p-3 text-sm ${m.role === "user" ? "bg-[#A11C27] text-white ml-8" : "bg-slate-100 text-slate-800 mr-8"}`}>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.role === "assistant" && <button className="text-xs underline mt-2" onClick={() => copyText(m.content)}>copiar</button>}
                    </div>
                  ))}
                  {maxLoading && <div className="rounded-2xl p-3 bg-slate-100 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Max pensando...</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => quickPrompt("abordagem")} disabled={!selectedAction}>Abordagem</Button>
                    <Button size="sm" variant="outline" onClick={() => quickPrompt("objeções")} disabled={!selectedAction}>Objeções</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendChat(); }} placeholder="Peça ajuda ao Max..." />
                    <Button onClick={() => sendChat()} disabled={maxLoading || !chatInput.trim()}><Send className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader><DialogTitle>{editingItem?.id?.startsWith("temp-") ? "Nova ação 5W2H" : "Editar ação 5W2H"}</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><Label>Qual ação será feita? (What)</Label><Input value={editingItem.what || ""} onChange={(e) => setEditingItem({ ...editingItem, what: e.target.value })} placeholder="Ex.: Reativar leads parados de automóvel" /></div>
              <div><Label>Objetivo comercial (Why)</Label><Textarea rows={3} value={editingItem.why || ""} onChange={(e) => setEditingItem({ ...editingItem, why: e.target.value })} placeholder="Ex.: Gerar 10 conversas e 3 simulações" /></div>
              <div><Label>Público/lista (Who)</Label><Textarea rows={3} value={editingItem.who || ""} onChange={(e) => setEditingItem({ ...editingItem, who: e.target.value })} placeholder="Ex.: Leads que simularam carro acima de R$ 80 mil" /></div>
              <div><Label>Canal (Where)</Label><Input value={editingItem.where_ || ""} onChange={(e) => setEditingItem({ ...editingItem, where_: e.target.value })} placeholder="WhatsApp, ligação, Instagram, presencial" /></div>
              <div><Label>Quando? (When)</Label><Input value={editingItem.when_ || ""} onChange={(e) => setEditingItem({ ...editingItem, when_: e.target.value })} placeholder="Ex.: Segunda de manhã e quarta à tarde" /></div>
              <div><Label>De</Label><Input type="date" value={editingItem.date_start || ""} onChange={(e) => setEditingItem({ ...editingItem, date_start: e.target.value })} /></div>
              <div><Label>Até</Label><Input type="date" value={editingItem.date_end || ""} onChange={(e) => setEditingItem({ ...editingItem, date_end: e.target.value })} /></div>
              <div><Label>Como será executada? (How)</Label><Textarea rows={3} value={editingItem.how || ""} onChange={(e) => setEditingItem({ ...editingItem, how: e.target.value })} placeholder="Ex.: Mensagem curta, depois áudio, depois ligação se responder" /></div>
              <div><Label>Meta/esforço (How much)</Label><Textarea rows={3} value={editingItem.how_much || ""} onChange={(e) => setEditingItem({ ...editingItem, how_much: e.target.value })} placeholder="Ex.: 30 contatos, 10 respostas, 3 reuniões" /></div>
              <div><Label>Status</Label><Select value={normalizeStatus(String(editingItem.status))} onValueChange={(v) => setEditingItem({ ...editingItem, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(false)}>Cancelar</Button>
            <Button onClick={saveAction} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar ação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={strategyOpen} onOpenChange={setStrategyOpen}>
        <DialogContent className="max-w-2xl w-[95vw]">
          <DialogHeader><DialogTitle>Mensagem pronta da ação</DialogTitle></DialogHeader>
          <Textarea rows={10} value={aiDraft} onChange={(e) => setAiDraft(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => copyText(aiDraft)}><Copy className="w-4 h-4 mr-2" /> Copiar</Button>
            <Button onClick={() => setStrategyOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
