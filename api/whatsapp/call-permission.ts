import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const TEMPLATE_NAME = process.env.META_WHATSAPP_CALL_PERMISSION_TEMPLATE || "call_permission_optin";
const TEMPLATE_LANGUAGE = process.env.META_WHATSAPP_CALL_PERMISSION_LANGUAGE || "pt_BR";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!META_TOKEN) return res.status(500).json({ ok: false, error: "Missing META_WHATSAPP_TOKEN" });
    if (!DEFAULT_PHONE_NUMBER_ID) return res.status(500).json({ ok: false, error: "Missing META_WHATSAPP_PHONE_NUMBER_ID" });

    const { to, conversation_id, user_id } = req.body || {};
    const phone = onlyDigits(to);

    if (!phone) return res.status(400).json({ ok: false, error: "to é obrigatório." });

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
      },
    };

    const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJson(response);

    if (!response.ok) {
      console.error("WHATSAPP_CALL_PERMISSION_TEMPLATE_ERROR", data);
      return res.status(response.status).json({ ok: false, error: data });
    }

    if (conversation_id) {
      const body = "Solicitação de permissão para ligação enviada pelo WhatsApp.";
      const metaMessageId = data?.messages?.[0]?.id || null;

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id,
        direction: "outbound",
        sender_type: "sistema",
        user_id: user_id || null,
        message_type: "template",
        body,
        meta_message_id: metaMessageId,
        raw_payload: {
          ...data,
          _template_name: TEMPLATE_NAME,
          _template_language: TEMPLATE_LANGUAGE,
          _purpose: "call_permission_optin",
        },
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          last_message: body,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          status: "humano",
          stage: "triagem",
          queue: "triagem",
          closed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);
    }

    return res.status(200).json({ ok: true, data, template: TEMPLATE_NAME });
  } catch (error: any) {
    console.error("WHATSAPP_CALL_PERMISSION_TEMPLATE_EXCEPTION", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar template de permissão de ligação." });
  }
}
