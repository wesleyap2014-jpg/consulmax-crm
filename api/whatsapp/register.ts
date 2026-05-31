import type { VercelRequest, VercelResponse } from "@vercel/node";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";

// Pode criar WHATSAPP_REGISTER_KEY na Vercel.
// Se não criar, ele usa a mesma WHATSAPP_DEREGISTER_KEY que você já tinha.
const REGISTER_KEY =
  process.env.WHATSAPP_REGISTER_KEY ||
  process.env.WHATSAPP_DEREGISTER_KEY ||
  "";

function getParam(req: VercelRequest, name: string) {
  const fromQuery = req.query?.[name];
  if (Array.isArray(fromQuery)) return fromQuery[0] || "";
  if (fromQuery) return String(fromQuery);

  const fromBody = (req.body || {})?.[name];
  return fromBody == null ? "" : String(fromBody);
}

async function readJson(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function maskPin(pin: string) {
  if (!pin) return null;
  return `${pin.slice(0, 1)}****${pin.slice(-1)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!["GET", "POST"].includes(req.method || "")) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const key = getParam(req, "key");

    if (!REGISTER_KEY || key !== REGISTER_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    if (!META_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "Missing META_WHATSAPP_TOKEN",
      });
    }

    const phoneNumberId =
      getParam(req, "phone_number_id") || DEFAULT_PHONE_NUMBER_ID;

    if (!phoneNumberId) {
      return res.status(400).json({
        ok: false,
        error: "Missing META_WHATSAPP_PHONE_NUMBER_ID or phone_number_id",
      });
    }

    const action = (getParam(req, "action") || "register").toLowerCase();

    // Teste opcional: ver status do número
    if (action === "status") {
      const statusUrl =
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}` +
        `?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`;

      const response = await fetch(statusUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
        },
      });

      const data = await readJson(response);

      return res.status(response.ok ? 200 : response.status).json({
        ok: response.ok,
        action: "status",
        phone_number_id: phoneNumberId,
        data,
      });
    }

    const pin = getParam(req, "pin").replace(/\D/g, "");

    const body: Record<string, string> = {
      messaging_product: "whatsapp",
    };

    if (pin) {
      body.pin = pin;
    }

    const registerUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/register`;

    const response = await fetch(registerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await readJson(response);

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      action: "register",
      phone_number_id: phoneNumberId,
      used_pin: maskPin(pin),
      data,
      warning:
        "Rota temporária. Remova api/whatsapp/register.ts depois do teste.",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unexpected error",
    });
  }
}
