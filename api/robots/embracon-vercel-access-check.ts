import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 30 };

const PORTAL_URL = "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/";

function previewText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const response = await fetch(PORTAL_URL, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "upgrade-insecure-requests": "1",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const body = await response.text();
    const preview = previewText(body);
    const accessDenied = /access denied|acesso negado|request rejected|forbidden|not authorized/i.test(preview);
    const loginDetected = /convert\+|entrar|login|senha|password/i.test(preview);

    return res.status(200).json({
      ok: response.ok && !accessDenied,
      source: "vercel_function",
      httpStatus: response.status,
      finalUrl: response.url,
      accessDenied,
      loginDetected,
      bodyPreview: preview,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      source: "vercel_function",
      state: "request_error",
      error: String((error as Error)?.message || error).replace(/\s+/g, " ").trim().slice(0, 500),
      checkedAt: new Date().toISOString(),
    });
  }
}
