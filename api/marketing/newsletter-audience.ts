import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

type AudienceSource = "clientes" | "parceiros" | "leads" | "usuarios";
type RecipientSourceType = "cliente" | "parceiro" | "lead" | "usuario" | "arquivo" | "manual";
type Recipient = {
  source_type: RecipientSourceType;
  source_record_id: string | null;
  name: string;
  email: string;
};

type SourceLoad = {
  source: string;
  totalRecords: number;
  validEmails: number;
  invalidEmails: number;
  recipients: Recipient[];
};

function json(res: VercelResponse, status: number, body: any) {
  return res.status(status).json(body);
}

async function authenticatedUser(req: VercelRequest) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const jwt = header.slice(7).trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user || null;
}

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const user = await authenticatedUser(req);
  if (!user) {
    json(res, 401, { ok: false, message: "Não autorizado" });
    return null;
  }
  const { data: profile, error } = await db
    .from("users")
    .select("role,email,nome,is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || profile?.role !== "admin") {
    json(res, 403, { ok: false, message: "Apenas administradores podem preparar disparos de newsletter." });
    return null;
  }
  return { user, profile };
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function normalizeSources(value: unknown): AudienceSource[] {
  const allowed: AudienceSource[] = ["clientes", "parceiros", "leads", "usuarios"];
  const input = Array.isArray(value) ? value : [];
  return Array.from(new Set(input.filter((item): item is AudienceSource => allowed.includes(item as AudienceSource))));
}

function rowsToRecipients(rows: any[], source: string, sourceType: RecipientSourceType): SourceLoad {
  let invalid = 0;
  const recipients: Recipient[] = [];
  for (const row of rows || []) {
    const email = normalizeEmail(row?.email);
    if (!email || !validEmail(email)) {
      if (String(row?.email || "").trim()) invalid += 1;
      continue;
    }
    recipients.push({
      source_type: sourceType,
      source_record_id: row?.id || null,
      name: String(row?.nome || row?.name || "").trim(),
      email,
    });
  }
  return {
    source,
    totalRecords: (rows || []).length,
    validEmails: recipients.length,
    invalidEmails: invalid,
    recipients,
  };
}

async function loadSource(source: AudienceSource): Promise<SourceLoad> {
  if (source === "clientes") {
    const { data, error } = await db.from("clientes").select("id,nome,email").order("nome", { ascending: true });
    if (error) throw error;
    return rowsToRecipients(data || [], source, "cliente");
  }

  if (source === "parceiros") {
    const { data, error } = await db.from("partners").select("id,nome,email").order("nome", { ascending: true });
    if (error) throw error;
    return rowsToRecipients(data || [], source, "parceiro");
  }

  if (source === "leads") {
    const { data, error } = await db.from("leads").select("id,nome,email").order("nome", { ascending: true });
    if (error) throw error;
    return rowsToRecipients(data || [], source, "lead");
  }

  const { data, error } = await db
    .from("users")
    .select("id,nome,email,is_active")
    .eq("is_active", true)
    .order("nome", { ascending: true });
  if (error) throw error;
  return rowsToRecipients(data || [], source, "usuario");
}

function normalizeExtraRecipients(value: unknown, sourceType: "arquivo" | "manual", source: string): SourceLoad {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  let invalid = 0;
  const recipients: Recipient[] = [];

  for (const item of rows.slice(0, 5000)) {
    const email = normalizeEmail((item as any)?.email ?? item);
    const name = String((item as any)?.name || (item as any)?.nome || "").trim();
    if (!email || !validEmail(email)) {
      if (String((item as any)?.email ?? item ?? "").trim()) invalid += 1;
      continue;
    }
    recipients.push({
      source_type: sourceType,
      source_record_id: null,
      name,
      email,
    });
  }

  return {
    source,
    totalRecords: rows.length,
    validEmails: recipients.length,
    invalidEmails: invalid + Math.max(0, rows.length - 5000),
    recipients,
  };
}

async function buildAudience(sources: AudienceSource[], imported: unknown, manual: unknown) {
  const loaded = await Promise.all(sources.map(loadSource));
  const extra: SourceLoad[] = [];

  const importedLoad = normalizeExtraRecipients(imported, "arquivo", "arquivo");
  if (importedLoad.totalRecords) extra.push(importedLoad);

  const manualLoad = normalizeExtraRecipients(manual, "manual", "manual");
  if (manualLoad.totalRecords) extra.push(manualLoad);

  const allSources = [...loaded, ...extra];
  const byEmail = new Map<string, Recipient>();
  let duplicates = 0;
  let invalid = 0;

  for (const source of allSources) {
    invalid += source.invalidEmails;
    for (const recipient of source.recipients) {
      if (byEmail.has(recipient.email)) {
        duplicates += 1;
        continue;
      }
      byEmail.set(recipient.email, recipient);
    }
  }

  return {
    loaded: allSources,
    recipients: Array.from(byEmail.values()),
    duplicates,
    invalid,
  };
}

const DISPATCH_FIELDS = "id,status,source_types,hourly_limit,daily_limit,total_recipients,sent_count,failed_count,skipped_count,duplicate_count,invalid_count,created_at,started_at,completed_at,last_run_at";

async function latestDispatch(newsletterId: string) {
  const { data } = await db
    .from("marketing_newsletter_dispatches")
    .select(DISPATCH_FIELDS)
    .eq("newsletter_id", newsletterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function getDispatch(newsletterId: string, dispatchId?: string) {
  let query = db
    .from("marketing_newsletter_dispatches")
    .select(`${DISPATCH_FIELDS},newsletter_id`)
    .eq("newsletter_id", newsletterId);
  if (dispatchId) query = query.eq("id", dispatchId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function dispatchAction(action: "start" | "pause" | "resume", newsletterId: string, dispatchId?: string) {
  const dispatch = await getDispatch(newsletterId, dispatchId);
  if (!dispatch) throw new Error("Fila de envio não encontrada.");

  const now = new Date().toISOString();
  if (action === "start") {
    if (!["pronta", "pausada"].includes(dispatch.status)) {
      throw new Error("Esta fila não está pronta para iniciar.");
    }
    const { data, error } = await db
      .from("marketing_newsletter_dispatches")
      .update({ status: "em_envio", started_at: dispatch.started_at || now })
      .eq("id", dispatch.id)
      .select(DISPATCH_FIELDS)
      .single();
    if (error) throw error;
    await db.from("marketing_newsletters").update({ status: "programada" }).eq("id", newsletterId).neq("status", "enviada");
    return data;
  }

  if (action === "pause") {
    if (dispatch.status !== "em_envio") throw new Error("A fila não está em envio.");
    const { data, error } = await db
      .from("marketing_newsletter_dispatches")
      .update({ status: "pausada" })
      .eq("id", dispatch.id)
      .select(DISPATCH_FIELDS)
      .single();
    if (error) throw error;
    return data;
  }

  if (dispatch.status !== "pausada") throw new Error("A fila não está pausada.");
  const { data, error } = await db
    .from("marketing_newsletter_dispatches")
    .update({ status: "em_envio" })
    .eq("id", dispatch.id)
    .select(DISPATCH_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  try {
    if (req.method === "GET") {
      const [clientes, parceiros, leads, usuarios] = await Promise.all([
        loadSource("clientes"),
        loadSource("parceiros"),
        loadSource("leads"),
        loadSource("usuarios"),
      ]);
      const newsletterId = String(req.query.newsletter_id || "").trim();
      return json(res, 200, {
        ok: true,
        sources: {
          clientes: { total: clientes.totalRecords, valid: clientes.validEmails, invalid: clientes.invalidEmails },
          parceiros: { total: parceiros.totalRecords, valid: parceiros.validEmails, invalid: parceiros.invalidEmails },
          leads: { total: leads.totalRecords, valid: leads.validEmails, invalid: leads.invalidEmails },
          usuarios: { total: usuarios.totalRecords, valid: usuarios.validEmails, invalid: usuarios.invalidEmails },
        },
        current_user_email: normalizeEmail(auth.profile?.email || auth.user.email || ""),
        current_user_name: String(auth.profile?.nome || "").trim(),
        latest_dispatch: newsletterId ? await latestDispatch(newsletterId) : null,
        limits: { hourly: 50, daily: 100 },
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { ok: false, message: "Método não permitido" });
    }

    const action = String(req.body?.action || "preview");
    const newsletterId = String(req.body?.newsletter_id || "").trim();

    if (["start", "pause", "resume"].includes(action)) {
      if (!newsletterId) return json(res, 400, { ok: false, message: "Newsletter não informada." });
      const dispatch = await dispatchAction(action as "start" | "pause" | "resume", newsletterId, String(req.body?.dispatch_id || "").trim() || undefined);
      return json(res, 200, { ok: true, dispatch });
    }

    const sources = normalizeSources(req.body?.sources);
    const importedRecipients = req.body?.imported_recipients || [];
    const manualRecipient = req.body?.manual_recipient || null;

    if (!sources.length && !Array.isArray(importedRecipients) && !manualRecipient) {
      return json(res, 400, { ok: false, message: "Selecione pelo menos uma origem de contatos." });
    }

    const audience = await buildAudience(sources, importedRecipients, manualRecipient);
    if (!audience.loaded.length) {
      return json(res, 400, { ok: false, message: "Selecione pelo menos uma lista, importe um arquivo ou informe um e-mail de teste." });
    }

    const sourceSummary = Object.fromEntries(audience.loaded.map((source) => [source.source, {
      total: source.totalRecords,
      valid: source.validEmails,
      invalid: source.invalidEmails,
    }]));

    if (action === "preview") {
      return json(res, 200, {
        ok: true,
        total_unique: audience.recipients.length,
        duplicates_removed: audience.duplicates,
        invalid_removed: audience.invalid,
        sources: sourceSummary,
        sample: audience.recipients.slice(0, 20).map(({ name, email, source_type }) => ({ name, email, source_type })),
        limits: { hourly: 50, daily: 100 },
      });
    }

    if (action !== "queue") return json(res, 400, { ok: false, message: "Ação inválida." });

    if (!newsletterId) return json(res, 400, { ok: false, message: "Newsletter não informada." });
    if (!audience.recipients.length) return json(res, 400, { ok: false, message: "Nenhum e-mail válido encontrado no público selecionado." });

    const { data: newsletter, error: newsletterError } = await db
      .from("marketing_newsletters")
      .select("id,title,subject,content")
      .eq("id", newsletterId)
      .maybeSingle();
    if (newsletterError || !newsletter) return json(res, 404, { ok: false, message: "Newsletter não encontrada." });
    if (!String(newsletter.subject || "").trim() || !String(newsletter.content || "").trim()) {
      return json(res, 400, { ok: false, message: "Preencha o assunto e o conteúdo da newsletter antes de preparar o envio." });
    }

    const { data: activeDispatches, error: activeError } = await db
      .from("marketing_newsletter_dispatches")
      .select("id,status")
      .eq("newsletter_id", newsletterId)
      .in("status", ["em_envio", "pausada"])
      .limit(1);
    if (activeError) throw activeError;
    if (activeDispatches?.length) {
      return json(res, 409, { ok: false, message: "Já existe uma fila ativa ou pausada para esta newsletter. Conclua essa fila antes de criar outra." });
    }

    const { data: oldDispatches } = await db
      .from("marketing_newsletter_dispatches")
      .select("id")
      .eq("newsletter_id", newsletterId)
      .in("status", ["preparando", "pronta"]);
    if (oldDispatches?.length) {
      await db.from("marketing_newsletter_dispatches").delete().in("id", oldDispatches.map((item) => item.id));
    }

    const sourceTypes = [
      ...sources,
      ...(audience.loaded.some((source) => source.source === "arquivo") ? ["arquivo"] : []),
      ...(audience.loaded.some((source) => source.source === "manual") ? ["manual"] : []),
    ];

    const { data: dispatch, error: dispatchError } = await db
      .from("marketing_newsletter_dispatches")
      .insert({
        newsletter_id: newsletterId,
        status: "preparando",
        source_types: sourceTypes,
        hourly_limit: 50,
        daily_limit: 100,
        total_recipients: audience.recipients.length,
        duplicate_count: audience.duplicates,
        invalid_count: audience.invalid,
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (dispatchError || !dispatch) throw dispatchError || new Error("Não foi possível criar a fila.");

    const rows = audience.recipients.map((recipient) => ({
      dispatch_id: dispatch.id,
      newsletter_id: newsletterId,
      source_type: recipient.source_type,
      source_record_id: recipient.source_record_id,
      name: recipient.name || null,
      email: recipient.email,
      status: "pendente",
    }));

    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await db.from("marketing_newsletter_recipients").insert(rows.slice(index, index + 500));
      if (error) {
        await db.from("marketing_newsletter_dispatches").update({ status: "erro" }).eq("id", dispatch.id);
        throw error;
      }
    }

    const { data: ready, error: readyError } = await db
      .from("marketing_newsletter_dispatches")
      .update({ status: "pronta" })
      .eq("id", dispatch.id)
      .select(DISPATCH_FIELDS)
      .single();
    if (readyError) throw readyError;

    return json(res, 200, {
      ok: true,
      dispatch: ready,
      total_unique: audience.recipients.length,
      duplicates_removed: audience.duplicates,
      invalid_removed: audience.invalid,
      message: `Lista preparada com ${audience.recipients.length} destinatários únicos.`,
    });
  } catch (error: any) {
    console.error("newsletter-audience", error);
    return json(res, 500, { ok: false, message: error?.message || "Erro ao preparar o público da newsletter." });
  }
}
