import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { sendTransactionalEmail, smtpErrorMessage } from "./_email-smtp.js";

const TZ = "America/Porto_Velho";
const CRM_URL = "https://crm.consulmaxconsorcios.com.br/giro-de-carteira";
const format = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const htmlSafe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
const firstName = (value: unknown) => String(value || "Parceiro").trim().split(/\s+/)[0];
const dayDifference = (due: string, today: string) => Math.max(0, Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(due + "T12:00:00Z")) / 86400000));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ ok: false });
  const now = new Date();
  const today = format(now);
  // Impede disparos acidentais fora da segunda-feira local.
  const weekDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  if (weekDay !== "Mon") return res.status(200).json({ ok: true, skipped: "outside_monday" });
  try {
    const { data: activeUsers, error: usersError } = await supabaseAdmin.from("users")
      .select("id,auth_user_id,nome,email,role,user_role").eq("is_active", true);
    if (usersError) throw usersError;
    const vendors = (activeUsers || []).filter(user =>
      String(user.user_role || user.role || "").toLowerCase() === "vendedor" && user.email && user.auth_user_id);
    const owners = new Set(vendors.flatMap(u => [String(u.id), String(u.auth_user_id)]));
    const tasks: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabaseAdmin.from("giro_tasks")
        .select("id,owner_auth_id,cliente_id,lead_id,due_date,last_done_at,carteira_total")
        .lte("due_date", today).order("due_date", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      tasks.push(...(data || []).filter(t => owners.has(String(t.owner_auth_id)) && (!t.last_done_at || t.last_done_at < t.due_date)));
      if (!data || data.length < 1000) break;
      page++;
    }
    const customerIds = Array.from(new Set(tasks.map(t => t.cliente_id).filter(Boolean)));
    const leadIds = Array.from(new Set(tasks.map(t => t.lead_id).filter(Boolean)));
    const names = new Map<string, string>();
    for (const [table, ids] of [["clientes", customerIds], ["leads", leadIds]] as const) {
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabaseAdmin.from(table).select("id,nome").in("id", ids.slice(i, i + 200));
        if (error) throw error;
        for (const row of data || []) names.set(String(row.id), String(row.nome || "Cliente"));
      }
    }
    const summary = { vendors: vendors.length, pending: tasks.length, sent: 0, skipped: 0, failed: 0 };
    for (const user of vendors) {
      const rows = tasks.filter(t => [String(user.id), String(user.auth_user_id)].includes(String(t.owner_auth_id)));
      if (!rows.length) { summary.skipped++; continue; }
      // Registro único por vendedor e segunda-feira evita duplicação em execuções repetidas.
      const { data: old, error: logError } = await supabaseAdmin.from("weekly_giro_email_dispatches")
        .select("id,status").eq("user_id", user.id).eq("week_start", today).maybeSingle();
      if (logError) throw logError;
      if (old && ["sent", "processing"].includes(old.status)) { summary.skipped++; continue; }
      const { error: claimError } = await supabaseAdmin.from("weekly_giro_email_dispatches")
        .upsert({ user_id: user.id, week_start: today, status: "processing", pending_count: rows.length, updated_at: now.toISOString() }, { onConflict: "user_id,week_start" });
      if (claimError) throw claimError;
      const delayed = rows.filter(t => t.due_date < today).length;
      const top = rows.slice(0, 5);
      const list = top.map(t => {
        const name = names.get(String(t.cliente_id)) || names.get(String(t.lead_id)) || "Cliente";
        const days = dayDifference(t.due_date, today);
        return { name, detail: days ? `${days} dia(s) em atraso` : "Previsto para hoje" };
      });
      const subject = `Consulmax | Seu Giro de Carteira da Semana — ${rows.length} pendente(s)`;
      const html = `<div style="font-family:Arial,sans-serif;background:#F5F5F5;padding:30px 15px;color:#1E293F"><div style="max-width:610px;margin:auto;background:white;border-radius:16px;overflow:hidden"><div style="background:#1E293F;color:white;padding:24px"><div style="font-size:12px;letter-spacing:2px;color:#E0CE8C">CONSULMAX CONSÓRCIOS</div><h1 style="font-size:24px;margin:12px 0 0">Seu Giro de Carteira da Semana</h1></div><div style="padding:26px"><p>Olá, ${htmlSafe(firstName(user.nome))}!</p><p>Você tem clientes aguardando acompanhamento. Organize seus contatos para esta semana.</p><div style="background:#F5F5F5;border-left:4px solid #A11C27;padding:18px;margin:20px 0"><strong style="font-size:25px">${rows.length} pendente(s)</strong><div style="margin-top:6px;color:#A11C27">${delayed} atrasado(s) · ${rows.length - delayed} para hoje</div></div><h2 style="font-size:17px">Prioridades de contato</h2><ol style="padding-left:22px;line-height:1.9">${list.map(x => `<li><strong>${htmlSafe(x.name)}</strong> — ${htmlSafe(x.detail)}</li>`).join("")}</ol>${rows.length > 5 ? `<p>Outros ${rows.length - 5} giro(s) aguardam atendimento no CRM.</p>` : ""}<p style="margin-top:28px"><a href="${CRM_URL}" style="background:#A11C27;color:white;padding:14px 22px;border-radius:9px;text-decoration:none;font-weight:bold">Acessar Giro de Carteira</a></p><p style="font-size:12px;color:#64748b;margin-top:30px">Mensagem automática semanal. Você recebe este e-mail somente quando há giros pendentes.</p></div></div></div>`;
      const text = [`Olá, ${firstName(user.nome)}!`, `Giro de Carteira: ${rows.length} pendente(s), ${delayed} atrasado(s).`, ...list.map((x,i) => `${i+1}. ${x.name} — ${x.detail}`), CRM_URL].join("\n");
      try {
        await sendTransactionalEmail({ to: user.email, subject, html, text, fromName: "Consulmax | Giro de Carteira" });
        const { error } = await supabaseAdmin.from("weekly_giro_email_dispatches").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null }).eq("user_id", user.id).eq("week_start", today);
        if (error) throw error;
        summary.sent++;
      } catch (error) {
        await supabaseAdmin.from("weekly_giro_email_dispatches").update({ status: "failed", error: smtpErrorMessage(error).slice(0, 500), updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("week_start", today);
        summary.failed++;
      }
    }
    return res.status(200).json({ ok: true, date: today, ...summary });
  } catch (error) {
    console.error("[weekly-giro-email]", error);
    return res.status(500).json({ ok: false, error: "Falha no envio semanal do Giro de Carteira" });
  }
}
