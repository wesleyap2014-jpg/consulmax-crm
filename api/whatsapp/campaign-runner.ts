import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";
const GRAPH_BASE = "https://graph.facebook.com/v25.0";
const CRON_SECRET = process.env.WHATSAPP_CAMPAIGN_CRON_SECRET || "";
const BATCH_LIMIT = Number(process.env.WHATSAPP_CAMPAIGN_BATCH_LIMIT || 10);

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

function renderMessage(template: string, contact: any) {
  let body = String(template || "")
    .replace(/{{\s*nome\s*}}/gi, contact?.nome || "")
    .replace(/{{\s*primeiro_nome\s*}}/gi, firstName(contact?.nome))
    .replace(/{{\s*telefone\s*}}/gi, onlyDigits(contact?.telefone_digits || contact?.telefone));

  if (!/\b(SAIR|PARAR|CANCELAR|DESCADASTRAR|STOP)\b/i.test(body)) {
    body += "\n\nPara não receber mais mensagens da Consulmax, responda SAIR.";
  }

  return body.trim();
}

function detectMediaKind(mimeType?: string | null): MediaKind {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function safeFileName(value?: string | null) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function ensureConversation(contact: any) {
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
    .select("id, lead_id")
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
      stage: "entrada",
      queue: "novos_contatos",
      last_message: "Campanha iniciada",
      last_message_at: now,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error || !conversation?.id) throw error || new Error("Conversa não criada.");
  return conversation.id;
}

async function sendText(params: { conversationId: string; phone: string; body: string; campaignId: string }) {
  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.phone,
      type: "text",
      text: { preview_url: false, body: params.body },
    }),
  });

  const data = await readJson(response);
  if (!response.ok) return { ok: false, status: response.status, data };

  const metaMessageId = data?.messages?.[0]?.id || null;

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id: params.conversationId,
    direction: "outbound",
    sender_type: "campanha",
    message_type: "text",
    body: params.body,
    meta_message_id: metaMessageId,
    raw_payload: { ...data, _campaign_id: params.campaignId },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: params.body,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      status: "humano",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId);

  return { ok: true, status: 200, data };
}

async function downloadAttachment(campaign: any) {
  if (!campaign?.attachment_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(campaign.attachment_bucket || MEDIA_BUCKET)
    .download(campaign.attachment_path);

  if (error || !data) throw error || new Error("Anexo não encontrado.");

  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = campaign.attachment_mime_type || data.type || "application/octet-stream";
  const name = safeFileName(String(campaign.attachment_path).split("/").pop() || "arquivo");

  return { buffer, mime, name };
}

async function uploadMediaToMeta(file: { buffer: Buffer; mime: string; name: string }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([file.buffer], { type: file.mime }), file.name);
  form.append("type", file.mime);

  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}` },
    body: form,
  });

  const data = await readJson(response);
  if (!response.ok || !data?.id) return { ok: false, status: response.status, data };
  return { ok: true, status: 200, data, mediaId: data.id };
}

async function sendMedia(params: {
  conversationId: string;
  phone: string;
  body: string;
  campaignId: string;
  campaign: any;
  file: { buffer: Buffer; mime: string; name: string };
}) {
  const uploaded = await uploadMediaToMeta(params.file);
  if (!uploaded.ok) return uploaded;

  const mediaKind = detectMediaKind(params.file.mime);
  const mediaId = uploaded.mediaId;
  const payload =
    mediaKind === "image"
      ? { messaging_product: "whatsapp", to: params.phone, type: "image", image: { id: mediaId, caption: params.body } }
      : mediaKind === "video"
        ? { messaging_product: "whatsapp", to: params.phone, type: "video", video: { id: mediaId, caption: params.body } }
        : mediaKind === "audio"
          ? { messaging_product: "whatsapp", to: params.phone, type: "audio", audio: { id: mediaId } }
          : { messaging_product: "whatsapp", to: params.phone, type: "document", document: { id: mediaId, filename: params.file.name, caption: params.body } };

  const response = await fetch(`${GRAPH_BASE}/${DEFAULT_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await readJson(response);
  if (!response.ok) return { ok: false, status: response.status, data };

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id: params.conversationId,
    direction: "outbound",
    sender_type: "campanha",
    message_type: mediaKind,
    body: mediaKind === "audio" ? null : params.body,
    media_id: mediaId,
    media_mime_type: params.file.mime,
    meta_message_id: data?.messages?.[0]?.id || null,
    raw_payload: { send: data, upload: uploaded.data, _campaign_id: params.campaignId },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: mediaKind === "audio" ? "Áudio enviado" : params.body,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      status: "humano",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId);

  return { ok: true, status: 200, data };
}

async function processCampaign(campaign: any) {
  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({ status: "running", started_at: campaign.started_at || new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  const { data: recipients, error } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id,contact_book_id,telefone_digits,nome,status")
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(BATCH_LIMIT, 50)));

  if (error) throw error;

  if (!recipients || recipients.length === 0) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "finished", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    return { sent: 0, failed: 0, skipped: 0, finished: true };
  }

  const attachment = await downloadAttachment(campaign).catch((error) => {
    console.error("CAMPAIGN_ATTACHMENT_ERROR", error);
    return null;
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const phone = onlyDigits(recipient.telefone_digits);

    try {
      const { data: optOut } = await supabaseAdmin
        .from("whatsapp_opt_outs")
        .select("id")
        .eq("telefone_digits", phone)
        .limit(1);

      if (optOut && optOut.length > 0) {
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .update({ status: "skipped", error_message: "Contato descadastrado." })
          .eq("id", recipient.id);
        skipped++;
        continue;
      }

      const conversationId = await ensureConversation(recipient);
      const body = renderMessage(campaign.message_body || "", recipient);
      const result = attachment
        ? await sendMedia({ conversationId, phone, body, campaignId: campaign.id, campaign, file: attachment })
        : await sendText({ conversationId, phone, body, campaignId: campaign.id });

      if (!result.ok) throw new Error(JSON.stringify(result.data || result).slice(0, 800));

      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", recipient.id);
      sent++;
    } catch (error: any) {
      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({ status: "failed", error_message: String(error?.message || error).slice(0, 800) })
        .eq("id", recipient.id);
      failed++;
    }

    await sleep(650);
  }

  const { count } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "failed"]);

  if (!count) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "finished", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
  } else {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
  }

  return { sent, failed, skipped, finished: !count };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const providedSecret = String(req.headers["x-cron-secret"] || req.query.secret || "");
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const now = new Date().toISOString();
    const campaignId = req.query.campaign_id || (req.body as any)?.campaign_id || null;

    let query = supabaseAdmin
      .from("whatsapp_campaigns")
      .select("*")
      .in("status", ["scheduled", "running"])
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
      .order("scheduled_at", { ascending: true, nullsFirst: true })
      .limit(1);

    if (campaignId) {
      query = supabaseAdmin.from("whatsapp_campaigns").select("*").eq("id", String(campaignId)).limit(1);
    }

    const { data: campaigns, error } = await query;
    if (error) throw error;

    const campaign = campaigns?.[0];
    if (!campaign) return res.status(200).json({ ok: true, message: "Nenhuma campanha pendente." });

    const result = await processCampaign(campaign);
    return res.status(200).json({ ok: true, campaign_id: campaign.id, ...result });
  } catch (error: any) {
    console.error("WHATSAPP_CAMPAIGN_RUNNER_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao processar campanhas." });
  }
}
