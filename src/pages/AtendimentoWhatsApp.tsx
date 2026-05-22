import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

type Conversation = {
  id: string;
  contact_id: string;
  lead_id: string | null;
  assigned_to: string | null;
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

function fmtTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function initials(name?: string | null) {
  const clean = String(name || "Cliente").trim();
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function AtendimentoWhatsApp() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    setAuthUserId(data?.user?.id ?? null);
  }

  async function loadConversations() {
    setLoading(true);

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
      .limit(80);

    if (error) {
      console.error(error);
      setConversations([]);
    } else {
      setConversations((data || []) as Conversation[]);
      if (!active && data?.[0]) {
        setActive(data[0] as Conversation);
      }
    }

    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setMessages([]);
      return;
    }

    setMessages((data || []) as Message[]);

    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);
  }

  useEffect(() => {
    loadAuth();
    loadConversations();
  }, []);

  useEffect(() => {
    if (active?.id) {
      loadMessages(active.id);
    }
  }, [active?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-central")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => {
          if (active?.id) loadMessages(active.id);
          loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active?.id]);

  const activeContact = active?.whatsapp_contacts;
  const activePhone = onlyDigits(activeContact?.telefone || activeContact?.wa_id);

  const filteredConversations = useMemo(() => {
    return conversations;
  }, [conversations]);

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
      await loadConversations();
    } finally {
      setSending(false);
    }
  }

  async function assumirConversa() {
    if (!active || !authUserId) return;

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({
        assigned_to: authUserId,
        status: "humano",
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);

    if (!error) {
      await loadConversations();
      setActive((prev) =>
        prev ? { ...prev, assigned_to: authUserId, status: "humano" } : prev
      );
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#f7f7f8" }}>
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.navy }}>
            Central WhatsApp
          </h1>
          <p className="text-sm text-slate-500">
            Caixa de entrada compartilhada da Consulmax para atendimento,
            triagem e qualificação de leads.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadConversations}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardHeader
            className="border-b"
            style={{
              background: `linear-gradient(135deg, ${C.navy}, ${C.red})`,
              color: "white",
            }}
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5" />
              Conversas
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Nenhuma conversa recebida ainda.
              </div>
            ) : (
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
                {filteredConversations.map((conv) => {
                  const contact = conv.whatsapp_contacts;
                  const selected = active?.id === conv.id;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActive(conv)}
                      className={`w-full border-b p-4 text-left transition hover:bg-slate-50 ${
                        selected ? "bg-slate-100" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ background: C.navy }}
                        >
                          {initials(contact?.nome)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-semibold text-slate-800">
                              {contact?.nome || "Cliente WhatsApp"}
                            </p>
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {fmtTime(conv.last_message_at)}
                            </span>
                          </div>

                          <p className="truncate text-xs text-slate-500">
                            {contact?.telefone || contact?.wa_id}
                          </p>

                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {conv.last_message || "—"}
                          </p>

                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="secondary">{conv.status}</Badge>
                            {conv.unread_count > 0 && (
                              <Badge
                                style={{
                                  background: C.red,
                                  color: "white",
                                }}
                              >
                                {conv.unread_count}
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
            <div className="flex h-[70vh] items-center justify-center text-slate-500">
              Selecione uma conversa.
            </div>
          ) : (
            <>
              <CardHeader className="border-b bg-white">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: C.red }}
                    >
                      {initials(activeContact?.nome)}
                    </div>

                    <div>
                      <CardTitle className="text-base text-slate-900">
                        {activeContact?.nome || "Cliente WhatsApp"}
                      </CardTitle>
                      <p className="text-sm text-slate-500">
                        {activeContact?.telefone || activeContact?.wa_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="gap-1"
                      style={{
                        background:
                          active.status === "bot" ? C.gold : C.navy,
                        color: "white",
                      }}
                    >
                      {active.status === "bot" ? (
                        <Bot className="h-3 w-3" />
                      ) : (
                        <UserRound className="h-3 w-3" />
                      )}
                      {active.status}
                    </Badge>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={assumirConversa}
                    >
                      Assumir conversa
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex h-[calc(100vh-250px)] flex-col p-0">
                <div className="flex-1 space-y-3 overflow-auto bg-slate-50 p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Nenhuma mensagem nesta conversa.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const outbound = msg.direction === "outbound";

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${
                            outbound ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                              outbound
                                ? "rounded-br-sm text-white"
                                : "rounded-bl-sm bg-white text-slate-800"
                            }`}
                            style={{
                              background: outbound ? C.navy : "white",
                            }}
                          >
                            <p className="whitespace-pre-wrap">
                              {msg.body || "Mensagem sem texto"}
                            </p>
                            <p
                              className={`mt-1 text-[10px] ${
                                outbound
                                  ? "text-white/70"
                                  : "text-slate-400"
                              }`}
                            >
                              {fmtTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t bg-white p-3">
                  <div className="flex gap-2">
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      className="min-h-[54px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                    />

                    <Button
                      onClick={sendMessage}
                      disabled={sending || !text.trim()}
                      className="h-auto min-w-[52px]"
                      style={{ background: C.red }}
                    >
                      {sending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
