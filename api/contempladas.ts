import type { VercelRequest, VercelResponse } from "@vercel/node";

const EXTERNAL_STOCK_URL =
  "https://fragaebitelloconsorcios.com.br/api/json/contemplados";

function disableCache(res: VercelResponse) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  disableCache(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const sourceUrl = new URL(EXTERNAL_STOCK_URL);

    // Evita que o portal, proxies intermediários ou a CDN devolvam um retrato antigo.
    sourceUrl.searchParams.set("_crm_refresh", Date.now().toString());

    const upstream = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
        "User-Agent": "Consulmax-CRM/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const raw = await upstream.text();

    if (!upstream.ok) {
      console.error("[contempladas] Falha no portal externo", {
        status: upstream.status,
        statusText: upstream.statusText,
        body: raw.slice(0, 500),
      });

      return res.status(502).json({
        error: `O portal externo respondeu com HTTP ${upstream.status}.`,
      });
    }

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      console.error(
        "[contempladas] Resposta inválida do portal externo:",
        raw.slice(0, 500)
      );

      return res.status(502).json({
        error: "O portal externo não retornou um JSON válido.",
      });
    }

    if (!Array.isArray(payload)) {
      console.error("[contempladas] Formato inesperado do portal externo");
      return res.status(502).json({
        error: "O portal externo não retornou uma lista de cartas.",
      });
    }

    res.setHeader("X-Consulmax-Stock-Fetched-At", new Date().toISOString());
    res.setHeader("X-Consulmax-Stock-Count", String(payload.length));

    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[contempladas] Erro ao atualizar estoque:", message);

    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return res.status(502).json({
      error: timedOut
        ? "O portal externo demorou demais para responder."
        : "Não foi possível atualizar o estoque do portal.",
    });
  }
}
