import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

type AudienceSource = "clientes" | "parceiros";
type Recipient = {
  source_type: "cliente" | "parceiro";
  source_record_id: string | null;
  name: string;
  email: string;
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
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || profile?.role !== "admin") {
    json(res, 403, { ok: false, message: "Apenas administradores podem preparar disparos de newsletter." });
    return null;
  }
  return user;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function normalizeSources(value: unknown): AudienceSource[] {
  const input = Array.isArray(value) ? value : [];
  return Array.from(new Set(input.filter((item): item is AudienceSource => item === "clientes" || item === "parceiros")));
}

async function loadSource(source: AudienceSource) {
  const table = source === "clientes" ? "clientes" : "partners";
  const sourceType = source === "clientes" ? "cliente" : "parceiro";
  const { data, error } = await db.from(table).select("id,nome,email").order("nome", { ascending: true });
  if (error) throw error;

  const rows = data || [];
  let invalid = 0;
  const recipients: Recipient[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email || !validEmail(email)) {
      if (String(row.email || "").trim()) invalid += 1;
      continue;
    }
    recipients.push({
      source_type: sourceType,
      source_record_id: row.id || null,
      name: String(row.nome || "").trim(),
      email,
    });
  }

  return {
    source,
    totalRecords: rows.length,
    validEmails: recipients.length,
    invalidEmails: invalid,
    recipients,
  };
}

async function buildAudience(sources: AudienceSource[]) {
  const loaded = await Promise.all(sources.map(loadSource));
  const byEmail = new Map<string, Recipient>();
  let duplicates = 0;
  let invalid = 0;

  for (const source of loaded) {
    invalid += source.invalidEmails;
    for (const recipient of source.recipients) {
      if (byEmail.has(recipient.email)) {
        duplicates += 1;
        continue;
      }
      byEmail.set(recipient.email, recipient);
    }
  }

  const recipients = Array.from(byEmail.values());
  return { loaded, recipients, duplicates, invalid };
}

async function latestDispatch(newsletterId: string) {
  const { data } = await db
    .from("marketing_newsletter_dispatches")
    .select("id,status,source_types,hourly_limit,daily_limit,total_recipients,sent_count,failed_count,skipped_count,duplicate_count,invalid_count,created_at,started_at,completed_at")
    .eq("newsletter_id", newsletterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    if (req.method === "GET") {
      const [clientes, parceiros] = await Promise.all([loadSource("clientes"), loadSource("parceiros")]);
      const newsletterId = String(req.query.newsletter_id || "").trim();
      return json(res, 200, {
        ok: true,
        sources: {
          clientes: { total: clientes.totalRecords, valid: clientes.validEmails, invalid: clientes.invalidEmails },
          parceiros: { total: parceiros.totalRecords, valid: parceiros.validEmails, invalid: parceiros.invalidEmails },
        },
        latest_dispatch: newsletterId ? await latestDispatch(newsletterId) : null,
        limits: { hourly: 50, daily: 100 },
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { ok: false, message: "Método não permitido" });
    }

    const action = String(req.body?.action || "preview");
    const sources = normalizeSources(req.body?.sources);
    if (!sources.length) return json(res, 400, { ok: false, message: "Selecione pelo menos uma origem de contatos." });

    const audience = await buildAudience(sources);
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
        sample: audience.recipients.slice(0, 12).map(({ name, email, source_type }) => ({ name, email, source_type })),
        limits: { hourly: 50, daily: 100 },
      });
    }

    if (action !== "queue") return json(res, 400, { ok: false, message: "Ação inválida." });

    const newsletterId = String(req.body?.newsletter_id || "").trim();
    if (!newsletterId) return json(res, 400, { ok: false, message: "Newsletter não informada." });
    if (!audience.recipients.length) return json(res, 400, { ok: false, message: "Nenhum e-mail válido encontrado nas origens selecionadas." });

    const { data: newsletter, error: newsletterError } = await db
      .from("marketing_newsletters")
      .select("id,title,subject")
      .eq("id", newsletterId)
      .maybeSingle();
    if (newsletterError || !newsletter) return json(res, 404, { ok: false, message: "Newsletter não encontrada." });

    const { data: oldDispatches } = await db
      .from("marketing_newsletter_dispatches")
      .select("id")
      .eq("newsletter_id", newsletterId)
      .in("status", ["preparando", "pronta"]);
    if (oldDispatches?.length) {
      await db.from("marketing_newsletter_dispatches").delete().in("id", oldDispatches.map((item) => item.id));
    }

    const { data: dispatch, error: dispatchError } = await db
      .from("marketing_newsletter_dispatches")
      .insert({
        newsletter_id: newsletterId,
        status: "preparando",
        source_types: sources,
        hourly_limit: 50,
        daily_limit: 100,
        total_recipients: audience.recipients.length,
        duplicate_count: audience.duplicates,
        invalid_count: audience.invalid,
        created_by: user.id,
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
      .select("id,status,source_types,hourly_limit,daily_limit,total_recipients,sent_count,failed_count,duplicate_count,invalid_count,created_at")
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
