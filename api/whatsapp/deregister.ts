import type { VercelRequest, VercelResponse } from "@vercel/node";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID =
  process.env.META_WHATSAPP_PHONE_NUMBER_ID || "1119396254593409";
const DEREGISTER_KEY = process.env.WHATSAPP_DEREGISTER_KEY || "";

async function readJson(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = String(req.query.key || "");

  if (!DEREGISTER_KEY || key !== DEREGISTER_KEY) {
    return res.status(403).json({
      ok: false,
      error: "Chave de segurança inválida.",
    });
  }

  if (!META_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "META_WHATSAPP_TOKEN não configurado na Vercel.",
    });
  }

  if (!PHONE_NUMBER_ID) {
    return res.status(500).json({
      ok: false,
      error: "META_WHATSAPP_PHONE_NUMBER_ID não configurado na Vercel.",
    });
  }

  try {
    const response = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/deregister`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
      },
    });

    const data = await readJson(response);

    if (!response.ok) {
      console.error("WHATSAPP_DEREGISTER_ERROR", data);

      return res.status(response.status).json({
        ok: false,
        phone_number_id: PHONE_NUMBER_ID,
        status: response.status,
        error: data,
      });
    }

    return res.status(200).json({
      ok: true,
      phone_number_id: PHONE_NUMBER_ID,
      data,
      warning:
        "Número desregistrado. Remova esta rota temporária api/whatsapp/deregister.ts imediatamente.",
    });
  } catch (error: any) {
    console.error("WHATSAPP_DEREGISTER_EXCEPTION", error);

    return res.status(500).json({
      ok: false,
      phone_number_id: PHONE_NUMBER_ID,
      error: error?.message || "Erro ao desregistrar número.",
    });
  }
}
