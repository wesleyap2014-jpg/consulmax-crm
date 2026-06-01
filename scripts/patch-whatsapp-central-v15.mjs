import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";

function patch(file, label, from, to) {
  let s = fs.readFileSync(file, "utf8");

  if (s.includes(to)) {
    console.log(`[patch-whatsapp-central-v15] ${label}: já aplicado`);
    return;
  }

  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-central-v15] ${label}: trecho não encontrado`);
    return;
  }

  s = s.replace(from, to);
  fs.writeFileSync(file, s);
  console.log(`[patch-whatsapp-central-v15] ${label}: aplicado`);
}

function insertBefore(file, label, needle, block, flag) {
  let s = fs.readFileSync(file, "utf8");

  if (s.includes(flag)) {
    console.log(`[patch-whatsapp-central-v15] ${label}: já aplicado`);
    return;
  }

  if (!s.includes(needle)) {
    console.warn(`[patch-whatsapp-central-v15] ${label}: ponto não encontrado`);
    return;
  }

  s = s.replace(needle, `${block}\n${needle}`);
  fs.writeFileSync(file, s);
  console.log(`[patch-whatsapp-central-v15] ${label}: aplicado`);
}

// 1) Campo de mensagem mais compacto.
patch(
  pageFile,
  "textarea compacto",
  `                  className="min-h-[72px] resize-none text-base leading-relaxed"`,
  `                  className="min-h-[44px] max-h-[92px] resize-none text-sm leading-relaxed py-2"`
);

patch(
  pageFile,
  "composer compacto",
  `<div className="border-t bg-white p-4">`,
  `<div className="border-t bg-white p-3">`
);

// 2) ESC para minimizar/restaurar a conversa.
insertBefore(
  pageFile,
  "atalho ESC",
  `  async function sendMessage(customBody?: string) {`,
  `  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (emojiOpen) {
        setEmojiOpen(false);
        return;
      }

      if (activeRef.current) {
        setDrawerMinimized((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [emojiOpen]);
`,
  "function handleEsc(event: KeyboardEvent)"
);

// 3) Envio do template oficial de permissão de ligação com fallback profissional.
insertBefore(
  pageFile,
  "função template permissão chamada",
  `  function addEmoji(emoji: string) {`,
  `  async function sendCallPermissionTemplate() {
    if (!active || !activePhone) {
      alert("Telefone do contato não identificado.");
      return false;
    }

    try {
      const response = await fetch("/api/whatsapp/call-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: active.id, to: activePhone, user_id: authUserId }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(JSON.stringify(result?.error || result).slice(0, 800));
      }

      await loadMessages(active.id);
      await loadConversations({ silent: true });
      alert("Solicitação oficial de permissão de ligação enviada pelo WhatsApp. Assim que o cliente autorizar, tente ligar novamente.");
      return true;
    } catch (error) {
      console.warn("Template oficial de permissão ainda indisponível:", error);
      const fallback = "Olá! Aqui é da Consulmax. Para sua segurança, o WhatsApp exige autorização antes de receber chamadas iniciadas pela nossa equipe. Você pode autorizar a ligação por aqui para continuarmos seu atendimento?";
      return sendMessage(fallback);
    }
  }
`,
  "async function sendCallPermissionTemplate()"
);

patch(
  pageFile,
  "callSoon via template",
  `  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }`,
  `  async function callSoon() {
    await sendCallPermissionTemplate();
  }`
);

patch(
  pageFile,
  "hint chamada",
  `<p className="text-xs text-slate-400">Assinatura automática: as mensagens enviadas pelo CRM exibem o nome do usuário responsável.</p>`,
  `<p className="text-xs text-slate-400">Assinatura automática: mensagens enviadas pelo CRM exibem o responsável. Para ligar pelo WhatsApp, solicite a permissão oficial do cliente pelo botão de telefone.</p>`
);

// 4) Evitar criação de novo ticket quando o cliente responde a uma conversa encerrada há pouco tempo.
patch(
  webhookFile,
  "findActiveConversation tolerante",
  `async function findActiveConversation(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
    .eq("contact_id", contactId)
    .neq("status", "fechada")
    .neq("status", "finalizado")
    .neq("stage", "finalizado")
    .neq("queue", "finalizado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("WHATSAPP_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  return data;
}`,
  `async function findActiveConversation(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at, created_at")
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("WHATSAPP_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  if (!data?.id) return null;

  const status = String(data.status || "").toLowerCase();
  const stage = String(data.stage || "").toLowerCase();
  const queue = String(data.queue || "").toLowerCase();
  const closed = status === "fechada" || status === "finalizado" || stage === "finalizado" || queue === "finalizado" || !!data.closed_at;

  if (!closed) return data;

  const ref = data.last_message_at || data.closed_at || data.created_at;
  const hours = ref ? (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60) : 999;

  // Se o CRM acabou de falar com o cliente e ele respondeu, reaproveita o mesmo ticket.
  if (hours <= 24) return data;

  return null;
}`
);

patch(
  webhookFile,
  "reabre conversa reaproveitada",
  `        : {
            last_message: body || (mediaId ? \`${"$"}{messageType} recebido\` : body),
            last_message_at: inboundAt,
            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
            updated_at: inboundAt,
          };`,
  `        : {
            last_message: body || (mediaId ? \`${"$"}{messageType} recebido\` : body),
            last_message_at: inboundAt,
            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
            status: conversation.status === "fechada" || conversation.status === "finalizado" ? "humano" : conversation.status,
            stage: conversation.stage === "finalizado" ? "triagem" : conversation.stage,
            queue: conversation.queue === "finalizado" ? "triagem" : conversation.queue,
            closed_at: null,
            updated_at: inboundAt,
          };`
);

// 5) Registrar quando a Meta começar a devolver call_permission_reply.
patch(
  webhookFile,
  "log call_permission_reply",
  `      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }`,
  `      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }

      const callPermissionReplies = value?.call_permission_reply || value?.call_permission_replies || [];
      if (Array.isArray(callPermissionReplies) && callPermissionReplies.length > 0) {
        console.log("WHATSAPP_CALL_PERMISSION_REPLY", callPermissionReplies);
      }`
);

console.log("[patch-whatsapp-central-v15] concluído");
