import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { sendTransactionalEmail, smtpErrorMessage } from "./_email-smtp.js";

const CRM_TZ = process.env.CRM_TIMEZONE || "America/Porto_Velho";
const CRM_PROFILE_URL = "https://crm.consulmaxconsorcios.com.br/perfil";
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "");
const OPENAI_MODEL = String(process.env.OPENAI_PERFORMANCE_MODEL || "gpt-4.1-mini");
const LOGO_URL = "https://crm.consulmaxconsorcios.com.br/logo-consulmax.png";

type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  email: string;
  role?: string | null;
  user_role?: string | null;
};

type FeedbackStatus = "strong" | "attention" | "action";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function localYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDaysYmd(value: string, amount: number) {
  const d = new Date(`${value}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(value: string) {
  return new Date(`${value}T12:00:00.000Z`).getUTCDay();
}

function mondayOf(value: string) {
  const dow = dayOfWeek(value);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(value, offset);
}

function isoStart(value: string) {
  // Rondônia não usa horário de verão e opera em UTC-4.
  return `${value}T04:00:00.000Z`;
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function businessDays(start: string, end: string) {
  let cursor = start;
  let count = 0;
  while (cursor <= end) {
    const dow = dayOfWeek(cursor);
    if (dow >= 1 && dow <= 5) count += 1;
    cursor = addDaysYmd(cursor, 1);
  }
  return count;
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function yearStart(value: string) {
  return `${value.slice(0, 4)}-01-01`;
}

function yearEnd(value: string) {
  return `${value.slice(0, 4)}-12-31`;
}

function monthEnd(value: string) {
  const start = monthStart(value);
  const d = new Date(`${start}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPct(value: number) {
  return `${Math.round(Number(value || 0))}%`;
}

function shortDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function stageRank(row: any) {
  const value = normalize(row?.estagio || row?.stage);
  if (value.includes("ganho")) return 6;
  if (value.includes("fechamento")) return 5;
  if (value.includes("negoci")) return 4;
  if (value.includes("proposta")) return 3;
  if (value.includes("qualifica")) return 2;
  if (value.includes("contato")) return 1;
  return 0;
}

function isWon(row: any) {
  return normalize(row?.estagio || row?.stage).includes("ganho");
}

function isLost(row: any) {
  return normalize(row?.estagio || row?.stage).includes("perdido");
}

function isOpen(row: any) {
  return !isWon(row) && !isLost(row);
}

function firstName(value?: string | null) {
  return String(value || "Usuário").trim().split(/\s+/)[0] || "Usuário";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusMeta(status: FeedbackStatus) {
  if (status === "strong") {
    return { label: "Ritmo forte", icon: "🟢", bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" };
  }
  if (status === "action") {
    return { label: "Ação necessária", icon: "🔴", bg: "#fff1f2", border: "#fecdd3", text: "#be123c" };
  }
  return { label: "Atenção", icon: "🟡", bg: "#fffbeb", border: "#fde68a", text: "#a16207" };
}

function asNumber(value: unknown) {
  return Number(value || 0) || 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function sumSales(rows: any[]) {
  return rows.reduce((sum, row) => sum + asNumber(row.valor_venda), 0);
}

function metricCard(label: string, value: string | number, helper = "") {
  return `<td width="33.33%" valign="top" style="padding:6px;">
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#ffffff;min-height:76px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${escapeHtml(label)}</div>
      <div style="margin-top:6px;font-size:21px;font-weight:900;color:#1E293F;">${escapeHtml(value)}</div>
      ${helper ? `<div style="margin-top:4px;font-size:11px;color:#64748b;">${escapeHtml(helper)}</div>` : ""}
    </div>
  </td>`;
}

function progressBar(actual: number, target: number, expected: number) {
  const pctTarget = target > 0 ? clamp((actual / target) * 100) : 0;
  const expectedPct = target > 0 ? clamp((expected / target) * 100) : 0;
  return `
    <div style="position:relative;height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:10px;">
      <div style="height:10px;width:${pctTarget}%;background:#A11C27;border-radius:999px;"></div>
    </div>
    <div style="margin-top:6px;font-size:11px;color:#64748b;">
      Realizado: <strong>${pctTarget.toFixed(0)}%</strong> da meta · Esperado até agora: <strong>${expectedPct.toFixed(0)}%</strong>
    </div>`;
}

function buildEmailHtml(user: UserRow, payload: any) {
  const meta = statusMeta(payload.status);
  const w = payload.week;
  const m = payload.month;
  const y = payload.year;
  const p = payload.pipeline;
  const alerts = (payload.alerts || []).slice(0, 5);
  const positives = (payload.positives || []).slice(0, 4);
  const priorities = (payload.priorities || []).slice(0, 3);

  const list = (items: string[], color: string) =>
    items.length
      ? items.map((item) => `<li style="margin:0 0 9px;line-height:1.5;color:#334155;"><span style="color:${color};font-weight:900;">•</span> ${escapeHtml(item)}</li>`).join("")
      : '<li style="color:#64748b;">Nenhum item relevante nesta semana.</li>';

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1E293F;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu feedback semanal de performance e disciplina comercial está pronto.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.09);">
        <tr><td align="center" style="padding:24px 30px 18px;border-top:5px solid #A11C27;background:#ffffff;">
          <img src="${LOGO_URL}" width="210" alt="Consulmax Consórcios" style="display:block;width:210px;max-width:70%;height:auto;border:0;margin:0 auto;">
          <div style="margin-top:10px;font-size:10px;color:#64748b;letter-spacing:1.25px;text-transform:uppercase;">Feedback semanal de performance</div>
        </td></tr>
        <tr><td style="height:4px;background:#B5A573;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 28px 32px;">
          <h1 style="margin:0;color:#1E293F;font-size:27px;line-height:1.2;">Olá, ${escapeHtml(firstName(user.nome))}. Veja como foi sua semana.</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.65;color:#64748b;">Período de ${shortDate(payload.periodStart)} a ${shortDate(payload.periodEnd)}. Este feedback analisa comportamento comercial, gestão do funil e resultados — não apenas vendas.</p>

          <div style="margin:24px 0;padding:18px 20px;border-radius:14px;background:${meta.bg};border:1px solid ${meta.border};">
            <table width="100%" cellspacing="0" cellpadding="0"><tr>
              <td>
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${meta.text};">Índice de disciplina comercial</div>
                <div style="margin-top:5px;font-size:29px;font-weight:900;color:#1E293F;">${payload.disciplineScore}/100</div>
              </td>
              <td align="right" style="font-size:16px;font-weight:900;color:${meta.text};">${meta.icon} ${meta.label}</td>
            </tr></table>
          </div>

          <h2 style="margin:26px 0 10px;font-size:17px;color:#1E293F;">Sua semana em números</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 -6px;">
            <tr>
              ${metricCard("Vendas", formatBRL(w.salesAmount), `${w.salesCount} venda(s)`)}
              ${metricCard("Simulações", w.simulations)}
              ${metricCard("Prospecções", w.prospections)}
            </tr>
            <tr>
              ${metricCard("Qualificações", w.qualifications)}
              ${metricCard("Reuniões", w.meetings)}
              ${metricCard("Abordagens", w.approaches, "conversas atendidas")}
            </tr>
          </table>

          <h2 style="margin:28px 0 10px;font-size:17px;color:#1E293F;">Ritmo de metas</h2>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:12px;">
            <table width="100%"><tr><td>
              <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;">Meta mensal</div>
              <div style="margin-top:4px;font-size:21px;font-weight:900;">${formatBRL(m.actual)} <span style="font-size:12px;font-weight:600;color:#64748b;">de ${formatBRL(m.goal)}</span></div>
            </td><td align="right" style="font-size:13px;font-weight:800;color:#A11C27;">Esperado: ${formatBRL(m.expected)}</td></tr></table>
            ${progressBar(m.actual, m.goal, m.expected)}
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;">
            <table width="100%"><tr><td>
              <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;">Meta anual</div>
              <div style="margin-top:4px;font-size:21px;font-weight:900;">${formatBRL(y.actual)} <span style="font-size:12px;font-weight:600;color:#64748b;">de ${formatBRL(y.goal)}</span></div>
            </td><td align="right" style="font-size:13px;font-weight:800;color:#A11C27;">Esperado: ${formatBRL(y.expected)}</td></tr></table>
            ${progressBar(y.actual, y.goal, y.expected)}
          </div>

          <h2 style="margin:28px 0 10px;font-size:17px;color:#1E293F;">Saúde das oportunidades</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 -6px;">
            <tr>
              ${metricCard("Oportunidades reais", p.realCount, formatBRL(p.realValue))}
              ${metricCard("Follow-ups atrasados", p.overdueFollowups)}
              ${metricCard("Sem próxima ação", p.missingNextAction)}
            </tr>
            <tr>
              ${metricCard("Paradas +7 dias", p.staleOpen)}
              ${metricCard("Alto potencial atrasado", p.highPotentialOverdue)}
              ${metricCard("Conversas paradas", p.staleConversations)}
            </tr>
          </table>

          <div style="margin:26px 0;padding:20px;border-radius:14px;background:#f8fafc;border-left:4px solid #A11C27;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#A11C27;">Análise do Max</div>
            <div style="margin-top:9px;font-size:14px;line-height:1.75;color:#334155;white-space:pre-line;">${escapeHtml(payload.analysis)}</div>
          </div>

          <table width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="50%" valign="top" style="padding-right:8px;">
              <div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px;padding:17px;">
                <div style="font-size:13px;font-weight:900;color:#166534;">Pontos positivos</div>
                <ul style="padding-left:16px;margin:12px 0 0;">${list(positives, "#16a34a")}</ul>
              </div>
            </td>
            <td width="50%" valign="top" style="padding-left:8px;">
              <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:14px;padding:17px;">
                <div style="font-size:13px;font-weight:900;color:#92400e;">Sinais de atenção</div>
                <ul style="padding-left:16px;margin:12px 0 0;">${list(alerts, "#d97706")}</ul>
              </div>
            </td>
          </tr></table>

          <div style="margin-top:18px;border:1px solid #e2e8f0;border-radius:14px;padding:18px;">
            <div style="font-size:13px;font-weight:900;color:#1E293F;">Seu foco para a próxima semana</div>
            <ol style="padding-left:20px;margin:12px 0 0;color:#334155;">
              ${priorities.map((item: string) => `<li style="margin-bottom:9px;line-height:1.5;">${escapeHtml(item)}</li>`).join("")}
            </ol>
          </div>

          <div style="text-align:center;margin:28px 0 4px;">
            <a href="${CRM_PROFILE_URL}" style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:14px 24px;border-radius:11px;">Ver meu histórico no CRM</a>
          </div>
        </td></tr>
        <tr><td style="padding:22px 30px;background:#1E293F;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(255,255,255,.76);">Consulmax Serviços de Planejamento Estruturado e Proteção LTDA</p>
          <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.56);">Feedback automático baseado nos registros do CRM. Quanto melhor o CRM é alimentado, mais precisa é a análise.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function maxAnalysis(context: any) {
  const fallback = context.fallbackAnalysis;
  if (!OPENAI_API_KEY) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você é Max, coach comercial interno da Consulmax. Analise comportamento de vendas com postura construtiva, objetiva e motivadora. Não julgue a pessoa, analise o comportamento observado. Nunca invente dados, metas, clientes, causas ou resultados. Diferencie esforço, disciplina do funil e resultado. Se houver venda sem manutenção de pipeline, reconheça a venda e sinalize o risco. Se não houver venda mas houver boa construção de pipeline, reconheça isso. Retorne JSON válido somente com a chave analysis. O texto deve ter 2 a 4 parágrafos curtos em português brasileiro, sem markdown e sem listas.",
          },
          {
            role: "user",
            content: JSON.stringify({
              vendedor: firstName(context.userName),
              semana: context.week,
              metas: { mes: context.month, ano: context.year },
              pipeline: context.pipeline,
              disciplina: context.components,
              alertas: context.alerts,
              positivos: context.positives,
              oportunidades_prioritarias: context.priorityOpportunities,
            }).slice(0, 15000),
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return fallback;
    const body = await response.json();
    const raw = String(body?.choices?.[0]?.message?.content || "");
    const parsed = JSON.parse(raw);
    const analysis = String(parsed?.analysis || "").trim();
    return analysis || fallback;
  } catch (error) {
    console.warn("[weekly-feedback] Max indisponível:", error);
    return fallback;
  }
}

function buildFallbackAnalysis(args: any) {
  const parts: string[] = [];
  if (args.month.goal > 0) {
    const gap = args.month.actual - args.month.expected;
    if (gap >= 0) {
      parts.push(`Seu realizado mensal está ${formatBRL(Math.abs(gap))} acima do ritmo esperado para este ponto do mês.`);
    } else {
      parts.push(`Seu realizado mensal está ${formatBRL(Math.abs(gap))} abaixo do ritmo esperado neste momento. O ponto principal é recuperar cadência sem abandonar a qualidade do funil.`);
    }
  } else {
    parts.push("Sua meta mensal de vendas ainda não está cadastrada; por isso, o ritmo de resultado não pesa integralmente na análise.");
  }

  if (args.pipeline.highPotentialOverdue > 0) {
    parts.push(`Existem ${args.pipeline.highPotentialOverdue} oportunidades de maior potencial com follow-up atrasado. Esse é o ponto de atenção mais imediato, porque são conversas que já demonstraram aderência e precisam de avanço.`);
  } else if (args.pipeline.overdueFollowups === 0 && args.pipeline.missingNextAction === 0) {
    parts.push("A organização do funil está saudável: não há follow-ups vencidos nem oportunidades abertas sem próxima ação relevante.");
  }

  if (args.week.salesCount === 0 && args.week.qualifications + args.week.simulations + args.week.meetings > 0) {
    parts.push("Mesmo sem conversão em venda nesta semana, houve construção de pipeline. O próximo passo é transformar esse movimento em proposta, negociação e fechamento.");
  } else if (args.week.salesCount > 0 && args.week.prospections + args.week.approaches < 5) {
    parts.push("A semana teve venda, mas a reposição do topo do funil ficou baixa. É importante manter prospecção e abordagens para não concentrar o resultado apenas nas oportunidades que já estavam maduras.");
  }
  return parts.join(" ");
}

async function loadData(periodEnd: string) {
  const periodStart = mondayOf(periodEnd);
  const historyStart = addDaysYmd(periodStart, -28);
  const endExclusive = addDaysYmd(periodEnd, 1);
  const currentMonthStart = monthStart(periodEnd);
  const currentYearStart = yearStart(periodEnd);

  const [
    usersRes,
    salesRes,
    leadsRes,
    oppsRes,
    notesRes,
    simulationsRes,
    agendaRes,
    attendanceRes,
    waMessagesRes,
    waConversationsRes,
    goalsRes,
  ] = await Promise.all([
    supabaseAdmin.from("users").select("id,auth_user_id,nome,email,role,user_role,is_active").eq("is_active", true),
    supabaseAdmin.from("vendas").select("id,data_venda,vendedor_id,valor_venda,cancelada_em,status").gte("data_venda", currentYearStart).lte("data_venda", periodEnd),
    supabaseAdmin.from("leads").select("id,owner_id,created_at").gte("created_at", isoStart(historyStart)).lt("created_at", isoStart(endExclusive)),
    supabaseAdmin
      .from("opportunities")
      .select("id,lead_id,vendedor_id,estagio,stage,valor_credito,credito_desejado,score,qualification_score,qualification_status,qualified_at,created_at,updated_at,last_follow_up_at,next_follow_up_at,won_at,lost_at,leads:lead_id(id,nome)"),
    supabaseAdmin.from("opportunity_notes").select("id,opportunity_id,user_id,kind,created_at").gte("created_at", isoStart(historyStart)).lt("created_at", isoStart(endExclusive)),
    supabaseAdmin.from("sim_simulations").select("id,lead_id,created_at").gte("created_at", isoStart(historyStart)).lt("created_at", isoStart(endExclusive)),
    supabaseAdmin.from("agenda_eventos").select("id,tipo,user_id,inicio_at,completed_at,cancelled_at").gte("inicio_at", isoStart(historyStart)).lt("inicio_at", isoStart(endExclusive)),
    supabaseAdmin.from("agenda_event_attendance").select("id,event_id,user_id,auth_user_id,attended_at").gte("attended_at", isoStart(historyStart)).lt("attended_at", isoStart(endExclusive)),
    supabaseAdmin.from("whatsapp_messages").select("id,conversation_id,user_id,direction,sender_type,created_at").eq("direction", "outbound").eq("sender_type", "usuario").gte("created_at", isoStart(historyStart)).lt("created_at", isoStart(endExclusive)),
    supabaseAdmin.from("whatsapp_conversations").select("id,assigned_to,status,stage,last_message_at,unread_count,lead_id,opportunity_id"),
    supabaseAdmin.from("metas_vendedores").select("vendedor_id,auth_user_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12").eq("ano", Number(periodEnd.slice(0, 4))),
  ]);

  const results = [usersRes, salesRes, leadsRes, oppsRes, notesRes, simulationsRes, agendaRes, attendanceRes, waMessagesRes, waConversationsRes, goalsRes];
  const error = results.find((r: any) => r.error)?.error;
  if (error) throw error;

  return {
    periodStart,
    periodEnd,
    historyStart,
    currentMonthStart,
    currentYearStart,
    users: (usersRes.data || []) as any[],
    sales: (salesRes.data || []) as any[],
    leads: (leadsRes.data || []) as any[],
    opportunities: (oppsRes.data || []) as any[],
    notes: (notesRes.data || []) as any[],
    simulations: (simulationsRes.data || []) as any[],
    agenda: (agendaRes.data || []) as any[],
    attendance: (attendanceRes.data || []) as any[],
    waMessages: (waMessagesRes.data || []) as any[],
    waConversations: (waConversationsRes.data || []) as any[],
    goals: (goalsRes.data || []) as any[],
  };
}

function countActivitiesForWindow(data: any, user: UserRow, start: string, endExclusive: string) {
  const startIso = isoStart(start);
  const endIso = isoStart(endExclusive);
  const inWindow = (value?: string | null) => Boolean(value && value >= startIso && value < endIso);

  const userLeads = data.leads.filter((row: any) => row.owner_id === user.auth_user_id && inWindow(row.created_at));
  const userOpps = data.opportunities.filter((row: any) => row.vendedor_id === user.auth_user_id && inWindow(row.created_at));
  const userQualifications = data.opportunities.filter((row: any) => row.vendedor_id === user.auth_user_id && inWindow(row.qualified_at));
  const userNotes = data.notes.filter((row: any) => row.user_id === user.auth_user_id && inWindow(row.created_at));
  const followups = userNotes.filter((row: any) => row.kind === "follow_up").length;
  const stageMoves = userNotes.filter((row: any) => row.kind === "stage").length;

  const leadIds = new Set(data.leads.filter((row: any) => row.owner_id === user.auth_user_id).map((row: any) => row.id));
  const simulations = new Set(
    data.simulations
      .filter((row: any) => leadIds.has(row.lead_id) && inWindow(row.created_at))
      .map((row: any) => row.lead_id || row.id),
  ).size;

  const attendanceEvents = new Set(
    data.attendance
      .filter((row: any) => (row.auth_user_id === user.auth_user_id || row.user_id === user.auth_user_id) && inWindow(row.attended_at))
      .map((row: any) => row.event_id),
  );
  const meetings = data.agenda.filter(
    (row: any) =>
      row.user_id === user.auth_user_id &&
      String(row.tipo) === "reuniao" &&
      !row.cancelled_at &&
      inWindow(row.inicio_at) &&
      (row.completed_at || attendanceEvents.has(row.id)),
  ).length;

  const approaches = new Set(
    data.waMessages
      .filter((row: any) => row.user_id === user.auth_user_id && inWindow(row.created_at))
      .map((row: any) => row.conversation_id)
      .filter(Boolean),
  ).size;

  return {
    simulations,
    prospections: userLeads.length + userOpps.length,
    qualifications: userQualifications.length,
    meetings,
    approaches,
    followups,
    stageMoves,
  };
}

function computeForUser(data: any, user: UserRow) {
  const nowIso = new Date().toISOString();
  const periodStart = data.periodStart;
  const endExclusive = addDaysYmd(data.periodEnd, 1);
  const weekly = countActivitiesForWindow(data, user, periodStart, endExclusive);

  const priorActivityScores: number[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const start = addDaysYmd(periodStart, -7 * i);
    const end = addDaysYmd(start, 7);
    const a = countActivitiesForWindow(data, user, start, end);
    priorActivityScores.push(a.approaches + a.prospections + a.qualifications * 2 + a.simulations * 2 + a.meetings * 3 + a.followups);
  }
  const activityNow = weekly.approaches + weekly.prospections + weekly.qualifications * 2 + weekly.simulations * 2 + weekly.meetings * 3 + weekly.followups;
  const priorAverage = average(priorActivityScores);
  const activityScore = priorAverage > 0
    ? clamp(55 + ((activityNow - priorAverage) / Math.max(1, priorAverage)) * 45)
    : activityNow > 0
      ? clamp(45 + activityNow * 3)
      : 20;

  const salesRows = data.sales.filter((row: any) => {
    const cancelled = Boolean(row.cancelada_em) || normalize(row.status).includes("cancel");
    return row.vendedor_id === user.auth_user_id && !cancelled;
  });
  const weekSales = salesRows.filter((row: any) => row.data_venda >= periodStart && row.data_venda <= data.periodEnd);
  const monthSales = salesRows.filter((row: any) => row.data_venda >= data.currentMonthStart && row.data_venda <= data.periodEnd);
  const yearSales = salesRows.filter((row: any) => row.data_venda >= data.currentYearStart && row.data_venda <= data.periodEnd);

  const goal = data.goals.find((row: any) => row.vendedor_id === user.id || row.auth_user_id === user.auth_user_id) || null;
  const monthNumber = Number(data.periodEnd.slice(5, 7));
  const monthKey = `m${String(monthNumber).padStart(2, "0")}`;
  const monthGoal = asNumber(goal?.[monthKey]);
  const annualGoal = goal
    ? Array.from({ length: 12 }, (_, index) => asNumber(goal[`m${String(index + 1).padStart(2, "0")}`])).reduce((a, b) => a + b, 0)
    : 0;

  const monthActual = sumSales(monthSales);
  const annualActual = sumSales(yearSales);
  const monthBusinessTotal = businessDays(monthStart(data.periodEnd), monthEnd(data.periodEnd));
  const monthBusinessElapsed = businessDays(monthStart(data.periodEnd), data.periodEnd);
  const yearBusinessTotal = businessDays(yearStart(data.periodEnd), yearEnd(data.periodEnd));
  const yearBusinessElapsed = businessDays(yearStart(data.periodEnd), data.periodEnd);
  const monthExpected = monthGoal * (monthBusinessTotal ? monthBusinessElapsed / monthBusinessTotal : 0);
  const annualExpected = annualGoal * (yearBusinessTotal ? yearBusinessElapsed / yearBusinessTotal : 0);

  const userOpps = data.opportunities.filter((row: any) => row.vendedor_id === user.auth_user_id);
  const open = userOpps.filter(isOpen);
  const overdue = open.filter((row: any) => row.next_follow_up_at && row.next_follow_up_at < nowIso);
  const missingNext = open.filter((row: any) => {
    if (row.next_follow_up_at) return false;
    const created = new Date(row.created_at).getTime();
    return Date.now() - created > 24 * 60 * 60 * 1000;
  });
  const staleOpen = open.filter((row: any) => Date.now() - new Date(row.updated_at).getTime() > 7 * 86400000);
  const realOpps = open.filter((row: any) => {
    const q = normalize(row.qualification_status);
    return ["quente", "morno"].includes(q) || asNumber(row.qualification_score) >= 15 || stageRank(row) >= 3;
  });
  const highPotentialOverdue = realOpps.filter((row: any) => row.next_follow_up_at && row.next_follow_up_at < nowIso);
  const realValue = realOpps.reduce((sum: number, row: any) => sum + asNumber(row.credito_desejado || row.valor_credito), 0);

  const recentCutoff = isoStart(addDaysYmd(data.periodEnd, -30));
  const recentEligible = userOpps.filter(
    (row: any) => row.created_at >= recentCutoff && Date.now() - new Date(row.created_at).getTime() > 2 * 86400000,
  );
  const recentQualified = recentEligible.filter((row: any) => row.qualified_at || row.qualification_status || stageRank(row) >= 3);
  const qualificationCoverage = recentEligible.length ? (recentQualified.length / recentEligible.length) * 100 : 70;

  const openConversations = data.waConversations.filter((row: any) => {
    const closed = ["fechada", "finalizado", "finalizada", "closed"].includes(normalize(row.status));
    return row.assigned_to === user.auth_user_id && !closed;
  });
  const staleConversations = openConversations.filter(
    (row: any) => row.last_message_at && Date.now() - new Date(row.last_message_at).getTime() > 3 * 86400000,
  );
  const unreadConversations = openConversations.filter((row: any) => asNumber(row.unread_count) > 0);

  const followupScore = open.length
    ? clamp(100 - (overdue.length / open.length) * 55 - (missingNext.length / open.length) * 35 - highPotentialOverdue.length * 3)
    : 85;
  const hygieneScore = open.length
    ? clamp(100 - (staleOpen.length / open.length) * 55 - (staleConversations.length / Math.max(1, openConversations.length)) * 25 - Math.min(20, unreadConversations.length * 2))
    : 85;
  const qualificationScore = clamp(qualificationCoverage);
  const resultPaceScore = monthGoal > 0 && monthExpected > 0 ? clamp((monthActual / monthExpected) * 100) : 65;

  const disciplineScore = Math.round(
    followupScore * 0.30 +
      hygieneScore * 0.20 +
      qualificationScore * 0.20 +
      activityScore * 0.20 +
      resultPaceScore * 0.10,
  );
  const status: FeedbackStatus = disciplineScore >= 80 ? "strong" : disciplineScore >= 60 ? "attention" : "action";

  const priorityOpportunities = realOpps
    .slice()
    .sort((a: any, b: any) => {
      const aOver = a.next_follow_up_at && a.next_follow_up_at < nowIso ? 1 : 0;
      const bOver = b.next_follow_up_at && b.next_follow_up_at < nowIso ? 1 : 0;
      return bOver - aOver || asNumber(b.qualification_score) - asNumber(a.qualification_score) || asNumber(b.credito_desejado || b.valor_credito) - asNumber(a.credito_desejado || a.valor_credito);
    })
    .slice(0, 5)
    .map((row: any) => ({
      cliente: firstName(Array.isArray(row.leads) ? row.leads[0]?.nome : row.leads?.nome),
      etapa: row.estagio || row.stage || "Oportunidade",
      score: row.qualification_score ?? row.score ?? null,
      credito: asNumber(row.credito_desejado || row.valor_credito),
      followup_atrasado: Boolean(row.next_follow_up_at && row.next_follow_up_at < nowIso),
    }));

  const alerts: string[] = [];
  if (highPotentialOverdue.length) alerts.push(`${highPotentialOverdue.length} oportunidade(s) de maior potencial estão com follow-up atrasado.`);
  if (missingNext.length) alerts.push(`${missingNext.length} oportunidade(s) aberta(s) estão sem próxima ação definida.`);
  if (staleOpen.length) alerts.push(`${staleOpen.length} oportunidade(s) estão sem atualização há mais de 7 dias.`);
  if (staleConversations.length) alerts.push(`${staleConversations.length} conversa(s) atribuída(s) a você estão paradas há mais de 3 dias.`);
  if (unreadConversations.length) alerts.push(`${unreadConversations.length} conversa(s) abertas possuem mensagens não lidas.`);
  if (!weekly.prospections) alerts.push("Nenhuma nova prospecção foi registrada nesta semana.");
  if (monthGoal > 0 && monthActual < monthExpected * 0.85) {
    alerts.push(`O realizado mensal está ${formatBRL(monthExpected - monthActual)} abaixo do ritmo esperado.`);
  }

  const positives: string[] = [];
  if (!overdue.length && open.length) positives.push("Todos os follow-ups agendados estão em dia.");
  if (!missingNext.length && open.length) positives.push("Suas oportunidades abertas possuem próxima ação organizada.");
  if (weekly.qualifications > 0) positives.push(`${weekly.qualifications} qualificação(ões) concluída(s) nesta semana.`);
  if (weekly.meetings > 0) positives.push(`${weekly.meetings} reunião(ões) confirmada(s) nesta semana.`);
  if (activityNow > priorAverage && priorAverage > 0) positives.push("Seu nível de atividade comercial ficou acima da média das quatro semanas anteriores.");
  if (monthGoal > 0 && monthActual >= monthExpected) positives.push("Seu volume de vendas está no ritmo ou acima do esperado para o mês.");
  if (weekSales.length > 0) positives.push(`${weekSales.length} venda(s) registrada(s) na semana, totalizando ${formatBRL(sumSales(weekSales))}.`);

  const priorities: string[] = [];
  if (highPotentialOverdue.length) {
    const names = priorityOpportunities.filter((row: any) => row.followup_atrasado).slice(0, 3).map((row: any) => row.cliente).filter(Boolean);
    priorities.push(`Recuperar os ${highPotentialOverdue.length} follow-up(s) de maior potencial${names.length ? `, começando por ${names.join(", ")}` : ""}.`);
  } else if (overdue.length) {
    priorities.push(`Regularizar ${overdue.length} follow-up(s) vencido(s) antes de ampliar o volume do funil.`);
  }
  if (missingNext.length) priorities.push(`Definir próxima ação para ${missingNext.length} oportunidade(s) que hoje estão abertas sem follow-up futuro.`);
  if (staleOpen.length) priorities.push(`Revisar e avançar ou encerrar ${staleOpen.length} oportunidade(s) paradas há mais de 7 dias.`);
  if (!weekly.prospections || weekly.prospections < priorAverage / 6) priorities.push("Reforçar a entrada de novas oportunidades para manter o pipeline saudável.");
  if (priorities.length < 3 && realOpps.length) priorities.push(`Concentrar energia nas ${realOpps.length} oportunidades reais atualmente abertas, priorizando as mais maduras.`);
  if (priorities.length < 3 && monthGoal > 0 && monthActual < monthExpected) priorities.push(`Buscar ${formatBRL(Math.max(0, monthExpected - monthActual))} de recuperação para voltar ao ritmo esperado do mês.`);
  if (priorities.length < 3) priorities.push("Manter CRM, qualificação e próximos passos atualizados diariamente para que nenhuma conversa dependa da memória.");
  while (priorities.length < 3) priorities.push("Manter constância nas abordagens, diagnóstico e follow-ups ao longo da próxima semana.");

  const week = {
    salesAmount: sumSales(weekSales),
    salesCount: weekSales.length,
    simulations: weekly.simulations,
    prospections: weekly.prospections,
    qualifications: weekly.qualifications,
    meetings: weekly.meetings,
    approaches: weekly.approaches,
    followups: weekly.followups,
    stageMoves: weekly.stageMoves,
    activityIndex: activityNow,
    priorFourWeekAverage: Math.round(priorAverage * 10) / 10,
  };
  const month = {
    goal: monthGoal,
    actual: monthActual,
    expected: monthExpected,
    progressPct: monthGoal ? (monthActual / monthGoal) * 100 : 0,
    expectedPct: monthGoal ? (monthExpected / monthGoal) * 100 : 0,
  };
  const year = {
    goal: annualGoal,
    actual: annualActual,
    expected: annualExpected,
    progressPct: annualGoal ? (annualActual / annualGoal) * 100 : 0,
    expectedPct: annualGoal ? (annualExpected / annualGoal) * 100 : 0,
  };
  const pipeline = {
    openCount: open.length,
    realCount: realOpps.length,
    realValue,
    overdueFollowups: overdue.length,
    missingNextAction: missingNext.length,
    staleOpen: staleOpen.length,
    highPotentialOverdue: highPotentialOverdue.length,
    staleConversations: staleConversations.length,
    unreadConversations: unreadConversations.length,
    qualificationCoverage: Math.round(qualificationCoverage),
  };
  const components = {
    followup: Math.round(followupScore),
    pipelineHygiene: Math.round(hygieneScore),
    qualification: Math.round(qualificationScore),
    activityConsistency: Math.round(activityScore),
    resultPace: Math.round(resultPaceScore),
  };

  const fallbackAnalysis = buildFallbackAnalysis({ week, month, year, pipeline, components });

  return {
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    disciplineScore,
    status,
    week,
    month,
    year,
    pipeline,
    components,
    alerts,
    positives,
    priorities: priorities.slice(0, 3),
    priorityOpportunities,
    fallbackAnalysis,
  };
}

async function saveFeedback(user: UserRow, payload: any, analysis: string, emailStatus: string, emailError?: string | null) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("weekly_performance_feedbacks")
    .upsert(
      {
        user_id: user.id,
        auth_user_id: user.auth_user_id,
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
        status: payload.status,
        discipline_score: payload.disciplineScore,
        metrics: {
          week: payload.week,
          month: payload.month,
          year: payload.year,
          pipeline: payload.pipeline,
          components: payload.components,
          priority_opportunities: payload.priorityOpportunities,
        },
        alerts: payload.alerts,
        positives: payload.positives,
        priorities: payload.priorities,
        max_analysis: analysis,
        email_status: emailStatus,
        email_sent_at: emailStatus === "sent" ? now : null,
        email_error: emailError || null,
        generated_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,period_start,period_end" },
    )
    .select("id,email_status")
    .single();
  if (error) throw error;
  return data;
}

async function alreadySent(userId: string, periodStart: string, periodEnd: string) {
  const { data } = await supabaseAdmin
    .from("weekly_performance_feedbacks")
    .select("id,email_status")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  return data?.email_status === "sent";
}

function authorized(req: VercelRequest) {
  const authorization = String(req.headers.authorization || "");
  const cronSecret = String(process.env.CRON_SECRET || "");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  return String(req.headers["user-agent"] || "").startsWith("vercel-cron/1.0");
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

  try {
    const requestedDate = String(req.query.date || req.body?.date || localYmd()).slice(0, 10);
    const dryRun = String(req.query.dry_run || req.body?.dry_run || "").toLowerCase() === "true";
    const force = String(req.query.force || req.body?.force || "").toLowerCase() === "true";
    const onlyEmail = String(req.query.email || req.body?.email || "").trim().toLowerCase();
    const data = await loadData(requestedDate);
    const users = data.users
      .filter((row: any) => {
        const role = normalize(row.user_role || row.role);
        return row.auth_user_id && row.email && ["admin", "vendedor", "gestor"].includes(role);
      })
      .filter((row: any) => !onlyEmail || String(row.email).toLowerCase() === onlyEmail) as UserRow[];

    const summary = { processed: 0, sent: 0, skipped: 0, failed: 0, dry_run: dryRun, period_start: data.periodStart, period_end: data.periodEnd, items: [] as any[] };

    for (const user of users) {
      try {
        if (!force && !dryRun && (await alreadySent(user.id, data.periodStart, data.periodEnd))) {
          summary.skipped += 1;
          summary.items.push({ user_id: user.id, email: user.email, status: "already_sent" });
          continue;
        }

        const payload = computeForUser(data, user);
        const analysis = await maxAnalysis({ ...payload, userName: user.nome });
        summary.processed += 1;

        if (dryRun) {
          await saveFeedback(user, payload, analysis, "skipped", "Dry run: e-mail não enviado.");
          summary.skipped += 1;
          summary.items.push({ user_id: user.id, email: user.email, status: "dry_run", score: payload.disciplineScore, feedback_status: payload.status });
          continue;
        }

        await saveFeedback(user, payload, analysis, "pending", null);
        try {
          const meta = statusMeta(payload.status);
          const subject = `Feedback semanal Consulmax | ${meta.label} | ${shortDate(payload.periodEnd)}`;
          const html = buildEmailHtml(user, { ...payload, analysis });
          const text = [
            `Olá, ${firstName(user.nome)}.`,
            `Feedback de ${shortDate(payload.periodStart)} a ${shortDate(payload.periodEnd)}.`,
            `Disciplina comercial: ${payload.disciplineScore}/100 — ${meta.label}.`,
            `Vendas: ${formatBRL(payload.week.salesAmount)} | Simulações: ${payload.week.simulations} | Prospecções: ${payload.week.prospections} | Qualificações: ${payload.week.qualifications} | Reuniões: ${payload.week.meetings} | Abordagens: ${payload.week.approaches}.`,
            "",
            analysis,
            "",
            "Foco para a próxima semana:",
            ...payload.priorities.map((item: string, index: number) => `${index + 1}. ${item}`),
            "",
            `Veja o histórico: ${CRM_PROFILE_URL}`,
          ].join("\n");
          await sendTransactionalEmail({
            to: user.email,
            subject,
            html,
            text,
            fromName: "Consulmax | Feedback de Performance",
          });
          await saveFeedback(user, payload, analysis, "sent", null);
          summary.sent += 1;
          summary.items.push({ user_id: user.id, email: user.email, status: "sent", score: payload.disciplineScore, feedback_status: payload.status });
        } catch (emailError) {
          const message = smtpErrorMessage(emailError);
          await saveFeedback(user, payload, analysis, "failed", message);
          summary.failed += 1;
          summary.items.push({ user_id: user.id, email: user.email, status: "failed", error: message });
        }
      } catch (userError: any) {
        summary.failed += 1;
        summary.items.push({ user_id: user.id, email: user.email, status: "failed", error: String(userError?.message || userError).slice(0, 500) });
      }
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (error: any) {
    console.error("[weekly-performance-feedback]", error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
