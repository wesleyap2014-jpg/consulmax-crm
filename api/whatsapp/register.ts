import type { VercelRequest, VercelResponse } from "@vercel/node";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";

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

function normalizePin(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function validatePin(pin: string) {
  return /^\d{6}$/.test(pin);
}

async function graphRequest(params: {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: Record<string, any>;
}) {
  const { method, path, body } = params;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\/+/, "")}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
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

    const action = (getParam(req, "action") || "status").toLowerCase();
    const pin = normalizePin(getParam(req, "pin"));

    if (action === "status") {
      const result = await graphRequest({
        method: "GET",
        path:
          `${phoneNumberId}` +
          `?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`,
      });

      return res.status(result.ok ? 200 : result.status).json({
        ok: result.ok,
        action,
        phone_number_id: phoneNumberId,
        data: result.data,
      });
    }

    if (action === "set_pin") {
      if (!validatePin(pin)) {
        return res.status(400).json({
          ok: false,
          action,
          error: "PIN inválido. Envie exatamente 6 dígitos.",
        });
      }

      const result = await graphRequest({
        method: "POST",
        path: phoneNumberId,
        body: { pin },
      });

      return res.status(result.ok ? 200 : result.status).json({
        ok: result.ok,
        action,
        phone_number_id: phoneNumberId,
        used_pin: maskPin(pin),
        data: result.data,
        next_step: result.ok
          ? "Agora rode action=register com o mesmo PIN."
          : "Se retornar account is not registered, tente action=register com o PIN ou solicite reset à Meta.",
        warning:
          "Rota temporária. Remova api/whatsapp/register.ts depois do teste.",
      });
    }

    if (action === "register") {
      const body: Record<string, string> = {
        messaging_product: "whatsapp",
      };

      if (pin) {
        if (!validatePin(pin)) {
          return res.status(400).json({
            ok: false,
            action,
            error: "PIN inválido. Envie exatamente 6 dígitos.",
          });
        }

        body.pin = pin;
      }

      const result = await graphRequest({
        method: "POST",
        path: `${phoneNumberId}/register`,
        body,
      });

      return res.status(result.ok ? 200 : result.status).json({
        ok: result.ok,
        action,
        phone_number_id: phoneNumberId,
        used_pin: maskPin(pin),
        data: result.data,
        next_step: result.ok
          ? "Número registrado. Teste o envio pelo CRM."
          : "Se pedir PIN ou acusar mismatch, o PIN antigo ainda está preso na Meta.",
        warning:
          "Rota temporária. Remova api/whatsapp/register.ts depois do teste.",
      });
    }

    if (action === "set_pin_register") {
      if (!validatePin(pin)) {
        return res.status(400).json({
          ok: false,
          action,
          error: "PIN inválido. Envie exatamente 6 dígitos.",
        });
      }

      const setPinResult = await graphRequest({
        method: "POST",
        path: phoneNumberId,
        body: { pin },
      });

      const registerResult = await graphRequest({
        method: "POST",
        path: `${phoneNumberId}/register`,
        body: {
          messaging_product: "whatsapp",
          pin,
        },
      });

      const finalOk = setPinResult.ok && registerResult.ok;

      return res.status(finalOk ? 200 : 207).json({
        ok: finalOk,
        action,
        phone_number_id: phoneNumberId,
        used_pin: maskPin(pin),
        set_pin: {
          ok: setPinResult.ok,
          status: setPinResult.status,
          data: setPinResult.data,
        },
        register: {
          ok: registerResult.ok,
          status: registerResult.status,
          data: registerResult.data,
        },
        interpretation:
          setPinResult.ok && registerResult.ok
            ? "PIN criado/alterado e número registrado com sucesso."
            : "Uma das etapas falhou. Veja set_pin e register separadamente.",
        warning:
          "Rota temporária. Remova api/whatsapp/register.ts depois do teste.",
      });
    }

    return res.status(400).json({
      ok: false,
      error: "Ação inválida.",
      valid_actions: ["status", "set_pin", "register", "set_pin_register"],
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unexpected error",
    });
  }
}
