import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v18] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
let changed = false;

function insertAfter(label, needle, block, flag) {
  if (s.includes(flag)) return log(label, "já aplicado");
  if (!s.includes(needle)) return log(label, "ponto não encontrado");
  s = s.replace(needle, `${needle}\n${block}`);
  changed = true;
  log(label, "aplicado");
}

insertAfter(
  "força reabertura de ticket inbound",
  `  let handledAsClosedRating = false;`,
  `
  const shouldReopenInboundConversation = (conv: any) => {
    if (!conv?.id || isRating) return false;
    const status = String(conv.status || "").toLowerCase();
    const stage = String(conv.stage || "").toLowerCase();
    const queue = String(conv.queue || "").toLowerCase();
    return status === "fechada" || status === "finalizado" || stage === "finalizado" || queue === "finalizado" || !!conv.closed_at;
  };
`,
  "shouldReopenInboundConversation"
);

insertAfter(
  "reabre antes de atualizar conversa",
  `    const updatePayload = handledAsClosedRating`,
  `    const forceReopenInbound = shouldReopenInboundConversation(conversation);`,
  "forceReopenInbound"
);

// Ajusta o payload não-rating para reabrir quando necessário, sem depender do patch v15 que não encontrou o trecho.
s = s.replace(
  `            last_message: body || (mediaId ? \`${"$"}{messageType} recebido\` : body),\n            last_message_at: inboundAt,\n            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,\n            updated_at: inboundAt,\n          };`,
  `            last_message: body || (mediaId ? \`${"$"}{messageType} recebido\` : body),\n            last_message_at: inboundAt,\n            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,\n            status: forceReopenInbound ? "humano" : conversation.status,\n            stage: forceReopenInbound ? "triagem" : conversation.stage,\n            queue: forceReopenInbound ? "triagem" : conversation.queue,\n            closed_at: forceReopenInbound ? null : conversation.closed_at,\n            updated_at: inboundAt,\n          };`
);
if (s.includes("forceReopenInbound ? \"humano\"")) {
  changed = true;
  log("payload de reabertura", "aplicado ou já presente");
} else {
  log("payload de reabertura", "trecho não encontrado");
}

insertAfter(
  "log reabertura inbound",
  `    if (updateConversationError) {
      console.error("WHATSAPP_CONVERSATION_UPDATE_ERROR", updateConversationError);
    }`,
  `

    if (!handledAsClosedRating && shouldReopenInboundConversation(conversation)) {
      console.log("WHATSAPP_REOPENED_INBOUND_TICKET_V18", {
        conversationId: conversation.id,
        fromStatus: conversation.status,
        fromStage: conversation.stage,
        fromQueue: conversation.queue,
        nextStatus: "humano",
        nextStage: "triagem",
        nextQueue: "triagem",
      });
    }`,
  "WHATSAPP_REOPENED_INBOUND_TICKET_V18"
);

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v18] concluído");
