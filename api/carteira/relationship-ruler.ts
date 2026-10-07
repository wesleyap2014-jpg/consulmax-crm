import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_supabase";
import { randomUUID } from "node:crypto";
import { sendRelationshipEmail, relationshipSmtpError, RELATIONSHIP_FROM_EMAIL } from "../_relationship-email.js";

const CRM_TZ = process.env.CRM_TIMEZONE || "America/Porto_Velho";
const APP_URL = String(process.env.PUBLIC_APP_URL || "https://crm.consulmaxconsorcios.com.br").replace(/\/$/, "");
const LOGO_URL = `${APP_URL}/logo-consulmax.png`;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "");
const OPENAI_MODEL = String(process.env.OPENAI_PERFORMANCE_MODEL || "gpt-4.1-mini");

type Ruler = "inadimplencia" | "recuperacao";
type CtaType = "regularizar" | "reparcelamento" | "ajuda" | "retomar_projeto";

type SaleRow = {
  id: string;
  lead_id?: string | null;
  cliente_lead_id?: string | null;
  vendedor_id?: string | null;
  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null;
  cancelada_em?: string | null;
  reativada_em?: string | null;
  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;
  email?: string | null;
  produto?: string | null;
  segmento?: string | null;
  administradora?: string | null;
  valor_venda?: number | null;
};

type Contact = { nome?: string | null; email?: string | null; telefone?: string | null };

type Decision = {
  subject: string;
  preheader: string;
  headline: string;
  paragraphs: string[];
  cta_label: string;
  cta_type: CtaType;
  rationale: string;
};

function localYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYmd(value: string, amount: number) {
  const d = new Date(`${value}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function dayDiff(later: string, earlier: string) {
  const a = new Date(`${later.slice(0, 10)}T12:00:00.000Z`).getTime();
  const b = new Date(`${earlier.slice(0, 10)}T12:00:00.000Z`).getTime();
  return Math.max(0, Math.floor((a - b) / 86_400_000));
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function firstName(value?: string | null) {
  return String(value || "Cliente").trim().split(/\s+/)[0] || "Cliente";
}

function validEmail(value?: string | null) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isCancelled(sale: SaleRow) {
  if (sale.cancelada_em) return true;
  if (sale.codigo === "00") return false;
  return Boolean(sale.codigo && sale.codigo !== "00");
}

function groupCota(sale: SaleRow) {
  return `${sale.grupo || "—"}/${sale.cota || "—"}`;
}

function latestMilestone(days: number, milestones: number[]) {
  return [...milestones].reverse().find((m) => days >= m) || null;
}

function overdueStage(days: number) {
  if (days < 1) return null;
  if (days <= 30) {
    return { stage: "inad_1_30", milestone: latestMilestone(days, [1, 7, 15, 25, 30]) };
  }
  if (days <= 60) {
    return { stage: "inad_31_60", milestone: latestMilestone(days, [35, 45, 55, 60]) };
  }
  if (days <= 89) {
    return { stage: "inad_61_89", milestone: latestMilestone(days, [61, 68, 75, 82, 87, 89]) };
  }
  return null;
}

function recoveryStage(days: number) {
  if (days < 20) return null;
  const milestone = Math.floor(days / 20) * 20;
  return { stage: "recovery_cancelled", milestone };
}

function fallbackDecision(args: {
  ruler: Ruler;
  stage: string;
  sale: SaleRow;
  days: number;
  name: string;
  milestone: number;
  clickCount: number;
}) : Decision {
  const name = firstName(args.name);
  const ref = groupCota(args.sale);
  if (args.ruler === "recuperacao") {
    const angle = Math.max(1, Math.floor(args.milestone / 20));
    const variants = [
      {
        subject: `${name}, seu projeto ainda faz sentido para você?`,
        headline: "Seu planejamento pode ser retomado",
        body: "Quando iniciamos seu consórcio, havia um objetivo por trás dessa decisão. Se esse projeto ainda fizer sentido, podemos conversar sobre uma nova estratégia adequada ao seu momento atual.",
      },
      {
        subject: `${name}, podemos reconstruir seu planejamento?`,
        headline: "Uma nova estratégia pode fazer mais sentido agora",
        body: "Sua realidade pode ter mudado desde o início do projeto. A Consulmax pode revisar o objetivo e estudar uma alternativa compatível com o cenário de hoje.",
      },
      {
        subject: `Consulmax | Quer retomar seu projeto de ${args.sale.produto || args.sale.segmento || "consórcio"}?`,
        headline: "Seu objetivo não precisa terminar com o cancelamento",
        body: "O cancelamento encerrou aquela etapa, mas não necessariamente o seu objetivo. Se quiser, podemos reavaliar o projeto e construir um novo caminho.",
      },
    ];
    const v = variants[(angle - 1) % variants.length];
    return {
      subject: v.subject,
      preheader: "A Consulmax pode ajudar você a reavaliar e retomar seu planejamento.",
      headline: v.headline,
      paragraphs: [
        `Olá, ${name}.`,
        v.body,
        `Referência do projeto anterior: Grupo/Cota ${ref}.`,
      ],
      cta_label: "Quero retomar meu projeto",
      cta_type: "retomar_projeto",
      rationale: `Recuperação D+${args.milestone}; abordagem rotativa de retomada do objetivo.`,
    };
  }

  if (args.stage === "inad_1_30") {
    return {
      subject: `${name}, identificamos uma parcela em aberto no seu consórcio`,
      preheader: "Um lembrete da Consulmax para ajudar você a manter seu planejamento em dia.",
      headline: "Vamos manter seu planejamento em dia?",
      paragraphs: [
        `Olá, ${name}.`,
        "Identificamos que sua cota consta como inadimplente em nossa carteira. Sabemos que imprevistos acontecem e queremos facilitar sua regularização.",
        `Grupo/Cota: ${ref}. Se você já regularizou, desconsidere esta mensagem; a régua será encerrada assim que a baixa constar no CRM.`,
      ],
      cta_label: "Quero regularizar minha cota",
      cta_type: "regularizar",
      rationale: "Faixa de 1 a 30 dias: lembrete amigável com foco em regularização.",
    };
  }

  if (args.stage === "inad_31_60") {
    return {
      subject: `${name}, podemos verificar uma alternativa para regularizar sua cota`,
      preheader: "Podemos verificar a possibilidade de reparcelamento das parcelas em aberto.",
      headline: "Existe uma alternativa que podemos verificar com você",
      paragraphs: [
        `Olá, ${name}.`,
        "Sua cota permanece com parcelas em aberto. Neste momento, podemos verificar a possibilidade de reparcelamento para facilitar a regularização, sempre conforme as condições e regras aplicáveis à sua administradora.",
        `Grupo/Cota: ${ref}. Nosso objetivo é ajudar você a recuperar a condição de adimplência e preservar a continuidade do seu planejamento.`,
      ],
      cta_label: "Verificar reparcelamento",
      cta_type: "reparcelamento",
      rationale: "Faixa de 31 a 60 dias: solução financeira, sem prometer aprovação de reparcelamento.",
    };
  }

  return {
    subject: `Atenção, ${name}: sua cota está em risco de cancelamento`,
    preheader: "Sua cota está em uma faixa crítica de inadimplência. Fale com a Consulmax.",
    headline: "Precisamos agir para evitar o cancelamento da sua cota",
    paragraphs: [
      `Olá, ${name}.`,
      "Sua cota permanece inadimplente e já está em uma faixa crítica. Como referência operacional, a baixa por cancelamento costuma ocorrer por volta do 90º dia de atraso e pode ocorrer antes, conforme as regras e o processamento da administradora.",
      `Grupo/Cota: ${ref}. Para preservar seu planejamento, fale conosco agora para verificarmos as alternativas de regularização ou eventual reparcelamento disponíveis para o seu caso.`,
    ],
    cta_label: "Quero verificar minhas opções",
    cta_type: "reparcelamento",
    rationale: "Faixa de 61 a 89 dias: comunicação firme, factual e orientada a evitar cancelamento.",
  };
}

function allowedCtas(ruler: Ruler, stage: string): CtaType[] {
  if (ruler === "recuperacao") return ["retomar_projeto", "ajuda"];
  if (stage === "inad_1_30") return ["regularizar", "ajuda"];
  return ["reparcelamento", "regularizar", "ajuda"];
}

async function maxDecision(context: any, fallback: Decision): Promise<Decision> {
  if (!OPENAI_API_KEY) return fallback;
  try {
    const allowed = allowedCtas(context.ruler, context.stage);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você é MAX, cérebro de relacionamento da Consulmax Consórcios. Sua missão é preservar a carteira, recuperar clientes e decidir a melhor abordagem de comunicação. Nunca invente valores, datas, condições de administradora, aprovação de reparcelamento, consequências contratuais ou fatos não fornecidos. Não use ameaça, constrangimento ou linguagem agressiva. Em inadimplência 1-30, seja amigável; 31-60, ofereça somente VERIFICAR a possibilidade de reparcelamento; 61-89, seja firme e explique que existe risco de cancelamento por volta do 90º dia e que pode ocorrer antes, sem garantir uma data. Em recuperação pós-cancelamento, não cobre dívida: retome o objetivo original e varie o argumento a cada ciclo. Considere sinais de comportamento como quantidade de e-mails e cliques. Retorne SOMENTE JSON válido com: subject, preheader, headline, paragraphs (2 a 4 strings), cta_label, cta_type, rationale. cta_type deve estar entre os permitidos enviados no contexto. Escreva português brasileiro, institucional, humano e conciso.",
          },
          {
            role: "user",
            content: JSON.stringify(context).slice(0, 12000),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return fallback;
    const body = await response.json();
    const parsed = JSON.parse(String(body?.choices?.[0]?.message?.content || "{}"));
    const cta = String(parsed?.cta_type || "") as CtaType;
    if (!allowed.includes(cta)) return fallback;
    const paragraphs = Array.isArray(parsed?.paragraphs)
      ? parsed.paragraphs.map((p: any) => String(p || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    if (!paragraphs.length) return fallback;
    return {
      subject: String(parsed.subject || fallback.subject).trim().slice(0, 150),
      preheader: String(parsed.preheader || fallback.preheader).trim().slice(0, 220),
      headline: String(parsed.headline || fallback.headline).trim().slice(0, 180),
      paragraphs,
      cta_label: String(parsed.cta_label || fallback.cta_label).trim().slice(0, 80),
      cta_type: cta,
      rationale: String(parsed.rationale || fallback.rationale).trim().slice(0, 700),
    };
  } catch (error) {
    console.warn("[carteira-ruler] MAX indisponível, usando fallback:", error);
    return fallback;
  }
}

function ctaMessage(type: CtaType, sale: SaleRow) {
  const ref = groupCota(sale);
  if (type === "reparcelamento") {
    return `Olá! Gostaria de verificar a possibilidade de reparcelamento das parcelas em aberto referente ao meu consórcio. Grupo/Cota ${ref}.`;
  }
  if (type === "ajuda") {
    return `Olá! Preciso de ajuda referente ao meu consórcio. Grupo/Cota ${ref}.`;
  }
  if (type === "retomar_projeto") {
    return `Olá! Gostaria de conversar sobre a possibilidade de retomar meu projeto de consórcio. Grupo/Cota ${ref}.`;
  }
  return `Olá! Gostaria de regularizar as parcelas em aberto referente ao meu consórcio. Grupo/Cota ${ref}.`;
}

function buildEmailHtml(args: {
  name: string;
  sale: SaleRow;
  decision: Decision;
  ctaUrl: string;
  ruler: Ruler;
  days: number;
}) {
  const stageLabel = args.ruler === "recuperacao" ? "Retomada de planejamento" : "Acompanhamento da sua cota";
  const paragraphs = args.decision.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#334155;">${escapeHtml(p)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1E293F;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(args.decision.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.09);">
        <tr><td align="center" style="padding:24px 30px 18px;border-top:5px solid #A11C27;background:#ffffff;">
          <img src="${LOGO_URL}" width="210" alt="Consulmax Consórcios" style="display:block;width:210px;max-width:70%;height:auto;border:0;margin:0 auto;">
          <div style="margin-top:10px;font-size:10px;color:#64748b;letter-spacing:1.25px;text-transform:uppercase;">${escapeHtml(stageLabel)}</div>
        </td></tr>
        <tr><td style="height:4px;background:#B5A573;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 30px 34px;">
          <h1 style="margin:0 0 20px;font-size:25px;line-height:1.25;color:#1E293F;">${escapeHtml(args.decision.headline)}</h1>
          ${paragraphs}
          <div style="margin:22px 0;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800;">Referência</div>
            <div style="margin-top:6px;font-size:14px;color:#1E293F;font-weight:800;">Grupo/Cota: ${escapeHtml(groupCota(args.sale))}</div>
            <div style="margin-top:4px;font-size:12px;color:#64748b;">${escapeHtml(args.sale.administradora || "Consórcio")} · ${escapeHtml(args.sale.produto || args.sale.segmento || "Planejamento")}</div>
          </div>
          <div style="text-align:center;margin:26px 0 8px;">
            <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:14px 24px;border-radius:11px;">${escapeHtml(args.decision.cta_label)}</a>
          </div>
          <p style="margin:18px 0 0;text-align:center;font-size:11px;line-height:1.55;color:#94a3b8;">Ao clicar, você será direcionado ao WhatsApp oficial da Consulmax com uma mensagem pronta. O clique é registrado no CRM para que nossa equipe possa priorizar seu atendimento.</p>
        </td></tr>
        <tr><td style="padding:22px 30px;background:#1E293F;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(255,255,255,.78);">Consulmax Serviços de Planejamento Estruturado e Proteção LTDA</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.58);">Consulmax | Relacionamento · ${escapeHtml(RELATIONSHIP_FROM_EMAIL)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText(args: { decision: Decision; sale: SaleRow; ctaUrl: string }) {
  return [
    args.decision.headline,
    "",
    ...args.decision.paragraphs,
    "",
    `Grupo/Cota: ${groupCota(args.sale)}`,
    "",
    `${args.decision.cta_label}: ${args.ctaUrl}`,
    "",
    `Consulmax | Relacionamento — ${RELATIONSHIP_FROM_EMAIL}`,
  ].join("\n");
}

async function loadContacts(sales: SaleRow[]) {
  const leadIds = Array.from(new Set(
    sales.map((s) => String(s.lead_id || s.cliente_lead_id || "")).filter(Boolean),
  ));
  const clients = new Map<string, Contact>();
  const leads = new Map<string, Contact>();
  if (leadIds.length) {
    const [c, l] = await Promise.all([
      supabaseAdmin.from("clientes").select("lead_id,nome,email,telefone").in("lead_id", leadIds),
      supabaseAdmin.from("leads").select("id,nome,email,telefone").in("id", leadIds),
    ]);
    if (c.error) console.warn("[carteira-ruler] clientes:", c.error.message);
    if (l.error) console.warn("[carteira-ruler] leads:", l.error.message);
    for (const row of c.data || []) if (row.lead_id) clients.set(String(row.lead_id), row);
    for (const row of l.data || []) if (row.id) leads.set(String(row.id), row);
  }
  return { clients, leads };
}

function contactFor(sale: SaleRow, maps: Awaited<ReturnType<typeof loadContacts>>) {
  const leadId = String(sale.lead_id || sale.cliente_lead_id || "");
  const client = maps.clients.get(leadId) || {};
  const lead = maps.leads.get(leadId) || {};
  return {
    leadId: leadId || null,
    nome: String(client.nome || lead.nome || "Cliente"),
    email: validEmail(sale.email) || validEmail(client.email) || validEmail(lead.email),
  };
}

async function historyFor(vendaId: string) {
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("carteira_relationship_messages")
    .select("status,ruler,stage,milestone,click_count,last_clicked_at,sent_at,created_at")
    .eq("venda_id", vendaId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = data || [];
  return {
    emailsSent: rows.filter((r: any) => r.status === "sent").length,
    clickCount: rows.reduce((sum: number, r: any) => sum + Number(r.click_count || 0), 0),
    lastClickedAt: rows.find((r: any) => r.last_clicked_at)?.last_clicked_at || null,
    recent: rows.slice(0, 8),
  };
}

async function getOrCreateMessage(args: {
  sale: SaleRow;
  ruler: Ruler;
  stage: string;
  milestone: number;
  leadId: string | null;
  email: string;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("carteira_relationship_messages")
    .select("*")
    .eq("venda_id", args.sale.id)
    .eq("ruler", args.ruler)
    .eq("milestone", args.milestone)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("carteira_relationship_messages")
    .insert({
      venda_id: args.sale.id,
      lead_id: args.leadId,
      vendedor_id: args.sale.vendedor_id || null,
      ruler: args.ruler,
      stage: args.stage,
      milestone: args.milestone,
      status: "pending",
      email: args.email,
      click_token: randomUUID(),
      meta: {},
    })
    .select("*")
    .single();
  if (error) {
    if (String(error.code || "") === "23505") {
      const { data: retry } = await supabaseAdmin
        .from("carteira_relationship_messages")
        .select("*")
        .eq("venda_id", args.sale.id)
        .eq("ruler", args.ruler)
        .eq("milestone", args.milestone)
        .maybeSingle();
      if (retry) return retry;
    }
    throw error;
  }
  return data;
}

function authorized(req: VercelRequest) {
  const authorization = String(req.headers.authorization || "");
  const cronSecret = String(process.env.CRON_SECRET || "");
  return Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`;
}

async function isAdminRequest(req: VercelRequest) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  const token = authorization.slice(7).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role,is_active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  return profile?.is_active !== false && String(profile?.role || "") === "admin";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const cronAuthorized = authorized(req);
  const adminAuthorized = cronAuthorized ? false : await isAdminRequest(req);
  if (!cronAuthorized && !adminAuthorized) return res.status(401).json({ ok: false, error: "Não autorizado" });

  const today = String(req.query.date || req.body?.date || localYmd()).slice(0, 10);
  const dryRun = String(req.query.dry_run || req.body?.dry_run || "").toLowerCase() === "true";
  const onlySaleId = String(req.query.venda_id || req.body?.venda_id || "").trim();

  try {
    let inadQuery = supabaseAdmin
      .from("vendas")
      .select("id,lead_id,cliente_lead_id,vendedor_id,grupo,cota,codigo,cancelada_em,reativada_em,inad,inad_em,inad_revertida_em,email,produto,segmento,administradora,valor_venda")
      .eq("inad", true)
      .is("inad_revertida_em", null)
      .limit(5000);
    let recoveryQuery = supabaseAdmin
      .from("vendas")
      .select("id,lead_id,cliente_lead_id,vendedor_id,grupo,cota,codigo,cancelada_em,reativada_em,inad,inad_em,inad_revertida_em,email,produto,segmento,administradora,valor_venda")
      .not("cancelada_em", "is", null)
      .is("reativada_em", null)
      .limit(5000);
    if (onlySaleId) {
      inadQuery = inadQuery.eq("id", onlySaleId);
      recoveryQuery = recoveryQuery.eq("id", onlySaleId);
    }
    const [inadRes, recoveryRes] = await Promise.all([inadQuery, recoveryQuery]);
    if (inadRes.error) throw inadRes.error;
    if (recoveryRes.error) throw recoveryRes.error;

    const inadSales = ((inadRes.data || []) as SaleRow[])
      .filter((sale) => !isCancelled(sale) && Boolean(dateOnly(sale.inad_em)));
    const recoverySales = ((recoveryRes.data || []) as SaleRow[])
      .filter((sale) => Boolean(dateOnly(sale.cancelada_em)));
    const allSales = [...inadSales, ...recoverySales.filter((r) => !inadSales.some((i) => i.id === r.id))];
    const contacts = await loadContacts(allSales);

    const candidates: Array<{ sale: SaleRow; ruler: Ruler; stage: string; milestone: number; days: number }> = [];
    for (const sale of inadSales) {
      const days = dayDiff(today, dateOnly(sale.inad_em));
      const stage = overdueStage(days);
      if (stage?.milestone != null) candidates.push({ sale, ruler: "inadimplencia", stage: stage.stage, milestone: stage.milestone, days });
    }
    for (const sale of recoverySales) {
      const days = dayDiff(today, dateOnly(sale.cancelada_em));
      const stage = recoveryStage(days);
      if (stage?.milestone != null) candidates.push({ sale, ruler: "recuperacao", stage: stage.stage, milestone: stage.milestone, days });
    }

    const summary = {
      ok: true,
      date: today,
      dry_run: dryRun,
      candidates: candidates.length,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      items: [] as any[],
    };

    for (const candidate of candidates) {
      const { sale, ruler, stage, milestone, days } = candidate;
      const contact = contactFor(sale, contacts);
      if (!contact.email) {
        summary.skipped += 1;
        summary.items.push({ venda_id: sale.id, ruler, stage, milestone, status: "sem_email" });
        continue;
      }

      const existing = await supabaseAdmin
        .from("carteira_relationship_messages")
        .select("id,status,created_at")
        .eq("venda_id", sale.id)
        .eq("ruler", ruler)
        .eq("milestone", milestone)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "sent") {
        summary.skipped += 1;
        summary.items.push({ venda_id: sale.id, ruler, stage, milestone, status: "already_sent" });
        continue;
      }
      if (existing.data?.status === "pending") {
        const ageMs = Date.now() - new Date(existing.data.created_at).getTime();
        if (ageMs < 2 * 60 * 60 * 1000) {
          summary.skipped += 1;
          summary.items.push({ venda_id: sale.id, ruler, stage, milestone, status: "pending" });
          continue;
        }
      }

      const history = await historyFor(sale.id);
      const fallback = fallbackDecision({
        ruler,
        stage,
        sale,
        days,
        name: contact.nome,
        milestone,
        clickCount: history.clickCount,
      });
      const decision = await maxDecision({
        ruler,
        stage,
        milestone,
        dias_desde_marco: days,
        cliente_primeiro_nome: firstName(contact.nome),
        produto: sale.produto || sale.segmento || null,
        administradora: sale.administradora || null,
        grupo: sale.grupo || null,
        cota: sale.cota || null,
        referencia_cancelamento_d90: ruler === "inadimplencia",
        comportamento: {
          emails_enviados_ultimos_180_dias: history.emailsSent,
          cliques_ultimos_180_dias: history.clickCount,
          ultimo_clique_em: history.lastClickedAt,
        },
        ctas_permitidos: allowedCtas(ruler, stage),
        regra:
          ruler === "recuperacao"
            ? "Mensagem de recuperação a cada 20 dias enquanto a cota permanecer cancelada e não houver reativação."
            : "D+90 é referência operacional, mas o status real da cota prevalece e pode cancelar antes.",
      }, fallback);

      summary.processed += 1;
      if (dryRun) {
        summary.skipped += 1;
        summary.items.push({
          venda_id: sale.id,
          ruler,
          stage,
          milestone,
          status: "dry_run",
          email: contact.email,
          subject: decision.subject,
          cta_type: decision.cta_type,
        });
        continue;
      }

      const record = await getOrCreateMessage({
        sale,
        ruler,
        stage,
        milestone,
        leadId: contact.leadId,
        email: contact.email,
      });
      if (record.status === "sent") {
        summary.skipped += 1;
        continue;
      }

      const ctaText = ctaMessage(decision.cta_type, sale);
      const ctaUrl = `${APP_URL}/api/carteira/relationship-cta?token=${encodeURIComponent(record.click_token)}`;
      const meta = {
        nome: contact.nome,
        grupo: sale.grupo || null,
        cota: sale.cota || null,
        produto: sale.produto || sale.segmento || null,
        administradora: sale.administradora || null,
        dias: days,
        cta_message: ctaText,
        max_decision: decision,
        history_snapshot: {
          emails_sent: history.emailsSent,
          clicks: history.clickCount,
          last_clicked_at: history.lastClickedAt,
        },
      };

      await supabaseAdmin
        .from("carteira_relationship_messages")
        .update({
          status: "pending",
          email: contact.email,
          subject: decision.subject,
          cta_type: decision.cta_type,
          max_reason: decision.rationale,
          meta,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);

      try {
        await sendRelationshipEmail({
          to: contact.email,
          subject: decision.subject,
          html: buildEmailHtml({ name: contact.nome, sale, decision, ctaUrl, ruler, days }),
          text: buildText({ decision, sale, ctaUrl }),
        });
        const sentAt = new Date().toISOString();
        await supabaseAdmin
          .from("carteira_relationship_messages")
          .update({ status: "sent", sent_at: sentAt, updated_at: sentAt })
          .eq("id", record.id);
        summary.sent += 1;
        summary.items.push({ venda_id: sale.id, ruler, stage, milestone, status: "sent" });
      } catch (emailError) {
        const message = relationshipSmtpError(emailError);
        await supabaseAdmin
          .from("carteira_relationship_messages")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", record.id);
        summary.failed += 1;
        summary.items.push({ venda_id: sale.id, ruler, stage, milestone, status: "failed", error: message });
      }
    }

    return res.status(200).json(summary);
  } catch (error: any) {
    console.error("[carteira-ruler] erro:", error);
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 1000) });
  }
}
