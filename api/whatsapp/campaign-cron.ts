import type { VercelRequest, VercelResponse } from "@vercel/node";

function deploymentBaseUrl() {
  const explicit =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "crm.consulmaxconsorcios.com.br";

  return explicit.startsWith("http://") || explicit.startsWith("https://")
    ? explicit
    : `https://${explicit}`;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const response = await fetch(`${deploymentBaseUrl()}/api/whatsapp/campaign-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await readJson(response);
    return res.status(response.ok ? 200 : response.status).json(data || { ok: response.ok });
  } catch (error: any) {
    console.error("WHATSAPP_CAMPAIGN_CRON_BRIDGE_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao acionar o runner de campanhas.",
    });
  }
}
