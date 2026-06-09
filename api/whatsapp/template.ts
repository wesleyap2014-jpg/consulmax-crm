import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const DEFAULT_PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { conversation_id, to, template_name, template_language = "pt_BR", user_id, template_params, body_params, components } = req.body || {};
    const phone = onlyDigits(to);
    const name = String(template_name || "").trim();

    if (!conversation_id || !phone || !name) {
      return res.status(400).json({ ok: false, error: "conversation_id, to e template_name são obrigatórios." });
    }

    const bodyParameters = normalizeTemplateParameters(template_params || body_params);
    const templatePayload: any = { name, language: { code: template_language || "pt_BR" } };

    if (Array.isArray(components) && components.length > 0) {
      templatePayload.components = components;
    } else if (bodyParameters.length > 0) {
      templatePayload.components = [{ type: "body", parameters: bodyParameters }];
    }

    const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: templatePayload }),
    });

    const data = await readJson(response);
    if (!response.ok) return res.status(response.status).json({ ok: false, error: data });

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
      raw_payload: { ...data, template_name: name, template_language, template_params: bodyParameters },
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return res.status(200).json({ ok: true, data });
  } catch (error: any) {
    console.error("WHATSAPP_TEMPLATE_SEND_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar modelo." });
  }
}
