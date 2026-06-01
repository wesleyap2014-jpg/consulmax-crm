import fs from "node:fs";

const webhookFile = "api/whatsapp/webhook.ts";

function log(label, status) {
  console.log(`[patch-whatsapp-central-v19] ${label}: ${status}`);
}

let s = fs.readFileSync(webhookFile, "utf8");
let changed = false;

function replace(label, from, to) {
  if (s.includes(to)) return log(label, "já aplicado");
  if (!s.includes(from)) return log(label, "trecho não encontrado");
  s = s.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

const messageTypeTpl = "`" + "${messageType} recebido" + "`";
const ratingTpl = "`" + "Avaliação recebida: ${ratingValue(body) || body}" + "`";

// Reabre ticket finalizado quando chega mensagem normal do cliente.
const oldBlock = [
  "      const updatePayload = handledAsClosedRating",
  "        ? {",
  `            last_message: ${ratingTpl},`,
  "            last_message_at: inboundAt,",
  "            unread_count: 0,",
  "            status: \"fechada\",",
  "            stage: \"finalizado\",",
  "            queue: \"finalizado\",",
  "            updated_at: inboundAt,",
  "          }",
  "        : {",
  `            last_message: body || (mediaId ? ${messageTypeTpl} : body),`,
  "            last_message_at: inboundAt,",
  "            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,",
  "            updated_at: inboundAt,",
  "          };",
].join("\n");

const newBlock = [
  "      const inboundStatus = String(conversation.status || \"\").toLowerCase();",
  "      const inboundStage = String(conversation.stage || \"\").toLowerCase();",
  "      const inboundQueue = String(conversation.queue || \"\").toLowerCase();",
  "      const forceReopenInbound =",
  "        !handledAsClosedRating &&",
  "        !isRating &&",
  "        (inboundStatus === \"fechada\" || inboundStatus === \"finalizado\" || inboundStage === \"finalizado\" || inboundQueue === \"finalizado\" || !!conversation.closed_at);",
  "",
  "      const updatePayload = handledAsClosedRating",
  "        ? {",
  `            last_message: ${ratingTpl},`,
  "            last_message_at: inboundAt,",
  "            unread_count: 0,",
  "            status: \"fechada\",",
  "            stage: \"finalizado\",",
  "            queue: \"finalizado\",",
  "            updated_at: inboundAt,",
  "          }",
  "        : {",
  `            last_message: body || (mediaId ? ${messageTypeTpl} : body),`,
  "            last_message_at: inboundAt,",
  "            unread_count: optOut || optIn ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,",
  "            status: forceReopenInbound ? \"humano\" : conversation.status,",
  "            stage: forceReopenInbound ? \"triagem\" : conversation.stage,",
  "            queue: forceReopenInbound ? \"triagem\" : conversation.queue,",
  "            closed_at: forceReopenInbound ? null : conversation.closed_at,",
  "            updated_at: inboundAt,",
  "          };",
].join("\n");

replace("payload reabre inbound", oldBlock, newBlock);

const oldAfterUpdate = [
  "    if (updateConversationError) {",
  "      console.error(\"WHATSAPP_CONVERSATION_UPDATE_ERROR\", updateConversationError);",
  "    }",
].join("\n");

const newAfterUpdate = [
  "    if (updateConversationError) {",
  "      console.error(\"WHATSAPP_CONVERSATION_UPDATE_ERROR\", updateConversationError);",
  "    }",
  "",
  "    if (!handledAsClosedRating && typeof forceReopenInbound !== \"undefined\" && forceReopenInbound) {",
  "      console.log(\"WHATSAPP_REOPENED_INBOUND_TICKET_V19\", {",
  "        conversationId: conversation.id,",
  "        fromStatus: conversation.status,",
  "        fromStage: conversation.stage,",
  "        fromQueue: conversation.queue,",
  "        nextStatus: \"humano\",",
  "        nextStage: \"triagem\",",
  "        nextQueue: \"triagem\",",
  "      });",
  "    }",
].join("\n");

replace("log reabertura inbound", oldAfterUpdate, newAfterUpdate);

if (changed) fs.writeFileSync(webhookFile, s);
console.log("[patch-whatsapp-central-v19] concluído");
