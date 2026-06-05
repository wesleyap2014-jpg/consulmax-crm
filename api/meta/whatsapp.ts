import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const META_TOKEN = process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
const WABA_ID =
  process.env.META_WHATSAPP_WABA_ID ||
  process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ||
  process.env.META_WABA_ID ||
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
  "";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const MARKETING_COST_USD = Number(process.env.WHATSAPP_MARKETING_COST_USD || "0.07");
const UTILITY_COST_USD = Number(process.env.WHATSAPP_UTILITY_COST_USD || "0");
const AUTH_COST_USD = Number(process.env.WHATSAPP_AUTH_COST_USD || "0");

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;

type AnyRecord = Record<string, any>;

function send(res: VercelResponse, status: number, body: AnyRecord) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function metaGet(path: string, params?: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${META_TOKEN}` },
  });

  const data = await readJson(response);
  return { ok: response.ok, status: response.status, data, url: url.toString().replace(META_TOKEN, "***") };
}

async function resolveWabaId() {
  if (WABA_ID) return WABA_ID;
  if (!PHONE_NUMBER_ID) return "";

  const phone = await metaGet(PHONE_NUMBER_ID, {
    fields: "id,display_phone_number,verified_name,whatsapp_business_account",
  });

  return phone.data?.whatsapp_business_account?.id || "";
}

function extractTemplateBody(components: any[] = []) {
  const body = components.find((component) => String(component?.type || "").toUpperCase() === "BODY");
  return body?.text || "";
}

function daysAgoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfTodayUTC() {
  const date = new Date();
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseDateParam(value: any, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function templateNameFromMessage(row: any) {
  const raw = row?.raw_payload || {};
  const fromRaw = raw.template_name || raw.template?.name || raw?.status_payload?.template_name;
  if (fromRaw) return String(fromRaw);
  const body = String(row?.body || "");
  const match = body.match(/\[Modelo enviado:\s*([^\]]+)\]/i);
  return match?.[1]?.trim() || null;
}

function costByCategory(category?: string | null) {
  const c = String(category || "").toUpperCase();
  if (c.includes("MARKETING")) return MARKETING_COST_USD;
  if (c.includes("UTILITY") || c.includes("UTILIDADE")) return UTILITY_COST_USD;
  if (c.includes("AUTH") || c.includes("AUTENTICA")) return AUTH_COST_USD;
  return 0;
}

function statusFromMessage(row: any) {
  const raw = row?.raw_payload || {};
  return String(raw.meta_status || raw.status || raw?.status_payload?.status || "sent").toLowerCase();
}

function normalizeMetaInsightRecord(record: any) {
  const name = record?.template_name || record?.name || record?.template?.name || record?.message_template_name;
  if (!name) return null;
  const sent = Number(record.sent || record.messages_sent || record.sent_count || 0);
  const delivered = Number(record.delivered || record.messages_delivered || record.delivered_count || 0);
  const read = Number(record.read || record.messages_read || record.read_count || 0);
  const responses = Number(record.responses || record.unique_responses || record.replies || record.clicked || 0);
  const spend = Number(record.spend || record.amount_spent || record.cost || record.value_used || 0);
  return {
    template_name: String(name),
    sent,
    delivered,
    read,
    unique_responses: responses,
    value_used_usd: spend,
    cost_per_delivered_usd: delivered ? spend / delivered : 0,
    source: "meta",
    raw: record,
  };
}

function extractMetaInsights(data: any) {
  const rawRows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.template_analytics) ? data.template_analytics : [];
  return rawRows.map(normalizeMetaInsightRecord).filter(Boolean);
}

async function getTemplates(req: VercelRequest, res: VercelResponse) {
  const wabaId = await resolveWabaId();
  if (!wabaId) {
    return send(res, 400, {
      ok: false,
      error: "WABA_ID ausente. Configure META_WHATSAPP_WABA_ID, META_WHATSAPP_BUSINESS_ACCOUNT_ID, META_WABA_ID ou WHATSAPP_BUSINESS_ACCOUNT_ID na Vercel.",
    });
  }

  const limit = Number(req.query.limit || 100);
  const result = await metaGet(`${wabaId}/message_templates`, {
    limit,
    fields: "id,name,status,category,language,components,quality_score,rejected_reason,previous_category",
  });

  if (!result.ok) return send(res, result.status, { ok: false, error: result.data });

  const templates = (result.data?.data || []).map((template: any) => ({
    id: template.id,
    name: template.name,
    template_name: template.name,
    status: template.status,
    category: template.category,
    language: template.language,
    body: extractTemplateBody(template.components),
    components: template.components || [],
    quality_score: template.quality_score || null,
    rejected_reason: template.rejected_reason || null,
    previous_category: template.previous_category || null,
  }));

  return send(res, 200, {
    ok: true,
    source: "meta",
    graph_version: GRAPH_VERSION,
    waba_id: wabaId,
    count: templates.length,
    templates,
    paging: result.data?.paging || null,
  });
}

async function getLocalTemplateInsights(start: Date, end: Date, categories: Record<string, string>) {
  if (!supabaseAdmin) return { insights: [], error: "SUPABASE_SERVICE_ROLE_KEY ausente; fallback local desativado." };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id,body,message_type,direction,created_at,raw_payload,conversation_id")
    .eq("direction", "outbound")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .limit(10000);

  if (error) return { insights: [], error: error.message };

  const map = new Map<string, any>();
  for (const row of data || []) {
    const templateName = templateNameFromMessage(row);
    if (!templateName) continue;
    const current = map.get(templateName) || {
      template_name: templateName,
      sent: 0,
      delivered: 0,
      read: 0,
      unique_responses: 0,
      value_used_usd: 0,
      cost_per_delivered_usd: 0,
      source: "crm_estimado",
    };
    const status = statusFromMessage(row);
    current.sent += 1;
    if (["delivered", "read"].includes(status)) current.delivered += 1;
    if (status === "read") current.read += 1;
    map.set(templateName, current);
  }

  const insights = Array.from(map.values()).map((item) => {
    const unitCost = costByCategory(categories[item.template_name]);
    const deliveredForCost = item.delivered || item.sent;
    return {
      ...item,
      value_used_usd: Number((deliveredForCost * unitCost).toFixed(4)),
      cost_per_delivered_usd: deliveredForCost ? Number(unitCost.toFixed(4)) : 0,
      estimated: true,
    };
  });

  return { insights, error: null };
}

async function getTemplateInsights(req: VercelRequest, res: VercelResponse) {
  const wabaId = await resolveWabaId();
  const start = parseDateParam(req.query.start, daysAgoDate(7));
  const end = parseDateParam(req.query.end, endOfTodayUTC());
  const granularity = String(req.query.granularity || "DAILY").toUpperCase();

  if (!wabaId) {
    return send(res, 400, {
      ok: false,
      error: "WABA_ID ausente para consultar insights dos modelos.",
    });
  }

  const templatesResult = await metaGet(`${wabaId}/message_templates`, {
    limit: 250,
    fields: "id,name,status,category,language",
  });
  const categories: Record<string, string> = {};
  for (const template of templatesResult.data?.data || []) categories[template.name] = template.category || "";

  const metaAttempts = [
    await metaGet(`${wabaId}/template_analytics`, {
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000),
      granularity,
    }),
    await metaGet(`${wabaId}/template_analytics`, {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      granularity,
    }),
  ];

  const workingMeta = metaAttempts.find((attempt) => attempt.ok);
  const metaInsights = workingMeta ? extractMetaInsights(workingMeta.data) : [];
  const local = await getLocalTemplateInsights(start, end, categories);

  const merged = new Map<string, any>();
  for (const item of local.insights) merged.set(item.template_name, item);
  for (const item of metaInsights) merged.set(item.template_name, item);

  const insights = Array.from(merged.values()).sort((a, b) => (b.value_used_usd || 0) - (a.value_used_usd || 0));
  const summary = insights.reduce(
    (acc, item) => {
      acc.sent += Number(item.sent || 0);
      acc.delivered += Number(item.delivered || 0);
      acc.read += Number(item.read || 0);
      acc.unique_responses += Number(item.unique_responses || 0);
      acc.value_used_usd += Number(item.value_used_usd || 0);
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, unique_responses: 0, value_used_usd: 0 }
  );

  return send(res, 200, {
    ok: true,
    source: metaInsights.length ? "meta" : "crm_estimado",
    graph_version: GRAPH_VERSION,
    waba_id: wabaId,
    period: { start: start.toISOString(), end: end.toISOString(), granularity },
    summary: { ...summary, value_used_usd: Number(summary.value_used_usd.toFixed(4)), cost_per_delivered_usd: summary.delivered ? Number((summary.value_used_usd / summary.delivered).toFixed(4)) : 0 },
    insights,
    meta_raw: workingMeta?.data || null,
    warnings: [
      metaInsights.length ? null : "A consulta direta de insights da Meta não retornou linhas normalizáveis; exibindo fallback calculado pelo CRM quando houver templates enviados.",
      local.error ? { local_error: local.error } : null,
      ...metaAttempts.filter((a) => !a.ok).map((a) => ({ meta_attempt_error: a.data, status: a.status })),
    ].filter(Boolean),
  });
}

async function getOverview(_req: VercelRequest, res: VercelResponse) {
  const wabaId = await resolveWabaId();

  const [phone, waba, businessProfile] = await Promise.all([
    PHONE_NUMBER_ID
      ? metaGet(PHONE_NUMBER_ID, {
          fields: "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,account_mode,whatsapp_business_account",
        })
      : Promise.resolve({ ok: false, status: 400, data: { error: "META_WHATSAPP_PHONE_NUMBER_ID ausente" } }),
    wabaId
      ? metaGet(wabaId, {
          fields: "id,name,currency,timezone_id,message_template_namespace,phone_numbers{id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status}",
        })
      : Promise.resolve({ ok: false, status: 400, data: { error: "WABA_ID ausente" } }),
    PHONE_NUMBER_ID
      ? metaGet(`${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
          fields: "about,address,description,email,profile_picture_url,websites,vertical",
        })
      : Promise.resolve({ ok: false, status: 400, data: { error: "META_WHATSAPP_PHONE_NUMBER_ID ausente" } }),
  ]);

  return send(res, 200, {
    ok: true,
    source: "meta",
    graph_version: GRAPH_VERSION,
    ids: {
      phone_number_id: PHONE_NUMBER_ID || null,
      waba_id: wabaId || null,
    },
    phone_number: phone.ok ? phone.data : null,
    waba: waba.ok ? waba.data : null,
    business_profile: businessProfile.ok ? businessProfile.data?.data?.[0] || businessProfile.data : null,
    warnings: [
      !PHONE_NUMBER_ID ? "Configure META_WHATSAPP_PHONE_NUMBER_ID para consultar número e perfil." : null,
      !wabaId ? "Configure META_WHATSAPP_WABA_ID ou META_WHATSAPP_BUSINESS_ACCOUNT_ID para consultar WABA, modelos e números." : null,
      phone.ok ? null : { phone_number_error: phone.data },
      waba.ok ? null : { waba_error: waba.data },
      businessProfile.ok ? null : { business_profile_error: businessProfile.data },
    ].filter(Boolean),
    billing: {
      available_in_this_endpoint: false,
      note: "Custos por modelo agora aparecem no endpoint resource=template_insights. Quando a Meta não devolver insight direto, o CRM estima usando templates enviados e custo configurável por categoria.",
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Método não permitido" });

  if (!META_TOKEN) {
    return send(res, 400, {
      ok: false,
      error: "META_WHATSAPP_TOKEN ausente na Vercel.",
    });
  }

  const resource = String(req.query.resource || "overview").toLowerCase();

  try {
    if (resource === "templates" || resource === "modelos") return getTemplates(req, res);
    if (resource === "template_insights" || resource === "insights_modelos") return getTemplateInsights(req, res);
    return getOverview(req, res);
  } catch (error: any) {
    console.error("META_WHATSAPP_API_ERROR", error);
    return send(res, 500, { ok: false, error: error?.message || "Erro ao consultar API da Meta" });
  }
}
