import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  META_GRAPH_VERSION,
  callbackUrl,
  createOauthState,
  fetchJson,
  json,
  providerConfig,
  requireAdmin,
  saveSocialAccount,
  type SocialProvider,
} from "./_social";

const PROVIDERS: SocialProvider[] = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "whatsapp"];

function isProvider(value: any): value is SocialProvider {
  return PROVIDERS.includes(String(value) as SocialProvider);
}

function authorizationUrl(provider: SocialProvider, state: string) {
  const config = providerConfig(provider);
  const redirectUri = callbackUrl();
  const url = new URL(config.authUrl);

  if (provider === "instagram" || provider === "facebook") {
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", config.scopes.join(","));
    return url.toString();
  }

  if (provider === "tiktok") {
    url.searchParams.set("client_key", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", config.scopes.join(","));
    url.searchParams.set("disable_auto_auth", "1");
    return url.toString();
  }

  if (provider === "linkedin") {
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", config.scopes.join(" "));
    return url.toString();
  }

  if (provider === "youtube") {
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent select_account");
    return url.toString();
  }

  throw new Error("Provedor não usa redirecionamento OAuth nesta rota.");
}

async function connectWhatsApp(userId: string) {
  const token = process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN || "";
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API ainda não possui token e Phone Number ID configurados no backend.");
  }

  const phone = await fetchJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const wabaId =
    phone?.whatsapp_business_account?.id ||
    process.env.META_WHATSAPP_WABA_ID ||
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ||
    process.env.META_WABA_ID ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    null;

  return saveSocialAccount({
    provider: "whatsapp",
    providerAccountId: String(phone?.id || phoneNumberId),
    username: phone?.display_phone_number || null,
    displayName: phone?.verified_name || "WhatsApp Business",
    accountType: "business",
    editorialRole: "Canal direto / relacionamento",
    scopes: ["messages", "templates", "analytics"],
    accessToken: token,
    connectedBy: userId,
    metadata: { waba_id: wabaId, phone_number_id: phoneNumberId },
    providerPayload: { phone_number_id: phoneNumberId, waba_id: wabaId },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const providers = PROVIDERS.map((provider) => {
      const config = providerConfig(provider);
      return {
        provider,
        configured: config.configured,
        missing: config.missing,
        scopes: config.scopes,
        callback_url: provider === "whatsapp" ? null : callbackUrl(),
      };
    });
    return json(res, 200, { ok: true, providers });
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });

  const provider = String(req.body?.provider || "").toLowerCase();
  if (!isProvider(provider)) return json(res, 400, { ok: false, message: "Rede social inválida." });

  try {
    const config = providerConfig(provider);
    if (!config.configured) {
      return json(res, 409, {
        ok: false,
        code: "provider_not_configured",
        provider,
        missing: config.missing,
        callback_url: provider === "whatsapp" ? null : callbackUrl(),
        message: `${provider}: faltam as credenciais do aplicativo oficial no backend.`,
      });
    }

    if (provider === "whatsapp") {
      const account = await connectWhatsApp(user.id);
      return json(res, 200, { ok: true, connected: true, provider, account });
    }

    await supabaseCleanup();
    const state = await createOauthState(provider, user.id, config.scopes);
    const authUrl = authorizationUrl(provider, state);
    return json(res, 200, {
      ok: true,
      provider,
      auth_url: authUrl,
      callback_url: callbackUrl(),
      scopes: config.scopes,
    });
  } catch (error: any) {
    console.error("[social-connect]", provider, error?.data || error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      provider,
      message: error?.data?.error?.message || error?.message || "Não foi possível iniciar a conexão social.",
    });
  }
}

async function supabaseCleanup() {
  const { supabaseAdmin } = await import("./_social");
  await supabaseAdmin
    .from("marketing_social_oauth_states")
    .delete()
    .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
}
