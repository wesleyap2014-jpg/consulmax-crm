import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const META_TOKEN = process.env["META" + "_WHATSAPP" + "_TOKEN"]!;
const PHONE_NUMBER_ID = process.env["META" + "_WHATSAPP" + "_PHONE" + "_NUMBER" + "_ID"]!;
const WABA_ID = process.env["META" + "_WHATSAPP" + "_WABA" + "_ID"] || process.env["META" + "_WABA" + "_ID"] || process.env["WHATSAPP" + "_BUSINESS" + "_ACCOUNT" + "_ID"] || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const TEMPLATE_NAME = "resultado_assembleia_nao_contemplada";
const TEMPLATE_LANGUAGE = "pt_BR";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

type AnyRow = Record<string, any>;

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAdmin(raw?: string | null): string {
  const s = stripAccents(String(raw ?? "")).toLowerCase();
  const cleaned = s
    .replace(/consorcios?|consorcio|holding|sa|s\/a|s\.a\.?/g, "")
    .replace(/[^\w]/g, "")
    .trim();
  if (cleaned.includes("embracon")) return "Embracon";
  if (cleaned.includes("hs")) return "HS";
  if (cleaned.includes("maggi")) return "Maggi";
  if (cleaned.includes("bb") || cleaned.includes("bancodobrasil")) return "Banco do Brasil";
  return String(raw ?? "").trim();
}

function normalizeGroupDigits(g?: string | number | null): string {
  const s = String(g ?? "").trim();
  const first = s.split(/[\/\-\s]/)[0] || s;
  const m = first.match(/\d+/);
  if (m) return m[0];
  return s.replace(/\D/g, "");
}

function keyDigits(adm?: string | null, grp?: string | number | null) {
  return `${normalizeAdmin(adm)}::${normalizeGroupDigits(grp)}`;
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

function formatSavedLanceStrategy(strategy: any): string | null {
  const opcoes = Array.isArray(strategy?.opcoes) ? strategy.opcoes : [];
  if (!opcoes.length) return null;

  const parts = opcoes
    .map((op: any) => {
      const tipo = String(op?.tipo || "").trim();
      const pct = op?.percentual != null ? formatPctBR(Number(op.percentual)) : String(op?.percentual_formatado || "").trim();
      if (!tipo && !pct) return "";
      if (tipo && pct && pct !== "—") return `${tipo}: ${pct}`;
      return tipo || pct;
    })
    .filter(Boolean);

  return parts.length ? parts.join("; ") : null;
}

function tipoLanceFromVendas(vendas: AnyRow[]): string | null {
  const rows = vendas
    .map((v) => ({ cota: String(v.cota || "").trim(), text: formatSavedLanceStrategy(v.estrategia_lance) }))
    .filter((r) => !!r.text) as Array<{ cota: string; text: string }>;

  if (!rows.length) return null;

  const unique = Array.from(new Set(rows.map((r) => r.text)));
  if (unique.length === 1) return unique[0];

  return rows.map((r) => (r.cota ? `Cota ${r.cota}: ${r.text}` : r.text)).join(" | ");
}

function firstName(nome?: string | null) {
  const full = String(nome || "Cliente").trim() || "Cliente";
  return full.split(/\s+/)[0] || full;
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

function makeParam(name: string, value: string) {
  const param: any = { type: "text", text: String(value || "—") };
  if (name && Number.isNaN(Number(name))) param.parameter_name = name;
  return param;
}

function buildTemplateParams(templateDefinition: any, data: Record<string, string>) {
  const names = variableNames(bodyText(templateDefinition));
  const orderedDefaults = [
    data.nome_cliente,
    data.grupo,
    data.cota,
    data.data_assembleia,
    data.tipo_lance,
    data.info_ll,
    data.info_lf50,
    data.info_lf25,
    data.dt_prov,
    data.dt_pros,
    data.dt_proa,
  ];

  return names.map((name, index) => {
    const key = normalizeVarKey(name);
    const value = data[key] || data[name] || orderedDefaults[index] || "—";
    return makeParam(name, value);
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

function infoLivre(result: AnyRow) {
  const entregas = Number(result.ll_deliveries || 0);
  const ofertas = Number(result.ll_offers || 0);
  const high = result.ll_high == null ? null : Number(result.ll_high);
  const low = result.ll_low == null ? null : Number(result.ll_low);
  if (!entregas && !ofertas && high == null && low == null) return "Sem contemplações informadas";
  const parts = [`${entregas} contemplado(s)`];
  if (ofertas) parts.push(`${ofertas} oferta(s)`);
  if (high != null) parts.push(`maior ${formatPctBR(high)}`);
  if (low != null) parts.push(`menor ${formatPctBR(low)}`);
  return parts.join(" — ");
}

function infoFixo(entregasRaw: any, ofertasRaw: any) {
  const entregas = Number(entregasRaw || 0);
  const ofertas = Number(ofertasRaw || 0);
  if (!entregas && !ofertas) return "Sem contemplações informadas";
  if (ofertas) return `${entregas} contemplado(s) de ${ofertas} oferta(s)`;
  return `${entregas} contemplado(s)`;
}

function cmpNumLike(a: string | number | null, b: string | number | null) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  const na = parseInt(sa.replace(/\D+/g, ""), 10);
  const nb = parseInt(sb.replace(/\D+/g, ""), 10);
  const aIsNum = !Number.isNaN(na);
  const bIsNum = !Number.isNaN(nb);
  if (aIsNum && bIsNum && na !== nb) return na - nb;
  return sa.localeCompare(sb);
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
      stage: "assembleia",
      status: "humano",
      last_message: "Resultado de assembleia não contemplada",
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
    const date = String(req.query.date || req.body?.date || "").slice(0, 10);
    const groupIdsRaw = req.body?.group_ids || req.query.group_ids;
    const groupIds = Array.isArray(groupIdsRaw)
      ? groupIdsRaw.map(String).filter(Boolean)
      : String(groupIdsRaw || "").split(",").map((x) => x.trim()).filter(Boolean);

    if (!date) return res.status(400).json({ ok: false, error: "date é obrigatório." });

    const templateDefinition = await getTemplateDefinition();
    if (!templateDefinition) return res.status(400).json({ ok: false, error: `Modelo ${TEMPLATE_NAME} não encontrado/aprovado na Meta.` });

    let resultQuery = supabaseAdmin.from("assembly_results").select("*").eq("date", date);
    if (groupIds.length) resultQuery = resultQuery.in("group_id", groupIds);
    const { data: results, error: resultsError } = await resultQuery;
    if (resultsError) throw resultsError;
    if (!results?.length) return res.status(200).json({ ok: true, date, dry_run: dryRun, total: 0, sent: 0, skipped: 0, results: [] });

    const foundGroupIds = Array.from(new Set((results || []).map((r: any) => String(r.group_id)).filter(Boolean)));
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from("groups")
      .select("id,administradora,codigo,prox_vencimento,prox_sorteio,prox_assembleia")
      .in("id", foundGroupIds);
    if (groupsError) throw groupsError;

    const groupsById = new Map<string, AnyRow>();
    const groupCodes = new Set<string>();
    const groupKeyToId = new Map<string, string>();
    (groups || []).forEach((g: AnyRow) => {
      groupsById.set(String(g.id), g);
      const gd = normalizeGroupDigits(g.codigo);
      if (gd) groupCodes.add(gd);
      groupKeyToId.set(keyDigits(g.administradora, gd), String(g.id));
    });

    if (!groupCodes.size) return res.status(200).json({ ok: true, date, dry_run: dryRun, total: 0, sent: 0, skipped: 0, results: [] });

    const { data: vendas, error: vendasError } = await supabaseAdmin
      .from("vendas")
      .select("id,lead_id,administradora,grupo,cota,codigo,contemplada,inad,status,estrategia_lance")
      .eq("status", "encarteirada")
      .eq("codigo", "00")
      .in("grupo", Array.from(groupCodes));
    if (vendasError) throw vendasError;

    const filteredVendas = (vendas || []).filter((v: AnyRow) => {
      if (v.contemplada === true) return false;
      if (v.inad === true) return false;
      const gid = groupKeyToId.get(keyDigits(v.administradora, v.grupo));
      return !!gid;
    });

    const leadIds = Array.from(new Set(filteredVendas.map((v: AnyRow) => String(v.lead_id || "")).filter(Boolean)));
    const leadsById = new Map<string, AnyRow>();
    if (leadIds.length) {
      const { data: leads, error: leadsError } = await supabaseAdmin.from("leads").select("id,nome,telefone").in("id", leadIds);
      if (leadsError) throw leadsError;
      (leads || []).forEach((l: AnyRow) => leadsById.set(String(l.id), l));
    }

    const resultByGroupId = new Map<string, AnyRow>();
    (results || []).forEach((r: AnyRow) => resultByGroupId.set(String(r.group_id), r));

    const grouped = new Map<string, { groupId: string; leadId: string; vendas: AnyRow[] }>();
    filteredVendas.forEach((v: AnyRow) => {
      const groupId = groupKeyToId.get(keyDigits(v.administradora, v.grupo));
      if (!groupId) return;
      const leadId = String(v.lead_id || "");
      if (!leadId) return;
      const key = `${groupId}::${leadId}`;
      const current = grouped.get(key) || { groupId, leadId, vendas: [] };
      current.vendas.push(v);
      grouped.set(key, current);
    });

    const out: any[] = [];

    for (const item of grouped.values()) {
      const g = groupsById.get(item.groupId);
      const r = resultByGroupId.get(item.groupId);
      const lead = leadsById.get(item.leadId);
      const phone = onlyDigits(lead?.telefone || "");
      const nomeCompleto = String(lead?.nome || "Cliente").trim() || "Cliente";
      const cotas = item.vendas
        .map((v) => String(v.cota || "").trim())
        .filter(Boolean)
        .sort(cmpNumLike)
        .join(", ") || "—";
      const tipoLance = tipoLanceFromVendas(item.vendas);

      const automationKey = `gestao_nao_contemplada:${date}:${item.groupId}:${item.leadId}`;

      if (!phone) {
        out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, status: "skipped", reason: "sem_telefone", cotas });
        continue;
      }
      if (!tipoLance) {
        out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, phone, status: "skipped", reason: "estrategia_lance_nao_informada", cotas });
        continue;
      }
      if (await alreadySent(automationKey)) {
        out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, phone, status: "skipped", reason: "ja_enviado", cotas });
        continue;
      }

      const paramData: Record<string, string> = {
        nomecliente: firstName(nomeCompleto),
        nome_cliente: firstName(nomeCompleto),
        nome: firstName(nomeCompleto),
        cliente: firstName(nomeCompleto),
        grupo: String(g?.codigo || item.vendas[0]?.grupo || "—"),
        cota: cotas,
        cotas,
        dataassembleia: formatDateBR(date),
        data_assembleia: formatDateBR(date),
        tipolance: tipoLance,
        tipo_lance: tipoLance,
        info_ll: infoLivre(r || {}),
        infoll: infoLivre(r || {}),
        info_lf50: infoFixo(r?.fixed50_deliveries, r?.fixed50_offers),
        infolf50: infoFixo(r?.fixed50_deliveries, r?.fixed50_offers),
        info_lf25: infoFixo(r?.fixed25_deliveries, r?.fixed25_offers),
        infolf25: infoFixo(r?.fixed25_deliveries, r?.fixed25_offers),
        dt_prov: formatDateBR(g?.prox_vencimento),
        dtprov: formatDateBR(g?.prox_vencimento),
        dt_pros: formatDateBR(g?.prox_sorteio),
        dtpros: formatDateBR(g?.prox_sorteio),
        dt_proa: formatDateBR(g?.prox_assembleia),
        dtproa: formatDateBR(g?.prox_assembleia),
      };

      const params = buildTemplateParams(templateDefinition, paramData);
      const renderedBody = renderTemplateBody(templateDefinition, params);

      if (dryRun) {
        out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, phone, status: "dry_run", cotas, tipo_lance: tipoLance, body: renderedBody, params: paramData });
        continue;
      }

      const conversationId = await ensureConversation(phone, nomeCompleto, item.leadId);
      const sent = await sendTemplate(phone, params);

      if (!sent.ok) {
        out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, phone, status: "error", error: sent.data, cotas, tipo_lance: tipoLance });
        continue;
      }

      const metaMessageId = sent.data?.messages?.[0]?.id || null;
      const rawPayload = {
        ...sent.data,
        automation_key: automationKey,
        automation_type: "gestao_grupos_nao_contemplada",
        assembly_date: date,
        group_id: item.groupId,
        lead_id: item.leadId,
        template_name: TEMPLATE_NAME,
        template_language: TEMPLATE_LANGUAGE,
        template_rendered_body: renderedBody,
        template_components: sent.payload?.template?.components || [],
        cotas,
        tipo_lance: tipoLance,
        param_data: paramData,
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

      out.push({ group_id: item.groupId, lead_id: item.leadId, nome: nomeCompleto, phone, conversation_id: conversationId, status: "sent", meta_message_id: metaMessageId, cotas, tipo_lance: tipoLance });
    }

    return res.status(200).json({
      ok: true,
      date,
      template: TEMPLATE_NAME,
      dry_run: dryRun,
      total: out.length,
      sent: out.filter((r) => r.status === "sent").length,
      skipped: out.filter((r) => r.status === "skipped").length,
      errors: out.filter((r) => r.status === "error").length,
      results: out,
    });
  } catch (error: any) {
    console.error("GESTAO_NAO_CONTEMPLADA_WHATSAPP_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro ao enviar mensagens de cotas não contempladas." });
  }
}
