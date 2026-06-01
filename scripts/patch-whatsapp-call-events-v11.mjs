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

const oldFallback = `  if (type === "document") return "Documento recebido";
  if (type === "sticker") return "Figurinha recebida";

  return "Mensagem sem texto";`;

const newFallback = `  if (type === "document") return "Documento recebido";
  if (type === "sticker") return "Figurinha recebida";
  if (type === "call") return msg.body || "Chamada WhatsApp";

  return "Mensagem sem texto";`;

const oldIcon = `  if (value === "document") return <FileText className="h-4 w-4" />;

  return null;`;

const newIcon = `  if (value === "document") return <FileText className="h-4 w-4" />;
  if (value === "call") return <Phone className="h-4 w-4" />;

  return null;`;

const oldCallHandler = `async function handleSingleCallEvent(payload: any, value: any, call: any) {
  const now = new Date().toISOString();
  const phoneNumberId = value?.metadata?.phone_number_id || null;
  const displayPhoneNumber = value?.metadata?.display_phone_number || null;
  await upsertAccount(phoneNumberId, displayPhoneNumber);

  const waId = extractCallPhone(value, call);
  const metaCallId = extractCallId(call);
  const status = extractCallStatus(call);
  const direction = call?.from || call?.caller || call?.customer ? "inbound" : "outbound";

  console.log("WHATSAPP_CALL_EVENT", {
    waId,
    metaCallId,
    status,
    direction,
    keys: Object.keys(call || {}),
  });

  const payloadToStore = {
    phone: waId || null,
    wa_id: waId || null,
    direction,
    status,
    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },
  };

  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);

  if (insertCallError) {
    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);
  }
}`;

const newCallHandler = `async function handleSingleCallEvent(payload: any, value: any, call: any) {
  const now = new Date().toISOString();
  const phoneNumberId = value?.metadata?.phone_number_id || null;
  const displayPhoneNumber = value?.metadata?.display_phone_number || null;
  const accountId = await upsertAccount(phoneNumberId, displayPhoneNumber);

  const waId = extractCallPhone(value, call);
  const metaCallId = extractCallId(call);
  const status = extractCallStatus(call);
  const direction = call?.from || call?.caller || call?.customer ? "inbound" : "outbound";
  const contactFromContacts = value?.contacts?.find((c: any) => onlyDigits(c?.wa_id) === waId) || value?.contacts?.[0];
  const nome = contactFromContacts?.profile?.name || null;

  console.log("WHATSAPP_CALL_EVENT", {
    waId,
    metaCallId,
    status,
    direction,
    keys: Object.keys(call || {}),
    rawCall: call,
  });

  const payloadToStore = {
    phone: waId || null,
    wa_id: waId || null,
    direction,
    status,
    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },
  };

  const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert(payloadToStore);

  if (insertCallError) {
    console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);
  }

  if (!waId) return;

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: waId,
        telefone: waId,
        nome,
        updated_at: now,
      },
      { onConflict: "wa_id" }
    )
    .select("id, lead_id")
    .single();

  if (contactError || !contact?.id) {
    console.error("WHATSAPP_CALL_CONTACT_UPSERT_ERROR", contactError);
    return;
  }

  let conversation = await findActiveConversation(contact.id);

  if (!conversation?.id) {
    const { data: createdConversation, error: createConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        account_id: accountId,
        contact_id: contact.id,
        lead_id: contact.lead_id,
        status: "humano",
        stage: "triagem",
        queue: "triagem",
        last_message: "Chamada WhatsApp recebida",
        last_message_at: now,
        unread_count: direction === "inbound" ? 1 : 0,
      })
      .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
      .single();

    if (createConversationError || !createdConversation?.id) {
      console.error("WHATSAPP_CALL_CONVERSATION_CREATE_ERROR", createConversationError);
      return;
    }

    conversation = createdConversation;
  } else {
    const { error: updateConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message: direction === "inbound" ? "Chamada WhatsApp recebida" : "Chamada WhatsApp realizada",
        last_message_at: now,
        unread_count: direction === "inbound" ? (conversation.unread_count || 0) + 1 : conversation.unread_count || 0,
        updated_at: now,
      })
      .eq("id", conversation.id);

    if (updateConversationError) {
      console.error("WHATSAPP_CALL_CONVERSATION_UPDATE_ERROR", updateConversationError);
    }
  }

  const body = direction === "inbound" ? "Chamada WhatsApp recebida" : "Chamada WhatsApp realizada";

  const messagePayload = {
    conversation_id: conversation.id,
    direction: direction === "inbound" ? "inbound" : "outbound",
    sender_type: direction === "inbound" ? "cliente" : "usuario",
    message_type: "call",
    body: body + (status ? " • " + status : ""),
    meta_message_id: metaCallId ? "call:" + metaCallId + ":" + (status || "event") : null,
    raw_payload: { payload, value, call, meta_call_id: metaCallId, provider: "meta_whatsapp_calling_api" },
  };

  const { error: messageError } = messagePayload.meta_message_id
    ? await supabaseAdmin.from("whatsapp_messages").upsert(messagePayload, { onConflict: "meta_message_id" })
    : await supabaseAdmin.from("whatsapp_messages").insert(messagePayload);

  if (messageError) {
    console.error("WHATSAPP_CALL_MESSAGE_INSERT_ERROR", messageError);
  }
}`;

patch(pageFile, "messageFallback-call", oldFallback, newFallback);
patch(pageFile, "MediaIcon-call", oldIcon, newIcon);
patch(webhookFile, "handleSingleCallEvent-persist-conversation", oldCallHandler, newCallHandler);

if (changed) {
  console.log("[patch-whatsapp-call-events-v11] patches aplicados");
} else {
  console.log("[patch-whatsapp-call-events-v11] nenhuma alteração necessária");
}
