import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

type MediaKind = "image" | "video" | "audio" | "document";

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function cleanName(value?: string | null) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function mediaKind(mime: string, explicit?: string): MediaKind {
  const requested = String(explicit || "").toLowerCase();
  if (["image", "video", "audio", "document"].includes(requested)) return requested as MediaKind;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function metaHeaders(json = false) {
  const headers: Record<string, string> = { Authorization: "Bearer " + META_TOKEN };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function messagePayload(to: string, kind: MediaKind, mediaId: string, caption: string, fileName: string) {
  if (kind === "image") return { messaging_product: "whatsapp", to, type: "image", image: { id: mediaId, ...(caption ? { caption } : {}) } };
  if (kind === "video") return { messaging_product: "whatsapp", to, type: "video", video: { id: mediaId, ...(caption ? { caption } : {}) } };
  if (kind === "audio") return { messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } };
  return { messaging_product: "whatsapp", to, type: "document", document: { id: mediaId, filename: fileName, ...(caption ? { caption } : {}) } };
}

async function jsonFromResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, file_base64, file_name, mime_type, caption, media_type } = req.body || {};
    if (!to || !file_base64 || !mime_type) return res.status(400).json({ ok: false, error: "to, file_base64 e mime_type são obrigatórios." });

    const mime = String(mime_type);
    const kind = mediaKind(mime, media_type);
    const name = cleanName(file_name || "arquivo");
    const phone = onlyDigits(to);
    const base64 = String(file_base64).includes(",") ? String(file_base64).split(",").pop() || "" : String(file_base64);
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) return res.status(400).json({ ok: false, error: "Arquivo vazio ou inválido." });

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([buffer], { type: mime }), name);
    form.append("type", mime);

    const uploadResponse = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/media`, { method: "POST", headers: metaHeaders(false), body: form });
    const uploadData = await jsonFromResponse(uploadResponse);
    if (!uploadResponse.ok || !uploadData?.id) return res.status(uploadResponse.status).json({ ok: false, error: uploadData });

    const cleanCaption = String(caption || "").trim();
    const sendResponse = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: metaHeaders(true),
      body: JSON.stringify(messagePayload(phone, kind, uploadData.id, cleanCaption, name)),
    });
    const sendData = await jsonFromResponse(sendResponse);
    if (!sendResponse.ok) return res.status(sendResponse.status).json({ ok: false, error: sendData });

    return res.status(200).json({ ok: true, data: sendData, upload: uploadData, media_id: uploadData.id, media_type: kind });
  } catch (error: any) {
    console.error("WHATSAPP_SEND_MEDIA_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar mídia." });
  }
}
