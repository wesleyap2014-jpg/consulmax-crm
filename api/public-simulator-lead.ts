import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIP } from "node:net";
import { supabaseAdmin } from "./_supabase";

/**
 * Entrada única do simulador público. O IP e a geolocalização são obtidos
 * exclusivamente dos cabeçalhos normalizados pelo proxy da Vercel.
 * Nunca aceitar IP/cidade enviados no corpo da requisição.
 */
const CRM_OWNER_AUTH_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";
const ALLOWED_SEGMENTS = new Set([
  "Automóvel", "Motocicleta", "Imóvel", "Serviços", "Pesados", "Imóvel Estendido",
]);

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value || "").trim();
}

function decoded(value: string, maxLength: number): string | null {
  try {
    return (decodeURIComponent(value).trim() || "").slice(0, maxLength) || null;
  } catch {
    return value.trim().slice(0, maxLength) || null;
  }
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

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  // Campo isca, sem qualquer implicação para usuários reais.
  if (String(body.website || "").trim()) {
    return res.status(422).json({ error: "Não foi possível validar o cadastro." });
  }
  const nome = String(body.nome || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const telefone = String(body.telefone || "").replace(/\D/g, "");
  const segmento = String(body.segmento || "").trim();
  if (
    nome.length < 3 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    email.endsWith("@example.com") || email.endsWith("@exemplo.com") ||
    !/^\d{10,11}$/.test(telefone) ||
    (telefone.length === 11 && telefone[2] !== "9") ||
    !ALLOWED_SEGMENTS.has(segmento)
  ) {
    return res.status(400).json({ error: "Confira o nome, e-mail, WhatsApp e segmento." });
  }

  // Em produção a Vercel sobrescreve esses cabeçalhos para evitar spoofing.
  // Não usamos IP/geo fornecidos pelo JavaScript do visitante.
  const rawIp = first(req.headers["x-vercel-forwarded-for"]) ||
    first(req.headers["x-forwarded-for"]);
  const candidateIp = rawIp.split(",")[0].trim();
  const ip = isIP(candidateIp) ? candidateIp : null;
  const city = decoded(first(req.headers["x-vercel-ip-city"]), 120);
  const region = first(req.headers["x-vercel-ip-country-region"]).slice(0, 8) || null;
  const country = first(req.headers["x-vercel-ip-country"]).slice(0, 2) || null;
  const userAgent = first(req.headers["user-agent"]).slice(0, 400) || null;

  try {
    // Limite simples por IP. O banco mantém as gravações de forma transacional.
    if (ip) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabaseAdmin
        .from("public_simulator_access_logs")
        .select("opportunity_id", { count: "exact", head: true })
        .eq("ip_address", ip)
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 8) {
        return res.status(429).json({ error: "Muitas solicitações deste acesso. Tente novamente mais tarde." });
      }
    }

    const { data: opportunityId, error } = await supabaseAdmin.rpc(
      "public_create_opportunity_logged",
      {
        p_nome: nome,
        p_email: email,
        p_telefone: telefone,
        p_segmento: segmento,
        p_vendedor_auth_id: CRM_OWNER_AUTH_ID,
        p_owner_auth_id: CRM_OWNER_AUTH_ID,
        p_ip_address: ip,
        p_city: city,
        p_region_code: region,
        p_country_code: country,
        p_user_agent: userAgent,
      },
    );
    if (error) throw error;
    if (typeof opportunityId !== "string") throw new Error("ID da oportunidade não retornado.");
    return res.status(200).json({ opportunityId });
  } catch (error) {
    console.error("[public-simulator-lead] Falha no pré-cadastro seguro", error);
    return res.status(503).json({ error: "Não foi possível registrar o pré-cadastro. Tente novamente." });
  }
}
