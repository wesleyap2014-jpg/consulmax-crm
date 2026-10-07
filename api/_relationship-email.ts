import tls from "node:tls";
import { randomUUID } from "node:crypto";

const SMTP_HOST = String(process.env.NEWSLETTER_SMTP_HOST || process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.NEWSLETTER_SMTP_PORT || process.env.SMTP_PORT || 465);
const SMTP_USER = String(process.env.NEWSLETTER_SMTP_USER || process.env.SMTP_USER || "").trim();
const SMTP_PASSWORD = String(process.env.NEWSLETTER_SMTP_PASSWORD || process.env.SMTP_PASS || "");
export const RELATIONSHIP_FROM_EMAIL = String(
  process.env.RELATIONSHIP_FROM_EMAIL || "relacionamento@consulmaxconsorcios.com.br",
).trim();

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

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || encoded;
}

function ensureConfig() {
  const missing = [
    ["SMTP host", SMTP_HOST],
    ["SMTP user", SMTP_USER],
    ["SMTP password", SMTP_PASSWORD],
    ["Relationship from", RELATIONSHIP_FROM_EMAIL],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Configuração SMTP incompleta: ${missing.join(", ")}.`);
  if (!Number.isFinite(SMTP_PORT) || SMTP_PORT <= 0) throw new Error("Porta SMTP inválida.");
}

function buildRawMessage(args: { to: string; subject: string; html: string; text?: string }) {
  const domain = RELATIONSHIP_FROM_EMAIL.includes("@")
    ? RELATIONSHIP_FROM_EMAIL.split("@")[1]
    : "consulmaxconsorcios.com.br";
  const boundary = `cmx-rel-${randomUUID()}`;
  const text = args.text || "Seu cliente de e-mail não exibiu a versão HTML desta mensagem.";
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    `From: ${encodeHeader("Consulmax | Relacionamento")} <${RELATIONSHIP_FROM_EMAIL}>`,
    `To: <${args.to}>`,
    `Reply-To: <${RELATIONSHIP_FROM_EMAIL}>`,
    `Subject: ${encodeHeader(args.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-Mailer: Consulmax CRM",
  ];
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(args.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

async function openSession() {
  ensureConfig();
  const socket = tls.connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
    rejectUnauthorized: true,
  });
  socket.setEncoding("utf8");
  socket.setTimeout(25_000);

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
      const timer = setTimeout(() => reject(new Error("Timeout aguardando resposta do SMTP.")), 25_000);
      waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  async function readResponse() {
    const lines: string[] = [];
    while (true) {
      const line = await nextLine();
      lines.push(line);
      const match = line.match(/^(\d{3})([ -])/);
      if (!match) continue;
      const code = Number(match[1]);
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
  await expect([250], "EHLO crm.consulmaxconsorcios.com.br");
  await expect([334], "AUTH LOGIN");
  await expect([334], Buffer.from(SMTP_USER, "utf8").toString("base64"));
  await expect([235], Buffer.from(SMTP_PASSWORD, "utf8").toString("base64"));

  return {
    async send(to: string, message: string) {
      await expect([250], `MAIL FROM:<${SMTP_USER}>`);
      await expect([250, 251], `RCPT TO:<${to}>`);
      await expect([354], "DATA");
      const stuffed = message.replace(/(^|\r\n)\./g, "$1..");
      socket.write(`${stuffed}\r\n.\r\n`);
      await expect([250]);
    },
    async close() {
      try { await expect([221], "QUIT"); } catch {}
      socket.end();
      socket.destroy();
    },
  };
}

export async function sendRelationshipEmail(args: { to: string; subject: string; html: string; text?: string }) {
  const session = await openSession();
  try {
    await session.send(args.to, buildRawMessage(args));
  } finally {
    await session.close();
  }
}

export function relationshipSmtpError(error: unknown) {
  if (error instanceof SmtpError) {
    return `${error.message}${error.response ? ` ${error.response}` : ""}`.slice(0, 1200);
  }
  if (error instanceof Error) return error.message.slice(0, 1200);
  return String(error || "Erro SMTP").slice(0, 1200);
}
