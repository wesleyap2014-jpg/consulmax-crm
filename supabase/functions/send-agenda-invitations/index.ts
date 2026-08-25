import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(v: unknown) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function fmt(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Porto_Velho", dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}
function icsDate(iso: string) {
  const d = new Date(iso); const p = (n:number) => String(n).padStart(2,"0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function makeIcs(event: any) {
  const end = event.fim_at || new Date(new Date(event.inicio_at).getTime() + 3600000).toISOString();
  const description = String(event.descricao || "").replace(/\n/g, "\\n");
  const location = event.videocall_url || event.meeting_link || "";
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Consulmax CRM//Agenda//PT-BR","CALSCALE:GREGORIAN","METHOD:REQUEST","BEGIN:VEVENT",`UID:${event.id}@consulmaxcrm`,`DTSTAMP:${icsDate(new Date().toISOString())}`,`DTSTART:${icsDate(event.inicio_at)}`,`DTEND:${icsDate(end)}`,`SUMMARY:${String(event.titulo || "Compromisso Consulmax").replace(/\n/g," ")}`,`DESCRIPTION:${description}`,location ? `URL:${location}` : "","ORGANIZER;CN=Consulmax:mailto:relacionamento@consulmaxconsorcios.com.br","END:VEVENT","END:VCALENDAR"].filter(Boolean).join("\r\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData } = await admin.auth.getUser(token);
    const authId = authData.user?.id;
    if (!authId) return json({ error: "Usuário não autenticado." }, 401);

    const body = await req.json();
    const eventId = String(body?.event_id || "").trim();
    if (!eventId) return json({ error: "event_id obrigatório." }, 400);

    const [{ data: event, error: eventError }, { data: profile }] = await Promise.all([
      admin.from("agenda_eventos").select("id,titulo,inicio_at,fim_at,videocall_url,meeting_link,descricao,user_id").eq("id", eventId).maybeSingle(),
      admin.from("users").select("role,is_active").eq("auth_user_id", authId).maybeSingle(),
    ]);
    if (eventError) throw eventError;
    if (!event) return json({ error: "Compromisso não encontrado." }, 404);
    const isAdmin = profile?.role === "admin" && profile?.is_active !== false;
    if (event.user_id !== authId && !isAdmin) return json({ error: "Sem permissão para enviar estes convites." }, 403);

    const { data: guests, error: guestError } = await admin.from("agenda_event_guests").select("id,name,email,rsvp_token,rsvp_status").eq("event_id", eventId).order("created_at");
    if (guestError) throw guestError;
    if (!guests?.length) return json({ ok: true, sent: 0, skipped: 0 });

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) throw new Error("SMTP não configurado no Supabase.");

    const fromEmail = Deno.env.get("AGENDA_FROM_EMAIL") || "relacionamento@consulmaxconsorcios.com.br";
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") || "https://crm.consulmaxconsorcios.com.br").replace(/\/$/, "");
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } });
    const ics = makeIcs(event);
    let sent = 0; let failed = 0;

    for (const guest of guests) {
      try {
        const yes = `${appUrl}/api/agenda/rsvp?token=${guest.rsvp_token}&response=accepted`;
        const no = `${appUrl}/api/agenda/rsvp?token=${guest.rsvp_token}&response=declined`;
        const meeting = event.videocall_url || event.meeting_link || "";
        const html = `<div style="background:#F5F5F5;padding:28px 12px;font-family:Arial,sans-serif;color:#1E293F"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden"><tr><td style="background:#1E293F;padding:25px 28px;color:#fff"><div style="color:#E0CE8C;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Consulmax • Agenda</div><h1 style="font-size:24px;margin:9px 0 0">${esc(event.titulo || "Novo compromisso")}</h1></td></tr><tr><td style="padding:28px"><p style="font-size:16px">Olá${guest.name ? `, ${esc(guest.name)}` : ""}!</p><p style="line-height:1.6;color:#475569">Você foi convidado(a) para um compromisso da Consulmax.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:20px 0"><strong style="display:block;color:#1E293F">${esc(event.titulo || "Compromisso")}</strong><span style="display:block;margin-top:7px;color:#64748b">${esc(fmt(event.inicio_at))}</span>${event.fim_at ? `<span style="display:block;margin-top:4px;color:#64748b">Término: ${esc(fmt(event.fim_at))}</span>` : ""}${event.descricao ? `<p style="margin:10px 0 0;color:#475569">${esc(event.descricao)}</p>` : ""}</div><p style="font-weight:700">Confirme sua presença com um clique:</p><div style="margin:18px 0"><a href="${yes}" style="display:inline-block;background:#1E293F;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;margin-right:8px">Confirmar presença</a><a href="${no}" style="display:inline-block;background:#fff;color:#A11C27;text-decoration:none;padding:11px 18px;border-radius:10px;border:1px solid #A11C27;font-weight:700">Não poderei participar</a></div>${meeting ? `<p style="margin-top:24px"><a href="${esc(meeting)}" style="color:#A11C27;font-weight:700;text-decoration:none">Abrir sala da reunião</a></p>` : ""}<p style="font-size:12px;color:#94a3b8;margin-top:26px">O arquivo de calendário está anexado para facilitar a inclusão no seu calendário.</p></td></tr></table></td></tr></table></div>`;
        await transporter.sendMail({
          from: `"Consulmax | Agenda" <${fromEmail}>`,
          replyTo: fromEmail,
          envelope: { from: smtpUser, to: guest.email },
          to: guest.email,
          subject: `Convite: ${event.titulo || "Compromisso Consulmax"}`,
          html,
          attachments: [{ filename: "convite-consulmax.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
        });
        await admin.from("agenda_event_guests").update({ email_sent_at: new Date().toISOString(), email_error: null, updated_at: new Date().toISOString() }).eq("id", guest.id);
        sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha no envio";
        await admin.from("agenda_event_guests").update({ email_error: message, updated_at: new Date().toISOString() }).eq("id", guest.id);
        failed++;
      }
    }
    return json({ ok: true, sent, failed });
  } catch (e) {
    console.error("[send-agenda-invitations]", e);
    return json({ error: e instanceof Error ? e.message : "Erro ao enviar convites." }, 500);
  }
});
