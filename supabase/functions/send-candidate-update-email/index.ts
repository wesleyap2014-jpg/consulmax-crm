// supabase/functions/send-candidate-update-email/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  application_id?: string;
  history_id?: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  inscrito: "Inscrito",
  novo: "Novo",
  triagem: "Triagem",
  teste: "Teste",
  entrevista: "Entrevista",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  convertido: "Convertido",
  banco_talentos: "Banco de Talentos",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stageLabel(status?: string | null) {
  return STAGE_LABELS[String(status || "novo")] || status || "Novo";
}

function escapeHtml(value?: string | number | boolean | null) {
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

function buildHtmlEmail(args: {
  candidateName?: string | null;
  jobTitle?: string | null;
  stage?: string | null;
  parecer?: string | null;
  publicAreaUrl: string;
}) {
  const nome = firstName(args.candidateName);
  const vaga = args.jobTitle || "Consulmax";
  const etapa = stageLabel(args.stage);
  const parecer =
    args.parecer ||
    "Acesse sua Área do Candidato para acompanhar a atualização completa da sua candidatura.";

  return `
<div style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#1E293F;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#1E293F,#A11C27);padding:32px 28px;text-align:center;color:#ffffff;">
              <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#E0CE8C;font-weight:700;">
                Consulmax RH
              </div>
              <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">
                Atualização na sua candidatura
              </h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,.82);">
                Temos uma nova movimentação no seu processo seletivo.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1E293F;">
                Olá, ${escapeHtml(nome)}!
              </p>

              <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#334155;">
                Sua candidatura para a vaga <strong>${escapeHtml(vaga)}</strong> foi atualizada.
              </p>

              <div style="margin:24px 0;padding:18px;border-radius:18px;background:#F8FAFC;border:1px solid #E2E8F0;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;font-weight:700;">
                  Etapa atual
                </div>
                <div style="margin-top:6px;font-size:22px;font-weight:800;color:#A11C27;">
                  ${escapeHtml(etapa)}
                </div>
              </div>

              <div style="margin:24px 0;padding:18px;border-radius:18px;background:#fffaf0;border:1px solid #E0CE8C;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#1E293F;font-weight:700;">
                  Devolutiva
                </div>
                <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
                  ${escapeHtml(parecer).replaceAll("\n", "<br />")}
                </p>
              </div>

              <div style="text-align:center;margin:30px 0;">
                <a href="${escapeHtml(args.publicAreaUrl)}"
                   style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 26px;border-radius:16px;">
                  Acompanhar minha candidatura
                </a>
              </div>

              <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#1E293F;">
                Atenciosamente,<br />
                <strong>Equipe Consulmax RH</strong><br />
                <span style="color:#A11C27;font-weight:700;">Maximize as suas conquistas.</span>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px;background:#1E293F;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(255,255,255,.72);">
                Consulmax Serviços de Planejamento Estruturado e Proteção LTDA
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.6);">
                Este é um e-mail automático da Área do Candidato.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let historyId: string | null = null;

  try {
    const body = (await req.json()) as RequestBody;
    const applicationId = body?.application_id;
    historyId = body?.history_id || null;

    if (!applicationId) {
      return json({ error: "application_id obrigatório." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: app, error: appError } = await supabase
      .from("hr_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError) throw appError;
    if (!app) throw new Error("Candidatura não encontrada.");

    const [{ data: candidate, error: candidateError }, { data: job, error: jobError }] =
      await Promise.all([
        supabase.from("hr_candidates").select("*").eq("id", app.candidate_id).maybeSingle(),
        supabase.from("hr_jobs").select("*").eq("id", app.job_id).maybeSingle(),
      ]);

    if (candidateError) throw candidateError;
    if (jobError) throw jobError;
    if (!candidate) throw new Error("Candidato não encontrado.");
    if (!candidate.email) throw new Error("Candidato sem e-mail cadastrado.");

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || 465);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Consulmax RH";
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || smtpUser;
    const publicAreaUrl =
      Deno.env.get("PUBLIC_AREA_URL") ||
      "https://crm.consulmaxconsorcios.com.br/area-candidato";

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      throw new Error("Secrets de SMTP incompletos. Verifique SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL.");
    }

    const subject = `Atualização da sua candidatura | ${job?.title || "Consulmax"}`;
    const html = buildHtmlEmail({
      candidateName: candidate.nome,
      jobTitle: job?.title,
      stage: app.status,
      parecer: app.parecer_candidato,
      publicAreaUrl,
    });

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
      from: `"${fromName}" <${fromEmail}>`,
      to: candidate.email,
      subject,
      html,
    });

    if (historyId) {
      await supabase
        .from("hr_application_history")
        .update({ email_sent_at: new Date().toISOString(), email_error: null })
        .eq("id", historyId);
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar e-mail.";
    console.error("[send-candidate-update-email]", message, err);

    try {
      if (historyId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceRoleKey) {
          const supabase = createClient(supabaseUrl, serviceRoleKey);
          await supabase
            .from("hr_application_history")
            .update({ email_error: message })
            .eq("id", historyId);
        }
      }
    } catch (logErr) {
      console.error("[send-candidate-update-email] Falha ao registrar erro:", logErr);
    }

    return json({ error: message }, 500);
  }
});
