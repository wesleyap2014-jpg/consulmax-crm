import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.14";

type RequestBody = {
  name?: string;
  email?: string;
  temp_password?: string;
  crm_url?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstName(name?: string | null) {
  return (name || "Olá").trim().split(/\s+/)[0] || "Olá";
}

function buildHtml(args: { name: string; email: string; tempPassword: string; crmUrl: string }) {
  const name = escapeHtml(firstName(args.name));
  const email = escapeHtml(args.email);
  const tempPassword = escapeHtml(args.tempPassword);
  const crmUrl = escapeHtml(args.crmUrl);
  const logoUrl = "https://crm.consulmaxconsorcios.com.br/logo-consulmax.png";

  return [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bem-vindo à Consulmax</title></head>',
    '<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1E293F;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu acesso ao CRM Consulmax foi criado.</div>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:28px 12px;"><tr><td align="center">',
    '<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.09);">',
    '<tr><td align="center" style="padding:24px 30px 18px;border-top:5px solid #A11C27;background:#ffffff;">',
    '<img src="', logoUrl, '" width="210" alt="Consulmax Consórcios" style="display:block;width:210px;max-width:70%;height:auto;border:0;margin:0 auto;">',
    '<div style="margin-top:10px;font-size:10px;color:#64748b;letter-spacing:1.25px;text-transform:uppercase;">CRM Consulmax</div>',
    '</td></tr><tr><td style="height:4px;background:#B5A573;font-size:0;line-height:0;">&nbsp;</td></tr>',
    '<tr><td style="padding:34px 32px 30px;">',
    '<div style="height:3px;width:54px;background:#A11C27;margin-bottom:20px;"></div>',
    '<h1 style="margin:0 0 18px;color:#1E293F;font-size:28px;line-height:1.22;">Bem-vindo à Consulmax, ', name, '!</h1>',
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#475569;">Seu acesso ao CRM Consulmax foi criado. Abaixo estão os dados para o seu primeiro acesso.</p>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">',
    '<tr><td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">E-mail de acesso</div><div style="margin-top:6px;font-size:16px;font-weight:700;color:#1E293F;word-break:break-word;">', email, '</div></td></tr>',
    '<tr><td style="padding:18px 20px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Senha provisória</div><div style="margin-top:6px;font-size:18px;font-weight:800;letter-spacing:.04em;color:#A11C27;word-break:break-word;">', tempPassword, '</div></td></tr>',
    '</table>',
    '<div style="text-align:center;margin:30px 0;"><a href="', crmUrl, '" style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 28px;border-radius:12px;">Acessar o CRM</a></div>',
    '<div style="margin:24px 0;padding:16px 18px;border-radius:12px;background:#fffaf0;border:1px solid #E0CE8C;"><div style="font-size:13px;font-weight:800;color:#1E293F;margin-bottom:5px;">Importante</div><div style="font-size:14px;line-height:1.6;color:#475569;">Esta senha é provisória. No primeiro acesso, o sistema solicitará a criação de uma nova senha pessoal. Não compartilhe suas credenciais com terceiros.</div></div>',
    '<p style="margin:22px 0 0;font-size:14px;line-height:1.65;color:#475569;">Se o botão acima não abrir, acesse:<br><a href="', crmUrl, '" style="color:#A11C27;font-weight:700;text-decoration:none;word-break:break-all;">', crmUrl, '</a></p>',
    '<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#1E293F;">Atenciosamente,<br><strong>Equipe Consulmax</strong><br><span style="color:#A11C27;font-weight:700;">Maximize as suas conquistas.</span></p>',
    '</td></tr>',
    '<tr><td style="padding:22px 30px;background:#1E293F;text-align:center;"><p style="margin:0;font-size:12px;line-height:1.5;color:rgba(255,255,255,.75);">Consulmax Serviços de Planejamento Estruturado e Proteção LTDA</p><p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.58);">Este é um e-mail automático referente à criação do seu acesso ao CRM.</p></td></tr>',
    '</table></td></tr></table></body></html>'
  ].join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = req.headers.get("Authorization") || "";

    if (!serviceRoleKey || authorization !== "Bearer " + serviceRoleKey) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as RequestBody;
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const tempPassword = String(body?.temp_password || "").trim();
    const crmUrl = String(body?.crm_url || "https://crm.consulmaxconsorcios.com.br/login").trim();

    if (!name || !email || !tempPassword) {
      return json({ error: "name, email e temp_password são obrigatórios." }, 400);
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      throw new Error("Secrets de SMTP incompletos. Verifique SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL.");
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: '"Consulmax Consórcios" <' + fromEmail + '>',
      to: email,
      subject: "Bem-vindo à Consulmax | Seu acesso ao CRM",
      html: buildHtml({ name, email, tempPassword, crmUrl }),
      text: [
        "Bem-vindo à Consulmax, " + firstName(name) + "!",
        "",
        "Seu acesso ao CRM Consulmax foi criado.",
        "E-mail: " + email,
        "Senha provisória: " + tempPassword,
        "Acesse: " + crmUrl,
        "",
        "No primeiro acesso, crie uma nova senha pessoal.",
        "Não compartilhe suas credenciais com terceiros.",
      ].join("\n"),
    });

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar e-mail.";
    console.error("[send-user-welcome-email]", message);
    return json({ error: message }, 500);
  }
});
