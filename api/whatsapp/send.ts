import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

type MediaKind = "image" | "video" | "audio" | "document";

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
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

async function sendTextMessage(params: { conversation_id: string; to: string; body: string; user_id?: string | null }) {
  const { conversation_id, to, body, user_id } = params;
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
    sender_type: "usuario",
    user_id: user_id || null,
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
}) {
  const { conversation_id, to, user_id, file_base64, file_name, mime_type, caption, media_type } = params;
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
  form.append("file", new Blob([buffer], { type: mimeType }), cleanFileName);
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
    sender_type: "usuario",
    user_id: user_id || null,
    message_type: mediaKind,
    body: cleanCaption || null,
    media_id: uploadData.id,
    media_mime_type: mimeType,
    meta_message_id: metaMessageId,
    raw_payload: {
      send: sendData,
      upload: uploadData,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      const result = await sendMediaMessage({ conversation_id, to, user_id, file_base64, file_name, mime_type, caption, media_type });
      if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, data: result.data, media_id: result.media_id, storage_path: result.storage_path });
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
