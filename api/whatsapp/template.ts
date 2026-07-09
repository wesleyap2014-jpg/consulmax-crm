import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const DEFAULT_PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const BIRTHDAY_TEMPLATE_NAME = "felicitacao_aniversario_cliente";
const BIRTHDAY_IMAGE_URL = process.env.WHATSAPP_BIRTHDAY_IMAGE_URL || process.env.VITE_WHATSAPP_BIRTHDAY_IMAGE_URL || "";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) { return String(value || "").replace(/\D/g, ""); }
async function readJson(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; } }
function countVars(text?: string | null) { return (String(text || "").match(/{{\s*[^}]+\s*}}/g) || []).length; }
function variableNames(text?: string | null) { return Array.from(String(text || "").matchAll(/{{\s*([^}]+)\s*}}/g)).map((m) => String(m[1] || "").trim()); }
function normalizeLanguage(value?: string | null) { const v = String(value || "pt_BR").trim(); return v === "pt-br" ? "pt_BR" : v; }
function normalizeVarKey(value?: string | null) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function safeFileName(value?: string | null) { return String(value || "arquivo.pdf").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120); }
function extFromNameOrMime(name: string, mimeType: string) { const ext = name.includes(".") ? name.split(".").pop() : ""; if (ext) return ext; return mimeType === "application/pdf" ? "pdf" : mimeType.startsWith("image/") ? "jpg" : mimeType.startsWith("video/") ? "mp4" : "bin"; }
function bufferToBlob(buffer: Buffer, mimeType: string) { const arrayBuffer = new ArrayBuffer(buffer.length); new Uint8Array(arrayBuffer).set(buffer); return new Blob([arrayBuffer], { type: mimeType }); }
function mediaTypeFromMime(mimeType?: string | null, explicit?: string | null) { const requested = String(explicit || "").toLowerCase(); if (["image", "video", "document"].includes(requested)) return requested; const mime = String(mimeType || "").toLowerCase(); if (mime.startsWith("image/")) return "image"; if (mime.startsWith("video/")) return "video"; return "document"; }

async function metaGet(path: string, params?: Record<string, string | number>) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${META_TOKEN}` } });
  return { ok: response.ok, status: response.status, data: await readJson(response) };
}

async function resolveWabaId() {
  if (WABA_ID) return WABA_ID;
  const phone = await metaGet(DEFAULT_PHONE_NUMBER_ID, { fields: "whatsapp_business_account" });
  return phone.data?.whatsapp_business_account?.id || "";
}

async function getTemplateDefinition(name: string, language: string) {
  const wabaId = await resolveWabaId();
  if (!wabaId) return null;
  const result = await metaGet(`${wabaId}/message_templates`, { limit: 250, fields: "id,name,language,status,category,components" });
  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  return rows.find((t: any) => t.name === name && t.language === language) || rows.find((t: any) => t.name === name) || null;
}

async function getConversationContact(conversationId: string) {
  const { data } = await supabaseAdmin.from("whatsapp_conversations").select("id,whatsapp_contacts(nome,telefone,wa_id)").eq("id", conversationId).maybeSingle();
  const contact: any = Array.isArray((data as any)?.whatsapp_contacts) ? (data as any).whatsapp_contacts[0] : (data as any)?.whatsapp_contacts;
  return contact || {};
}

function plainTextFromParam(value: any) { return String(value?.text ?? value?.payload ?? value ?? "").trim(); }
function makeParam(name: string, value: any) {
  const param: any = { type: "text", text: String(value ?? "").trim() || "Cliente" };
  if (name && Number.isNaN(Number(name))) param.parameter_name = name;
  return param;
}

function componentByType(templateDefinition: any, type: string) {
  return (templateDefinition?.components || []).find((c: any) => String(c?.type || "").toUpperCase() === type.toUpperCase());
}
function bodyComponent(templateDefinition: any) { return componentByType(templateDefinition, "BODY"); }
function headerComponent(templateDefinition: any) { return componentByType(templateDefinition, "HEADER"); }
function bodyVariableCount(templateDefinition: any) { return countVars(bodyComponent(templateDefinition)?.text || ""); }

function normalizeProvidedParams(raw: any[]) {
  const arr = Array.isArray(raw) ? raw : [];
  const byName: Record<string, string> = {};
  const ordered: string[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const text = plainTextFromParam(item);
      const key = normalizeVarKey(item.name || item.parameter_name || item.key || "");
      if (key) byName[key] = text;
      if (text) ordered.push(text);
    } else {
      const text = plainTextFromParam(item);
      if (text) ordered.push(text);
    }
  }
  return { ordered, byName };
}

async function buildBodyParams(conversationId: string, templateDefinition: any, providedRaw: any[]) {
  const body = bodyComponent(templateDefinition);
  const names = variableNames(body?.text || "");
  const contact = await getConversationContact(conversationId);
  const nomeCompleto = String(contact?.nome || "Cliente").trim() || "Cliente";
  const primeiroNome = nomeCompleto.split(/\s+/)[0] || nomeCompleto;
  const consultor = "Wesley";
  const telefone = onlyDigits(contact?.telefone || contact?.wa_id);
  const defaultsByName: Record<string, string> = {
    nomecliente: primeiroNome,
    nome: primeiroNome,
    cliente: primeiroNome,
    primeironome: primeiroNome,
    primeiroNome: primeiroNome,
    primeiro_nome: primeiroNome,
    nomecompleto: nomeCompleto,
    nomeconsultor: consultor,
    consultor,
    telefone,
    celular: telefone,
    whatsapp: telefone,
  };
  const defaults = [primeiroNome, consultor, nomeCompleto, telefone];
  const provided = normalizeProvidedParams(providedRaw);
  return names.map((name, index) => {
    const key = normalizeVarKey(name);
    const value = provided.byName[key] || provided.ordered[index] || defaultsByName[key] || defaults[index] || defaults[0] || "Cliente";
    return makeParam(name, value);
  });
}

function renderBodyText(templateDefinition: any, params: any[], fallbackName: string) {
  const bodyText = String(bodyComponent(templateDefinition)?.text || "").trim();
  if (!bodyText) return `[Modelo enviado: ${fallbackName}]`;
  let index = 0;
  return bodyText.replace(/{{\s*[^}]+\s*}}/g, () => {
    const value = params[index]?.text || params[index]?.payload || "";
    index += 1;
    return String(value || "").trim();
  }).trim();
}

async function uploadTemplateHeaderMedia(conversationId: string, reqBody: any) {
  const fileBase64 = reqBody?.file_base64 || reqBody?.header_file_base64 || null;
  const mimeType = String(reqBody?.mime_type || reqBody?.header_mime_type || "application/pdf");
  if (!fileBase64) return null;

  const cleanFileName = safeFileName(reqBody?.file_name || reqBody?.header_file_name || "boleto.pdf");
  const mediaType = mediaTypeFromMime(mimeType, reqBody?.media_type || "document");
  const base64 = String(fileBase64).includes(",") ? String(fileBase64).split(",").pop() || "" : String(fileBase64);
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("Arquivo vazio ou inválido.");

  const ext = extFromNameOrMime(cleanFileName, mimeType);
  const storagePath = `template/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const saved = await supabaseAdmin.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (saved.error) throw new Error(saved.error.message || "Erro ao salvar anexo.");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", bufferToBlob(buffer, mimeType), cleanFileName);
  form.append("type", mimeType);

  const uploadResponse = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}` }, body: form });
  const uploadData = await readJson(uploadResponse);
  if (!uploadResponse.ok || !uploadData?.id) throw new Error(JSON.stringify(uploadData || {}).slice(0, 800) || "Erro ao subir anexo para a Meta.");

  return {
    type: mediaType,
    id: uploadData.id,
    filename: cleanFileName,
    bucket: MEDIA_BUCKET,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: buffer.length,
    original_file_name: cleanFileName,
  };
}

function buildHeaderComponent(templateDefinition: any, reqBody: any, templateName?: string | null) {
  const header = headerComponent(templateDefinition);
  const format = String(header?.format || "").toLowerCase();
  const isBirthdayTemplate = String(templateName || "") === BIRTHDAY_TEMPLATE_NAME;
  const media = reqBody?.header_media || reqBody?.media || null;
  const birthdayImageLink = isBirthdayTemplate && format === "image" ? BIRTHDAY_IMAGE_URL : null;
  const link = reqBody?.header_media_link || reqBody?.media_link || reqBody?.document_link || reqBody?.image_link || media?.link || birthdayImageLink || null;
  const id = reqBody?.header_media_id || reqBody?.media_id || media?.id || null;
  const filename = reqBody?.header_file_name || reqBody?.file_name || media?.filename || media?.file_name || undefined;
  const type = ["image", "document", "video"].includes(format) ? format : String(media?.type || reqBody?.media_type || "").toLowerCase();

  if (!type || !["image", "document", "video"].includes(type)) return null;
  if (!link && !id) return null;

  const mediaPayload: any = {};
  if (link) mediaPayload.link = link;
  if (id) mediaPayload.id = id;
  if (filename && type === "document") mediaPayload.filename = filename;

  return {
    type: "header",
    parameters: [{ type, [type]: mediaPayload }],
    _rendered_media: {
      type,
      link: link || null,
      id: id || null,
      filename: filename || null,
      bucket: media?.bucket || null,
      storage_path: media?.storage_path || null,
      mime_type: media?.mime_type || null,
      original_file_name: media?.original_file_name || filename || null,
      file_size: media?.file_size || null,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const { conversation_id, to, template_name, template_language = "pt_BR", user_id, template_params, body_params } = req.body || {};
    const phone = onlyDigits(to);
    const name = String(template_name || "").trim();
    const language = normalizeLanguage(template_language);
    if (!conversation_id || !phone || !name) return res.status(400).json({ ok: false, error: "conversation_id, to e template_name são obrigatórios." });

    const templateDefinition = await getTemplateDefinition(name, language).catch(() => null);
    const headerFormat = String(headerComponent(templateDefinition)?.format || "").toUpperCase();
    if (name === BIRTHDAY_TEMPLATE_NAME && headerFormat === "IMAGE" && !BIRTHDAY_IMAGE_URL) {
      return res.status(400).json({ ok: false, error: "O modelo de aniversário possui cabeçalho de imagem, mas WHATSAPP_BIRTHDAY_IMAGE_URL não está configurada na Vercel." });
    }

    const uploadedHeaderMedia = await uploadTemplateHeaderMedia(conversation_id, req.body || {});
    const requestBodyForHeader = uploadedHeaderMedia
      ? { ...(req.body || {}), header_media: uploadedHeaderMedia, header_media_id: uploadedHeaderMedia.id, header_file_name: uploadedHeaderMedia.filename, media_type: uploadedHeaderMedia.type }
      : (req.body || {});

    const needed = bodyVariableCount(templateDefinition);
    const provided = Array.isArray(template_params) ? template_params : Array.isArray(body_params) ? body_params : [];
    const templatePayload: any = { name, language: { code: language } };
    const components: any[] = [];

    const headerPayload = buildHeaderComponent(templateDefinition, requestBodyForHeader, name);
    if (headerPayload) components.push({ type: "header", parameters: headerPayload.parameters });

    const bodyParams = needed > 0 ? await buildBodyParams(conversation_id, templateDefinition, provided) : [];
    if (needed > 0) components.push({ type: "body", parameters: bodyParams });
    if (components.length) templatePayload.components = components;

    const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: templatePayload }),
    });
    const data = await readJson(response);
    if (!response.ok) return res.status(response.status).json({ ok: false, error: data, template_debug: { name, language, needed, components: templatePayload.components || [], template_found: !!templateDefinition, sent_template: templatePayload } });

    const renderedBody = renderBodyText(templateDefinition, bodyParams, name);
    const mediaInfo = headerPayload?._rendered_media || null;
    const body = mediaInfo?.filename ? `${renderedBody}\n\n📎 ${mediaInfo.filename}` : renderedBody;
    const metaMessageId = data?.messages?.[0]?.id || null;
    const rawPayload: any = {
      ...data,
      template_name: name,
      template_language: language,
      template_definition: templateDefinition ? { id: templateDefinition.id, name: templateDefinition.name, category: templateDefinition.category, language: templateDefinition.language, components: templateDefinition.components || [] } : null,
      template_components: templatePayload.components || [],
      template_rendered_body: renderedBody,
      template_header_media: mediaInfo,
    };
    if (mediaInfo?.storage_path) {
      rawPayload._consulmax_media = {
        bucket: mediaInfo.bucket || MEDIA_BUCKET,
        storage_path: mediaInfo.storage_path,
        mime_type: mediaInfo.mime_type || "application/pdf",
        file_size: mediaInfo.file_size || null,
        media_id: mediaInfo.id || null,
        original_file_name: mediaInfo.original_file_name || mediaInfo.filename || "boleto.pdf",
      };
    }

    await supabaseAdmin.from("whatsapp_messages").insert({ conversation_id, direction: "outbound", sender_type: "usuario", user_id: user_id || null, message_type: mediaInfo?.type || "template", body, meta_message_id: metaMessageId, raw_payload: rawPayload, media_mime_type: mediaInfo?.type === "image" ? "image/*" : mediaInfo?.type === "document" ? "application/pdf" : mediaInfo?.type === "video" ? "video/*" : null });
    await supabaseAdmin.from("whatsapp_conversations").update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() }).eq("id", conversation_id);
    return res.status(200).json({ ok: true, data, rendered_body: renderedBody, template_debug: { name, language, needed, template_found: !!templateDefinition, used_components: templatePayload.components || [], media: mediaInfo } });
  } catch (error: any) {
    console.error("WHATSAPP_TEMPLATE_SEND_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar modelo." });
  }
}
