import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { isIP } from "node:net";
import { supabaseAdmin } from "./_supabase";

const TEMPLATE_NAME = "verificacao_cadastro_consulmax";
const GRAPH_VERSION = "v21.0";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value || "").trim();
}

function validPhone(value: unknown): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{10,11}$/.test(digits)) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  if (new Set(digits).size === 1) return null;
  return "55" + digits;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    return res.status(415).json({ error: "Envie os dados em JSON." });
  }
  if (String(req.body?.website || "").trim()) {
    return res.status(422).json({ error: "Não foi possível validar a solicitação." });
  }

  const phone = validPhone(req.body?.telefone);
  if (!phone) return res.status(400).json({ error: "Informe um WhatsApp válido." });

  const rawIp = first(req.headers["x-vercel-forwarded-for"]) ||
    first(req.headers["x-forwarded-for"]);
  const ipCandidate = rawIp.split(",")[0].trim();
  const ip = isIP(ipCandidate) ? ipCandidate : null;
  const code = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + ":" + code).digest("hex");
  let challengeId: string | null = null;

  try {
    const { data, error } = await supabaseAdmin.rpc("reserve_public_simulator_otp", {
      p_phone: phone,
      p_ip: ip,
      p_salt: salt,
      p_hash: hash,
    });
    if (error) {
      if (error.code === "P0001") {
        return res.status(429).json({ error: error.message });
      }
      throw error;
    }
    if (typeof data !== "string") throw new Error("Não foi possível criar a verificação.");
    challengeId = data;

    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) throw new Error("Integração WhatsApp não configurada.");

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: TEMPLATE_NAME,
            language: { code: "pt_BR" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }],
              },
            ],
          },
        }),
      },
    );
    const result = await response.json().catch(() => ({}));
    const messageId = result?.messages?.[0]?.id;
    if (!response.ok || typeof messageId !== "string") {
      console.error("[public-simulator-otp] envio recusado", {
        status: response.status,
        metaCode: result?.error?.code,
      });
      throw new Error("Meta recusou o envio do código.");
    }
    const { error: updateError } = await supabaseAdmin
      .from("public_simulator_otp_challenges")
      .update({ sent_at: new Date().toISOString(), meta_message_id: messageId })
      .eq("id", challengeId)
      .is("invalidated_at", null);
    if (updateError) throw updateError;

    return res.status(200).json({
      challengeId,
      expiresInSeconds: 300,
      retryAfterSeconds: 60,
    });
  } catch (error) {
    if (challengeId) {
      await supabaseAdmin.from("public_simulator_otp_challenges")
        .update({ invalidated_at: new Date().toISOString() }).eq("id", challengeId)
        .is("used_at", null).then(() => {}, () => {});
    }
    console.error("[public-simulator-otp] erro ao solicitar verificação", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return res.status(503).json({
      error: "Não conseguimos enviar o código agora. Tente novamente mais tarde.",
    });
  }
}
