import fs from "node:fs";

const pageFile = "src/pages/AtendimentoWhatsApp.tsx";
const webhookFile = "api/whatsapp/webhook.ts";

let changed = false;

function patch(file, label, from, to) {
  let s = fs.readFileSync(file, "utf8");

  if (s.includes(to)) {
    console.log(`[patch-whatsapp-call-events-v11] ${label}: já aplicado`);
    return;
  }

  if (!s.includes(from)) {
    console.warn(`[patch-whatsapp-call-events-v11] ${label}: trecho não encontrado`);
    return;
  }

  s = s.replace(from, to);
  fs.writeFileSync(file, s);
  changed = true;
  console.log(`[patch-whatsapp-call-events-v11] ${label}: aplicado`);
}

patch(
  pageFile,
  "messageFallback-call",
  `  if (type === "document") return "Documento recebido";\n  if (type === "sticker") return "Figurinha recebida";\n\n  return "Mensagem sem texto";`,
  `  if (type === "document") return "Documento recebido";\n  if (type === "sticker") return "Figurinha recebida";\n  if (type === "call") return msg.body || "Chamada WhatsApp";\n\n  return "Mensagem sem texto";`
);

patch(
  pageFile,
  "MediaIcon-call",
  `  if (value === "document") return <FileText className="h-4 w-4" />;\n\n  return null;`,
  `  if (value === "document") return <FileText className="h-4 w-4" />;\n  if (value === "call") return <Phone className="h-4 w-4" />;\n\n  return null;`
);

patch(
  webhookFile,
  "handleSingleCallEvent-persist-conversation",
  `async function handleSingleCallEvent(payload: any, value: any, call: any) {\n  const now = new Date().toISOString();\n  const phoneNumberId = value?.metadata?.phone_number_id || null;\n  const displayPhoneNumber = value?.metadata?.display_phone_number || null;\n  await upsertAccount(phoneNumberId, displayPhoneNumber);\n\n  const waId = extractCallPhone(value, call);\n  const metaCallId = extractCallId(call);\n  const status = extractCallStatus(call);\n  const direction = call?.from || call?.caller || call?.customer ? "inbound" : "outbound";\n\n  console.log("WHATSAPP_CALL_EVENT", {\n    waId,\n    metaCallId,\n    status,\n    direction,\n    keys: Object.keys(call || {}),\n  });\n\n  const payloadToStore = {\n    phone: waId || null,\n    wa_id: waId || null,\n    direction,\n    status,\n    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },\n  };\n\n  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n  }\n}`,
  `async function handleSingleCallEvent(payload: any, value: any, call: any) {\n  const now = new Date().toISOString();\n  const phoneNumberId = value?.metadata?.phone_number_id || null;\n  const displayPhoneNumber = value?.metadata?.display_phone_number || null;\n  const accountId = await upsertAccount(phoneNumberId, displayPhoneNumber);\n\n  const waId = extractCallPhone(value, call);\n  const metaCallId = extractCallId(call);\n  const status = extractCallStatus(call);\n  const direction = call?.from || call?.caller || call?.customer ? "inbound" : "outbound";\n  const contactFromContacts = value?.contacts?.find((c: any) => onlyDigits(c?.wa_id) === waId) || value?.contacts?.[0];\n  const nome = contactFromContacts?.profile?.name || null;\n\n  console.log("WHATSAPP_CALL_EVENT", {\n    waId,\n    metaCallId,\n    status,\n    direction,\n    keys: Object.keys(call || {}),\n    rawCall: call,\n  });\n\n  const payloadToStore = {\n    phone: waId || null,\n    wa_id: waId || null,\n    direction,\n    status,\n    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },\n  };\n\n  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);\n\n  if (insertCallError) {\n    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);\n  }\n\n  if (!waId) return;\n\n  const { data: contact, error: contactError } = await supabaseAdmin\n    .from("whatsapp_contacts")\n    .upsert(\n      {\n        wa_id: waId,\n        telefone: waId,\n        nome,\n        updated_at: now,\n      },\n      { onConflict: "wa_id" }\n    )\n    .select("id, lead_id")\n    .single();\n\n  if (contactError || !contact?.id) {\n    console.error("WHATSAPP_CALL_CONTACT_UPSERT_ERROR", contactError);\n    return;\n  }\n\n  let conversation = await findActiveConversation(contact.id);\n\n  if (!conversation?.id) {\n    const { data: createdConversation, error: createConversationError } = await supabaseAdmin\n      .from("whatsapp_conversations")\n      .insert({\n        account_id: accountId,\n        contact_id: contact.id,\n        lead_id: contact.lead_id,\n        status: "humano",\n        stage: "triagem",\n        queue: "triagem",\n        last_message: "Chamada WhatsApp recebida",\n        last_message_at: now,\n        unread_count: direction === "inbound" ? 1 : 0,\n      })\n      .select("id, unread_count, status, stage, queue, closed_at, last_message_at")\n      .single();\n\n    if (createConversationError || !createdConversation?.id) {\n      console.error("WHATSAPP_CALL_CONVERSATION_CREATE_ERROR", createConversationError);\n      return;\n    }\n\n    conversation = createdConversation;\n  } else {\n    const { error: updateConversationError } = await supabaseAdmin\n      .from("whatsapp_conversations")\n      .update({\n        last_message: direction === "inbound" ? "Chamada WhatsApp recebida" : "Chamada WhatsApp realizada",\n        last_message_at: now,\n        unread_count: direction === "inbound" ? (conversation.unread_count || 0) + 1 : conversation.unread_count || 0,\n        updated_at: now,\n      })\n      .eq("id", conversation.id);\n\n    if (updateConversationError) {\n      console.error("WHATSAPP_CALL_CONVERSATION_UPDATE_ERROR", updateConversationError);\n    }\n  }\n\n  const body = direction === "inbound" ? "Chamada WhatsApp recebida" : "Chamada WhatsApp realizada";\n\n  const messagePayload = {\n    conversation_id: conversation.id,\n    direction: direction === "inbound" ? "inbound" : "outbound",\n    sender_type: direction === "inbound" ? "cliente" : "usuario",\n    message_type: "call",\n    body: `${body}${status ? ` • ${status}` : ""}`,\n    meta_message_id: metaCallId ? `call:${metaCallId}:${status || "event"}` : null,\n    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },\n  };\n\n  const { error: messageError } = messagePayload.meta_message_id\n    ? await supabaseAdmin.from("whatsapp_messages").upsert(messagePayload, { onConflict: "meta_message_id" })\n    : await supabaseAdmin.from("whatsapp_messages").insert(messagePayload);\n\n  if (messageError) {\n    console.error("WHATSAPP_CALL_MESSAGE_INSERT_ERROR", messageError);\n  }\n}`
);

if (changed) {
  console.log("[patch-whatsapp-call-events-v11] patches aplicados");
} else {
  console.log("[patch-whatsapp-call-events-v11] nenhuma alteração necessária");
}
