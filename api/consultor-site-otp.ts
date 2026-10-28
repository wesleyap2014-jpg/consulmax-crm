import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { isIP } from "node:net";
import { supabaseAdmin } from "./_supabase";

const TEMPLATE_NAME = "verificacao_cadastro_consulmax";
const SLUG = /^[a-z0-9][a-z0-9-]{2,59}$/;

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v || "").trim();
}

function normalizedPhone(v: unknown): string | null {
  let s = String(v || "").replace(/\D/g, "");
  if ((s.length === 12 || s.length === 13) && s.startsWith("55")) s = s.slice(2);
  if (!/^\d{10,11}$/.test(s) || (s.length === 11 && s[2] !== "9") ||
      new Set(s).size === 1 || Number(s.slice(0, 2)) < 11) return null;
  return "55" + s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }
  if (!String(req.headers["content-type"] || "").includes("application/json"))
    return res.status(415).json({ error: "Envie dados em JSON." });
  const slug = first(req.query.slug).toLowerCase();
  if (!SLUG.test(slug)) return res.status(404).json({ error: "Página indisponível." });
  if (String(req.body?.website || "").trim())
    return res.status(422).json({ error: "Não foi possível verificar a solicitação." });
  const phone = normalizedPhone(req.body?.telefone);
  if (!phone) return res.status(400).json({ error: "Informe um WhatsApp brasileiro válido." });

  const rawIp = first(req.headers["x-vercel-forwarded-for"]) || first(req.headers["x-forwarded-for"]);
  const candidate = rawIp.split(",")[0].trim();
  const ip = isIP(candidate) ? candidate : null;
  const salt = randomBytes(16).toString("hex");
  const code = String(randomInt(100000, 1000000));
  const hash = createHash("sha256").update(salt + ":" + code).digest("hex");
  let challengeId: string | null = null;

  try {
    const { data, error } = await supabaseAdmin.rpc("reserve_consultor_site_otp", {
      p_phone: phone, p_ip: ip, p_salt: salt, p_hash: hash, p_slug: slug,
    });
    if (error) {
      if (error.code === "P0001") return res.status(429).json({ error: error.message });
      if (error.code === "22023") return res.status(400).json({ error: "Página ou WhatsApp inválido." });
      throw error;
    }
    if (typeof data !== "string") throw new Error("Não foi possível iniciar a verificação.");
    challengeId = data;
    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) throw new Error("WhatsApp não configurado.");
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: phone, type: "template",
        template: {
          name: TEMPLATE_NAME, language: { code: "pt_BR" },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0",
              parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    const messageId = result?.messages?.[0]?.id;
    if (!response.ok || typeof messageId !== "string") {
      console.error("[consultor-site-otp] Meta recusou envio", { status: response.status, code: result?.error?.code });
      throw new Error("A Meta não aceitou o envio do código.");
    }
    const { error: markError } = await supabaseAdmin.from("consultor_site_otp_challenges")
      .update({ sent_at: new Date().toISOString(), meta_message_id: messageId })
      .eq("id", challengeId).is("invalidated_at", null);
    if (markError) throw markError;
    return res.status(200).json({ challengeId, expiresInSeconds: 300, retryAfterSeconds: 60 });
  } catch (error) {
    if (challengeId) {
      await supabaseAdmin.from("consultor_site_otp_challenges")
        .update({ invalidated_at: new Date().toISOString() })
        .eq("id", challengeId).is("used_at", null).then(() => {}, () => {});
    }
    console.error("[consultor-site-otp] erro", { type: error instanceof Error ? error.name : "unknown" });
    return res.status(503).json({ error: "Não conseguimos enviar o código agora. Tente novamente mais tarde." });
  }
}
