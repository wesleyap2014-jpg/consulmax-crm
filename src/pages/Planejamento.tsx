// src/pages/Planejamento.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  Send,
  MessageCircle,
  Dog,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
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

type MaxMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  // iso yyyy-mm-dd
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/* ========================= Componente ========================= */

const Planejamento: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("vendedor");

  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [items, setItems] = useState<WeeklyPlanItem[]>([]);
  const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null);
  const [objections, setObjections] = useState<SalesObjection[]>([]);

  // IA extra (editável) – diálogo / possibilidades
  const [aiDialogues, setAiDialogues] = useState<string>("");

  // Controle do widget flutuante (chat)
  const [maxMessages, setMaxMessages] = useState<MaxMessage[]>([]);
  const [maxInput, setMaxInput] = useState("");
  const [maxLoading, setMaxLoading] = useState(false);
  const [maxOpen, setMaxOpen] = useState(false);

  // Overlay Playbook
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [playbookTab, setPlaybookTab] = useState<"playbook" | "objections" | "dialogo">(
    "playbook"
  );

  // Expansões por status (por padrão oculto)
  const [openDoing, setOpenDoing] = useState(false);
  const [openPlanned, setOpenPlanned] = useState(false);
  const [openDone, setOpenDone] = useState(false);

  // Gate: só habilita Playbook depois de salvar 5W2H
  const [hasSaved5W2H, setHasSaved5W2H] = useState(false);

  const isAdmin = useMemo(
    () => currentUser?.user_role === "admin",
    [currentUser]
  );

  /* ========================= Load user & collaborators ========================= */

  useEffect(() => {
    const loadUserAndUsers = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user)
          throw userError || new Error("Usuário não autenticado");

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

  /* ========================= Carregar ou criar plano ========================= */

  const handleLoadOrCreatePlan = async () => {
    if (!selectedUserId || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      // reset gate – precisa salvar novamente depois que abrir/editar
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

      setPlan(currentPlan);

      const { data: planItems, error: itemsError } = await supabase
        .from("weekly_plan_items")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .order("date_start", { ascending: true });

      if (itemsError) throw itemsError;
      setItems((planItems || []) as WeeklyPlanItem[]);

      const { data: playbooks, error: pbError } = await supabase
        .from("sales_playbooks")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .limit(1);

      if (pbError) throw pbError;

      if (playbooks && playbooks.length > 0) {
        setPlaybook(playbooks[0] as SalesPlaybook);

        const { data: objData, error: objError } = await supabase
          .from("sales_objections")
          .select("*")
          .eq("playbook_id", playbooks[0].id)
          .order("priority", { ascending: true });

        if (objError) throw objError;
        setObjections((objData || []) as SalesObjection[]);
      } else {
        setPlaybook(null);
        setObjections([]);
      }

      // não auto-abre as listas; mantém oculto por padrão
      setOpenDoing(false);
      setOpenPlanned(false);
      setOpenDone(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ========================= 5W2H (itens + theme/meta dentro) ========================= */

  const markDirty = useCallback(() => {
    setHasSaved5W2H(false);
  }, []);

  const handleAddItem = () => {
    if (!plan) return;
    markDirty();

    const today = dateStart || new Date().toISOString().slice(0, 10);
    const newItem: WeeklyPlanItem = {
      id: `temp-${Math.random()}`,
      plan_id: plan.id,
      date_start: today,
      date_end: dateEnd || today,
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
  };

  const handleUpdateItemField = (
    id: string,
    field: keyof WeeklyPlanItem,
    value: any
  ) => {
    markDirty();
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSavePlanAndItems = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      // 1) salva theme + meta principal dentro do weekly_plans
      {
        const { id, ...payload } = plan;
        const { error } = await supabase
          .from("weekly_plans")
          .update(payload)
          .eq("id", id);

        if (error) throw error;
      }

      // 2) salva itens
      const toInsert = items.filter((i) => i.id.startsWith("temp-"));
      const toUpdate = items.filter((i) => !i.id.startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("weekly_plan_items")
          .insert(
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

      // 3) recarrega
      await handleLoadOrCreatePlan();

      // gate OK
      setHasSaved5W2H(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  /* ========================= Playbook + Objeções ========================= */

  const handleEnsurePlaybook = async (): Promise<SalesPlaybook | null> => {
    if (!plan) return null;
    if (playbook && playbook.id) return playbook;

    try {
      const { data, error } = await supabase
        .from("sales_playbooks")
        .insert({
          plan_id: plan.id,
        })
        .select("*")
        .single();

      if (error) throw error;

      setPlaybook(data as SalesPlaybook);
      setObjections([]); // começa vazio
      setAiDialogues("");
      return data as SalesPlaybook;
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

  const handleSavePlaybookAndObjections = async () => {
    if (!plan) return;
    setSaving(true);

    try {
      const pb = await handleEnsurePlaybook();
      const finalPb = playbook || pb;
      if (!finalPb) return;

      // garante playbook no state com id real
      if (!playbook || !playbook.id) setPlaybook(finalPb);

      // 1) update playbook
      {
        const { id, ...payload } = finalPb as SalesPlaybook;
        const { error } = await supabase
          .from("sales_playbooks")
          .update(payload)
          .eq("id", id);

        if (error) throw error;
      }

      // 2) salva objeções
      const toInsert = objections.filter((o) => String(o.id).startsWith("temp-"));
      const toUpdate = objections.filter((o) => !String(o.id).startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from("sales_objections").insert(
          toInsert.map((o) => ({
            playbook_id: (finalPb as SalesPlaybook).id,
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
        const { error: updateError } = await supabase
          .from("sales_objections")
          .update(payload)
          .eq("id", id);
        if (updateError) throw updateError;
      }

      // 3) recarrega tudo
      await handleLoadOrCreatePlan();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  /* ========================= Max - IA Consulmax ========================= */

  const pushMaxMessage = (role: "user" | "assistant", content: string) => {
    setMaxMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content },
    ]);
  };

  const callMaxRaw = async (
    prompt: string,
    mode: "livre" | "estrategia" | "objeções" = "livre"
  ): Promise<string | null> => {
    if (!prompt.trim()) return null;
    setMaxLoading(true);

    try {
      const context = {
        plan,
        items,
        playbook,
        objections,
        aiDialogues,
        mode,
      };

      const res = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode, context }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Erro ao chamar /api/max-chat:", text);
        return null;
      }

      const data = await res.json();
      const answer =
        (data as any)?.answer ||
        "Max pensou, mas não conseguiu responder agora. Tenta de novo?";

      return String(answer);
    } catch (err) {
      console.error("Erro inesperado ao falar com Max:", err);
      return null;
    } finally {
      setMaxLoading(false);
    }
  };

  // Chat do widget flutuante
  const callMaxChat = async (
    prompt: string,
    mode: "livre" | "estrategia" | "objeções" = "livre"
  ) => {
    if (!prompt.trim()) return;
    setMaxLoading(true);
    try {
      const answer = await callMaxRaw(prompt, mode);
      if (!answer) {
        pushMaxMessage(
          "assistant",
          "Max não conseguiu responder agora. Verifique a chave de API na Vercel ou tente novamente em alguns instantes."
        );
        return;
      }
      pushMaxMessage("assistant", answer);
    } finally {
      setMaxLoading(false);
    }
  };

  const handleSendToMax = async () => {
    if (!maxInput.trim()) return;
    const message = maxInput.trim();
    pushMaxMessage("user", message);
    setMaxInput("");
    await callMaxChat(message, "livre");
  };

  // Preenche Playbook + Objeções automaticamente
  const handleFillPlaybookFromMax = async () => {
    if (!plan) return;

    // garante playbook para receber objeções com playbook_id
    const pb = await handleEnsurePlaybook();
    if (!pb) return;

    const prompt = `
Você é o Max (Consulmax). Gere um PLAYBOOK COMPLETO e OBJEÇÕES para esta semana com base no contexto (tema, meta, ações 5W2H, cargo e período).
Responda APENAS em JSON válido (sem markdown, sem explicações) neste formato:

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
  "dialogo": "Texto com possibilidades do que o cliente pode falar e o que o vendedor responde (formato fácil de ler, com variações)."
}

Regras:
- Faça scripts curtos, naturais e “Consulmax”.
- Objeções: 10 itens, prioridade 1..10.
- Use o tema/meta/ações para direcionar (não genérico).
`;

    const answer = await callMaxRaw(prompt, "estrategia");
    if (!answer) {
      pushMaxMessage(
        "assistant",
        "Não consegui preencher automaticamente agora. Tenta de novo em alguns instantes."
      );
      return;
    }

    const parsed = safeJsonExtract(answer);
    if (!parsed?.playbook) {
      pushMaxMessage(
        "assistant",
        "O Max respondeu, mas não veio no JSON certinho pra auto-preencher. Tenta de novo."
      );
      return;
    }

    // aplica playbook
    setPlaybook((prev) => {
      const base = prev && prev.id ? prev : (pb as SalesPlaybook);
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
        script_quebra_gelo:
          parsed.playbook.script_quebra_gelo ?? base.script_quebra_gelo ?? "",
        script_diagnostico:
          parsed.playbook.script_diagnostico ?? base.script_diagnostico ?? "",
        script_apresentacao:
          parsed.playbook.script_apresentacao ?? base.script_apresentacao ?? "",
        script_oferta: parsed.playbook.script_oferta ?? base.script_oferta ?? "",
        script_fechamento:
          parsed.playbook.script_fechamento ?? base.script_fechamento ?? "",
        script_followup:
          parsed.playbook.script_followup ?? base.script_followup ?? "",
      };
    });

    // aplica objeções
    const objs = Array.isArray(parsed.objections) ? parsed.objections : [];
    setObjections(
      objs.map((o: any, idx: number) => ({
        id: `temp-${Math.random()}`,
        playbook_id: (pb as SalesPlaybook).id,
        tag: String(o?.tag ?? ""),
        objection_text: String(o?.objection_text ?? ""),
        answer_text: String(o?.answer_text ?? ""),
        next_step: String(o?.next_step ?? ""),
        priority: Number(o?.priority ?? idx + 1),
      }))
    );

    // diálogo
    setAiDialogues(String(parsed.dialogo ?? ""));

    // leva pra aba playbook
    setPlaybookTab("playbook");
  };

  const handleGenerateDialoguesFromMax = async () => {
    if (!plan) return;

    const prompt = `
Você é o Max (Consulmax). Crie um "roteiro de conversa" com variações:
- o que o cliente pode falar (várias possibilidades)
- como o vendedor responde (respostas curtas e fortes)
Use o contexto (tema/meta/ações 5W2H, scripts e objeções já cadastradas).
Retorne um texto organizado em tópicos, bem legível para colar e treinar.
`;
    const answer = await callMaxRaw(prompt, "livre");
    if (!answer) return;
    setAiDialogues(answer);
  };

  /* ========================= PDF Profissional ========================= */

  const handleExportPDF = async () => {
    if (!plan) return;

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(BRAND_NAVY);
    doc.rect(0, 0, pageWidth, 22, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Consulmax — Planejamento & Playbook", 14, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Período: ${formatDateBR(plan.date_start)} a ${formatDateBR(plan.date_end)}  •  Cargo: ${role}`,
      14,
      19
    );

    // Subheader box
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    let y = 30;

    doc.setFont("helvetica", "bold");
    doc.text("Tema da Semana:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(plan.theme || "-"), 48, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Meta principal:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(plan.main_goal || "-"), 48, y);
    y += 10;

    // 5W2H table (todos os itens)
    const rows = items
      .slice()
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))
      .map((it) => [
        `${formatDateBR(it.date_start)} → ${formatDateBR(it.date_end)}`,
        String(it.what || ""),
        String(it.why || ""),
        String(it.how_much || ""),
        String(it.status || ""),
      ]);

    autoTable(doc, {
      startY: y,
      head: [["Período", "O que?", "Por quê?", "Quanto?", "Status"]],
      body: rows.length ? rows : [["-", "-", "-", "-", "-"]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 63] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;

    // Playbook section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Playbook (editável pelo vendedor)", 14, y);
    y += 6;

    const pb = playbook;

    const playbookLines: Array<[string, string]> = [
      ["Segmento", String(pb?.segmento || "-")],
      ["Produto", String(pb?.produto || "-")],
      ["Persona", String(pb?.persona || "-")],
      ["Dor principal", String(pb?.dor_principal || "-")],
      ["Big Idea", String(pb?.big_idea || "-")],
      ["Garantia", String(pb?.garantia || "-")],
      ["CTA principal", String(pb?.cta_principal || "-")],
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
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: pageWidth - 14 - 14 - 36 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 8;

    // Objections
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Objeções & Contornos (o que o cliente fala vs resposta)", 14, y);
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

    // Dialogues (IA)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Possibilidades de Conversa (IA) — editável", 14, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const dialog = String(aiDialogues || "-");
    const split = doc.splitTextToSize(dialog, pageWidth - 28);

    // se estourar página, jsPDF vai quebrar no addPage manualmente
    const maxHeight = doc.internal.pageSize.getHeight() - 14;
    for (let i = 0; i < split.length; i++) {
      if (y > maxHeight) {
        doc.addPage();
        y = 16;
      }
      doc.text(split[i], 14, y);
      y += 4.2;
    }

    // Footer
    doc.setTextColor(120);
    doc.setFontSize(8);
    doc.text(
      "Consulmax — Maximize as suas conquistas • Documento interno de treinamento",
      14,
      doc.internal.pageSize.getHeight() - 10
    );

    doc.save(
      `consulmax-playbook-${plan.date_start}_a_${plan.date_end}-${role}.pdf`
    );
  };

  /* ========================= Derived groups ========================= */

  const doingItems = useMemo(
    () =>
      items.filter((i) => normalizeStatus(String(i.status || "planejado")) === "em_andamento"),
    [items]
  );

  const plannedItems = useMemo(
    () =>
      items.filter((i) => {
        const st = normalizeStatus(String(i.status || "planejado"));
        return st === "planejado" || st === "adiado";
      }),
    [items]
  );

  const doneItems = useMemo(
    () =>
      items.filter((i) => normalizeStatus(String(i.status || "planejado")) === "concluido"),
    [items]
  );

  const renderItem = (item: WeeklyPlanItem) => {
    return (
      <div
        key={item.id}
        className="border rounded-xl p-3 grid md:grid-cols-4 gap-3 bg-background/40"
      >
        <div>
          <Label>De</Label>
          <Input
            type="date"
            value={item.date_start || ""}
            onChange={(e) =>
              handleUpdateItemField(item.id, "date_start", e.target.value)
            }
          />
        </div>
        <div>
          <Label>Até</Label>
          <Input
            type="date"
            value={item.date_end || ""}
            onChange={(e) =>
              handleUpdateItemField(item.id, "date_end", e.target.value)
            }
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
            onChange={(e) =>
              handleUpdateItemField(item.id, "where_", e.target.value)
            }
          />
        </div>
        <div>
          <Label>Quando? (When)</Label>
          <Input
            value={item.when_ || ""}
            onChange={(e) =>
              handleUpdateItemField(item.id, "when_", e.target.value)
            }
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
            onChange={(e) =>
              handleUpdateItemField(item.id, "how_much", e.target.value)
            }
            placeholder="Ex.: 30 ligações, 10 reuniões..."
          />
        </div>

        <div>
          <Label>Status</Label>
          <Select
            value={normalizeStatus(String(item.status || "planejado"))}
            onValueChange={(val) =>
              handleUpdateItemField(item.id, "status", val as WeeklyPlanItemStatus)
            }
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
    );
  };

  /* ========================= Render ========================= */

  return (
    <div className="relative flex gap-4 h-full">
      {/* Coluna principal */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
        {/* Filtros topo */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Dog className="w-6 h-6" style={{ color: BRAND_RUBI }} />
              <CardTitle>
                Planejamento &amp; Playbook – Max, o mascote da Consulmax 🐶
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isAdmin && (
              <div>
                <Label>Colaborador</Label>
                <Select
                  value={selectedUserId || ""}
                  onValueChange={(val) => setSelectedUserId(val)}
                >
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
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>

            <div>
              <Label>Até</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleLoadOrCreatePlan}
                disabled={loading || !selectedUserId || !dateStart || !dateEnd}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Carregar / Criar planejamento
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 5W2H + Theme/Meta dentro */}
        {plan && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex flex-col">
                <CardTitle>Planejamento 5W2H</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  Período do plano: <b>{formatDateBR(plan.date_start)}</b> a{" "}
                  <b>{formatDateBR(plan.date_end)}</b>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar ação
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Tema / Meta (movidos para cá) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tema da semana</Label>
                  <Input
                    value={plan.theme || ""}
                    onChange={(e) => {
                      markDirty();
                      setPlan({ ...plan, theme: e.target.value });
                    }}
                    placeholder="Ex.: Semana da Frota Agro, Semana dos Médicos, etc."
                  />
                </div>

                <div>
                  <Label>Meta principal</Label>
                  <Input
                    value={plan.main_goal || ""}
                    onChange={(e) => {
                      markDirty();
                      setPlan({ ...plan, main_goal: e.target.value });
                    }}
                    placeholder="Ex.: Agendar 15 reuniões, fechar 300k em vendas..."
                  />
                </div>
              </div>

              {/* Separação por status */}
              <div className="space-y-3">
                {/* Em andamento */}
                <div className="border rounded-2xl p-3 bg-background/40">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-semibold"
                      onClick={() => setOpenDoing((v) => !v)}
                    >
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-white text-xs"
                        style={{ backgroundColor: BRAND_NAVY }}
                      >
                        Em andamento • {doingItems.length}
                      </span>
                      {openDoing ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Ocultar
                          </span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Expandir
                          </span>
                        </>
                      )}
                    </button>

                    <span className="text-xs text-muted-foreground">
                      Itens com status “Em andamento”
                    </span>
                  </div>

                  {openDoing && (
                    <div className="mt-3 space-y-3">
                      {doingItems.length ? (
                        doingItems.map(renderItem)
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Nenhum item em andamento ainda.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Planejado (inclui Adiado) */}
                <div className="border rounded-2xl p-3 bg-background/40">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-semibold"
                      onClick={() => setOpenPlanned((v) => !v)}
                    >
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-white text-xs"
                        style={{ backgroundColor: BRAND_RUBI }}
                      >
                        Planejado • {plannedItems.length}
                      </span>
                      {openPlanned ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Ocultar
                          </span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Expandir
                          </span>
                        </>
                      )}
                    </button>

                    <span className="text-xs text-muted-foreground">
                      Inclui “Planejado” e “Adiado”
                    </span>
                  </div>

                  {openPlanned && (
                    <div className="mt-3 space-y-3">
                      {plannedItems.length ? (
                        plannedItems.map(renderItem)
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Nenhum item planejado/adiado ainda.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Concluídos */}
                <div className="border rounded-2xl p-3 bg-background/40">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-semibold"
                      onClick={() => setOpenDone((v) => !v)}
                    >
                      <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-600 text-white text-xs">
                        Concluídos • {doneItems.length}
                      </span>
                      {openDone ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Ocultar
                          </span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          <span className="text-xs text-muted-foreground">
                            Expandir
                          </span>
                        </>
                      )}
                    </button>

                    <span className="text-xs text-muted-foreground">
                      Itens com status “Concluído”
                    </span>
                  </div>

                  {openDone && (
                    <div className="mt-3 space-y-3">
                      {doneItems.length ? (
                        doneItems.map(renderItem)
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Nenhum item concluído ainda.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé: salvar + playbook (gate) */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPlaybookOpen(true);
                    setPlaybookTab("playbook");
                  }}
                  disabled={!hasSaved5W2H || saving || loading}
                  title={
                    !hasSaved5W2H
                      ? "Salve o 5W2H primeiro para habilitar o Playbook."
                      : "Abrir Playbook"
                  }
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Playbook
                </Button>

                <Button onClick={handleSavePlanAndItems} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar 5W2H
                </Button>
              </div>

              {!hasSaved5W2H && (
                <div className="text-xs text-muted-foreground">
                  ⚠️ O botão <b>Playbook</b> só habilita depois que você salvar o 5W2H.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ========================= Overlay Playbook (Playbook + Objeções + Diálogo + PDF) ========================= */}
      <Dialog open={playbookOpen} onOpenChange={setPlaybookOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              Playbook da Semana (com Objeções) — {plan ? `${formatDateBR(plan.date_start)} a ${formatDateBR(plan.date_end)}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Preencha manualmente ou clique em <b>Pedir para o Max</b> para auto-preencher tudo.
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleFillPlaybookFromMax}
                disabled={maxLoading || saving || !plan}
              >
                {maxLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Pedir para o Max
              </Button>

              <Button
                variant="outline"
                onClick={handleExportPDF}
                disabled={!plan}
              >
                <FileText className="w-4 h-4 mr-2" />
                Gerar PDF
              </Button>

              <Button
                onClick={handleSavePlaybookAndObjections}
                disabled={saving || !plan}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Playbook
              </Button>
            </div>
          </div>

          <Tabs
            value={playbookTab}
            onValueChange={(v) => setPlaybookTab(v as any)}
            className="mt-2"
          >
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
                    placeholder="Ex.: Renovar a frota pagando juros médios de 1% ao ano..."
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
                    placeholder="Ex.: Você consegue 15 min hoje às 14h ou às 15h pra alinharmos isso?"
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
                  <Label>Diagnóstico (perguntas)</Label>
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
                <div className="text-sm text-muted-foreground">
                  Registre as objeções reais — isso vira “munição” pro time.
                </div>
                <Button variant="outline" size="sm" onClick={handleAddObjection} disabled={!playbook}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar objeção
                </Button>
              </div>

              <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1 space-y-3">
                {objections.map((obj) => (
                  <div
                    key={obj.id}
                    className="border rounded-xl p-3 grid md:grid-cols-2 gap-3 bg-background/40"
                  >
                    <div>
                      <Label>Tag</Label>
                      <Input
                        value={obj.tag || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id ? { ...o, tag: e.target.value } : o
                            )
                          )
                        }
                        placeholder="Ex.: sem_dinheiro, falar_com_esposa..."
                      />
                    </div>

                    <div>
                      <Label>Prioridade</Label>
                      <Input
                        type="number"
                        value={obj.priority}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, priority: Number(e.target.value) }
                                : o
                            )
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
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, objection_text: e.target.value }
                                : o
                            )
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
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, answer_text: e.target.value }
                                : o
                            )
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
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, next_step: e.target.value }
                                : o
                            )
                          )
                        }
                        placeholder="Ex.: reagendar, enviar proposta, marcar call com sócio..."
                      />
                    </div>
                  </div>
                ))}

                {objections.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma objeção ainda. Clique em “Adicionar objeção” ou “Pedir para o Max”.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="dialogo" className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  “O que o cliente pode falar” vs “como responder” — editável antes do PDF.
                </div>
                <Button
                  variant="outline"
                  onClick={handleGenerateDialoguesFromMax}
                  disabled={maxLoading || !plan}
                >
                  {maxLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Gerar com Max
                </Button>
              </div>

              <div className="mt-3">
                <Label>Possibilidades (IA)</Label>
                <Textarea
                  rows={14}
                  value={aiDialogues}
                  onChange={(e) => setAiDialogues(e.target.value)}
                  placeholder="Clique em “Gerar com Max” para criar as possibilidades — depois você pode editar."
                />
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

      {/* ========================= Widget flutuante do Max (chat) ========================= */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        {maxOpen && (
          <div className="w-80 sm:w-96 bg-background border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div
              className="flex items-center justify-between px-3 py-2 border-b text-white"
              style={{
                background: `linear-gradient(90deg, ${BRAND_NAVY}, ${BRAND_RUBI})`,
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/40">
                  <Dog className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Max – IA da Consulmax</span>
                  <span className="text-[11px] text-white/80">
                    Seu mascote ajudante de scripts 🐶
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMaxOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 transition"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="flex-1 px-3 py-2 overflow-y-auto space-y-2 text-sm bg-background">
              {maxMessages.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  Fale com o Max! Você pode pedir:
                  <ul className="list-disc list-inside mt-1">
                    <li>“Max, melhora minha abertura pra médicos.”</li>
                    <li>“Simula um cliente difícil com essa objeção.”</li>
                    <li>“Transforma meu playbook em bullets pra eu treinar.”</li>
                  </ul>
                </div>
              )}
              {maxMessages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2 rounded-lg max-w-full whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted mr-auto"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>

            <div className="px-3 py-2 border-t bg-background flex items-center gap-2">
              <Input
                placeholder="Pergunte algo pro Max..."
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendToMax();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleSendToMax}
                disabled={maxLoading || !maxInput.trim()}
              >
                {maxLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Botão flutuante redondinho */}
        <Button
          type="button"
          size="icon"
          onClick={() => setMaxOpen((prev) => !prev)}
          className="h-14 w-14 rounded-full shadow-2xl text-white border-4 border-white flex items-center justify-center hover:scale-105 transition-transform"
          style={{ backgroundColor: BRAND_NAVY }}
        >
          <Dog className="w-7 h-7" />
        </Button>
      </div>
    </div>
  );
};

export default Planejamento;
