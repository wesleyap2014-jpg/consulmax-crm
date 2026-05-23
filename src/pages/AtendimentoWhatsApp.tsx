import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Bot,
  UserRound,
  MessageCircle,
  RefreshCw,
  Inbox,
  UserCheck,
  Users,
  CheckCircle2,
  Clock,
  Tag,
  ShieldCheck,
  ArrowRightLeft,
} from "lucide-react";

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  green: "#0f766e",
  muted: "#64748b",
};

type Conversation = {
  id: string;
  contact_id: string;
  lead_id: string | null;
  opportunity_id?: string | null;
  assigned_to: string | null;
  assigned_at?: string | null;
  closed_at?: string | null;
  queue?: string | null;
  status: string;
  stage: string;
  priority: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  whatsapp_contacts?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    wa_id: string;
  } | null;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  user_id: string | null;
  message_type: string;
  body: string | null;
  created_at: string;
};

type TabKey = "new" | "mine" | "all" | "closed";

type TabDef = {
  key: TabKey;
  label: string;
  short: string;
  icon: React.ElementType;
};

const TABS: TabDef[] = [
  { key: "new", label: "Novos Contatos", short: "Novos", icon: Inbox },
  { key: "mine", label: "Meus Atendimentos", short: "Meus", icon: UserCheck },
  { key: "all", label: "Todas as Abertas", short: "Abertas", icon: Users },
  { key: "closed", label: "Finalizados", short: "Finalizados", icon: CheckCircle2 },
];

const CLOSED_STATUSES = new Set(["fechada", "finalizado", "finalizada", "closed"]);

function isClosed(conv?: Pick<Conversation, "status" | "stage"> | null) {
  if (!conv) return false;
  return (
    CLOSED_STATUSES.has(String(conv.status || "").toLowerCase()) ||
    CLOSED_STATUSES.has(String(conv.stage || "").toLowerCase())
  );
}

function isUnassigned(conv: Conversation) {
  return !conv.assigned_to && !isClosed(conv);
}

function fmtTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fmtRelative(value?: string | null) {
  if (!value) return "Sem horário";

  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const min = Math.max(0, Math.floor(diff / 60000));

  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneBR(value?: string | null) {
  const digits = onlyDigits(value);

  if (!digits) return "Telefone não identificado";

  if (digits.startsWith("55") && digits.length >= 12) {
    const local = digits.slice(2);
    const ddd = local.slice(0, 2);
    const rest = local.slice(2);

    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }

    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  return digits;
}

function initials(name?: string | null) {
  const clean = String(name || "Cliente").trim();

  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function conversationName(conv?: Conversation | null) {
  return conv?.whatsapp_contacts?.nome || "Cliente WhatsApp";
}

function statusLabel(status?: string | null) {
  const value = String(status || "novo").toLowerCase();

  const map: Record<string, string> = {
    bot: "Bot",
    humano: "Humano",
    novo: "Novo",
    entrada: "Entrada",
    aguardando_cliente: "Aguard. cliente",
    aguardando_interno: "Aguard. interno",
    fechada: "Finalizado",
    finalizado: "Finalizado",
    finalizada: "Finalizado",
  };

  return map[value] || status || "Novo";
}

function queueLabel(value?: string | null) {
  const normalized = String(value || "novos_contatos").toLowerCase();

  const map: Record<string, string> = {
    novos_contatos: "Novos Contatos",
    triagem: "Triagem",
    atendimento: "Atendimento",
    comercial: "Comercial",
    cliente_ativo: "Cliente Ativo",
    boleto: "Boleto",
    contemplacao: "Contemplação",
    pos_venda: "Pós-venda",
    suporte: "Suporte",
    financeiro: "Financeiro",
    consultor: "Consultor",
    finalizado: "Finalizado",
  };

  return map[normalized] || value || "Novos Contatos";
}

function stageLabel(stage?: string | null) {
  const value = String(stage || "entrada").toLowerCase();

  const map: Record<string, string> = {
    entrada: "Entrada",
    atendimento: "Atendimento",
    triagem: "Triagem",
    qualificacao: "Qualificação",
    comercial: "Comercial",
    boleto: "Boleto",
    contemplacao: "Contemplação",
    pos_venda: "Pós-venda",
    suporte: "Suporte",
    finalizado: "Finalizado",
  };

  return map[value] || stage || "Entrada";
}

function badgeStyleForStatus(status?: string | null): React.CSSProperties {
  const value = String(status || "").toLowerCase();

  if (value === "bot" || value === "novo") {
    return { background: C.gold, color: C.navy };
  }

  if (value === "humano") {
    return { background: C.navy, color: "white" };
  }

  if (CLOSED_STATUSES.has(value)) {
    return { background: C.green, color: "white" };
  }

  return { background: "#e2e8f0", color: C.navy };
}

function queueFromConversation(conv?: Conversation | null) {
  if (!conv) return "novos_contatos";
  return conv.queue || conv.stage || "novos_contatos";
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "navy" | "red" | "green";
}) {
  const colorMap = {
    gold: C.gold,
    navy: C.navy,
    red: C.red,
    green: C.green,
  };

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: colorMap[tone] }}>
        {value}
      </p>
    </div>
  );
}

export default function AtendimentoWhatsApp() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingConversation, setUpdatingConversation] = useState(false);

  const [tab, setTab] = useState<TabKey>("new");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  const activeRef = useRef<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    setAuthUserId(data?.user?.id ?? null);
  }

  async function loadConversations(options?: { showLoading?: boolean; silent?: boolean }) {
    const showLoading = options?.showLoading ?? false;
    const silent = options?.silent ?? false;

    if (showLoading) setLoading(true);
    if (!silent && !showLoading) setRefreshing(true);

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select(
        `
        *,
        whatsapp_contacts (
          id,
          nome,
          telefone,
          wa_id
        )
      `
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(120);

    if (error) {
      console.error("Erro ao carregar conversas WhatsApp:", error);
      setConversations([]);
    } else {
      const next = (data || []) as Conversation[];
      setConversations(next);

      const currentActive = activeRef.current;

      if (currentActive?.id) {
        const refreshedActive = next.find((c) => c.id === currentActive.id);
        if (refreshedActive) setActive(refreshedActive);
      } else if (next.length > 0) {
        setActive(next[0]);
      }
    }

    if (showLoading) setLoading(false);
    if (!silent && !showLoading) setRefreshing(false);
  }

  async function loadMessages(conversationId: string, options?: { markRead?: boolean }) {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao carregar mensagens WhatsApp:", error);
      setMessages([]);
      return;
    }

    setMessages((data || []) as Message[]);

    if (options?.markRead !== false) {
      await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId);
    }
  }

  useEffect(() => {
    loadAuth();
    loadConversations({ showLoading: true });
  }, []);

  useEffect(() => {
    if (active?.id) {
      loadMessages(active.id);
    } else {
      setMessages([]);
    }
  }, [active?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, active?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-central-atendimentos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const currentActive = activeRef.current;
          const row = payload.new as Message | null;

          if (currentActive?.id && row?.conversation_id === currentActive.id) {
            loadMessages(currentActive.id);
          }

          loadConversations({ silent: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          loadConversations({ silent: true });
        }
      )
      .subscribe();

    const fallback = window.setInterval(() => {
      loadConversations({ silent: true });
    }, 20000);

    return () => {
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, []);

  const activeContact = active?.whatsapp_contacts;
  const activePhone = onlyDigits(activeContact?.telefone || activeContact?.wa_id);

  const counts = useMemo(() => {
    const newCount = conversations.filter(isUnassigned).length;
    const mineCount = conversations.filter(
      (conv) => conv.assigned_to === authUserId && !isClosed(conv)
    ).length;
    const allOpenCount = conversations.filter((conv) => !isClosed(conv)).length;
    const closedCount = conversations.filter(isClosed).length;

    return {
      new: newCount,
      mine: mineCount,
      all: allOpenCount,
      closed: closedCount,
    } satisfies Record<TabKey, number>;
  }, [authUserId, conversations]);

  const filteredConversations = useMemo(() => {
    if (tab === "new") return conversations.filter(isUnassigned);

    if (tab === "mine") {
      return conversations.filter(
        (conv) => conv.assigned_to === authUserId && !isClosed(conv)
      );
    }

    if (tab === "closed") return conversations.filter(isClosed);

    return conversations.filter((conv) => !isClosed(conv));
  }, [authUserId, conversations, tab]);

  useEffect(() => {
    if (!active) return;

    const existsInTab = filteredConversations.some((conv) => conv.id === active.id);

    if (!existsInTab && filteredConversations.length > 0) {
      setActive(filteredConversations[0]);
    }

    if (!existsInTab && filteredConversations.length === 0 && tab !== "all") {
      setActive(null);
    }
  }, [active, filteredConversations, tab]);

  async function sendMessage() {
    const body = text.trim();

    if (!active || !activePhone || !body) return;

    setSending(true);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: active.id,
          to: activePhone,
          body,
          user_id: authUserId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        alert("Não foi possível enviar a mensagem.");
        console.error(result);
        return;
      }

      setText("");
      await loadMessages(active.id);
      await loadConversations({ silent: true });
    } finally {
      setSending(false);
    }
  }

  async function updateConversationPatch(patch: Partial<Conversation>) {
    if (!active) return false;

    setUpdatingConversation(true);

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);

    setUpdatingConversation(false);

    if (error) {
      console.error("Erro ao atualizar conversa WhatsApp:", error);
      alert("Não foi possível atualizar a conversa.");
      return false;
    }

    await loadConversations({ silent: true });
    return true;
  }

  async function assumirConversa() {
    if (!active || !authUserId) return;

    const now = new Date().toISOString();

    const ok = await updateConversationPatch({
      assigned_to: authUserId,
      assigned_at: now,
      status: "humano",
      stage: "atendimento",
      queue: "atendimento",
    });

    if (ok) {
      setActive((prev) =>
        prev
          ? {
              ...prev,
              assigned_to: authUserId,
              assigned_at: now,
              status: "humano",
              stage: "atendimento",
              queue: "atendimento",
            }
          : prev
      );

      setTab("mine");
    }
  }

  async function finalizarConversa() {
    if (!active) return;

    const ok = await updateConversationPatch({
      status: "fechada",
      stage: "finalizado",
      queue: "finalizado",
      closed_at: new Date().toISOString(),
    });

    if (ok) setTab("closed");
  }

  async function reabrirConversa() {
    if (!active) return;

    const ok = await updateConversationPatch({
      status: "humano",
      stage: "atendimento",
      queue: "atendimento",
      closed_at: null,
      assigned_to: active.assigned_to || authUserId,
      assigned_at: active.assigned_at || new Date().toISOString(),
    });

    if (ok) setTab("mine");
  }

  async function transferirFila(queue: string) {
    if (!active) return;

    const ok = await updateConversationPatch({
      queue,
      stage: queue,
    });

    if (ok) {
      setActive((prev) => (prev ? { ...prev, queue, stage: queue } : prev));
    }
  }

  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;
  const activeIsClosed = isClosed(active);
  const canSend = !!active && !activeIsClosed && !!text.trim() && !sending;

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#f7f7f8" }}>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: C.red }} />
            WhatsApp oficial conectado ao CRM
          </div>

          <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.navy }}>
            Central de Atendimentos
          </h1>

          <p className="mt-1 max-w-3xl text-base text-slate-500">
            Atendimento integrado da Consulmax para WhatsApp, triagem, suporte,
            pós-venda e oportunidades comerciais.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
          <MetricCard label="Novos" value={counts.new} tone="gold" />
          <MetricCard label="Meus" value={counts.mine} tone="navy" />
          <MetricCard label="Abertos" value={counts.all} tone="red" />
          <MetricCard label="Finalizados" value={counts.closed} tone="green" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardHeader
            className="border-b p-4"
            style={{
              background: `linear-gradient(135deg, ${C.navy}, ${C.red})`,
              color: "white",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5" />
                Atendimentos
              </CardTitle>

              <Button
                variant="outline"
                onClick={() => loadConversations()}
                disabled={refreshing}
                className="h-9 gap-2 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Atualizar
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {TABS.map((item) => {
                const Icon = item.icon;
                const selected = tab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`flex items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-semibold transition ${
                      selected
                        ? "bg-white text-slate-900 shadow-sm"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                    title={item.label}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {item.short}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        selected
                          ? "bg-slate-100 text-slate-700"
                          : "bg-white/15 text-white"
                      }`}
                    >
                      {counts[item.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-[420px] flex-col items-center justify-center p-8 text-center text-slate-500">
                <Inbox className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-semibold text-slate-700">
                  Nenhum atendimento nesta fila.
                </p>
                <p className="mt-1 text-sm">
                  Quando uma conversa entrar ou mudar de status, ela aparecerá
                  automaticamente aqui.
                </p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-285px)] overflow-auto">
                {filteredConversations.map((conv) => {
                  const contact = conv.whatsapp_contacts;
                  const selected = active?.id === conv.id;
                  const unassigned = isUnassigned(conv);

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActive(conv)}
                      className={`w-full border-b p-4 text-left transition hover:bg-slate-50 ${
                        selected ? "bg-[#fff7ed]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm"
                          style={{ background: unassigned ? C.red : C.navy }}
                        >
                          {initials(contact?.nome)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-base font-bold text-slate-900">
                                {contact?.nome || "Cliente WhatsApp"}
                              </p>

                              <p className="truncate text-sm text-slate-500">
                                {formatPhoneBR(contact?.telefone || contact?.wa_id)}
                              </p>
                            </div>

                            <span className="shrink-0 text-xs font-medium text-slate-400">
                              {fmtRelative(conv.last_message_at)}
                            </span>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-700">
                            {conv.last_message || "—"}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge style={badgeStyleForStatus(conv.status)}>
                              {statusLabel(conv.status)}
                            </Badge>

                            <Badge variant="secondary" className="gap-1">
                              <Tag className="h-3 w-3" />
                              {queueLabel(queueFromConversation(conv))}
                            </Badge>

                            {conv.unread_count > 0 && (
                              <Badge style={{ background: C.red, color: "white" }}>
                                {conv.unread_count} nova(s)
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          {!active ? (
            <div className="flex h-[70vh] items-center justify-center text-base text-slate-500">
              Selecione um atendimento para começar.
            </div>
          ) : (
            <>
              <CardHeader className="border-b bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
                      style={{ background: activeIsClosed ? C.green : C.red }}
                    >
                      {initials(activeContact?.nome)}
                    </div>

                    <div className="min-w-0">
                      <CardTitle className="text-xl text-slate-900">
                        {conversationName(active)}
                      </CardTitle>

                      <p className="mt-0.5 text-base text-slate-500">
                        {formatPhoneBR(activeContact?.telefone || activeContact?.wa_id)}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge className="gap-1" style={badgeStyleForStatus(active.status)}>
                          {active.status === "bot" ? (
                            <Bot className="h-3.5 w-3.5" />
                          ) : (
                            <UserRound className="h-3.5 w-3.5" />
                          )}
                          {statusLabel(active.status)}
                        </Badge>

                        <Badge variant="secondary" className="gap-1">
                          <Tag className="h-3.5 w-3.5" />
                          Fila: {queueLabel(queueFromConversation(active))}
                        </Badge>

                        {active.assigned_to ? (
                          <Badge variant="outline" className="gap-1">
                            <UserCheck className="h-3.5 w-3.5" />
                            {activeIsMine ? "Seu atendimento" : "Assumido"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            Novo contato
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!activeIsClosed && !active.assigned_to && (
                      <Button
                        onClick={assumirConversa}
                        disabled={updatingConversation}
                        style={{ background: C.red }}
                        className="gap-2 text-white hover:opacity-95"
                      >
                        {updatingConversation ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                        Assumir conversa
                      </Button>
                    )}

                    {!activeIsClosed && active.assigned_to && !activeIsMine && (
                      <Button
                        variant="outline"
                        onClick={assumirConversa}
                        disabled={updatingConversation}
                        className="gap-2"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        Assumir de outro usuário
                      </Button>
                    )}

                    {!activeIsClosed && (
                      <Button
                        variant="outline"
                        onClick={finalizarConversa}
                        disabled={updatingConversation}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Finalizar
                      </Button>
                    )}

                    {activeIsClosed && (
                      <Button
                        variant="outline"
                        onClick={reabrirConversa}
                        disabled={updatingConversation}
                        className="gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>

                {!activeIsClosed && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    <span className="mr-1 flex items-center text-sm font-semibold text-slate-500">
                      Mover para:
                    </span>

                    {[
                      ["triagem", "Triagem"],
                      ["comercial", "Comercial"],
                      ["boleto", "Boleto"],
                      ["contemplacao", "Contemplação"],
                      ["pos_venda", "Pós-venda"],
                      ["suporte", "Suporte"],
                    ].map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={queueFromConversation(active) === value ? "default" : "outline"}
                        onClick={() => transferirFila(value)}
                        disabled={updatingConversation}
                        style={queueFromConversation(active) === value ? { background: C.navy } : undefined}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </CardHeader>

              <CardContent className="flex h-[calc(100vh-315px)] min-h-[520px] flex-col p-0">
                <div className="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-base text-slate-500">
                      Nenhuma mensagem neste atendimento.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const outbound = msg.direction === "outbound";
                      const isBot = msg.sender_type === "bot";

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-3xl px-4 py-3 text-base leading-relaxed shadow-sm ${
                              outbound
                                ? "rounded-br-md text-white"
                                : "rounded-bl-md border border-slate-100 bg-white text-slate-900"
                            }`}
                            style={{
                              background: outbound ? (isBot ? C.gold : C.navy) : "white",
                              color: outbound && isBot ? C.navy : undefined,
                            }}
                          >
                            <p className="whitespace-pre-wrap">
                              {msg.body || "Mensagem sem texto"}
                            </p>

                            <p
                              className={`mt-2 text-[11px] ${
                                outbound ? "text-white/70" : "text-slate-400"
                              }`}
                            >
                              {fmtTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t bg-white p-4">
                  {activeIsClosed ? (
                    <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">
                      Este atendimento foi finalizado. Reabra a conversa para responder novamente.
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Digite sua mensagem... Use Enter para enviar e Shift + Enter para quebrar linha."
                        className="min-h-[72px] resize-none text-base leading-relaxed"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                      />

                      <Button
                        onClick={sendMessage}
                        disabled={!canSend}
                        className="min-w-[64px] px-4"
                        style={{ background: C.red }}
                      >
                        {sending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
