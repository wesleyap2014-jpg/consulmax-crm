import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  canvaAuthorizationUrl,
  canvaConfig,
  canvaStatusPayload,
  cleanupCanvaOauthStates,
  createCanvaOauthState,
  json,
  requireAdmin,
  supabaseAdmin,
} from "./_canva.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === "GET") {
    try {
      return json(res, 200, { ok: true, ...(await canvaStatusPayload()) });
    } catch (error: any) {
      console.error("[canva-connect:get]", error?.data || error);
      return json(res, Number(error?.status || 500), {
        ok: false,
        message: error?.message || "Não foi possível carregar a conexão do Canva.",
      });
    }
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const action = String(req.body?.action || "connect").toLowerCase();

  try {
    if (action === "disconnect") {
      const { data: connection, error } = await supabaseAdmin
        .from("marketing_design_connections")
        .select("id")
        .eq("provider", "canva")
        .neq("status", "disconnected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (connection?.id) {
        await supabaseAdmin.from("marketing_design_credentials").delete().eq("design_connection_id", connection.id);
        await supabaseAdmin
          .from("marketing_design_connections")
          .update({ status: "disconnected", token_expires_at: null, updated_at: new Date().toISOString() })
          .eq("id", connection.id);
      }
      return json(res, 200, { ok: true, disconnected: true });
    }

    const config = canvaConfig();
    if (!config.configured) {
      return json(res, 409, {
        ok: false,
        code: "canva_not_configured",
        configured: false,
        missing: config.missing,
        callback_url: config.callbackUrl,
        message: "A integração Canva Connect ainda não possui Client ID e Client Secret configurados no backend.",
      });
    }

    await cleanupCanvaOauthStates();
    const pkce = await createCanvaOauthState(user.id);
    return json(res, 200, {
      ok: true,
      auth_url: canvaAuthorizationUrl(pkce),
      callback_url: config.callbackUrl,
      scopes: config.scopes,
    });
  } catch (error: any) {
    console.error("[canva-connect:post]", error?.data || error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      message: error?.message || "Não foi possível iniciar a conexão com o Canva.",
    });
  }
}