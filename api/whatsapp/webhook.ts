import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";

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
    message?.video?.caption ||
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
    message?.sticker?.mime_type ||
    null
  );
}

function extractFileName(message: any, mediaId?: string | null) {
  return message?.document?.filename || `${mediaId || "media"}`;
}

function extensionFromMime(mime?: string | null, type?: string | null) {
  const clean = String(mime || "").split(";")[0].trim().toLowerCase();

  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "video/mp4": "mp4",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

  if (map[clean]) return map[clean];

  const messageType = String(type || "").toLowerCase();
  if (messageType === "audio") return "ogg";
  if (messageType === "video") return "mp4";
  if (messageType === "image") return "jpg";
  if (messageType === "sticker") return "webp";
  if (messageType === "document") return "bin";

  return "bin";
}

function isRatingResponse(body?: string | null) {
  const raw = String(body || "").trim();
  const digits = onlyDigits(raw);

  if (!digits) return false;
  if (digits.length !== 1) return false;
  if (!/[1-5]/.test(digits)) return false;

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

function extractCallId(call: any) {
  return call?.id || call?.call_id || call?.meta_call_id || call?.call?.id || null;
}

function extractCallStatus(call: any) {
  return String(call?.event || call?.status || call?.type || call?.state || "received").toLowerCase();
}

function extractCallPhone(value: any, call: any) {
  return onlyDigits(
    call?.from ||
      call?.to ||
      call?.caller ||
      call?.callee ||
      call?.customer?.wa_id ||
      call?.contact?.wa_id ||
      value?.contacts?.[0]?.wa_id ||
      value?.contacts?.[0]?.input ||
      ""
  );
}

function callHistoryText(status: string, direction: string) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("connect") || normalized.includes("accept") || normalized.includes("active")) {
    return "Chamada conectada pelo WhatsApp";
  }

  if (normalized.includes("reject") || normalized.includes("decline")) {
    return "Chamada recusada pelo WhatsApp";
  }

  if (normalized.includes("terminate") || normalized.includes("end") || normalized.includes("complete")) {
    return "Chamada encerrada pelo WhatsApp";
  }

  if (normalized.includes("miss")) {
    return "Chamada perdida pelo WhatsApp";
  }

  return direction === "inbound" ? "Chamada recebida pelo WhatsApp" : "Chamada iniciada pelo WhatsApp";
}

async function ensureMediaBucket() {
  try {
    const { error } = await supabaseAdmin.storage.createBucket(MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });

    if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
      console.warn("WHATSAPP_MEDIA_BUCKET_CREATE_WARN", error);
    }
  } catch (error) {
    console.warn("WHATSAPP_MEDIA_BUCKET_CREATE_IGNORED", error);
  }
}

async function downloadAndStoreMedia(params: {
  mediaId: string | null;
  messageType: string;
  mimeType: string | null;
  conversationId: string;
  metaMessageId: string | null;
  originalFileName?: string | null;
}) {
  const { mediaId, messageType, conversationId, metaMessageId, originalFileName } = params;

  if (!META_TOKEN || !mediaId) return null;

  try {
    const metaInfoResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${META_TOKEN}` },
    });

    const metaInfo = await metaInfoResponse.json();

    if (!metaInfoResponse.ok || !metaInfo?.url) {
      console.error("WHATSAPP_MEDIA_INFO_ERROR", metaInfo);
      return null;
    }

    const mediaResponse = await fetch(metaInfo.url, {
      headers: { Authorization: `Bearer ${META_TOKEN}` },
    });

    if (!mediaResponse.ok) {
      console.error("WHATSAPP_MEDIA_DOWNLOAD_ERROR", {
        status: mediaResponse.status,
        statusText: mediaResponse.statusText,
      });
      return null;
    }

    await ensureMediaBucket();

    const mimeType = metaInfo?.mime_type || params.mimeType || mediaResponse.headers.get("content-type") || "application/octet-stream";
    const extension = extensionFromMime(mimeType, messageType);
    const safeBaseName = String(originalFileName || metaMessageId || mediaId)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 80);
    const storagePath = `${conversationId}/${Date.now()}-${safeBaseName}.${extension}`;
    const arrayBuffer = await mediaResponse.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage.from(MEDIA_BUCKET).upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: mimeType,
      upsert: true,
    });

    if (uploadError) {
      console.error("WHATSAPP_MEDIA_UPLOAD_ERROR", uploadError);
      return null;
    }

    return {
      bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: metaInfo?.file_size || arrayBuffer.byteLength,
      sha256: metaInfo?.sha256 || null,
      media_id: mediaId,
      original_file_name: originalFileName || null,
    };
  } catch (error) {
    console.error("WHATSAPP_MEDIA_STORE_ERROR", error);
    return null;
  }
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
  const mediaId = extractMediaId(message);
  const mediaMimeType = extractMimeType(message);

  console.log("WHATSAPP_INBOUND_MESSAGE", {
    waId,
    nome,
    messageType,
    bodyPreview: body?.slice?.(0, 80),
    metaMessageId,
    isRating,
    hasMedia: !!mediaId,
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
        last_message: body || (mediaId ? `${messageType} recebido` : body),
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
          last_message: body || (mediaId ? `${messageType} recebido` : body),
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

  const storedMedia = mediaId
    ? await downloadAndStoreMedia({
        mediaId,
        messageType,
        mimeType: mediaMimeType,
        conversationId: conversation.id,
        metaMessageId,
        originalFileName: extractFileName(message, mediaId),
      })
    : null;

  const rawPayloadWithMedia = storedMedia
    ? { ...payload, _consulmax_media: storedMedia }
    : payload;

  const messagePayload = {
    conversation_id: conversation.id,
    direction: "inbound",
    sender_type: handledAsClosedRating ? "avaliacao" : "cliente",
    message_type: messageType,
    body,
    media_id: mediaId,
    media_mime_type: storedMedia?.mime_type || mediaMimeType,
    meta_message_id: metaMessageId,
    raw_payload: rawPayloadWithMedia,
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

async function handleSingleCallEvent(payload: any, value: any, call: any) {
  const now = new Date().toISOString();
  const phoneNumberId = value?.metadata?.phone_number_id || null;
  const displayPhoneNumber = value?.metadata?.display_phone_number || null;
  const accountId = await upsertAccount(phoneNumberId, displayPhoneNumber);

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

  if (!waId && !metaCallId) {
    console.warn("WHATSAPP_CALL_EVENT_WITHOUT_IDENTIFIERS", call);
    return;
  }

  let contactId: string | null = null;
  let conversationId: string | null = null;

  if (waId) {
    const contactFromContacts = value?.contacts?.find((c: any) => onlyDigits(c?.wa_id) === waId) || value?.contacts?.[0];
    const nome = contactFromContacts?.profile?.name || null;

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
    } else {
      contactId = contact.id;
      const activeConversation = await findActiveConversation(contact.id);

      if (activeConversation?.id) {
        conversationId = activeConversation.id;
      } else {
        const body = callHistoryText(status, direction);
        const { data: createdConversation, error: createConversationError } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert({
            account_id: accountId,
            contact_id: contact.id,
            lead_id: contact.lead_id,
            status: "humano",
            stage: "triagem",
            queue: "triagem",
            last_message: body,
            last_message_at: now,
            unread_count: direction === "inbound" ? 1 : 0,
          })
          .select("id")
          .single();

        if (createConversationError || !createdConversation?.id) {
          console.error("WHATSAPP_CALL_CONVERSATION_CREATE_ERROR", createConversationError);
        } else {
          conversationId = createdConversation.id;
        }
      }
    }
  }

  const callRow = {
    conversation_id: conversationId,
    contact_id: contactId,
    phone: waId || null,
    wa_id: waId || null,
    direction,
    provider: "meta_whatsapp_calling_api",
    status,
    meta_call_id: metaCallId,
    raw_payload: { payload, value, call },
    updated_at: now,
    ...(status.includes("connect") || status.includes("accept") || status.includes("active") ? { accepted_at: now } : {}),
    ...(status.includes("terminate") || status.includes("end") || status.includes("complete") ? { ended_at: now } : {}),
  };

  if (metaCallId) {
    const { data: existingCall, error: findCallError } = await supabaseAdmin
      .from("whatsapp_calls")
      .select("id")
      .eq("meta_call_id", metaCallId)
      .maybeSingle();

    if (findCallError) {
      console.error("WHATSAPP_CALL_FIND_ERROR", findCallError);
    }

    if (existingCall?.id) {
      const { error: updateCallError } = await supabaseAdmin.from("whatsapp_calls").update(callRow).eq("id", existingCall.id);
      if (updateCallError) console.error("WHATSAPP_CALL_UPDATE_ERROR", updateCallError);
    } else {
      const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert({ ...callRow, started_at: now });
      if (insertCallError) console.error("WHATSAPP_CALL_INSERT_ERROR", insertCallError);
    }
  } else {
    const { error: insertCallError } = await supabaseAdmin.from("whatsapp_calls").insert({ ...callRow, started_at: now });
    if (insertCallError) console.error("WHATSAPP_CALL_INSERT_NO_ID_ERROR", insertCallError);
  }

  if (conversationId) {
    const body = callHistoryText(status, direction);
    const eventKey = metaCallId ? `call_${metaCallId}_${status}_${Date.now()}` : null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: direction === "inbound" ? "inbound" : "outbound",
      sender_type: direction === "inbound" ? "cliente" : "usuario",
      message_type: "call_event",
      body,
      meta_message_id: eventKey,
      raw_payload: { payload, value, call },
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message: body,
        last_message_at: now,
        updated_at: now,
        ...(direction === "inbound" ? { unread_count: 1 } : {}),
      })
      .eq("id", conversationId);
  }
}

async function handleInboundWebhook(payload: any) {
  const entries = payload?.entry || [];

  for (const entry of entries) {
    const changes = entry?.changes || [];

    for (const change of changes) {
      const value = change?.value || {};

      console.log("WHATSAPP_WEBHOOK_RAW_CHANGE", {
        field: change?.field,
        valueKeys: Object.keys(value || {}),
        hasCalls: Array.isArray(value?.calls),
        callsLength: Array.isArray(value?.calls) ? value.calls.length : 0,
        hasStatuses: Array.isArray(value?.statuses),
        hasMessages: Array.isArray(value?.messages),
      });

      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        console.log("WHATSAPP_STATUS_EVENT", value.statuses);
      }

      const calls = value?.calls || value?.call_events || [];

      if (Array.isArray(calls) && calls.length > 0) {
        for (const call of calls) {
          await handleSingleCallEvent(payload, value, call);
        }
      }

      const messages = value?.messages || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        console.log("WHATSAPP_WEBHOOK_WITHOUT_MESSAGES", {
          field: change?.field,
          hasStatuses: Array.isArray(value?.statuses),
          hasCalls: Array.isArray(value?.calls),
          callsLength: Array.isArray(value?.calls) ? value.calls.length : 0,
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
