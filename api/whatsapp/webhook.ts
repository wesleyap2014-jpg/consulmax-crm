import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

async function handleInboundMessage(payload: any) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const phoneNumberId = value?.metadata?.phone_number_id;
  const displayPhoneNumber = value?.metadata?.display_phone_number;

  const message = value?.messages?.[0];
  const contactProfile = value?.contacts?.[0]?.profile;
  const contactWaId = value?.contacts?.[0]?.wa_id;

  if (!message || !contactWaId) return;

  const from = onlyDigits(message.from || contactWaId);
  const nome = contactProfile?.name || null;

  const messageType = message.type || "text";
  const body =
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    message?.image?.caption ||
    message?.document?.caption ||
    "";

  const metaMessageId = message.id;

  let accountId: string | null = null;

  if (phoneNumberId) {
    const { data: account } = await supabaseAdmin
      .from("whatsapp_accounts")
      .upsert(
        {
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhoneNumber,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone_number_id" }
      )
      .select("id")
      .single();

    accountId = account?.id ?? null;
  }

  const { data: contact } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: from,
        telefone: from,
        nome,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wa_id" }
    )
    .select("id, lead_id")
    .single();

  if (!contact?.id) return;

  let { data: conversation } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, unread_count")
    .eq("contact_id", contact.id)
    .neq("status", "fechada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation?.id) {
    const created = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        account_id: accountId,
        contact_id: contact.id,
        lead_id: contact.lead_id,
        status: "bot",
        stage: "entrada",
        last_message: body,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      })
      .select("id, unread_count")
      .single();

    conversation = created.data;
  } else {
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message: body,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  }

  if (!conversation?.id) return;

  await supabaseAdmin.from("whatsapp_messages").upsert(
    {
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "cliente",
      message_type: messageType,
      body,
      media_id: message?.image?.id || message?.audio?.id || message?.document?.id || null,
      media_mime_type:
        message?.image?.mime_type ||
        message?.audio?.mime_type ||
        message?.document?.mime_type ||
        null,
      meta_message_id: metaMessageId,
      raw_payload: payload,
    },
    { onConflict: "meta_message_id" }
  );

  await supabaseAdmin.from("whatsapp_bot_sessions").upsert(
    {
      conversation_id: conversation.id,
      current_step: "inicio",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" }
  );
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
      await handleInboundMessage(req.body);
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("WHATSAPP_WEBHOOK_ERROR", error);
      return res.status(500).json({ ok: false, error: error?.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
