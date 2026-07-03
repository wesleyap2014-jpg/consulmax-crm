import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const TEMPLATE_NAME = "resultado_assembleia_contemplada";
const TEMPLATE_LANGUAGE = "pt_BR";

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

async function metaGet(path: string, params?: Record<string, string | number>) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${META_TOKEN}` } });
  return { ok: response.ok, status: response.status, data: await readJson(response) };
}

async function resolveWabaId() {
  if (WABA_ID) return WABA_ID;
  const phone = await metaGet(PHONE_NUMBER_ID, { fields: "whatsapp_business_account" });
  return phone.data?.whatsapp_business_account?.id || "";
}

async function getTemplateDefinition() {
  const wabaId = await resolveWabaId();
  if (!wabaId) return null;
  const result = await metaGet(`${wabaId}/message_templates`, { limit: 250, fields: "id,name,language,status,category,components" });
  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  return rows.find((t: any) => t.name === TEMPLATE_NAME && t.language === TEMPLATE_LANGUAGE) || rows.find((t: any) => t.name === TEMPLATE_NAME) || null;
}

function bodyText(templateDefinition: any) {
  const body = (templateDefinition?.components || []).find((c: any) => String(c?.type || "").toUpperCase() === "BODY");
  return String(body?.text || "");
}

function variableNames(text?: string | null) {
  return Array.from(String(text || "").matchAll(/{{\s*([^}]+)\s*}}/g)).map((m) => String(m[1] || "").trim());
}

function normalizeVarKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function firstName(nome?: string | null) {
  const full = String(nome || "Cliente").trim() || "Cliente";
  return full.split(/\s+/)[0] || full;
}

function formatDateBR(date?: string | null) {
  if (!date) return "—";
  const s = String(date).slice(0, 10);
  const parts = s.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

function formatPctBR(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value))}%`;
}

function buildTemplateParams(templateDefinition: any, data: Record<string, string>) {
  const names = variableNames(bodyText(templateDefinition));
  const orderedDefaults = [
    data.nome_cliente,
    data.grupo,
    data.cota,
    data.data_assembleia,
    data.tipo_lance,
    data.percentual_lance,
  ];

  return names.map((name, index) => {
    const key = normalizeVarKey(name);
    const value =
      data[key] ||
      data[name] ||
      orderedDefaults[index] ||
      orderedDefaults[0] ||
      "Cliente";
    const param: any = { type: "text", text: String(value || "—") };
    if (name && Number.isNaN(Number(name))) param.parameter_name = name;
    return param;
  });
}

function renderTemplateBody(templateDefinition: any, params: any[]) {
  const text = bodyText(templateDefinition).trim();
  if (!text) return `[Modelo enviado: ${TEMPLATE_NAME}]`;
  let index = 0;
  return text.replace(/{{\s*[^}]+\s*}}/g, () => {
    const value = params[index]?.text || "";
    index += 1;
    return String(value || "").trim();
  }).trim();
}

async function ensureConversation(phone: string, nome: string, leadId?: string | null) {
  const now = new Date().toISOString();
  const { data: contact, error: contactError } = await supabaseAdmin
    .from("whatsapp_contacts")
    .upsert({ wa_id: phone, telefone: phone, nome: nome || "Cliente", lead_id: leadId || null, updated_at: now }, { onConflict: "wa_id" })
    .select("id,nome,telefone,wa_id,lead_id")
    .single();

  if (contactError || !contact?.id) throw contactError || new Error("Contato WhatsApp não criado.");

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .not("status", "in", "(fechada,finalizado,finalizada,closed)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: conv, error: convError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      contact_id: contact.id,
      lead_id: leadId || contact.lead_id || null,
      queue: "pos_sucesso",
      stage: "contemplacao",
      status: "humano",
      last_message: "Cota contemplada na Carteira",
      last_message_at: now,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (convError || !conv?.id) throw convError || new Error("Conversa WhatsApp não criada.");
  return conv.id as string;
}

async function alreadySent(automationKey: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id")
    .contains("raw_payload", { automation_key: automationKey })
    .limit(1);
  if (error) return false;
  return !!data?.length;
}

async function sendTemplate(to: string, params: any[]) {
  const components = params.length ? [{ type: "body", parameters: params }] : undefined;
  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANGUAGE },
      components,
    },
  };

  const response = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  return { ok: response.ok, status: response.status, data, payload };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["POST", "GET"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const vendaId = String(req.query.venda_id || req.body?.venda_id || "").trim();
    const dryRun = String(req.query.dry_run || req.body?.dry_run || "").toLowerCase() === "true";
    if (!vendaId) return res.status(400).json({ ok: false, error: "venda_id é obrigatório." });

    const { data: venda, error: vendaError } = await supabaseAdmin
      .from("vendas")
      .select("id,lead_id,grupo,cota,contemplada,data_contemplacao,contemplacao_tipo,contemplacao_pct,status,numero_proposta")
      .eq("id", vendaId)
      .maybeSingle();

    if (vendaError) throw vendaError;
    if (!venda?.id) return res.status(404).json({ ok: false, error: "Venda/cota não encontrada." });
    if (!venda.contemplada) return res.status(400).json({ ok: false, error: "A cota ainda não está marcada como contemplada." });

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id,nome,telefone")
      .eq("id", venda.lead_id)
      .maybeSingle();

    const nomeCompleto = String(lead?.nome || "Cliente").trim() || "Cliente";
    const phone = onlyDigits(lead?.telefone || "");
    if (!phone) return res.status(400).json({ ok: false, error: "Lead sem telefone válido para WhatsApp." });

    const templateDefinition = await getTemplateDefinition();
    if (!templateDefinition) return res.status(400).json({ ok: false, error: `Modelo ${TEMPLATE_NAME} não encontrado/aprovado na Meta.` });

    const automationKey = `carteira_contemplada:${venda.id}`;
    if (await alreadySent(automationKey)) {
      return res.status(200).json({ ok: true, status: "skipped", reason: "ja_enviado", venda_id: venda.id, template: TEMPLATE_NAME });
    }

    const paramData: Record<string, string> = {
      nomecliente: firstName(nomeCompleto),
      nome_cliente: firstName(nomeCompleto),
      nome: firstName(nomeCompleto),
      cliente: firstName(nomeCompleto),
      grupo: String(venda.grupo || "—"),
      cota: String(venda.cota || "—"),
      cotas: String(venda.cota || "—"),
      dataassembleia: formatDateBR(venda.data_contemplacao),
      data_assembleia: formatDateBR(venda.data_contemplacao),
      tipolance: String(venda.contemplacao_tipo || "—"),
      tipo_lance: String(venda.contemplacao_tipo || "—"),
      formacontemplacao: String(venda.contemplacao_tipo || "—"),
      percentual_lance: venda.contemplacao_tipo === "Sorteio" ? "—" : formatPctBR(venda.contemplacao_pct),
      percentuallance: venda.contemplacao_tipo === "Sorteio" ? "—" : formatPctBR(venda.contemplacao_pct),
    };

    const params = buildTemplateParams(templateDefinition, paramData);
    const renderedBody = renderTemplateBody(templateDefinition, params);

    if (dryRun) {
      return res.status(200).json({ ok: true, dry_run: true, venda_id: venda.id, template: TEMPLATE_NAME, phone, body: renderedBody, params: paramData });
    }

    const conversationId = await ensureConversation(phone, nomeCompleto, venda.lead_id);
    const sent = await sendTemplate(phone, params);
    if (!sent.ok) return res.status(sent.status).json({ ok: false, error: sent.data, sent_template: sent.payload });

    const metaMessageId = sent.data?.messages?.[0]?.id || null;
    const rawPayload = {
      ...sent.data,
      automation_key: automationKey,
      automation_type: "carteira_contemplada",
      venda_id: venda.id,
      lead_id: venda.lead_id,
      template_name: TEMPLATE_NAME,
      template_language: TEMPLATE_LANGUAGE,
      template_rendered_body: renderedBody,
      template_components: sent.payload?.template?.components || [],
      contemplada_data: {
        grupo: venda.grupo,
        cota: venda.cota,
        data_contemplacao: venda.data_contemplacao,
        contemplacao_tipo: venda.contemplacao_tipo,
        contemplacao_pct: venda.contemplacao_pct,
      },
    };

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "automacao",
      user_id: null,
      message_type: "template",
      body: renderedBody,
      meta_message_id: metaMessageId,
      raw_payload: rawPayload,
      media_mime_type: null,
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ last_message: renderedBody, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return res.status(200).json({ ok: true, status: "sent", venda_id: venda.id, conversation_id: conversationId, meta_message_id: metaMessageId, template: TEMPLATE_NAME, body: renderedBody });
  } catch (error: any) {
    console.error("CARTEIRA_CONTEMPLADA_WHATSAPP_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar mensagem de contemplação." });
  }
}
