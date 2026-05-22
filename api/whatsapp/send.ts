import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { conversation_id, to, body, user_id } = req.body || {};

    if (!conversation_id || !to || !body) {
      return res.status(400).json({
        error: "conversation_id, to e body são obrigatórios.",
      });
    }

    const phone = onlyDigits(to);

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${DEFAULT_PHONE_NUMBER_ID}/messages`,
      {
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
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("META_SEND_ERROR", data);
      return res.status(response.status).json({
        ok: false,
        error: data,
      });
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

    return res.status(200).json({ ok: true, data });
  } catch (error: any) {
    console.error("WHATSAPP_SEND_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao enviar mensagem.",
    });
  }
}
