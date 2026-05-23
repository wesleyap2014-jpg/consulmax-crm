import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function extractMessageBody(message: any) {
  return (
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    message?.image?.caption ||
    message?.document?.caption ||
    message?.audio?.caption ||
    ""
  );
}

function extractMediaId(message: any) {
  return (
    message?.image?.id ||
    message?.audio?.id ||
    message?.video?.id ||
    message?.document?.id ||
    message?.sticker?.id ||
    null
  );
}

function extractMimeType(message: any) {
  return (
    message?.image?.mime_type ||
    message?.audio?.mime_type ||
    message?.video?.mime_type ||
    message?.document?.mime_type ||
    null
  );
}

function isRatingResponse(body?: string | null) {
  const raw = String(body || "").trim();
  const digits = onlyDigits(raw);

  if (!digits) return false;
  if (digits.length !== 1) return false;
  if (!/[1-5]/.test(digits)) return false;

  // Evita classificar mensagens longas com números soltos como avaliação.
  return raw.length <= 20;
}

function ratingValue(body?: string | null) {
  const digits = onlyDigits(body);
  return digits.length === 1 ? digits : null;
}

function isRecentClosedConversation(value?: string | null) {
  if (!value) return true;

  const closedAt = new Date(value).getTime();
  if (Number.isNaN(closedAt)) return true;

  const days = (Date.now() - closedAt) / (1000 * 60 * 60 * 24);
  return days <= 7;
}

async function upsertAccount(phoneNumberId?: string | null, displayPhoneNumber?: string | null) {
  if (!phoneNumberId) return null;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_accounts")
    .upsert(
      {
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber || null,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("WHATSAPP_ACCOUNT_UPSERT_ERROR", error);
    return null;
  }

  return data?.id ?? null;
}

async function sendEvaluationThanks(params: {
  conversationId: string;
  phoneNumberId: string | null;
  to: string;
  rating: string | null;
}) {
  const { conversationId, phoneNumberId, to, rating } = params;

  if (!META_TOKEN || !phoneNumberId || !to) return;

  const body = rating
    ? `Obrigado pela sua avaliação ${rating}/5! 😊\n\nA Consulmax agradece seu retorno. Ele nos ajuda a melhorar cada vez mais o nosso atendimento.`
    : "Obrigado pela sua avaliação! 😊\n\nA Consulmax agradece seu retorno. Ele nos ajuda a melhorar cada vez mais o nosso atendimento.";

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WHATSAPP_RATING_THANKS_SEND_ERROR", data);
      return;
    }

    const metaMessageId = data?.messages?.[0]?.id || null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "bot",
      user_id: null,
      message_type: "text",
      body,
      meta_message_id: metaMessageId,
      raw_payload: data,
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message: body,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        status: "fechada",
        stage: "finalizado",
        queue: "finalizado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  } catch (error) {
    console.error("WHATSAPP_RATING_THANKS_ERROR", error);
  }
}

async function findActiveConversation(contactId: string) {
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
}

async function findRecentlyClosedConversationForRating(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
    .eq("contact_id", contactId)
    .or("status.eq.fechada,status.eq.finalizado,stage.eq.finalizado,queue.eq.finalizado")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("WHATSAPP_CLOSED_CONVERSATION_FIND_ERROR", error);
    return null;
  }

  if (!data?.id) return null;

  const refDate = data.closed_at || data.last_message_at;
  if (!isRecentClosedConversation(refDate)) return null;

  return data;
}

async function handleSingleInboundMessage(payload: any, value: any, message: any) {
  const phoneNumberId = value?.metadata?.phone_number_id || null;
  const displayPhoneNumber = value?.metadata?.display_phone_number || null;

  const accountId = await upsertAccount(phoneNumberId, displayPhoneNumber);

  const contactFromMessage = message?.from;
  const contactFromContacts = value?.contacts?.find((c: any) => c?.wa_id === contactFromMessage) || value?.contacts?.[0];

  const rawWaId = contactFromContacts?.wa_id || contactFromMessage;
  const waId = onlyDigits(rawWaId);

  if (!message || !waId) {
    console.warn("WHATSAPP_IGNORED_MESSAGE_WITHOUT_WA_ID", {
      hasMessage: !!message,
      rawWaId,
      from: contactFromMessage,
      contacts: value?.contacts,
    });
    return;
  }

  const nome = contactFromContacts?.profile?.name || null;
  const messageType = message?.type || "text";
  const body = extractMessageBody(message);
  const metaMessageId = message?.id || null;
  const inboundAt = new Date().toISOString();
  const isRating = isRatingResponse(body);

  console.log("WHATSAPP_INBOUND_MESSAGE", {
    waId,
    nome,
    messageType,
    bodyPreview: body?.slice?.(0, 80),
    metaMessageId,
    isRating,
  });

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: waId,
        telefone: waId,
        nome,
        updated_at: inboundAt,
      },
      { onConflict: "wa_id" }
    )
    .select("id, lead_id")
    .single();

  if (contactError || !contact?.id) {
    console.error("WHATSAPP_CONTACT_UPSERT_ERROR", contactError);
    return;
  }

  let conversation = await findActiveConversation(contact.id);
  let handledAsClosedRating = false;

  if (!conversation?.id && isRating) {
    const closedConversation = await findRecentlyClosedConversationForRating(contact.id);

    if (closedConversation?.id) {
      conversation = closedConversation;
      handledAsClosedRating = true;
    }
  }

  if (!conversation?.id) {
    const { data: createdConversation, error: createConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        account_id: accountId,
        contact_id: contact.id,
        lead_id: contact.lead_id,
        status: "bot",
        stage: "entrada",
        queue: "novos_contatos",
        last_message: body,
        last_message_at: inboundAt,
        unread_count: 1,
      })
      .select("id, unread_count, status, stage, queue, closed_at, last_message_at")
      .single();

    if (createConversationError || !createdConversation?.id) {
      console.error("WHATSAPP_CONVERSATION_CREATE_ERROR", createConversationError);
      return;
    }

    conversation = createdConversation;
  } else {
    const updatePayload = handledAsClosedRating
      ? {
          last_message: `Avaliação recebida: ${ratingValue(body) || body}`,
          last_message_at: inboundAt,
          unread_count: 0,
          status: "fechada",
          stage: "finalizado",
          queue: "finalizado",
          updated_at: inboundAt,
        }
      : {
          last_message: body,
          last_message_at: inboundAt,
          unread_count: (conversation.unread_count || 0) + 1,
          updated_at: inboundAt,
        };

    const { error: updateConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update(updatePayload)
      .eq("id", conversation.id);

    if (updateConversationError) {
      console.error("WHATSAPP_CONVERSATION_UPDATE_ERROR", updateConversationError);
    }
  }

  const messagePayload = {
    conversation_id: conversation.id,
    direction: "inbound",
    sender_type: handledAsClosedRating ? "avaliacao" : "cliente",
    message_type: messageType,
    body,
    media_id: extractMediaId(message),
    media_mime_type: extractMimeType(message),
    meta_message_id: metaMessageId,
    raw_payload: payload,
  };

  const { error: messageError } = metaMessageId
    ? await supabaseAdmin
        .from("whatsapp_messages")
        .upsert(messagePayload, { onConflict: "meta_message_id" })
    : await supabaseAdmin.from("whatsapp_messages").insert(messagePayload);

  if (messageError) {
    console.error("WHATSAPP_MESSAGE_INSERT_ERROR", messageError);
    return;
  }

  if (handledAsClosedRating) {
    await sendEvaluationThanks({
      conversationId: conversation.id,
      phoneNumberId,
      to: waId,
      rating: ratingValue(body),
    });

    console.log("WHATSAPP_RATING_RECEIVED", {
      conversationId: conversation.id,
      waId,
      rating: ratingValue(body),
    });

    return;
  }

  const { error: sessionError } = await supabaseAdmin.from("whatsapp_bot_sessions").upsert(
    {
      conversation_id: conversation.id,
      current_step: "inicio",
      updated_at: inboundAt,
    },
    { onConflict: "conversation_id" }
  );

  if (sessionError) {
    console.error("WHATSAPP_BOT_SESSION_UPSERT_ERROR", sessionError);
  }
}

async function handleInboundWebhook(payload: any) {
  const entries = payload?.entry || [];

  for (const entry of entries) {
    const changes = entry?.changes || [];

    for (const change of changes) {
      const value = change?.value || {};

      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }

      const messages = value?.messages || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        console.log("WHATSAPP_WEBHOOK_WITHOUT_MESSAGES", {
          field: change?.field,
          hasStatuses: Array.isArray(value?.statuses),
          keys: Object.keys(value || {}),
        });
        continue;
      }

      for (const message of messages) {
        await handleSingleInboundMessage(payload, value, message);
      }
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    try {
      await handleInboundWebhook(req.body);
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("WHATSAPP_WEBHOOK_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao processar webhook.",
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
