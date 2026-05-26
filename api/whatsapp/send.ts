import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const CAMPAIGN_BATCH_LIMIT = Number(process.env.WHATSAPP_CAMPAIGN_BATCH_LIMIT || 10);

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

type MediaKind = "image" | "video" | "audio" | "document";

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstName(nome?: string | null) {
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

function safeFileName(value?: string | null) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function detectMediaKind(mimeType?: string | null, explicit?: string | null): MediaKind {
  const requested = String(explicit || "").toLowerCase();
  if (["image", "video", "audio", "document"].includes(requested)) return requested as MediaKind;

  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  return "document";
}

function extFromNameOrMime(name: string, mimeType: string) {
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (ext) return ext;

  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/amr": "amr",
    "application/pdf": "pdf",
  };

  return map[mimeType] || "bin";
}

function bufferToBlob(buffer: Buffer, mimeType: string) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  new Uint8Array(arrayBuffer).set(buffer);
  return new Blob([arrayBuffer], { type: mimeType });
}

function renderCampaignBody(template: string, contact: any) {
  let body = String(template || "")
    .replace(/{{\s*nome\s*}}/gi, contact?.nome || "")
    .replace(/{{\s*primeiro_nome\s*}}/gi, firstName(contact?.nome))
    .replace(/{{\s*telefone\s*}}/gi, onlyDigits(contact?.telefone_digits || contact?.telefone));

  if (!/\b(SAIR|PARAR|CANCELAR|DESCADASTRAR|STOP)\b/i.test(body)) {
    body += "\n\nPara não receber mais mensagens da Consulmax, responda SAIR.";
  }

  return body.trim();
}

function makeMediaMessagePayload(params: {
  to: string;
  mediaKind: MediaKind;
  mediaId: string;
  caption: string;
  fileName: string;
}) {
  const { to, mediaKind, mediaId, caption, fileName } = params;

  if (mediaKind === "image") {
    return {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { id: mediaId, ...(caption ? { caption } : {}) },
    };
  }

  if (mediaKind === "video") {
    return {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId, ...(caption ? { caption } : {}) },
    };
  }

  if (mediaKind === "audio") {
    return {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { id: mediaId },
    };
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: { id: mediaId, filename: fileName, ...(caption ? { caption } : {}) },
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function sendTextMessage(params: {
  conversation_id: string;
  to: string;
  body: string;
  user_id?: string | null;
  sender_type?: string;
  raw_payload_extra?: Record<string, any>;
}) {
  const { conversation_id, to, body, user_id, sender_type = "usuario", raw_payload_extra } = params;
  const phone = onlyDigits(to);

  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    console.error("META_SEND_ERROR", data);
    return { ok: false, status: response.status, error: data };
  }

  const metaMessageId = data?.messages?.[0]?.id || null;

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id,
    direction: "outbound",
    sender_type,
    user_id: user_id || null,
    message_type: "text",
    body,
    meta_message_id: metaMessageId,
    raw_payload: { ...data, ...(raw_payload_extra || {}) },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: body,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      status: "humano",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation_id);

  return { ok: true, status: 200, data };
}

async function sendMediaMessage(params: {
  conversation_id: string;
  to: string;
  user_id?: string | null;
  file_base64: string;
  file_name?: string | null;
  mime_type: string;
  caption?: string | null;
  media_type?: string | null;
  sender_type?: string;
  raw_payload_extra?: Record<string, any>;
}) {
  const {
    conversation_id,
    to,
    user_id,
    file_base64,
    file_name,
    mime_type,
    caption,
    media_type,
    sender_type = "usuario",
    raw_payload_extra,
  } = params;

  const phone = onlyDigits(to);
  const mimeType = String(mime_type || "application/octet-stream");
  const mediaKind = detectMediaKind(mimeType, media_type);
  const cleanFileName = safeFileName(file_name || `arquivo.${extFromNameOrMime("arquivo", mimeType)}`);
  const base64 = String(file_base64).includes(",") ? String(file_base64).split(",").pop() || "" : String(file_base64);
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    return { ok: false, status: 400, error: "Arquivo vazio ou inválido." };
  }

  const ext = extFromNameOrMime(cleanFileName, mimeType);
  const storagePath = `outbound/${conversation_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const saved = await supabaseAdmin.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (saved.error) {
    console.error("SUPABASE_MEDIA_UPLOAD_ERROR", saved.error);
    return { ok: false, status: 500, error: saved.error.message };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", bufferToBlob(buffer, mimeType), cleanFileName);
  form.append("type", mimeType);

  const uploadResponse = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}` },
    body: form,
  });

  const uploadData = await readJson(uploadResponse);

  if (!uploadResponse.ok || !uploadData?.id) {
    console.error("META_MEDIA_UPLOAD_ERROR", uploadData);
    return { ok: false, status: uploadResponse.status, error: uploadData };
  }

  const cleanCaption = String(caption || "").trim();
  const payload = makeMediaMessagePayload({
    to: phone,
    mediaKind,
    mediaId: uploadData.id,
    caption: cleanCaption,
    fileName: cleanFileName,
  });

  const sendResponse = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const sendData = await readJson(sendResponse);

  if (!sendResponse.ok) {
    console.error("META_SEND_MEDIA_ERROR", sendData);
    return { ok: false, status: sendResponse.status, error: sendData };
  }

  const metaMessageId = sendData?.messages?.[0]?.id || null;
  const lastMessage =
    cleanCaption ||
    (mediaKind === "image"
      ? "Imagem enviada"
      : mediaKind === "video"
        ? "Vídeo enviado"
        : mediaKind === "audio"
          ? "Áudio enviado"
          : "Documento enviado");

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id,
    direction: "outbound",
    sender_type,
    user_id: user_id || null,
    message_type: mediaKind,
    body: cleanCaption || null,
    media_id: uploadData.id,
    media_mime_type: mimeType,
    meta_message_id: metaMessageId,
    raw_payload: {
      send: sendData,
      upload: uploadData,
      ...(raw_payload_extra || {}),
      _consulmax_media: {
        bucket: MEDIA_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: buffer.length,
        media_id: uploadData.id,
        original_file_name: cleanFileName,
      },
    },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: lastMessage,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      status: "humano",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation_id);

  return { ok: true, status: 200, data: sendData, media_id: uploadData.id, storage_path: storagePath };
}

async function ensureCampaignConversation(contact: any) {
  const phone = onlyDigits(contact.telefone_digits || contact.telefone);
  const now = new Date().toISOString();

  const { data: waContact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: phone,
        telefone: phone,
        nome: contact.nome || null,
        updated_at: now,
      },
      { onConflict: "wa_id" }
    )
    .select("id,lead_id")
    .single();

  if (contactError || !waContact?.id) throw contactError || new Error("Contato não criado.");

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("contact_id", waContact.id)
    .neq("queue", "finalizado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: conversation, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      contact_id: waContact.id,
      lead_id: waContact.lead_id,
      status: "humano",
      stage: "triagem",
      queue: "triagem",
      priority: "normal",
      last_message: "Campanha iniciada",
      last_message_at: now,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error || !conversation?.id) throw error || new Error("Conversa não criada.");
  return conversation.id;
}

async function downloadCampaignAttachment(campaign: any) {
  if (!campaign?.attachment_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(campaign.attachment_bucket || MEDIA_BUCKET)
    .download(campaign.attachment_path);

  if (error || !data) throw error || new Error("Anexo da campanha não encontrado.");

  const buffer = Buffer.from(await data.arrayBuffer());
  const mimeType = campaign.attachment_mime_type || data.type || "application/octet-stream";
  const fileName = safeFileName(String(campaign.attachment_path).split("/").pop() || "arquivo");
  const base64 = buffer.toString("base64");

  return {
    file_base64: base64,
    file_name: fileName,
    mime_type: mimeType,
    media_type: detectMediaKind(mimeType),
  };
}

async function processScheduledCampaigns() {
  const now = new Date().toISOString();

  const { data: campaigns, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("*")
    .in("status", ["scheduled", "running"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) throw error;

  const campaign = campaigns?.[0];

  if (!campaign) {
    return {
      ok: true,
      message: "Nenhuma campanha pendente.",
    };
  }

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status: "running",
      started_at: campaign.started_at || now,
      updated_at: now,
    })
    .eq("id", campaign.id);

  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id,campaign_id,contact_book_id,telefone_digits,nome,status")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(CAMPAIGN_BATCH_LIMIT, 50)));

  if (recipientsError) throw recipientsError;

  if (!recipients || recipients.length === 0) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return {
      ok: true,
      campaign_id: campaign.id,
      sent: 0,
      failed: 0,
      skipped: 0,
      finished: true,
    };
  }

  const attachment = await downloadCampaignAttachment(campaign).catch((error) => {
    console.warn("CAMPAIGN_ATTACHMENT_WARNING", error);
    return null;
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const phone = onlyDigits(recipient.telefone_digits);

    try {
      const { data: blocked } = await supabaseAdmin
        .from("whatsapp_opt_outs")
        .select("id")
        .eq("telefone_digits", phone)
        .limit(1);

      if (blocked && blocked.length > 0) {
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .update({
            status: "skipped",
            error_message: "Contato descadastrado.",
          })
          .eq("id", recipient.id);

        skipped++;
        continue;
      }

      const conversation_id = await ensureCampaignConversation(recipient);
      const body = renderCampaignBody(campaign.message_body || "", recipient);

      const result = attachment
        ? await sendMediaMessage({
            conversation_id,
            to: phone,
            user_id: campaign.created_by || null,
            file_base64: attachment.file_base64,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            media_type: attachment.media_type,
            caption: body,
            sender_type: "campanha",
            raw_payload_extra: { _campaign_id: campaign.id },
          })
        : await sendTextMessage({
            conversation_id,
            to: phone,
            body,
            user_id: campaign.created_by || null,
            sender_type: "campanha",
            raw_payload_extra: { _campaign_id: campaign.id },
          });

      if (!result.ok) {
        throw new Error(JSON.stringify(result.error || result).slice(0, 800));
      }

      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", recipient.id);

      sent++;
    } catch (error: any) {
      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({
          status: "failed",
          error_message: String(error?.message || error).slice(0, 800),
        })
        .eq("id", recipient.id);

      failed++;
    }

    await sleep(650);
  }

  const { count } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "pending");

  if (!count) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  } else {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  }

  return {
    ok: true,
    campaign_id: campaign.id,
    sent,
    failed,
    skipped,
    finished: !count,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const result = await processScheduledCampaigns();
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("WHATSAPP_CAMPAIGN_CRON_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao processar campanhas.",
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { conversation_id, to, body, user_id, file_base64, file_name, mime_type, caption, media_type } = req.body || {};

    if (!conversation_id || !to) {
      return res.status(400).json({
        ok: false,
        error: "conversation_id e to são obrigatórios.",
      });
    }

    if (file_base64 && mime_type) {
      const result = await sendMediaMessage({
        conversation_id,
        to,
        user_id,
        file_base64,
        file_name,
        mime_type,
        caption,
        media_type,
      });

      if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

      return res.status(200).json({
        ok: true,
        data: result.data,
        media_id: result.media_id,
        storage_path: result.storage_path,
      });
    }

    if (!body) {
      return res.status(400).json({
        ok: false,
        error: "body é obrigatório para mensagem de texto.",
      });
    }

    const result = await sendTextMessage({ conversation_id, to, body, user_id });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

    return res.status(200).json({ ok: true, data: result.data });
  } catch (error: any) {
    console.error("WHATSAPP_SEND_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao enviar mensagem.",
    });
  }
}
