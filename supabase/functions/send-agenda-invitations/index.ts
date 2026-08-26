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

const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const render = (template: string | null | undefined, values: Record<string, string>) =>
  String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => values[key] ?? "");

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

function makeIcs(event: any, guest: any, organizerEmail: string, organizerName: string) {
  const end = event.fim_at || new Date(new Date(event.inicio_at).getTime() + 3600000).toISOString();
  const meeting = event.videocall_url || event.meeting_link || "";
  const description = [
    event.descricao || "",
    meeting ? `Videoconferência: ${meeting}` : "",
  ].filter(Boolean).join("\n\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Consulmax CRM//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.id}@consulmaxcrm`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.inicio_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(event.titulo || "Compromisso Consulmax")}`,
    description ? `DESCRIPTION:${icsText(description)}` : "",
    meeting ? `URL:${meeting}` : "",
    meeting ? `LOCATION:${icsText("Videoconferência Consulmax")}` : "",
    `ORGANIZER;CN=${icsText(organizerName || "Consulmax")}:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${icsText(guest.name || guest.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${guest.email}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
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
    if (!eventId) return json({ error: "event_id obrigatório." }, 400);

    const [{ data: event, error: eventError }, { data: requesterProfile }] = await Promise.all([
      admin
        .from("agenda_eventos")
        .select("id,titulo,inicio_at,fim_at,videocall_url,meeting_link,descricao,user_id")
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
      return json({ error: "Sem permissão para enviar estes convites." }, 403);
    }

    const [
      { data: guests, error: guestError },
      { data: template, error: templateError },
      { data: organizer },
    ] = await Promise.all([
      admin
        .from("agenda_event_guests")
        .select("id,name,email,rsvp_token,rsvp_status,email_sent_at")
        .eq("event_id", eventId)
        .is("email_sent_at", null)
        .order("created_at"),
      admin
        .from("email_templates")
        .select("template_key,name,version,subject_template,preheader_template,html_template,text_template,sender_name,reply_to")
        .eq("template_key", "agenda_invite")
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
    if (!template) throw new Error("Template ativo agenda_invite não encontrado no Supabase.");
    if (!guests?.length) {
      return json({ ok: true, sent: 0, failed: 0, template_version: template.version, only_unsent: true });
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) throw new Error("SMTP não configurado no Supabase.");

    const fromEmail = Deno.env.get("AGENDA_FROM_EMAIL") || "relacionamento@consulmaxconsorcios.com.br";
    const appUrl = PUBLIC_APP_URL;
    const organizerName = organizer?.nome || "Consulmax";
    const senderName = template.sender_name || "Consulmax | Agenda";
    const replyTo = template.reply_to || fromEmail;
    const logoUrl = `${appUrl}/logo-consulmax.png`;
    const endIso = event.fim_at || new Date(new Date(event.inicio_at).getTime() + 3600000).toISOString();
    const meeting = event.videocall_url || event.meeting_link || "";

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
        const yes = `${appUrl}/api/agenda/rsvp?token=${guest.rsvp_token}&response=accepted`;
        const no = `${appUrl}/api/agenda/rsvp?token=${guest.rsvp_token}&response=declined`;
        const title = event.titulo || "Compromisso Consulmax";
        const guestName = guest.name || "Convidado";
        const description = String(event.descricao || "").trim();

        const plain: Record<string, string> = {
          titulo: title,
          nome_convidado: guestName,
          data_curta: fmtDateShort(event.inicio_at),
          data_extenso: fmtDateLong(event.inicio_at),
          hora_inicio: fmtTime(event.inicio_at),
          hora_fim: fmtTime(endIso),
          organizador_nome: organizerName,
          link_confirmar: yes,
          link_recusar: no,
          logo_url: logoUrl,
          preheader: "",
          descricao_texto: description,
          videoconferencia_texto: meeting ? `Videoconferência: ${meeting}` : "",
          descricao_html: "",
          videoconferencia_html: "",
        };

        plain.preheader = render(template.preheader_template, plain);

        const htmlValues: Record<string, string> = {
          ...plain,
          titulo: esc(title),
          nome_convidado: esc(guestName),
          data_curta: esc(plain.data_curta),
          data_extenso: esc(plain.data_extenso),
          hora_inicio: esc(plain.hora_inicio),
          hora_fim: esc(plain.hora_fim),
          organizador_nome: esc(organizerName),
          link_confirmar: esc(yes),
          link_recusar: esc(no),
          logo_url: esc(logoUrl),
          preheader: esc(plain.preheader),
          descricao_html: description
            ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid #E2E8F0"><div style="font-size:12px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Observações</div><div style="margin-top:7px;font-size:14px;line-height:1.65;color:#475569">${esc(description).replace(/\r?\n/g, "<br>")}</div></div>`
            : "",
          videoconferencia_html: meeting
            ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFF9F9;border:1px solid #EBC7CA;border-radius:16px"><tr><td style="padding:18px 20px"><div style="font-size:12px;color:#A11C27;font-weight:800;text-transform:uppercase;letter-spacing:.06em">Videoconferência</div><div style="margin-top:5px;font-size:16px;color:#1E293F;font-weight:800">Sala online da reunião</div><a href="${esc(meeting)}" style="display:inline-block;margin-top:13px;background:#A11C27;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:800;padding:11px 17px;border-radius:10px">Acessar videoconferência</a></td></tr></table>`
            : "",
        };

        const subject = render(template.subject_template, plain) || `Convite: ${title}`;
        const html = render(template.html_template, htmlValues);
        const text = render(template.text_template, plain);
        const ics = makeIcs(event, guest, fromEmail, organizerName);

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
            "X-Consulmax-Mime": "html-plus-inline-calendar",
            "X-Consulmax-App-Url": appUrl,
          },
          attachments: [{
            filename: "convite-consulmax.ics",
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
            contentDisposition: "inline",
            headers: { "Content-Class": "urn:content-classes:calendarmessage" },
          }],
        });

        const now = new Date().toISOString();
        await admin
          .from("agenda_event_guests")
          .update({ email_sent_at: now, email_error: null, updated_at: now })
          .eq("id", guest.id);

        console.log(`[agenda-invite] sent ${template.template_key} v${template.version} guest=${guest.id} mime=html-plus-inline-calendar`);
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha no envio";
        await admin
          .from("agenda_event_guests")
          .update({ email_error: message, updated_at: new Date().toISOString() })
          .eq("id", guest.id);
        console.error("[agenda-invite] guest send failed", guest.id, message);
        failed++;
      }
    }

    return json({
      ok: true,
      sent,
      failed,
      template_key: template.template_key,
      template_version: template.version,
      mime: "html-plus-inline-calendar",
      app_url: appUrl,
      only_unsent: true,
    });
  } catch (error) {
    console.error("[send-agenda-invitations]", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao enviar convites." }, 500);
  }
});
