import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const SMTP_HOST = String(process.env.NEWSLETTER_SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.NEWSLETTER_SMTP_PORT || 465);
const SMTP_USER = String(process.env.NEWSLETTER_SMTP_USER || "").trim();
const SMTP_PASSWORD = String(process.env.NEWSLETTER_SMTP_PASSWORD || "");
const FROM_NAME = String(process.env.NEWSLETTER_FROM_NAME || "Consulmax Consórcios").trim();
const FROM_EMAIL = String(process.env.NEWSLETTER_FROM_EMAIL || SMTP_USER).trim();
const HOURLY_LIMIT = 50;
const DAILY_LIMIT = 100;
const MAX_BATCH = 50;

type Newsletter = {
  id: string;
  title: string;
  subject: string;
  preheader: string | null;
  content: string | null;
  cta_text: string | null;
  cta_url: string | null;
  banner_file_path: string | null;
  banner_external_url: string | null;
  scheduled_for: string | null;
};

type Dispatch = {
  id: string;
  newsletter_id: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string | null;
};

type QueueRecipient = {
  id: string;
  name: string | null;
  email: string;
  attempts: number;
};

class SmtpError extends Error {
  code?: number;
  response?: string;

  constructor(message: string, code?: number, response?: string) {
    super(message);
    this.name = "SmtpError";
    this.code = code;
    this.response = response;
  }
}

function json(res: VercelResponse, status: number, body: any) {
  return res.status(status).json(body);
}

async function authenticatedAdmin(req: VercelRequest) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const jwt = header.slice(7).trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  const user = error ? null : data.user || null;
  if (!user) return null;
  const { data: profile } = await db.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  return profile?.role === "admin" ? user : null;
}

function isCronRequest(req: VercelRequest) {
  const authorization = String(req.headers.authorization || "");
  const cronSecret = String(process.env.CRON_SECRET || "");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  return String(req.headers["user-agent"] || "").startsWith("vercel-cron/1.0");
}

function ensureConfig() {
  const missing = [
    ["NEWSLETTER_SMTP_HOST", SMTP_HOST],
    ["NEWSLETTER_SMTP_USER", SMTP_USER],
    ["NEWSLETTER_SMTP_PASSWORD", SMTP_PASSWORD],
    ["NEWSLETTER_FROM_EMAIL", FROM_EMAIL],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Variáveis ausentes na Vercel: ${missing.join(", ")}`);
  if (!Number.isFinite(SMTP_PORT) || SMTP_PORT <= 0) throw new Error("NEWSLETTER_SMTP_PORT inválida.");
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function paragraphs(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .split(/\n\s*\n/g)
    .map((block) => `<p style="margin:0 0 18px;line-height:1.7;color:#334155;font-size:15px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || encoded;
}

function firstName(value?: string | null) {
  const name = String(value || "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function renderHtml(newsletter: Newsletter, recipient: QueueRecipient, bannerUrl: string) {
  const ctaUrl = safeHttpUrl(newsletter.cta_url);
  const preheader = escapeHtml(newsletter.preheader || "");
  const greeting = firstName(recipient.name);
  const greetingHtml = greeting
    ? `<p style="margin:0 0 18px;color:#334155;font-size:15px;">Olá, ${escapeHtml(greeting)}.</p>`
    : "";
  const banner = bannerUrl
    ? `<img src="${escapeHtml(bannerUrl)}" alt="" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;">`
    : "";
  const cta = ctaUrl && newsletter.cta_text
    ? `<div style="margin:28px 0 8px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;font-size:14px;">${escapeHtml(newsletter.cta_text)}</a></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">
        <tr><td style="background:#1E293F;padding:22px 28px;border-bottom:4px solid #B5A573;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:.2px;">Consulmax Consórcios</div>
          <div style="margin-top:5px;font-size:11px;color:#e2e8f0;letter-spacing:1.2px;text-transform:uppercase;">Relacionamento e planejamento</div>
        </td></tr>
        ${banner ? `<tr><td>${banner}</td></tr>` : ""}
        <tr><td style="padding:32px 30px 30px;">
          <h1 style="margin:0 0 22px;color:#1E293F;font-size:26px;line-height:1.25;">${escapeHtml(newsletter.title)}</h1>
          ${greetingHtml}
          ${paragraphs(newsletter.content)}
          ${cta}
        </td></tr>
        <tr><td style="padding:22px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.55;">
          Esta mensagem foi enviada por Consulmax Consórcios através de <strong>${escapeHtml(FROM_EMAIL)}</strong>.<br>
          Se não quiser mais receber nossas newsletters, responda este e-mail solicitando a remoção da lista.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function rawMessage(newsletter: Newsletter, recipient: QueueRecipient, html: string) {
  const domain = FROM_EMAIL.includes("@") ? FROM_EMAIL.split("@")[1] : "consulmaxconsorcios.com.br";
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    `From: ${encodeHeader(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: <${recipient.email}>`,
    `Reply-To: <${FROM_EMAIL}>`,
    `Subject: ${encodeHeader(newsletter.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "X-Mailer: Consulmax CRM",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrapBase64(html)}\r\n`;
}

async function openSmtpSession() {
  ensureConfig();

  const socket = tls.connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
    rejectUnauthorized: true,
  });
  socket.setEncoding("utf8");
  socket.setTimeout(20_000);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    socket.once("error", onError);
    socket.once("secureConnect", () => {
      socket.off("error", onError);
      resolve();
    });
  });

  let buffer = "";
  const lineQueue: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  socket.on("data", (chunk) => {
    buffer += String(chunk);
    while (true) {
      const index = buffer.indexOf("\r\n");
      if (index < 0) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lineQueue.push(line);
    }
  });

  function nextLine() {
    if (lineQueue.length) return Promise.resolve(lineQueue.shift()!);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout aguardando resposta do SMTP.")), 20_000);
      waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  async function readResponse() {
    const lines: string[] = [];
    let code = 0;
    while (true) {
      const line = await nextLine();
      lines.push(line);
      const match = line.match(/^(\d{3})([ -])/);
      if (!match) continue;
      code = Number(match[1]);
      if (match[2] === " ") return { code, text: lines.join("\n") };
    }
  }

  async function expect(codes: number[], command?: string) {
    if (command !== undefined) socket.write(`${command}\r\n`);
    const response = await readResponse();
    if (!codes.includes(response.code)) {
      throw new SmtpError(`SMTP retornou ${response.code}.`, response.code, response.text);
    }
    return response;
  }

  await expect([220]);
  await expect([250], `EHLO crm.consulmaxconsorcios.com.br`);
  await expect([334], "AUTH LOGIN");
  await expect([334], Buffer.from(SMTP_USER, "utf8").toString("base64"));
  await expect([235], Buffer.from(SMTP_PASSWORD, "utf8").toString("base64"));

  return {
    async send(to: string, message: string) {
      try {
        await expect([250], `MAIL FROM:<${FROM_EMAIL}>`);
        await expect([250, 251], `RCPT TO:<${to}>`);
        await expect([354], "DATA");
        const stuffed = message.replace(/(^|\r\n)\./g, "$1..");
        socket.write(`${stuffed}\r\n.\r\n`);
        await expect([250]);
      } catch (error) {
        try { await expect([250], "RSET"); } catch { /* keep original SMTP error */ }
        throw error;
      }
    },
    async close() {
      try { await expect([221], "QUIT"); } catch { /* socket will be destroyed below */ }
      socket.end();
      socket.destroy();
    },
  };
}

async function countSentSince(iso: string) {
  const { count, error } = await db
    .from("marketing_newsletter_recipients")
    .select("id", { head: true, count: "exact" })
    .eq("status", "enviado")
    .gte("sent_at", iso);
  if (error) throw error;
  return count || 0;
}

async function dispatchStats(dispatchId: string) {
  const count = async (status: string) => {
    const { count: total, error } = await db
      .from("marketing_newsletter_recipients")
      .select("id", { head: true, count: "exact" })
      .eq("dispatch_id", dispatchId)
      .eq("status", status);
    if (error) throw error;
    return total || 0;
  };
  const [sent, failed, pending, sending, skipped] = await Promise.all([
    count("enviado"),
    count("erro"),
    count("pendente"),
    count("enviando"),
    count("ignorado"),
  ]);
  return { sent, failed, pending, sending, skipped };
}

async function bannerUrl(newsletter: Newsletter) {
  const external = safeHttpUrl(newsletter.banner_external_url);
  if (external) return external;
  if (!newsletter.banner_file_path) return "";
  const { data, error } = await db.storage
    .from("marketing-creatives")
    .createSignedUrl(newsletter.banner_file_path, 60 * 60 * 24 * 30);
  if (error) return "";
  return data?.signedUrl || "";
}

function smtpFailureMessage(error: unknown) {
  if (error instanceof SmtpError) return `${error.message}${error.response ? ` ${error.response}` : ""}`.slice(0, 1000);
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error || "Erro SMTP").slice(0, 1000);
}

async function processQueues() {
  ensureConfig();
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [sentHour, sentDay] = await Promise.all([countSentSince(hourAgo), countSentSince(dayAgo)]);
  let allowance = Math.max(0, Math.min(HOURLY_LIMIT - sentHour, DAILY_LIMIT - sentDay, MAX_BATCH));

  if (allowance <= 0) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      pending_allowance: 0,
      sent_last_hour: sentHour,
      sent_last_24h: sentDay,
      reason: sentDay >= DAILY_LIMIT ? "daily_limit" : "hourly_limit",
    };
  }

  const { data: dispatchRows, error: dispatchError } = await db
    .from("marketing_newsletter_dispatches")
    .select("id,newsletter_id,status,total_recipients,sent_count,failed_count,skipped_count,started_at")
    .eq("status", "em_envio")
    .order("created_at", { ascending: true })
    .limit(10);
  if (dispatchError) throw dispatchError;

  const dispatches = (dispatchRows || []) as Dispatch[];
  if (!dispatches.length) {
    return { sent: 0, failed: 0, skipped: 0, pending_allowance: allowance, sent_last_hour: sentHour, sent_last_24h: sentDay, reason: "no_active_dispatch" };
  }

  let session: Awaited<ReturnType<typeof openSmtpSession>> | null = null;
  let sentNow = 0;
  let failedNow = 0;
  let skippedNow = 0;
  const touched: string[] = [];

  try {
    for (const dispatch of dispatches) {
      if (allowance <= 0) break;

      const { data: newsletterRow, error: newsletterError } = await db
        .from("marketing_newsletters")
        .select("id,title,subject,preheader,content,cta_text,cta_url,banner_file_path,banner_external_url,scheduled_for")
        .eq("id", dispatch.newsletter_id)
        .maybeSingle();
      if (newsletterError) throw newsletterError;
      if (!newsletterRow) {
        await db.from("marketing_newsletter_dispatches").update({ status: "erro", last_run_at: new Date().toISOString() }).eq("id", dispatch.id);
        continue;
      }

      const newsletter = newsletterRow as Newsletter;
      if (newsletter.scheduled_for && new Date(newsletter.scheduled_for).getTime() > Date.now()) continue;
      if (!newsletter.subject?.trim() || !newsletter.content?.trim()) {
        await db.from("marketing_newsletter_dispatches").update({ status: "erro", last_run_at: new Date().toISOString() }).eq("id", dispatch.id);
        continue;
      }

      if (!dispatch.started_at) {
        await db.from("marketing_newsletter_dispatches").update({ started_at: new Date().toISOString(), last_run_at: new Date().toISOString() }).eq("id", dispatch.id);
      } else {
        await db.from("marketing_newsletter_dispatches").update({ last_run_at: new Date().toISOString() }).eq("id", dispatch.id);
      }

      const { data: recipientRows, error: recipientsError } = await db
        .from("marketing_newsletter_recipients")
        .select("id,name,email,attempts")
        .eq("dispatch_id", dispatch.id)
        .eq("status", "pendente")
        .order("queued_at", { ascending: true })
        .limit(allowance);
      if (recipientsError) throw recipientsError;
      const recipients = (recipientRows || []) as QueueRecipient[];

      if (!recipients.length) {
        const stats = await dispatchStats(dispatch.id);
        if (stats.pending === 0 && stats.sending === 0) {
          const completedAt = new Date().toISOString();
          await db.from("marketing_newsletter_dispatches").update({
            status: "concluida",
            sent_count: stats.sent,
            failed_count: stats.failed,
            skipped_count: stats.skipped,
            completed_at: completedAt,
            last_run_at: completedAt,
          }).eq("id", dispatch.id);
          await db.from("marketing_newsletters").update({ status: "enviada", sent_at: completedAt }).eq("id", newsletter.id);
        }
        continue;
      }

      const imageUrl = await bannerUrl(newsletter);
      session ||= await openSmtpSession();
      touched.push(dispatch.id);

      for (const recipient of recipients) {
        if (allowance <= 0) break;

        const nextAttempts = Number(recipient.attempts || 0) + 1;
        const { data: claimed, error: claimError } = await db
          .from("marketing_newsletter_recipients")
          .update({ status: "enviando", attempts: nextAttempts, last_error: null })
          .eq("id", recipient.id)
          .eq("status", "pendente")
          .select("id")
          .maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) {
          skippedNow += 1;
          continue;
        }

        try {
          const html = renderHtml(newsletter, recipient, imageUrl);
          await session.send(recipient.email, rawMessage(newsletter, recipient, html));
          const sentAt = new Date().toISOString();
          const { error: sentError } = await db
            .from("marketing_newsletter_recipients")
            .update({ status: "enviado", sent_at: sentAt, last_error: null })
            .eq("id", recipient.id);
          if (sentError) throw sentError;
          sentNow += 1;
          allowance -= 1;
        } catch (error) {
          const permanent = error instanceof SmtpError && Number(error.code || 0) >= 500;
          const finalFailure = permanent || nextAttempts >= 3;
          await db.from("marketing_newsletter_recipients").update({
            status: finalFailure ? "erro" : "pendente",
            last_error: smtpFailureMessage(error),
          }).eq("id", recipient.id);
          if (finalFailure) failedNow += 1;
          if (!(error instanceof SmtpError) || [421, 432, 454].includes(Number(error.code || 0))) {
            throw error;
          }
        }
      }

      const stats = await dispatchStats(dispatch.id);
      const finished = stats.pending === 0 && stats.sending === 0;
      const updatedAt = new Date().toISOString();
      await db.from("marketing_newsletter_dispatches").update({
        status: finished ? "concluida" : "em_envio",
        sent_count: stats.sent,
        failed_count: stats.failed,
        skipped_count: stats.skipped,
        completed_at: finished ? updatedAt : null,
        last_run_at: updatedAt,
      }).eq("id", dispatch.id);
      if (finished) {
        await db.from("marketing_newsletters").update({ status: "enviada", sent_at: updatedAt }).eq("id", newsletter.id);
      }
    }
  } finally {
    if (session) await session.close();
  }

  return {
    sent: sentNow,
    failed: failedNow,
    skipped: skippedNow,
    touched_dispatches: Array.from(new Set(touched)),
    pending_allowance: allowance,
    sent_last_hour_before_run: sentHour,
    sent_last_24h_before_run: sentDay,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, message: "Método não permitido" });
  }

  const cron = req.method === "GET" && isCronRequest(req);
  const admin = cron ? null : await authenticatedAdmin(req);
  if (!cron && !admin) return json(res, 401, { ok: false, message: "Não autorizado" });

  try {
    const result = await processQueues();
    return json(res, 200, { ok: true, ...result });
  } catch (error: any) {
    console.error("NEWSLETTER_DISPATCH_RUN_ERROR", error);
    return json(res, 500, { ok: false, message: error?.message || "Erro ao processar a fila de newsletter." });
  }
}
