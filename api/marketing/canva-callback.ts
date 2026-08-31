import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  APP_BASE_URL,
  CANVA_API,
  canvaConfig,
  consumeCanvaOauthState,
  exchangeCanvaCode,
  upsertCanvaConnection,
} from "./_canva.js";

function redirect(res: VercelResponse, params: Record<string, string>) {
  const url = new URL(`${APP_BASE_URL}/marketing/conteudo`);
  url.searchParams.set("tab", "producao");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  res.statusCode = 302;
  res.setHeader("Location", url.toString());
  res.end();
}

async function canvaGet(path: string, token: string) {
  const response = await fetch(`${CANVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `Canva API HTTP ${response.status}`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return payload;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const denied = String(req.query?.error || "");
  if (denied) return redirect(res, { canva: "error", reason: denied });
  if (!code || !state) return redirect(res, { canva: "error", reason: "missing_code_or_state" });

  try {
    const config = canvaConfig();
    if (!config.configured) throw new Error(`Canva não configurado: ${config.missing.join(", ")}`);
    const oauth = await consumeCanvaOauthState(state);
    if (!oauth?.code_verifier) throw new Error("Estado OAuth do Canva inválido ou expirado.");

    const token = await exchangeCanvaCode(code, oauth.code_verifier);
    const accessToken = String(token?.access_token || "");
    if (!accessToken) throw new Error("O Canva não retornou access token.");

    const [me, profile, capabilities] = await Promise.all([
      canvaGet("/users/me", accessToken),
      canvaGet("/users/me/profile", accessToken).catch(() => null),
      canvaGet("/users/me/capabilities", accessToken).catch(() => null),
    ]);
    const canvaUserId = String(me?.team_user?.user_id || "");
    const canvaTeamId = String(me?.team_user?.team_id || "");
    if (!canvaUserId || !canvaTeamId) throw new Error("O Canva não retornou User ID e Team ID da conta conectada.");

    const grantedScopes = typeof token?.scope === "string"
      ? token.scope.split(/[\s,]+/).filter(Boolean)
      : oauth.requested_scopes || config.scopes;

    await upsertCanvaConnection({
      authUserId: oauth.user_id,
      canvaUserId,
      canvaTeamId,
      displayName: profile?.profile?.display_name || "Canva",
      scopes: grantedScopes,
      accessToken,
      refreshToken: token?.refresh_token || null,
      expiresIn: token?.expires_in || null,
      capabilities: capabilities?.capabilities || capabilities || {},
      providerPayload: { token_type: token?.token_type, scope: token?.scope || null },
    });

    return redirect(res, { canva: "connected" });
  } catch (error: any) {
    console.error("[canva-callback]", error?.data || error);
    return redirect(res, { canva: "error", reason: String(error?.message || "oauth_failed").slice(0, 180) });
  }
}