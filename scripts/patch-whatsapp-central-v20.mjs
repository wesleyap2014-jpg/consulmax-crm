import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v20] ${label}: ${status}`);
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

const needle = [
  "  if (messageError) {",
  "    console.error(\"WHATSAPP_MESSAGE_INSERT_ERROR\", messageError);",
  "    return;",
  "  }",
].join("\n");

const block = [
  "",
  "  const inboundStatusV20 = String(conversation.status || \"\").toLowerCase();",
  "  const inboundStageV20 = String(conversation.stage || \"\").toLowerCase();",
  "  const inboundQueueV20 = String(conversation.queue || \"\").toLowerCase();",
  "  const shouldReopenInboundV20 =",
  "    !handledAsClosedRating &&",
  "    !isRating &&",
  "    (inboundStatusV20 === \"fechada\" || inboundStatusV20 === \"finalizado\" || inboundStageV20 === \"finalizado\" || inboundQueueV20 === \"finalizado\" || !!conversation.closed_at);",
  "",
  "  if (shouldReopenInboundV20) {",
  "    const reopenLastMessageV20 = body || (mediaId ? String(messageType || \"mídia\") + \" recebido\" : body);",
  "    const { error: reopenInboundErrorV20 } = await supabaseAdmin",
  "      .from(\"whatsapp_conversations\")",
  "      .update({",
  "        status: \"humano\",",
  "        stage: \"triagem\",",
  "        queue: \"triagem\",",
  "        closed_at: null,",
  "        last_message: reopenLastMessageV20,",
  "        last_message_at: inboundAt,",
  "        unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,",
  "        updated_at: inboundAt,",
  "      })",
  "      .eq(\"id\", conversation.id);",
  "",
  "    if (reopenInboundErrorV20) {",
  "      console.error(\"WHATSAPP_REOPEN_INBOUND_TICKET_V20_ERROR\", reopenInboundErrorV20);",
  "    } else {",
  "      console.log(\"WHATSAPP_REOPENED_INBOUND_TICKET_V20\", {",
  "        conversationId: conversation.id,",
  "        fromStatus: conversation.status,",
  "        fromStage: conversation.stage,",
  "        fromQueue: conversation.queue,",
  "        nextStatus: \"humano\",",
  "        nextStage: \"triagem\",",
  "        nextQueue: \"triagem\",",
  "      });",
  "    }",
  "  }",
].join("\n");

insertAfter("reabre inbound após salvar mensagem", needle, block, "WHATSAPP_REOPENED_INBOUND_TICKET_V20");

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v20] concluído");
