import type { VercelRequest, VercelResponse } from "@vercel/node";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const DEFAULT_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

async function readJson(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function normalizeAction(value?: string | null) {
  const action = String(value || "").trim().toLowerCase();

  if (["accept", "answer", "atender"].includes(action)) return "accept";
  if (["reject", "decline", "recusar"].includes(action)) return "reject";
  if (["terminate", "end", "hangup", "encerrar"].includes(action)) return "terminate";

  return action;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!META_TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing META_WHATSAPP_TOKEN" });
    }

    const body = req.body || {};
    const phoneNumberId = String(body.phone_number_id || DEFAULT_PHONE_NUMBER_ID || "");
    const callId = String(body.call_id || body.id || "").trim();
    const action = normalizeAction(body.action);
    const sdp = typeof body.sdp === "string" ? body.sdp : body.session?.sdp;

    if (!phoneNumberId) {
      return res.status(400).json({ ok: false, error: "Missing phone_number_id" });
    }

    if (!callId) {
      return res.status(400).json({ ok: false, error: "Missing call_id" });
    }

    if (!action || !["accept", "reject", "terminate"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Invalid action", valid_actions: ["accept", "reject", "terminate"] });
    }

    if (action === "accept" && !sdp) {
      return res.status(400).json({ ok: false, error: "Missing SDP answer for accept action" });
    }

    const payload: Record<string, any> = {
      messaging_product: "whatsapp",
      call_id: callId,
      action,
    };

    if (action === "accept") {
      payload.session = {
        sdp_type: "answer",
        sdp,
      };
    }

    const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJson(response);

    if (!response.ok) {
      console.error("WHATSAPP_CALL_ACTION_ERROR", {
        status: response.status,
        action,
        callId,
        phoneNumberId: onlyDigits(phoneNumberId),
        data,
      });
    }

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      action,
      call_id: callId,
      data,
    });
  } catch (error: any) {
    console.error("WHATSAPP_CALL_ACTION_EXCEPTION", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao processar ação da chamada.",
    });
  }
}
