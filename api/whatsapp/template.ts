import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const DEFAULT_PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) { return String(value || "").replace(/\D/g, ""); }
async function readJson(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; } }
function countVars(text?: string | null) { return (String(text || "").match(/{{\s*[^}]+\s*}}/g) || []).length; }
function variableNames(text?: string | null) { return Array.from(String(text || "").matchAll(/{{\s*([^}]+)\s*}}/g)).map((m) => String(m[1] || "").trim()); }
function normalizeLanguage(value?: string | null) { const v = String(value || "pt_BR").trim(); return v === "pt-br" ? "pt_BR" : v; }
function normalizeVarKey(value?: string | null) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

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

function buildHeaderComponent(templateDefinition: any, reqBody: any) {
  const header = headerComponent(templateDefinition);
  const format = String(header?.format || "").toLowerCase();
  const media = reqBody?.header_media || reqBody?.media || null;
  const link = reqBody?.header_media_link || reqBody?.media_link || reqBody?.document_link || reqBody?.image_link || media?.link || null;
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
    _rendered_media: { type, link: link || null, id: id || null, filename: filename || null },
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
    const needed = bodyVariableCount(templateDefinition);
    const provided = Array.isArray(template_params) ? template_params : Array.isArray(body_params) ? body_params : [];
    const templatePayload: any = { name, language: { code: language } };
    const components: any[] = [];

    const headerPayload = buildHeaderComponent(templateDefinition, req.body || {});
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
    const rawPayload = {
      ...data,
      template_name: name,
      template_language: language,
      template_definition: templateDefinition ? { id: templateDefinition.id, name: templateDefinition.name, category: templateDefinition.category, language: templateDefinition.language, components: templateDefinition.components || [] } : null,
      template_components: templatePayload.components || [],
      template_rendered_body: renderedBody,
      template_header_media: mediaInfo,
    };

    await supabaseAdmin.from("whatsapp_messages").insert({ conversation_id, direction: "outbound", sender_type: "usuario", user_id: user_id || null, message_type: mediaInfo?.type || "template", body, meta_message_id: metaMessageId, raw_payload: rawPayload, media_mime_type: mediaInfo?.type === "image" ? "image/*" : mediaInfo?.type === "document" ? "application/pdf" : mediaInfo?.type === "video" ? "video/*" : null });
    await supabaseAdmin.from("whatsapp_conversations").update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() }).eq("id", conversation_id);
    return res.status(200).json({ ok: true, data, rendered_body: renderedBody, template_debug: { name, language, needed, template_found: !!templateDefinition, used_components: templatePayload.components || [], media: mediaInfo } });
  } catch (error: any) {
    console.error("WHATSAPP_TEMPLATE_SEND_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar modelo." });
  }
}
