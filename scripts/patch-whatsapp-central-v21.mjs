import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v21] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
const start = s.indexOf("async function findActiveConversation(contactId: string) {");
const end = s.indexOf("async function findRecentlyClosedConversationForRating", start);

if (start < 0 || end < 0) {
  log("findActiveConversation", "ponto não encontrado");
} else {
  const replacement = [
    "async function findActiveConversation(contactId: string) {",
    "  const selectFields = \"id, unread_count, status, stage, queue, closed_at, last_message_at, created_at\";",
    "",
    "  // 1) Sempre prioriza ticket aberto/não finalizado do mesmo contato.",
    "  const { data: openRows, error: openError } = await supabaseAdmin",
    "    .from(\"whatsapp_conversations\")",
    "    .select(selectFields)",
    "    .eq(\"contact_id\", contactId)",
    "    .is(\"closed_at\", null)",
    "    .order(\"last_message_at\", { ascending: false, nullsFirst: false })",
    "    .order(\"created_at\", { ascending: false })",
    "    .limit(10);",
    "",
    "  if (openError) {",
    "    console.error(\"WHATSAPP_CONVERSATION_OPEN_FIND_ERROR\", openError);",
    "  } else {",
    "    const openConversation = (openRows || []).find((row: any) => {",
    "      const status = String(row.status || \"\").toLowerCase();",
    "      const stage = String(row.stage || \"\").toLowerCase();",
    "      const queue = String(row.queue || \"\").toLowerCase();",
    "      return status !== \"fechada\" && status !== \"finalizado\" && stage !== \"finalizado\" && queue !== \"finalizado\";",
    "    });",
    "",
    "    if (openConversation?.id) {",
    "      console.log(\"WHATSAPP_ACTIVE_TICKET_SELECTED_V21\", {",
    "        contactId,",
    "        conversationId: openConversation.id,",
    "        status: openConversation.status,",
    "        stage: openConversation.stage,",
    "        queue: openConversation.queue,",
    "      });",
    "      return openConversation;",
    "    }",
    "  }",
    "",
    "  // 2) Só se não existir aberto, permite reaproveitar/reabrir um finalizado recente.",
    "  const { data, error } = await supabaseAdmin",
    "    .from(\"whatsapp_conversations\")",
    "    .select(selectFields)",
    "    .eq(\"contact_id\", contactId)",
    "    .order(\"last_message_at\", { ascending: false, nullsFirst: false })",
    "    .order(\"created_at\", { ascending: false })",
    "    .limit(1)",
    "    .maybeSingle();",
    "",
    "  if (error) {",
    "    console.error(\"WHATSAPP_CONVERSATION_FIND_ERROR\", error);",
    "    return null;",
    "  }",
    "",
    "  if (!data?.id) return null;",
    "",
    "  const status = String(data.status || \"\").toLowerCase();",
    "  const stage = String(data.stage || \"\").toLowerCase();",
    "  const queue = String(data.queue || \"\").toLowerCase();",
    "  const closed = status === \"fechada\" || status === \"finalizado\" || stage === \"finalizado\" || queue === \"finalizado\" || !!data.closed_at;",
    "",
    "  if (!closed) return data;",
    "",
    "  const ref = data.last_message_at || data.closed_at || data.created_at;",
    "  const hours = ref ? (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60) : 999;",
    "",
    "  if (hours <= 24) return data;",
    "",
    "  return null;",
    "}",
    "",
  ].join("\n");

  s = s.slice(0, start) + replacement + s.slice(end);
  fs.writeFileSync(webhookFile, s);
  log("findActiveConversation", "substituído com prioridade para ticket aberto");
}

console.log("[patch-whatsapp-central-v21] concluído");
