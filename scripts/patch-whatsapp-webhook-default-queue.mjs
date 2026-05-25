import fs from 'node:fs';

const file = 'api/whatsapp/webhook.ts';
let s = fs.readFileSync(file, 'utf8');

const oldFind = `async function findActiveConversation(contactId: string) {
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
}`;

const newFind = `async function findActiveConversation(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("WHATSAPP_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  return (data || []).find((row: any) => {
    const status = String(row?.status || "").toLowerCase();
    const stage = String(row?.stage || "").toLowerCase();
    const queue = String(row?.queue || "").toLowerCase();
    return status !== "fechada" && status !== "finalizado" && stage !== "finalizado" && queue !== "finalizado";
  }) || null;
}`;

if (s.includes(oldFind)) {
  s = s.replace(oldFind, newFind);
} else {
  console.warn('[patch-whatsapp-webhook-default-queue] bloco findActiveConversation não encontrado');
}

const oldUpdate = `      : {
          last_message: body || (mediaId ? \`${messageType} recebido\` : body),
          last_message_at: inboundAt,
          unread_count: (conversation.unread_count || 0) + 1,
          updated_at: inboundAt,
        };`;

const newUpdate = `      : {
          last_message: body || (mediaId ? \`${messageType} recebido\` : body),
          last_message_at: inboundAt,
          unread_count: (conversation.unread_count || 0) + 1,
          status: conversation.status || "bot",
          stage: conversation.stage || "entrada",
          queue: conversation.queue || "novos_contatos",
          updated_at: inboundAt,
        };`;

if (s.includes(oldUpdate)) {
  s = s.replace(oldUpdate, newUpdate);
} else {
  console.warn('[patch-whatsapp-webhook-default-queue] bloco updatePayload não encontrado');
}

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-webhook-default-queue] ok');
