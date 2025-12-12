// src/pages/Planejamento.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  MessageCircle,
  Dog,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  RefreshCcw,
  FolderOpen,
  ClipboardList,
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

type WeeklyPlanItemStatus = "planejado" | "em_andamento" | "concluido" | "adiado";

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
  status: WeeklyPlanItemStatus | string;
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
  hasPlaybook: boolean;
  queue: PlanQueue;
};

/* ========================= Helpers ========================= */

const BRAND_RUBI = "#A11C27";
const BRAND_NAVY = "#1E293F";

function safeJsonExtract(text: string): any | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeStatus(s: string): WeeklyPlanItemStatus {
  if (s === "em_andamento") return "em_andamento";
  if (s === "concluido") return "concluido";
  if (s === "adiado") return "adiado";
  return "planejado";
}

function formatDateBR(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function planDisplayName(p: WeeklyPlan) {
  const base = p.theme?.trim()
    ? p.theme.trim()
    : `Planejamento ${formatDateBR(p.date_start)} → ${formatDateBR(p.date_end)}`;
  return base;
}

function isPlaybookFilled(pb: SalesPlaybook | null) {
  if (!pb) return false;
  const fields = [
    pb.segmento,
    pb.produto,
    pb.persona,
    pb.dor_principal,
    pb.big_idea,
    pb.garantia,
    pb.cta_principal,
    pb.script_abertura,
    pb.script_quebra_gelo,
    pb.script_diagnostico,
    pb.script_apresentacao,
    pb.script_oferta,
    pb.script_fechamento,
    pb.script_followup,
  ];
  return fields.some((v) => String(v || "").trim().length > 0);
}

function computePlanQueue(items: WeeklyPlanItem[], pb: SalesPlaybook | null): PlanQueue {
  const arr = items || [];
  const hasAny = arr.length > 0;

  const allDone =
    hasAny && arr.every((i) => normalizeStatus(String(i.status || "planejado")) === "concluido");
  if (allDone) return "concluido";

  const anyDoing = arr.some((i) => normalizeStatus(String(i.status || "planejado")) === "em_andamento");
  if (anyDoing) return "em_andamento";

  // Se quiser que "gerou playbook" já jogue para Em andamento, mantenha isso:
  if (isPlaybookFilled(pb)) return "em_andamento";

  return "planejado";
}

/* ========================= Componente ========================= */

const Planejamento: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("vendedor");

  // topo (criação)
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  // plano ativo (carregado/selecionado)
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [items, setItems] = useState<WeeklyPlanItem[]>([]);
  const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null);
  const [objections, setObjections] = useState<SalesObjection[]>([]);
  const [aiDialogues, setAiDialogues] = useState<string>("");

  // gate (etapas)
  const [hasSaved5W2H, setHasSaved5W2H] = useState(false);

  // lista de planos (sempre visível)
  const [plansLoading, setPlansLoading] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [openQueueDoing, setOpenQueueDoing] = useState(true);
  const [openQueuePlanned, setOpenQueuePlanned] = useState(false);
  const [openQueueDone, setOpenQueueDone] = useState(false);

  // overlay 5W2H (etapa 1)
  const [w2hOpen, setW2hOpen] = useState(false);

  // overlay playbook (etapa 2)
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [playbookTab, setPlaybookTab] = useState<"playbook" | "objections" | "dialogo">("playbook");
  const [maxLoading, setMaxLoading] = useState(false);

  const isAdmin = useMemo(() => currentUser?.user_role === "admin", [currentUser]);

  /* ========================= Load user & collaborators ========================= */

  useEffect(() => {
    const loadUserAndUsers = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw userError || new Error("Usuário não autenticado");

        const { data: profiles, error: profilesError } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, email, user_role, is_active")
          .eq("auth_user_id", user.id)
          .limit(1);

        if (profilesError || !profiles || profiles.length === 0)
          throw profilesError || new Error("Perfil não encontrado");

        const me = profiles[0] as UserProfile;
        setCurrentUser(me);
        setSelectedUserId(me.id);

        if (me.user_role === "admin") {
          const { data: allUsers, error: allUsersError } = await supabase
            .from("users")
            .select("id, auth_user_id, nome, email, user_role, is_active")
            .eq("is_active", true)
            .order("nome", { ascending: true });

          if (allUsersError) throw allUsersError;
          setUsers((allUsers || []) as UserProfile[]);
        } else {
          setUsers([me]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadUserAndUsers();
  }, []);

  /* ========================= Lista de planos (sempre disponível) ========================= */

  const loadPlansList = useCallback(async () => {
    if (!selectedUserId) return;
    setPlansLoading(true);
    try {
      const { data: plansData, error: pErr } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("role", role)
        .order("date_start", { ascending: false })
        .limit(60);

      if (pErr) throw pErr;

      const list = (plansData || []) as WeeklyPlan[];
      if (!list.length) {
        setPlans([]);
        return;
      }

      const planIds = list.map((p) => p.id);

      const { data: itemsData, error: iErr } = await supabase
        .from("weekly_plan_items")
        .select("*")
        .in("plan_id", planIds);

      if (iErr) throw iErr;

      const allItems = (itemsData || []) as WeeklyPlanItem[];
      const itemsByPlan = new Map<string, WeeklyPlanItem[]>();
      for (const it of allItems) {
        const arr = itemsByPlan.get(it.plan_id) || [];
        arr.push(it);
        itemsByPlan.set(it.plan_id, arr);
      }

      const { data: pbData, error: pbErr } = await supabase
        .from("sales_playbooks")
        .select("*")
        .in("plan_id", planIds);

      if (pbErr) throw pbErr;

      const pbs = (pbData || []) as SalesPlaybook[];
      const pbByPlan = new Map<string, SalesPlaybook>();
      for (const pb of pbs) pbByPlan.set(pb.plan_id, pb);

      const rows: PlanRow[] = list.map((p) => {
        const its = (itemsByPlan.get(p.id) || []).slice();
        const doingCount = its.filter((x) => normalizeStatus(String(x.status || "planejado")) === "em_andamento").length;
        const doneCount = its.filter((x) => normalizeStatus(String(x.status || "planejado")) === "concluido").length;

        const pb = pbByPlan.get(p.id) || null;
        const queue = computePlanQueue(its, pb);

        return {
          plan: p,
          itemsCount: its.length,
          doingCount,
          doneCount,
          hasPlaybook: !!pb && isPlaybookFilled(pb),
          queue,
        };
      });

      setPlans(rows);
    } catch (err) {
      console.error(err);
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, [selectedUserId, role]);

  useEffect(() => {
    if (!selectedUserId) return;
    loadPlansList();
  }, [selectedUserId, role, loadPlansList]);

  const plansDoing = useMemo(() => plans.filter((p) => p.queue === "em_andamento"), [plans]);
  const plansPlanned = useMemo(() => plans.filter((p) => p.queue === "planejado"), [plans]);
  const plansDone = useMemo(() => plans.filter((p) => p.queue === "concluido"), [plans]);

  /* ========================= Carregar detalhes de um plano ========================= */

  const loadPlanDetails = useCallback(async (planId: string) => {
    setLoading(true);
    try {
      const { data: pData, error: pErr } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("id", planId)
        .single();

      if (pErr) throw pErr;
      const currentPlan = pData as WeeklyPlan;
      setPlan(currentPlan);

      setDateStart(currentPlan.date_start);
      setDateEnd(currentPlan.date_end);
      setRole(currentPlan.role);

      const { data: itemsData, error: itemsError } = await supabase
        .from("weekly_plan_items")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .order("date_start", { ascending: true });

      if (itemsError) throw itemsError;
      const loadedItems = (itemsData || []) as WeeklyPlanItem[];
      setItems(loadedItems);

      // etapa 1: só libera se já existe item salvo
      setHasSaved5W2H(loadedItems.length > 0);

      const { data: pbData, error: pbError } = await supabase
        .from("sales_playbooks")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .limit(1);

      if (pbError) throw pbError;

      if (pbData && pbData.length > 0) {
        const pb = pbData[0] as SalesPlaybook;
        setPlaybook(pb);

        const { data: objData, error: objError } = await supabase
          .from("sales_objections")
          .select("*")
          .eq("playbook_id", pb.id)
          .order("priority", { ascending: true });

        if (objError) throw objError;
        setObjections((objData || []) as SalesObjection[]);
      } else {
        setPlaybook(null);
        setObjections([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ========================= Fluxo: Criar/Gerar Planejamento -> abre overlay 5W2H ========================= */

  const handleCreateOrLoadPlanAndOpenW2H = async () => {
    if (!selectedUserId || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      setHasSaved5W2H(false);

      const { data: existingPlans, error: planError } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("role", role)
        .eq("date_start", dateStart)
        .eq("date_end", dateEnd)
        .limit(1);

      if (planError) throw planError;

      let currentPlan: WeeklyPlan;

      if (existingPlans && existingPlans.length > 0) {
        currentPlan = existingPlans[0] as WeeklyPlan;
      } else {
        const { data: newPlanData, error: insertError } = await supabase
          .from("weekly_plans")
          .insert({
            user_id: selectedUserId,
            role,
            date_start: dateStart,
            date_end: dateEnd,
            theme: null,
            main_goal: null,
          })
          .select("*")
          .single();

        if (insertError) throw insertError;
        currentPlan = newPlanData as WeeklyPlan;
      }

      // carrega tudo e abre overlay
      await loadPlanDetails(currentPlan.id);

      // Se não tiver itens ainda, já cria 1 linha inicial no overlay (melhora UX)
      setItems((prev) => {
        if (prev.length > 0) return prev;
        const today = currentPlan.date_start || new Date().toISOString().slice(0, 10);
        const first: WeeklyPlanItem = {
          id: `temp-${Math.random()}`,
          plan_id: currentPlan.id,
          date_start: today,
          date_end: currentPlan.date_end || today,
          what: "",
          why: "",
          where_: "",
          when_: "",
          who: "",
          how: "",
          how_much: "",
          status: "planejado",
        };
        return [first];
      });

      setW2hOpen(true);
      await loadPlansList();
      setOpenQueuePlanned(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ========================= Overlay 5W2H: editar e salvar ========================= */

  const handleAddItem = () => {
    if (!plan) return;
    const today = plan.date_start || new Date().toISOString().slice(0, 10);
    const newItem: WeeklyPlanItem = {
      id: `temp-${Math.random()}`,
      plan_id: plan.id,
      date_start: today,
      date_end: plan.date_end || today,
      what: "",
      why: "",
      where_: "",
      when_: "",
      who: "",
      how: "",
      how_much: "",
      status: "planejado",
    };
    setItems((prev) => [...prev, newItem]);
    setHasSaved5W2H(false);
  };

  const handleUpdateItemField = (id: string, field: keyof WeeklyPlanItem, value: any) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
    setHasSaved5W2H(false);
  };

  const handleSaveW2H = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      // 1) salva cabeçalho
      {
        const { id, ...payload } = plan;
        const { error } = await supabase.from("weekly_plans").update(payload).eq("id", id);
        if (error) throw error;
      }

      // 2) salva itens (insert/update)
      const toInsert = items.filter((i) => String(i.id).startsWith("temp-"));
      const toUpdate = items.filter((i) => !String(i.id).startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from("weekly_plan_items").insert(
          toInsert.map((i) => ({
            plan_id: plan.id,
            date_start: i.date_start,
            date_end: i.date_end,
            what: i.what,
            why: i.why,
            where_: i.where_,
            when_: i.when_,
            who: i.who,
            how: i.how,
            how_much: i.how_much,
            status: normalizeStatus(String(i.status || "planejado")),
          }))
        );
        if (insertError) throw insertError;
      }

      for (const item of toUpdate) {
        const { id, ...payload } = item;
        const { error: updateError } = await supabase
          .from("weekly_plan_items")
          .update({
            ...payload,
            status: normalizeStatus(String((payload as any)?.status || "planejado")),
          })
          .eq("id", id);
        if (updateError) throw updateError;
      }

      // recarrega com ids reais
      await loadPlanDetails(plan.id);

      setHasSaved5W2H(true);

      // Atualiza filas conforme status
      await loadPlansList();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  /* ========================= Playbook: ensure, gerar por Max, salvar ========================= */

  const handleEnsurePlaybook = async (): Promise<SalesPlaybook | null> => {
    if (!plan) return null;
    if (playbook && playbook.id) return playbook;

    try {
      const { data, error } = await supabase
        .from("sales_playbooks")
        .insert({ plan_id: plan.id })
        .select("*")
        .single();

      if (error) throw error;
      const pb = data as SalesPlaybook;
      setPlaybook(pb);
      setObjections([]);
      setAiDialogues("");
      return pb;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleAddObjection = () => {
    if (!playbook) return;
    setObjections((prev) => [
      ...prev,
      {
        id: `temp-${Math.random()}`,
        playbook_id: playbook.id,
        tag: "",
        objection_text: "",
        answer_text: "",
        next_step: "",
        priority: prev.length + 1,
      },
    ]);
  };

  const callMaxRaw = async (prompt: string): Promise<string | null> => {
    if (!prompt.trim()) return null;
    setMaxLoading(true);
    try {
      const context = { plan, items, playbook, objections, aiDialogues };
      const res = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "estrategia", context }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Erro ao chamar /api/max-chat:", text);
        return null;
      }

      const data = await res.json();
      const answer = (data as any)?.answer || "Max não conseguiu responder agora.";
      return String(answer);
    } catch (err) {
      console.error("Erro inesperado ao falar com Max:", err);
      return null;
    } finally {
      setMaxLoading(false);
    }
  };

  const handleFillPlaybookFromMax = async () => {
    if (!plan) return;
    const pb = await handleEnsurePlaybook();
    if (!pb) return;

    const prompt = `
Você é o Max (Consulmax). Gere um PLAYBOOK COMPLETO + OBJEÇÕES + POSSIBILIDADES DE CONVERSA
com base no contexto (Tema, Meta, Ações 5W2H, Cargo, Período).

Responda APENAS em JSON válido (sem markdown), formato:

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
    { "tag": "....", "objection_text": "...", "answer_text": "...", "next_step": "...", "priority": 1 }
  ],
  "dialogo": "Texto organizado: CLIENTE DIZ -> VENDEDOR RESPONDE (várias possibilidades)."
}

Regras:
- Scripts curtos, naturais, “Consulmax”.
- Objeções: 10 itens (priority 1..10).
- Use o tema/meta/ações para não ficar genérico.
`;

    const answer = await callMaxRaw(prompt);
    if (!answer) return;

    const parsed = safeJsonExtract(answer);
    if (!parsed?.playbook) return;

    setPlaybook((prev) => {
      const base = prev && prev.id ? prev : pb;
      return {
        ...(base as SalesPlaybook),
        segmento: parsed.playbook.segmento ?? base.segmento ?? "",
        produto: parsed.playbook.produto ?? base.produto ?? "",
        persona: parsed.playbook.persona ?? base.persona ?? "",
        dor_principal: parsed.playbook.dor_principal ?? base.dor_principal ?? "",
        big_idea: parsed.playbook.big_idea ?? base.big_idea ?? "",
        garantia: parsed.playbook.garantia ?? base.garantia ?? "",
        cta_principal: parsed.playbook.cta_principal ?? base.cta_principal ?? "",
        script_abertura: parsed.playbook.script_abertura ?? base.script_abertura ?? "",
        script_quebra_gelo: parsed.playbook.script_quebra_gelo ?? base.script_quebra_gelo ?? "",
        script_diagnostico: parsed.playbook.script_diagnostico ?? base.script_diagnostico ?? "",
        script_apresentacao: parsed.playbook.script_apresentacao ?? base.script_apresentacao ?? "",
        script_oferta: parsed.playbook.script_oferta ?? base.script_oferta ?? "",
        script_fechamento: parsed.playbook.script_fechamento ?? base.script_fechamento ?? "",
        script_followup: parsed.playbook.script_followup ?? base.script_followup ?? "",
      };
    });

    const objs = Array.isArray(parsed.objections) ? parsed.objections : [];
    setObjections(
      objs.map((o: any, idx: number) => ({
        id: `temp-${Math.random()}`,
        playbook_id: pb.id,
        tag: String(o?.tag ?? ""),
        objection_text: String(o?.objection_text ?? ""),
        answer_text: String(o?.answer_text ?? ""),
        next_step: String(o?.next_step ?? ""),
        priority: Number(o?.priority ?? idx + 1),
      }))
    );

    setAiDialogues(String(parsed.dialogo ?? ""));
    setPlaybookTab("playbook");
  };

  const handleSavePlaybookAndObjections = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const pb = await handleEnsurePlaybook();
      const finalPb = playbook || pb;
      if (!finalPb) return;

      {
        const { id, ...payload } = finalPb;
        const { error } = await supabase.from("sales_playbooks").update(payload).eq("id", id);
        if (error) throw error;
      }

      const toInsert = objections.filter((o) => String(o.id).startsWith("temp-"));
      const toUpdate = objections.filter((o) => !String(o.id).startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from("sales_objections").insert(
          toInsert.map((o) => ({
            playbook_id: finalPb.id,
            tag: o.tag,
            objection_text: o.objection_text,
            answer_text: o.answer_text,
            next_step: o.next_step,
            priority: o.priority,
          }))
        );
        if (insertError) throw insertError;
      }

      for (const obj of toUpdate) {
        const { id, ...payload } = obj;
        const { error: updateError } = await supabase.from("sales_objections").update(payload).eq("id", id);
        if (updateError) throw updateError;
      }

      await loadPlanDetails(plan.id);

      // “registrar no bloco conforme status”
      await loadPlansList();
      setOpenQueueDoing(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  /* ========================= PDF Profissional ========================= */

  const handleExportPDF = async () => {
    if (!plan) return;

    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(BRAND_NAVY);
    doc.rect(0, 0, pageW, 22, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Consulmax — Plano de Ação (5W2H) + Playbook", 14, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Plano: ${planDisplayName(plan)}  •  Período: ${formatDateBR(plan.date_start)} a ${formatDateBR(plan.date_end)}  •  Cargo: ${plan.role}`,
      14,
      19
    );

    let y = 30;

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);

    doc.setFont("helvetica", "bold");
    doc.text("Tema:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(plan.theme || "-"), 30, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Meta:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(plan.main_goal || "-"), 30, y);
    y += 10;

    const rows = items.map((it) => [
      `${formatDateBR(it.date_start)} → ${formatDateBR(it.date_end)}`,
      String(it.what || ""),
      String(it.why || ""),
      String(it.where_ || ""),
      String(it.when_ || ""),
      String(it.who || ""),
      String(it.how || ""),
      String(it.how_much || ""),
      String(it.status || ""),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Período", "What", "Why", "Where", "When", "Who", "How", "How much", "Status"]],
      body: rows.length ? rows : [["-", "-", "-", "-", "-", "-", "-", "-", "-"]],
      styles: { fontSize: 7, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [30, 41, 63] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Playbook", 14, y);
    y += 6;

    const pb = playbook;

    const playbookLines: Array<[string, string]> = [
      ["Segmento", String(pb?.segmento || "-")],
      ["Produto", String(pb?.produto || "-")],
      ["Persona", String(pb?.persona || "-")],
      ["Dor principal", String(pb?.dor_principal || "-")],
      ["Big Idea", String(pb?.big_idea || "-")],
      ["Garantia", String(pb?.garantia || "-")],
      ["CTA", String(pb?.cta_principal || "-")],
      ["Abertura", String(pb?.script_abertura || "-")],
      ["Quebra-gelo", String(pb?.script_quebra_gelo || "-")],
      ["Diagnóstico", String(pb?.script_diagnostico || "-")],
      ["Apresentação", String(pb?.script_apresentacao || "-")],
      ["Oferta", String(pb?.script_oferta || "-")],
      ["Fechamento", String(pb?.script_fechamento || "-")],
      ["Follow-up", String(pb?.script_followup || "-")],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Campo", "Conteúdo"]],
      body: playbookLines.map(([k, v]) => [k, v]),
      styles: { fontSize: 8, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [161, 28, 39] },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: pageW - 14 - 14 - 34 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Objeções & Contornos", 14, y);
    y += 6;

    const objRows = objections
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((o) => [
        String(o.priority ?? ""),
        String(o.tag || ""),
        String(o.objection_text || ""),
        String(o.answer_text || ""),
        String(o.next_step || ""),
      ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Tag", "Cliente diz", "Vendedor responde", "Próximo passo"]],
      body: objRows.length ? objRows : [["-", "-", "-", "-", "-"]],
      styles: { fontSize: 7, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [30, 41, 63] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Possibilidades (IA) — Cliente diz → Vendedor responde", 14, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const dialog = String(aiDialogues || "-");
    const split = doc.splitTextToSize(dialog, pageW - 28);
    const maxY = doc.internal.pageSize.getHeight() - 14;

    for (let i = 0; i < split.length; i++) {
      if (y > maxY) {
        doc.addPage();
        y = 16;
      }
      doc.text(split[i], 14, y);
      y += 4.2;
    }

    doc.save(`consulmax-playbook-${plan.date_start}_a_${plan.date_end}-${plan.role}.pdf`);
  };

  /* ========================= UI: Card de plano na lista ========================= */

  const PlanRowCard = ({ row }: { row: PlanRow }) => {
    const p = row.plan;

    return (
      <div className="border rounded-2xl p-3 bg-background/40 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{planDisplayName(p)}</div>
            <div className="text-xs text-muted-foreground">
              {formatDateBR(p.date_start)} → {formatDateBR(p.date_end)} • Cargo: {p.role} • Ações:{" "}
              {row.itemsCount} • Concluídas: {row.doneCount} • Em andamento: {row.doingCount}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await loadPlanDetails(p.id);
                setW2hOpen(true);
              }}
              disabled={loading}
            >
              <ClipboardList className="w-4 h-4 mr-1" />
              Plano (5W2H)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await loadPlanDetails(p.id);
                setPlaybookOpen(true);
                setPlaybookTab("playbook");
              }}
              disabled={loading || !(row.itemsCount > 0)}
              title={row.itemsCount > 0 ? "Abrir Playbook" : "Salve o 5W2H primeiro."}
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              Playbook
            </Button>

            <Button
              size="sm"
              onClick={async () => {
                await loadPlanDetails(p.id);
                await handleExportPDF();
              }}
              disabled={loading || !row.hasPlaybook}
              title={row.hasPlaybook ? "Baixar PDF" : "Gere e salve o Playbook antes do PDF."}
            >
              <FileText className="w-4 h-4 mr-1" />
              PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPlanDetails(p.id)}
              disabled={loading}
            >
              <FolderOpen className="w-4 h-4 mr-1" />
              Abrir
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /* ========================= Render ========================= */

  return (
    <div className="relative flex gap-4 h-full">
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
        {/* Topo: filtros e criar/gerar planejamento */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Dog className="w-6 h-6" style={{ color: BRAND_RUBI }} />
              <CardTitle>Planejamento &amp; Playbook</CardTitle>
            </div>

            <Button variant="outline" onClick={loadPlansList} disabled={plansLoading || !selectedUserId}>
              {plansLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="w-4 h-4 mr-2" />
              )}
              Atualizar lista
            </Button>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isAdmin && (
              <div>
                <Label>Colaborador</Label>
                <Select value={selectedUserId || ""} onValueChange={(val) => setSelectedUserId(val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAdmin && currentUser && (
              <div>
                <Label>Colaborador</Label>
                <Input value={currentUser.nome} disabled />
              </div>
            )}

            <div>
              <Label>Cargo</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sdr">SDR</SelectItem>
                  <SelectItem value="vendedor">Vendedor / Especialista</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="pos_venda">Pós-venda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>De</Label>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>

            <div>
              <Label>Até</Label>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleCreateOrLoadPlanAndOpenW2H}
                disabled={loading || !selectedUserId || !dateStart || !dateEnd}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar / Gerar Planejamento
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* FILAS */}
        <Card>
          <CardHeader>
            <CardTitle>Meus Planejamentos</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Em andamento */}
            <div className="border rounded-2xl p-3 bg-background/40">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold"
                onClick={() => setOpenQueueDoing((v) => !v)}
              >
                <span className="inline-flex items-center px-2 py-1 rounded-full text-white text-xs" style={{ backgroundColor: BRAND_NAVY }}>
                  Em andamento • {plansDoing.length}
                </span>
                {openQueueDoing ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Ocultar</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Expandir</span>
                  </>
                )}
              </button>

              {openQueueDoing && (
                <div className="mt-3 space-y-3">
                  {plansLoading ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                  ) : plansDoing.length ? (
                    plansDoing.map((r) => <PlanRowCard key={r.plan.id} row={r} />)
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum planejamento em andamento.</div>
                  )}
                </div>
              )}
            </div>

            {/* Planejado */}
            <div className="border rounded-2xl p-3 bg-background/40">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold"
                onClick={() => setOpenQueuePlanned((v) => !v)}
              >
                <span className="inline-flex items-center px-2 py-1 rounded-full text-white text-xs" style={{ backgroundColor: BRAND_RUBI }}>
                  Planejado • {plansPlanned.length}
                </span>
                {openQueuePlanned ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Ocultar</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Expandir</span>
                  </>
                )}
              </button>

              {openQueuePlanned && (
                <div className="mt-3 space-y-3">
                  {plansLoading ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                  ) : plansPlanned.length ? (
                    plansPlanned.map((r) => <PlanRowCard key={r.plan.id} row={r} />)
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum planejamento planejado.</div>
                  )}
                </div>
              )}
            </div>

            {/* Concluídos */}
            <div className="border rounded-2xl p-3 bg-background/40">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold"
                onClick={() => setOpenQueueDone((v) => !v)}
              >
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-600 text-white text-xs">
                  Concluídos • {plansDone.length}
                </span>
                {openQueueDone ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Ocultar</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    <span className="text-xs text-muted-foreground">Expandir</span>
                  </>
                )}
              </button>

              {openQueueDone && (
                <div className="mt-3 space-y-3">
                  {plansLoading ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                  ) : plansDone.length ? (
                    plansDone.map((r) => <PlanRowCard key={r.plan.id} row={r} />)
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum planejamento concluído.</div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================= Overlay 5W2H (Etapa 1) ========================= */}
      <Dialog open={w2hOpen} onOpenChange={setW2hOpen}>
        <DialogContent className="max-w-6xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              Plano de Ação — 5W2H {plan ? `• ${planDisplayName(plan)}` : ""}
            </DialogTitle>
          </DialogHeader>

          {!plan ? (
            <div className="text-sm text-muted-foreground">Carregando plano…</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Tema da Semana</Label>
                  <Input
                    value={plan.theme || ""}
                    onChange={(e) => {
                      setPlan({ ...plan, theme: e.target.value });
                      setHasSaved5W2H(false);
                    }}
                    placeholder="Ex.: Semana da Frota Agro, Semana dos Médicos..."
                  />
                </div>
                <div>
                  <Label>Meta Principal</Label>
                  <Input
                    value={plan.main_goal || ""}
                    onChange={(e) => {
                      setPlan({ ...plan, main_goal: e.target.value });
                      setHasSaved5W2H(false);
                    }}
                    placeholder="Ex.: Agendar 15 reuniões, fechar 300k..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Preencha as ações (5W2H). Depois clique <b>Salvar</b> para habilitar o Playbook.
                </div>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar ação
                </Button>
              </div>

              <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1 space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-xl p-3 grid md:grid-cols-4 gap-3 bg-background/40"
                  >
                    <div>
                      <Label>De</Label>
                      <Input
                        type="date"
                        value={item.date_start || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "date_start", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Até</Label>
                      <Input
                        type="date"
                        value={item.date_end || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "date_end", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>O que? (What)</Label>
                      <Input
                        value={item.what || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "what", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Por quê? (Why)</Label>
                      <Input
                        value={item.why || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "why", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Onde? (Where)</Label>
                      <Input
                        value={item.where_ || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "where_", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Quando? (When)</Label>
                      <Input
                        value={item.when_ || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "when_", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Quem? (Who)</Label>
                      <Input
                        value={item.who || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "who", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Como? (How)</Label>
                      <Input
                        value={item.how || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "how", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Quanto? (How much)</Label>
                      <Input
                        value={item.how_much || ""}
                        onChange={(e) => handleUpdateItemField(item.id, "how_much", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={normalizeStatus(String(item.status || "planejado"))}
                        onValueChange={(val) => handleUpdateItemField(item.id, "status", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planejado">Planejado</SelectItem>
                          <SelectItem value="em_andamento">Em andamento</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                          <SelectItem value="adiado">Adiado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma ação adicionada ainda. Clique em “Adicionar ação”.
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {hasSaved5W2H ? "✅ Etapa 1 salva — Playbook liberado." : "⚠️ Salve o 5W2H para liberar o Playbook."}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setW2hOpen(false)}>
                    Fechar
                  </Button>

                  <Button onClick={handleSaveW2H} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Salvar
                  </Button>

                  <Button
                    onClick={async () => {
                      // Ao clicar aqui, você “registra” no bloco correto (recarregando filas)
                      await loadPlansList();
                      setPlaybookOpen(true);
                      setPlaybookTab("playbook");
                    }}
                    disabled={!hasSaved5W2H}
                    title={!hasSaved5W2H ? "Salve o 5W2H primeiro" : "Gerar/Editar Playbook"}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Gerar Playbook
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================= Overlay Playbook (Etapa 2) ========================= */}
      <Dialog open={playbookOpen} onOpenChange={setPlaybookOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              Playbook (com Objeções) — {plan ? planDisplayName(plan) : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Clique em <b>Pedir para o Max</b> para auto-preencher tudo. Depois revise e salve.
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleFillPlaybookFromMax} disabled={maxLoading || saving || !plan}>
                {maxLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Pedir para o Max
              </Button>

              <Button variant="outline" onClick={handleExportPDF} disabled={!plan || !isPlaybookFilled(playbook)}>
                <FileText className="w-4 h-4 mr-2" />
                Gerar PDF
              </Button>

              <Button onClick={handleSavePlaybookAndObjections} disabled={saving || !plan}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Playbook
              </Button>
            </div>
          </div>

          <Tabs value={playbookTab} onValueChange={(v) => setPlaybookTab(v as any)} className="mt-2">
            <TabsList>
              <TabsTrigger value="playbook">Playbook</TabsTrigger>
              <TabsTrigger value="objections">Objeções</TabsTrigger>
              <TabsTrigger value="dialogo">Possibilidades (IA)</TabsTrigger>
            </TabsList>

            <TabsContent value="playbook" className="mt-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Segmento</Label>
                  <Input
                    value={playbook?.segmento || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        segmento: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Produto</Label>
                  <Input
                    value={playbook?.produto || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        produto: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Persona</Label>
                  <Input
                    value={playbook?.persona || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        persona: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Dor principal</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.dor_principal || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        dor_principal: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Big Idea / Promessa</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.big_idea || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        big_idea: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Garantia</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.garantia || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        garantia: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>CTA principal</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.cta_principal || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        cta_principal: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Abertura</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_abertura || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_abertura: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Quebra-gelo</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_quebra_gelo || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_quebra_gelo: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Diagnóstico</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_diagnostico || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_diagnostico: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Apresentação</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_apresentacao || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_apresentacao: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Oferta</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_oferta || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_oferta: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Fechamento</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_fechamento || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                        script_fechamento: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label>Follow-up</Label>
                <Textarea
                  rows={3}
                  value={playbook?.script_followup || ""}
                  onChange={(e) =>
                    setPlaybook((prev) => ({
                      ...(prev || ({ id: "" as UUID, plan_id: plan?.id as UUID } as any)),
                      script_followup: e.target.value,
                    }))
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="objections" className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Objeções reais viram padrão do time.</div>
                <Button variant="outline" size="sm" onClick={handleAddObjection} disabled={!playbook}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar objeção
                </Button>
              </div>

              <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1 space-y-3">
                {objections.map((obj) => (
                  <div key={obj.id} className="border rounded-xl p-3 grid md:grid-cols-2 gap-3 bg-background/40">
                    <div>
                      <Label>Tag</Label>
                      <Input
                        value={obj.tag || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) => (o.id === obj.id ? { ...o, tag: e.target.value } : o))
                          )
                        }
                      />
                    </div>

                    <div>
                      <Label>Prioridade</Label>
                      <Input
                        type="number"
                        value={obj.priority}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) => (o.id === obj.id ? { ...o, priority: Number(e.target.value) } : o))
                          )
                        }
                      />
                    </div>

                    <div>
                      <Label>Como o cliente fala</Label>
                      <Textarea
                        rows={2}
                        value={obj.objection_text || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) => (o.id === obj.id ? { ...o, objection_text: e.target.value } : o))
                          )
                        }
                      />
                    </div>

                    <div>
                      <Label>Resposta recomendada</Label>
                      <Textarea
                        rows={2}
                        value={obj.answer_text || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) => (o.id === obj.id ? { ...o, answer_text: e.target.value } : o))
                          )
                        }
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Próximo passo</Label>
                      <Input
                        value={obj.next_step || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) => (o.id === obj.id ? { ...o, next_step: e.target.value } : o))
                          )
                        }
                      />
                    </div>
                  </div>
                ))}

                {objections.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhuma objeção ainda. Use “Pedir para o Max”.</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="dialogo" className="mt-4">
              <div className="text-sm text-muted-foreground">Editável: cliente diz → vendedor responde.</div>
              <div className="mt-3">
                <Label>Possibilidades (IA)</Label>
                <Textarea rows={14} value={aiDialogues} onChange={(e) => setAiDialogues(e.target.value)} />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPlaybookOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Planejamento;
