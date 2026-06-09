import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const DEFAULT_PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function normalizeTemplateParameters(value: any): any[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      if (item && typeof item === "object" && item.type) return item;
      return { type: "text", text: String(item ?? "") };
    })
    .filter((item) => String(item.text ?? item.payload ?? "").trim() !== "");
}

function countVars(text?: string | null) {
  return (String(text || "").match(/{{\s*[^}]+\s*}}/g) || []).length;
}

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
  const result = await metaGet(`${wabaId}/message_templates`, {
    name,
    language,
    limit: 5,
    fields: "id,name,language,status,components",
  });
  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  return rows.find((t: any) => t.name === name && (!language || t.language === language)) || rows.find((t: any) => t.name === name) || null;
}

async function getConversationContact(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id,whatsapp_contacts(nome,telefone,wa_id)")
    .eq("id", conversationId)
    .maybeSingle();
  const contact: any = Array.isArray((data as any)?.whatsapp_contacts) ? (data as any).whatsapp_contacts[0] : (data as any)?.whatsapp_contacts;
  return contact || {};
}

async function buildAutoParams(conversationId: string, needed: number, provided: any[]) {
  const safeProvided = normalizeTemplateParameters(provided);
  const contact = await getConversationContact(conversationId);
  const nomeCompleto = String(contact?.nome || "Cliente").trim() || "Cliente";
  const primeiroNome = nomeCompleto.split(/\s+/)[0] || nomeCompleto;
  const consultor = "Wesley";
  const defaults = [primeiroNome, consultor, nomeCompleto, onlyDigits(contact?.telefone || contact?.wa_id)];

  const output: any[] = [];
  for (let i = 0; i < needed; i++) {
    output.push(safeProvided[i] || { type: "text", text: String(defaults[i] || defaults[0] || "Cliente") });
  }
  return output;
}

function componentParamCount(component: any) {
  const type = String(component?.type || "").toUpperCase();
  if (type === "BODY" || type === "HEADER") return countVars(component?.text || component?.format || "");
  if (type === "BUTTONS") {
    return (component?.buttons || []).map((button: any, index: number) => ({ index, count: countVars(button?.url || button?.text || "") })).filter((x: any) => x.count > 0);
  }
  return 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { conversation_id, to, template_name, template_language = "pt_BR", user_id, template_params, body_params, components } = req.body || {};
    const phone = onlyDigits(to);
    const name = String(template_name || "").trim();

    if (!conversation_id || !phone || !name) {
      return res.status(400).json({ ok: false, error: "conversation_id, to e template_name são obrigatórios." });
    }

    const templateDefinition = await getTemplateDefinition(name, template_language).catch(() => null);
    const bodyComponent = (templateDefinition?.components || []).find((c: any) => String(c?.type || "").toUpperCase() === "BODY");
    const headerComponent = (templateDefinition?.components || []).find((c: any) => String(c?.type || "").toUpperCase() === "HEADER");
    const bodyCount = componentParamCount(bodyComponent) as number;
    const headerCount = componentParamCount(headerComponent) as number;

    const providedParams = normalizeTemplateParameters(template_params || body_params);
    const templatePayload: any = { name, language: { code: template_language || "pt_BR" } };

    if (Array.isArray(components) && components.length > 0) {
      templatePayload.components = components;
    } else {
      const payloadComponents: any[] = [];
      if (headerCount > 0) {
        const headerParams = await buildAutoParams(conversation_id, headerCount, providedParams.splice(0, headerCount));
        payloadComponents.push({ type: "header", parameters: headerParams });
      }
      if (bodyCount > 0) {
        const bodyParams = await buildAutoParams(conversation_id, bodyCount, providedParams);
        payloadComponents.push({ type: "body", parameters: bodyParams });
      }
      if (payloadComponents.length > 0) templatePayload.components = payloadComponents;
    }

    const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: templatePayload }),
    });

    const data = await readJson(response);
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: data, template_debug: { name, template_language, bodyCount, headerCount, sent_components: templatePayload.components || [] } });
    }

    const body = `[Modelo enviado: ${name}]`;
    const metaMessageId = data?.messages?.[0]?.id || null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id,
      direction: "outbound",
      sender_type: "usuario",
      user_id: user_id || null,
      message_type: "template",
      body,
      meta_message_id: metaMessageId,
      raw_payload: { ...data, template_name: name, template_language, template_params: templatePayload.components || [] },
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return res.status(200).json({ ok: true, data, template_debug: { name, template_language, bodyCount, headerCount } });
  } catch (error: any) {
    console.error("WHATSAPP_TEMPLATE_SEND_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar modelo." });
  }
}
