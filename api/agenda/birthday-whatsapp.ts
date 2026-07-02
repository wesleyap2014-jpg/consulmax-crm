import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const TEMPLATE_NAME = "felicitacao_aniversario_cliente";
const TEMPLATE_LANGUAGE = "pt_BR";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function todayKeyBR() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function utcDayRange(dateStr: string) {
  return {
    startIso: `${dateStr}T00:00:00.000Z`,
    endIso: `${dateStr}T23:59:59.999Z`,
  };
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
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstName(nome?: string | null) {
  const full = String(nome || "Cliente").trim() || "Cliente";
  return full.split(/\s+/)[0] || full;
}

function buildTemplateParams(templateDefinition: any, nome: string) {
  const names = variableNames(bodyText(templateDefinition));
  const primeiro = firstName(nome);
  return names.map((name, index) => {
    const key = normalizeVarKey(name);
    const text = ["1", "nome", "nomecliente", "cliente", "primeironome"].includes(key) ? primeiro : index === 0 ? primeiro : "";
    const param: any = { type: "text", text: text || primeiro };
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

async function ensureConversation(phone: string, nome: string, clienteId?: string | null, leadId?: string | null) {
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
      stage: "pos_sucesso",
      status: "humano",
      last_message: "Aniversário identificado na Agenda",
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
  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANGUAGE },
      components: params.length ? [{ type: "body", parameters: params }] : undefined,
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
    const dryRun = String(req.query.dry_run || req.body?.dry_run || "").toLowerCase() === "true";
    const date = String(req.query.date || req.body?.date || todayKeyBR()).slice(0, 10);
    const { startIso, endIso } = utcDayRange(date);
    const templateDefinition = await getTemplateDefinition();

    if (!templateDefinition) {
      return res.status(400).json({ ok: false, error: `Modelo ${TEMPLATE_NAME} não encontrado/aprovado na Meta.` });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("agenda_eventos")
      .select(`
        id,tipo,titulo,cliente_id,lead_id,inicio_at,
        cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone),
        lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone)
      `)
      .eq("tipo", "aniversario")
      .gte("inicio_at", startIso)
      .lte("inicio_at", endIso)
      .limit(100);

    if (error) throw error;

    const results: any[] = [];

    for (const ev of rows || []) {
      const person = (ev as any).cliente || (ev as any).lead || null;
      const nome = String(person?.nome || ev.titulo || "Cliente").trim() || "Cliente";
      const phone = onlyDigits(person?.telefone || "");
      const automationKey = `birthday:${date}:${ev.id}`;

      if (!phone) {
        results.push({ event_id: ev.id, nome, status: "skipped", reason: "sem_telefone" });
        continue;
      }

      if (await alreadySent(automationKey)) {
        results.push({ event_id: ev.id, nome, phone, status: "skipped", reason: "ja_enviado" });
        continue;
      }

      const params = buildTemplateParams(templateDefinition, nome);
      const renderedBody = renderTemplateBody(templateDefinition, params);

      if (dryRun) {
        results.push({ event_id: ev.id, nome, phone, status: "dry_run", body: renderedBody });
        continue;
      }

      const conversationId = await ensureConversation(phone, nome, ev.cliente_id, ev.lead_id);
      const sent = await sendTemplate(phone, params);

      if (!sent.ok) {
        results.push({ event_id: ev.id, nome, phone, status: "error", error: sent.data });
        continue;
      }

      const metaMessageId = sent.data?.messages?.[0]?.id || null;
      const rawPayload = {
        ...sent.data,
        automation_key: automationKey,
        automation_type: "birthday_agenda",
        agenda_event_id: ev.id,
        template_name: TEMPLATE_NAME,
        template_language: TEMPLATE_LANGUAGE,
        template_rendered_body: renderedBody,
        template_components: sent.payload?.template?.components || [],
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
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ last_message: renderedBody, last_message_at: new Date().toISOString(), unread_count: 0, status: "humano", updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      results.push({ event_id: ev.id, nome, phone, conversation_id: conversationId, status: "sent", meta_message_id: metaMessageId });
    }

    return res.status(200).json({ ok: true, date, template: TEMPLATE_NAME, dry_run: dryRun, total: results.length, sent: results.filter((r) => r.status === "sent").length, skipped: results.filter((r) => r.status === "skipped").length, results });
  } catch (error: any) {
    console.error("AGENDA_BIRTHDAY_WHATSAPP_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar aniversários pelo WhatsApp." });
  }
}
