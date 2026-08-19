import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const WABA_ID =
  process.env.META_WHATSAPP_WABA_ID ||
  process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ||
  process.env.META_WABA_ID ||
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
  "";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || "whatsapp-media";
const BATCH_LIMIT = Math.max(
  1,
  Math.min(Number(process.env.WHATSAPP_CAMPAIGN_BATCH_LIMIT || 40), 50),
);
const DELAY_MS = Math.max(
  150,
  Math.min(Number(process.env.WHATSAPP_CAMPAIGN_DELAY_MS || 350), 2000),
);

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

type Campaign = Record<string, any>;
type Recipient = {
  id: string;
  campaign_id: string;
  contact_book_id?: string | null;
  telefone_digits: string;
  nome?: string | null;
  status?: string | null;
};

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function firstName(value?: string | null) {
  return String(value || "").trim().split(/\s+/)[0] || "Cliente";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLanguage(value?: string | null) {
  const language = String(value || "pt_BR").trim();
  return language.toLowerCase() === "pt-br" ? "pt_BR" : language;
}

function normalizeVarKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function variableNames(text?: string | null) {
  return Array.from(String(text || "").matchAll(/{{\s*([^}]+)\s*}}/g)).map(
    (match) => String(match[1] || "").trim(),
  );
}

function componentByType(template: any, type: string) {
  return (template?.components || []).find(
    (component: any) => String(component?.type || "").toUpperCase() === type,
  );
}

function safeFileName(value?: string | null) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function bufferToBlob(buffer: Buffer, mimeType: string) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  new Uint8Array(arrayBuffer).set(buffer);
  return new Blob([arrayBuffer], { type: mimeType });
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function metaGet(path: string, params?: Record<string, string | number>) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  Object.entries(params || {}).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${META_TOKEN}` },
  });

  return {
    ok: response.ok,
    status: response.status,
    data: await readJson(response),
  };
}

async function resolveWabaId() {
  if (WABA_ID) return WABA_ID;
  if (!PHONE_NUMBER_ID) return "";

  const phone = await metaGet(PHONE_NUMBER_ID, {
    fields: "whatsapp_business_account",
  });

  return phone.data?.whatsapp_business_account?.id || "";
}

async function getTemplateDefinition(name: string, language: string) {
  const wabaId = await resolveWabaId();
  if (!wabaId) throw new Error("WABA_ID não configurado para campanhas WhatsApp.");

  const result = await metaGet(`${wabaId}/message_templates`, {
    limit: 250,
    fields: "id,name,language,status,category,components",
  });

  if (!result.ok) {
    throw new Error(
      `Não foi possível consultar o modelo na Meta: ${JSON.stringify(result.data).slice(0, 700)}`,
    );
  }

  const templates = Array.isArray(result.data?.data) ? result.data.data : [];
  const template =
    templates.find((item: any) => item.name === name && item.language === language) ||
    templates.find((item: any) => item.name === name);

  if (!template) throw new Error(`Modelo ${name} não encontrado na Meta.`);
  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    throw new Error(`Modelo ${name} não está aprovado na Meta.`);
  }

  return template;
}

function resolveVariable(name: string, index: number, recipient: Recipient) {
  const fullName = String(recipient.nome || "Cliente").trim() || "Cliente";
  const first = firstName(fullName);
  const phone = onlyDigits(recipient.telefone_digits);
  const key = normalizeVarKey(name);

  const named: Record<string, string> = {
    nomecliente: first,
    nome: first,
    cliente: first,
    primeironome: first,
    nomecompleto: fullName,
    telefone: phone,
    celular: phone,
    whatsapp: phone,
    nomeconsultor: "Consulmax",
    consultor: "Consulmax",
    empresaconsultor: "Consulmax",
    etapaprocesso: "atendimento",
  };

  const ordered = [first, fullName, phone, "Consulmax", "atendimento"];
  return named[key] || ordered[index] || first;
}

function makeTextParameter(name: string, value: string) {
  const parameter: Record<string, any> = { type: "text", text: value || "Cliente" };
  if (name && Number.isNaN(Number(name))) parameter.parameter_name = name;
  return parameter;
}

function buildTextComponent(type: "header" | "body", text: string, recipient: Recipient) {
  const names = variableNames(text);
  if (names.length === 0) return null;

  return {
    type,
    parameters: names.map((name, index) =>
      makeTextParameter(name, resolveVariable(name, index, recipient)),
    ),
  };
}

function renderBody(template: any, recipient: Recipient) {
  const body = String(componentByType(template, "BODY")?.text || "");
  const names = variableNames(body);
  let index = 0;

  return body
    .replace(/{{\s*[^}]+\s*}}/g, () => {
      const name = names[index] || String(index + 1);
      const value = resolveVariable(name, index, recipient);
      index += 1;
      return value;
    })
    .trim();
}

async function uploadCampaignHeaderMedia(campaign: Campaign, template: any) {
  const header = componentByType(template, "HEADER");
  const format = String(header?.format || "").toLowerCase();
  if (!["image", "video", "document"].includes(format)) return null;

  if (!campaign.attachment_path) {
    throw new Error(
      `O modelo ${campaign.template_name} exige cabeçalho ${format}, mas a campanha não possui anexo.`,
    );
  }

  const bucket = campaign.attachment_bucket || MEDIA_BUCKET;
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(campaign.attachment_path);

  if (error || !data) {
    throw error || new Error("Não foi possível recuperar o anexo da campanha.");
  }

  const mimeType =
    campaign.attachment_mime_type || data.type || "application/octet-stream";
  const fileName = safeFileName(
    String(campaign.attachment_path).split("/").pop() || "arquivo",
  );
  const buffer = Buffer.from(await data.arrayBuffer());

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", bufferToBlob(buffer, mimeType), fileName);
  form.append("type", mimeType);

  const response = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}` },
    body: form,
  });

  const payload = await readJson(response);
  if (!response.ok || !payload?.id) {
    throw new Error(
      `Falha ao enviar anexo do template para a Meta: ${JSON.stringify(payload).slice(0, 700)}`,
    );
  }

  const media: Record<string, any> = { id: payload.id };
  if (format === "document") media.filename = fileName;

  return {
    type: "header",
    parameters: [{ type: format, [format]: media }],
  };
}

function buildDynamicButtonComponents(template: any, recipient: Recipient) {
  const buttons = componentByType(template, "BUTTONS")?.buttons || [];
  const components: any[] = [];

  buttons.forEach((button: any, index: number) => {
    const type = String(button?.type || "").toUpperCase();
    const url = String(button?.url || "");
    const vars = variableNames(url);

    if (type === "URL" && vars.length > 0) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: vars.map((name, varIndex) =>
          makeTextParameter(name, resolveVariable(name, varIndex, recipient)),
        ),
      });
    }
  });

  return components;
}

async function ensureCampaignConversation(recipient: Recipient) {
  const phone = onlyDigits(recipient.telefone_digits);
  const now = new Date().toISOString();

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert(
      {
        wa_id: phone,
        telefone: phone,
        nome: recipient.nome || null,
        updated_at: now,
      },
      { onConflict: "wa_id" },
    )
    .select("id,lead_id")
    .single();

  if (contactError || !contact?.id) {
    throw contactError || new Error("Contato WhatsApp não pôde ser criado.");
  }

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .neq("queue", "finalizado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: conversation, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      status: "humano",
      stage: "triagem",
      queue: "triagem",
      priority: "normal",
      last_message: "Campanha iniciada",
      last_message_at: now,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error || !conversation?.id) {
    throw error || new Error("Conversa da campanha não pôde ser criada.");
  }

  return conversation.id;
}

async function sendTemplateMessage(params: {
  campaign: Campaign;
  recipient: Recipient;
  template: any;
  sharedHeaderMedia: any | null;
}) {
  const { campaign, recipient, template, sharedHeaderMedia } = params;
  const phone = onlyDigits(recipient.telefone_digits);
  const conversationId = await ensureCampaignConversation(recipient);
  const language = normalizeLanguage(campaign.template_language || template.language);

  const components: any[] = [];
  const header = componentByType(template, "HEADER");
  const headerFormat = String(header?.format || "").toUpperCase();

  if (sharedHeaderMedia) {
    components.push(sharedHeaderMedia);
  } else if (headerFormat === "TEXT") {
    const headerText = buildTextComponent(
      "header",
      String(header?.text || ""),
      recipient,
    );
    if (headerText) components.push(headerText);
  }

  const bodyComponent = componentByType(template, "BODY");
  const bodyParams = buildTextComponent(
    "body",
    String(bodyComponent?.text || ""),
    recipient,
  );
  if (bodyParams) components.push(bodyParams);

  components.push(...buildDynamicButtonComponents(template, recipient));

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: campaign.template_name,
      language: { code: language },
      ...(components.length ? { components } : {}),
    },
  };

  const response = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(
      result?.error?.error_data?.details ||
        result?.error?.message ||
        JSON.stringify(result).slice(0, 800) ||
        "Falha ao enviar template pela Meta.",
    );
  }

  const metaMessageId = result?.messages?.[0]?.id || null;
  const body = renderBody(template, recipient) || campaign.message_body || "Template enviado";
  const now = new Date().toISOString();

  await supabaseAdmin.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    sender_type: "campanha",
    user_id: campaign.created_by || null,
    message_type: "template",
    body,
    meta_message_id: metaMessageId,
    raw_payload: {
      ...result,
      meta_status: "sent",
      meta_status_at: now,
      template_name: campaign.template_name,
      template_language: language,
      template_category: campaign.template_category || template.category || null,
      _campaign_id: campaign.id,
    },
  });

  await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      last_message: body,
      last_message_at: now,
      unread_count: 0,
      status: "humano",
      updated_at: now,
    })
    .eq("id", conversationId);

  return { metaMessageId, conversationId };
}

async function findCampaign(requestedId?: string | null) {
  if (requestedId) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("*")
      .eq("id", requestedId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (!["pending", "scheduled", "running"].includes(String(data.status))) return null;
    if (
      data.status === "scheduled" &&
      data.scheduled_at &&
      new Date(data.scheduled_at).getTime() > Date.now()
    ) {
      return null;
    }
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("*")
    .in("status", ["pending", "scheduled", "running"])
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) throw error;

  return (
    (data || []).find((campaign: any) => {
      if (campaign.status !== "scheduled") return true;
      if (!campaign.scheduled_at) return true;
      return new Date(campaign.scheduled_at).getTime() <= Date.now();
    }) || null
  );
}

async function processCampaign(requestedId?: string | null) {
  const campaign = await findCampaign(requestedId);

  if (!campaign) {
    return { ok: true, message: "Nenhuma campanha pronta para envio." };
  }

  if (!campaign.template_name) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    return {
      ok: false,
      campaign_id: campaign.id,
      error: "Campanha sem template_name. Mantida como rascunho.",
    };
  }

  const startedAt = new Date().toISOString();
  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status: "running",
      started_at: campaign.started_at || startedAt,
      updated_at: startedAt,
    })
    .eq("id", campaign.id);

  const template = await getTemplateDefinition(
    campaign.template_name,
    normalizeLanguage(campaign.template_language),
  );
  const sharedHeaderMedia = await uploadCampaignHeaderMedia(campaign, template);

  const { data: recipients, error } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id,campaign_id,contact_book_id,telefone_digits,nome,status")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw error;

  if (!recipients || recipients.length === 0) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return {
      ok: true,
      campaign_id: campaign.id,
      sent: 0,
      failed: 0,
      skipped: 0,
      finished: true,
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients as Recipient[]) {
    const phone = onlyDigits(recipient.telefone_digits);

    try {
      if (!phone) throw new Error("Telefone inválido.");

      const { data: blocked } = await supabaseAdmin
        .from("whatsapp_opt_outs")
        .select("id")
        .eq("telefone_digits", phone)
        .limit(1);

      if (blocked && blocked.length > 0) {
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .update({
            status: "skipped",
            error_message: "Contato descadastrado.",
          })
          .eq("id", recipient.id);
        skipped += 1;
        continue;
      }

      await sendTemplateMessage({
        campaign,
        recipient,
        template,
        sharedHeaderMedia,
      });

      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", recipient.id);

      sent += 1;
    } catch (sendError: any) {
      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .update({
          status: "failed",
          error_message: String(sendError?.message || sendError).slice(0, 800),
        })
        .eq("id", recipient.id);

      failed += 1;
    }

    await sleep(DELAY_MS);
  }

  const { count } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "pending");

  const finished = !count;
  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update(
      finished
        ? {
            status: "finished",
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            status: "running",
            updated_at: new Date().toISOString(),
          },
    )
    .eq("id", campaign.id);

  return {
    ok: true,
    campaign_id: campaign.id,
    sent,
    failed,
    skipped,
    remaining: count || 0,
    finished,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(String(req.method || ""))) {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.method === "GET") {
    const authorization = String(req.headers.authorization || "");
    if (authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  try {
    const requestedId =
      String(req.query.campaign_id || req.body?.campaign_id || "").trim() || null;
    const result = await processCampaign(requestedId);
    return res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error: any) {
    console.error("WHATSAPP_CAMPAIGN_RUN_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao processar campanha WhatsApp.",
    });
  }
}
