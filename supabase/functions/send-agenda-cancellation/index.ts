import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TZ = "America/Porto_Velho";
const PUBLIC_APP_URL = "https://crm.consulmaxconsorcios.com.br";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const render = (tpl: string | null | undefined, values: Record<string, string>) =>
  String(tpl || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => values[key] ?? "");

const fmtDateLong = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

const fmtDateShort = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

function icsDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function icsText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function makeCancelIcs(event: any, guest: any, organizerEmail: string, organizerName: string) {
  const end = event.fim_at || new Date(new Date(event.inicio_at).getTime() + 3600000).toISOString();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Consulmax CRM//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:CANCEL",
    "BEGIN:VEVENT",
    `UID:${event.id}@consulmaxcrm`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.inicio_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(event.titulo || "Compromisso Consulmax")}`,
    `ORGANIZER;CN=${icsText(organizerName || "Consulmax")}:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${icsText(guest.name || guest.email)};ROLE=REQ-PARTICIPANT:mailto:${guest.email}`,
    "SEQUENCE:1",
    "STATUS:CANCELLED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: authData } = await admin.auth.getUser(token);
    const authId = authData.user?.id;
    if (!authId) return json({ error: "Usuário não autenticado." }, 401);

    const body = await req.json();
    const eventId = String(body?.event_id || "").trim();
    const reason = String(body?.reason || "").trim();
    if (!eventId) return json({ error: "event_id obrigatório." }, 400);

    const [
      { data: event, error: eventError },
      { data: requesterProfile },
    ] = await Promise.all([
      admin
        .from("agenda_eventos")
        .select("id,titulo,inicio_at,fim_at,user_id,cancelled_at")
        .eq("id", eventId)
        .maybeSingle(),
      admin
        .from("users")
        .select("role,is_active")
        .eq("auth_user_id", authId)
        .maybeSingle(),
    ]);

    if (eventError) throw eventError;
    if (!event) return json({ error: "Compromisso não encontrado." }, 404);

    const isAdmin = requesterProfile?.role === "admin" && requesterProfile?.is_active !== false;
    if (event.user_id !== authId && !isAdmin) {
      return json({ error: "Sem permissão para cancelar este compromisso." }, 403);
    }

    const [
      { data: guests, error: guestError },
      { data: template, error: templateError },
      { data: organizer },
    ] = await Promise.all([
      admin
        .from("agenda_event_guests")
        .select("id,name,email")
        .eq("event_id", eventId)
        .order("created_at"),
      admin
        .from("email_templates")
        .select("template_key,version,subject_template,preheader_template,html_template,text_template,sender_name,reply_to")
        .eq("template_key", "agenda_cancelled")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("users")
        .select("nome,email")
        .eq("auth_user_id", event.user_id)
        .maybeSingle(),
    ]);

    if (guestError) throw guestError;
    if (templateError) throw templateError;
    if (!template) throw new Error("Template ativo agenda_cancelled não encontrado no Supabase.");
    if (!guests?.length) return json({ ok: true, sent: 0, failed: 0, template_version: template.version });

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) throw new Error("SMTP não configurado no Supabase.");

    const fromEmail = Deno.env.get("AGENDA_FROM_EMAIL") || "relacionamento@consulmaxconsorcios.com.br";
    const senderName = template.sender_name || "Consulmax | Agenda";
    const replyTo = template.reply_to || fromEmail;
    const organizerName = organizer?.nome || "Consulmax";
    const logoUrl = `${PUBLIC_APP_URL}/logo-consulmax.png`;
    const endIso = event.fim_at || new Date(new Date(event.inicio_at).getTime() + 3600000).toISOString();

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let failed = 0;

    for (const guest of guests) {
      try {
        const plain: Record<string, string> = {
          titulo: event.titulo || "Compromisso Consulmax",
          nome_convidado: guest.name || "Convidado",
          data_curta: fmtDateShort(event.inicio_at),
          data_extenso: fmtDateLong(event.inicio_at),
          hora_inicio: fmtTime(event.inicio_at),
          hora_fim: fmtTime(endIso),
          organizador_nome: organizerName,
          logo_url: logoUrl,
          preheader: "",
          motivo_texto: reason ? `Motivo: ${reason}` : "",
          motivo_html: "",
        };
        plain.preheader = render(template.preheader_template, plain);

        const htmlValues: Record<string, string> = {
          ...plain,
          titulo: esc(plain.titulo),
          nome_convidado: esc(plain.nome_convidado),
          data_curta: esc(plain.data_curta),
          data_extenso: esc(plain.data_extenso),
          hora_inicio: esc(plain.hora_inicio),
          hora_fim: esc(plain.hora_fim),
          organizador_nome: esc(plain.organizador_nome),
          logo_url: esc(logoUrl),
          preheader: esc(plain.preheader),
          motivo_html: reason
            ? `<tr><td style="padding:18px 30px 0;"><div style="background:#FFF8F8;border:1px solid #EBC7CA;border-radius:14px;padding:16px 18px;"><div style="font-size:12px;color:#A11C27;font-weight:800;text-transform:uppercase;letter-spacing:.05em;">Motivo</div><div style="margin-top:6px;font-size:14px;line-height:1.65;color:#475569;">${esc(reason).replace(/\r?\n/g, "<br>")}</div></div></td></tr>`
            : "",
        };

        const subject = render(template.subject_template, plain);
        const html = render(template.html_template, htmlValues);
        const text = render(template.text_template, plain);
        const ics = makeCancelIcs(event, guest, fromEmail, organizerName);

        await transporter.sendMail({
          from: `"${senderName.replaceAll('"', "")}" <${fromEmail}>`,
          replyTo,
          envelope: { from: smtpUser, to: guest.email },
          to: guest.email,
          subject,
          text,
          html,
          headers: {
            "X-Consulmax-Template": `${template.template_key}; v=${template.version}`,
            "X-Consulmax-Calendar-Action": "cancel",
          },
          attachments: [
            {
              filename: "cancelamento-consulmax.ics",
              content: ics,
              contentType: "text/calendar; charset=utf-8; method=CANCEL",
              contentDisposition: "inline",
              headers: { "Content-Class": "urn:content-classes:calendarmessage" },
            },
          ],
        });
        sent++;
      } catch (e) {
        console.error("[agenda-cancellation] guest send failed", guest.id, e);
        failed++;
      }
    }

    return json({ ok: failed === 0, sent, failed, template_key: template.template_key, template_version: template.version });
  } catch (e) {
    console.error("[send-agenda-cancellation]", e);
    return json({ error: e instanceof Error ? e.message : "Erro ao enviar cancelamentos." }, 500);
  }
});
