// /api/whatsapp/subscribe.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const META_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const WABA_ID = process.env.META_WHATSAPP_WABA_ID || "738926192556410";
const SUBSCRIBE_KEY = process.env.WHATSAPP_SUBSCRIBE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const key = String(req.query.key || req.body?.key || "");

    if (!SUBSCRIBE_KEY || key !== SUBSCRIBE_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Não autorizado.",
      });
    }

    if (!META_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "META_WHATSAPP_TOKEN não configurado no Vercel.",
      });
    }

    const url = `https://graph.facebook.com/v25.0/${WABA_ID}/subscribed_apps`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("META_SUBSCRIBE_ERROR", data);

      return res.status(response.status).json({
        ok: false,
        waba_id: WABA_ID,
        error: data,
      });
    }

    return res.status(200).json({
      ok: true,
      waba_id: WABA_ID,
      data,
    });
  } catch (error: any) {
    console.error("WHATSAPP_SUBSCRIBE_ERROR", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao inscrever app na WABA.",
    });
  }
}
