import type { VercelRequest, VercelResponse } from "@vercel/node";

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
      note: "A API da Meta não expõe uma fatura simples do WhatsApp por este endpoint. Para custos reais, vamos calcular pelo CRM usando mensagens/templates enviados, categoria, país e a tabela de preços configurada; e podemos exibir os dados financeiros do Business Manager quando houver permissões/endpoint de billing liberados no app.",
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
    return getOverview(req, res);
  } catch (error: any) {
    console.error("META_WHATSAPP_API_ERROR", error);
    return send(res, 500, { ok: false, error: error?.message || "Erro ao consultar API da Meta" });
  }
}
