import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  META_GRAPH_VERSION,
  addSeconds,
  callbackUrl,
  consumeOauthState,
  fetchJson,
  parseGrantedScopes,
  providerConfig,
  readJson,
  returnUrl,
  saveSocialAccount,
  type SocialProvider,
} from "./_social";

function redirect(res: VercelResponse, params: Record<string, string | number | null | undefined>) {
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", returnUrl(params));
  res.end();
}

async function exchangeMeta(code: string, provider: SocialProvider, userId: string, fallbackScopes: string[]) {
  const config = providerConfig(provider);
  const shortUrl = new URL(config.tokenUrl);
  shortUrl.searchParams.set("client_id", config.clientId);
  shortUrl.searchParams.set("client_secret", config.clientSecret);
  shortUrl.searchParams.set("redirect_uri", callbackUrl());
  shortUrl.searchParams.set("code", code);
  const shortToken = await fetchJson(shortUrl.toString());

  let accessToken = String(shortToken?.access_token || "");
  let expiresIn = Number(shortToken?.expires_in || 0);
  if (!accessToken) throw new Error("A Meta não retornou access token.");

  try {
    const longUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", config.clientId);
    longUrl.searchParams.set("client_secret", config.clientSecret);
    longUrl.searchParams.set("fb_exchange_token", accessToken);
    const longToken = await fetchJson(longUrl.toString());
    if (longToken?.access_token) accessToken = String(longToken.access_token);
    if (longToken?.expires_in) expiresIn = Number(longToken.expires_in);
  } catch (error) {
    console.warn("[social-callback] Meta long-lived token indisponível; usando token inicial.", error);
  }

  let scopes = fallbackScopes;
  try {
    const permissions = await fetchJson(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const granted = (permissions?.data || []).filter((item: any) => item?.status === "granted").map((item: any) => String(item.permission));
    if (granted.length) scopes = granted;
  } catch (error) {
    console.warn("[social-callback] Não foi possível ler permissões Meta.", error);
  }

  const pages = await fetchJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?limit=100&fields=id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const saved: any[] = [];
  for (const page of pages?.data || []) {
    const pageToken = String(page?.access_token || accessToken);
    if (provider === "facebook") {
      saved.push(await saveSocialAccount({
        provider: "facebook",
        providerAccountId: String(page.id),
        username: page.name || null,
        displayName: page.name || "Página do Facebook",
        accountType: "page",
        avatarUrl: page?.picture?.data?.url || null,
        editorialRole: "Marca / Página",
        scopes,
        accessToken: pageToken,
        expiresAt: addSeconds(expiresIn),
        connectedBy: userId,
        metadata: { page_id: page.id, meta_user_token_expires_in: expiresIn || null },
        providerPayload: { page_id: page.id },
      }));
      continue;
    }

    const ig = page?.instagram_business_account;
    if (!ig?.id) continue;
    saved.push(await saveSocialAccount({
      provider: "instagram",
      providerAccountId: String(ig.id),
      username: ig.username || null,
      displayName: ig.name || ig.username || "Instagram profissional",
      accountType: "professional",
      avatarUrl: ig.profile_picture_url || null,
      editorialRole: "Marca / Autoridade",
      scopes,
      accessToken: pageToken,
      expiresAt: addSeconds(expiresIn),
      connectedBy: userId,
      metadata: { linked_page_id: page.id, linked_page_name: page.name || null },
      providerPayload: { instagram_user_id: ig.id, page_id: page.id },
    }));
  }

  if (!saved.length) {
    throw new Error(provider === "instagram"
      ? "Nenhuma conta profissional do Instagram vinculada às páginas autorizadas foi encontrada."
      : "Nenhuma Página do Facebook autorizada foi encontrada.");
  }
  return saved;
}

async function exchangeTikTok(code: string, userId: string, fallbackScopes: string[]) {
  const config = providerConfig("tiktok");
  const body = new URLSearchParams({
    client_key: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl(),
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson(response);
  if (!response.ok) throw Object.assign(new Error(token?.error_description || token?.error || "Falha ao trocar código TikTok."), { status: response.status, data: token });

  const accessToken = String(token?.access_token || "");
  if (!accessToken) throw new Error("TikTok não retornou access token.");
  const scopes = parseGrantedScopes(token?.scope, fallbackScopes);
  const basicFields = ["open_id", "union_id", "avatar_url", "display_name"];
  const profileFields = scopes.includes("user.info.profile") ? ["username", "profile_deep_link", "bio_description", "is_verified"] : [];
  const profile = await fetchJson(`https://open.tiktokapis.com/v2/user/info/?fields=${[...basicFields, ...profileFields].join(",")}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = profile?.data?.user || {};
  const openId = String(user?.open_id || token?.open_id || "");
  if (!openId) throw new Error("TikTok não retornou o identificador da conta.");

  return [await saveSocialAccount({
    provider: "tiktok",
    providerAccountId: openId,
    username: user?.username || null,
    displayName: user?.display_name || user?.username || "TikTok",
    accountType: "creator",
    avatarUrl: user?.avatar_url || null,
    editorialRole: "Conteúdo curto / descoberta",
    scopes,
    accessToken,
    refreshToken: token?.refresh_token || null,
    expiresAt: addSeconds(token?.expires_in),
    connectedBy: userId,
    metadata: {
      union_id: user?.union_id || null,
      profile_deep_link: user?.profile_deep_link || null,
      refresh_expires_in: token?.refresh_expires_in || null,
    },
    providerPayload: { open_id: openId },
  })];
}

async function exchangeLinkedIn(code: string, userId: string, fallbackScopes: string[]) {
  const config = providerConfig("linkedin");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(),
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson(response);
  if (!response.ok) throw Object.assign(new Error(token?.error_description || token?.error || "Falha ao trocar código LinkedIn."), { status: response.status, data: token });
  const accessToken = String(token?.access_token || "");
  if (!accessToken) throw new Error("LinkedIn não retornou access token.");

  const profile = await fetchJson("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const accountId = String(profile?.sub || "");
  if (!accountId) throw new Error("LinkedIn não retornou o identificador do perfil.");
  const scopes = parseGrantedScopes(token?.scope, fallbackScopes);

  const saved = [await saveSocialAccount({
    provider: "linkedin",
    providerAccountId: accountId,
    username: profile?.email || null,
    displayName: profile?.name || "Perfil LinkedIn",
    accountType: "member",
    avatarUrl: profile?.picture || null,
    editorialRole: "Autoridade profissional",
    scopes,
    accessToken,
    refreshToken: token?.refresh_token || null,
    expiresAt: addSeconds(token?.expires_in),
    connectedBy: userId,
    metadata: { email: profile?.email || null },
    providerPayload: { sub: accountId },
  })];

  return saved;
}

async function exchangeYouTube(code: string, userId: string, fallbackScopes: string[]) {
  const config = providerConfig("youtube");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(),
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson(response);
  if (!response.ok) throw Object.assign(new Error(token?.error_description || token?.error || "Falha ao trocar código Google."), { status: response.status, data: token });
  const accessToken = String(token?.access_token || "");
  if (!accessToken) throw new Error("Google não retornou access token.");
  const scopes = parseGrantedScopes(token?.scope, fallbackScopes);

  const channels = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const saved: any[] = [];
  for (const channel of channels?.items || []) {
    saved.push(await saveSocialAccount({
      provider: "youtube",
      providerAccountId: String(channel.id),
      username: channel?.snippet?.customUrl || null,
      displayName: channel?.snippet?.title || "Canal YouTube",
      accountType: "channel",
      avatarUrl: channel?.snippet?.thumbnails?.default?.url || channel?.snippet?.thumbnails?.medium?.url || null,
      editorialRole: "Vídeo / busca / autoridade",
      scopes,
      accessToken,
      refreshToken: token?.refresh_token || null,
      expiresAt: addSeconds(token?.expires_in),
      connectedBy: userId,
      metadata: { statistics: channel?.statistics || {}, description: channel?.snippet?.description || null },
      providerPayload: { channel_id: channel.id },
    }));
  }
  if (!saved.length) throw new Error("Nenhum canal do YouTube foi encontrado na conta Google autorizada.");
  return saved;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const stateValue = String(req.query.state || "");
  if (!stateValue) return redirect(res, { social: "error", message: "Estado OAuth ausente." });

  let oauthState: Awaited<ReturnType<typeof consumeOauthState>> = null;
  try {
    oauthState = await consumeOauthState(stateValue);
    if (!oauthState) return redirect(res, { social: "error", message: "Autorização expirada ou inválida." });

    const provider = oauthState.provider;
    const providerError = String(req.query.error || "");
    if (providerError) {
      return redirect(res, {
        social: "error",
        provider,
        message: String(req.query.error_description || providerError).slice(0, 180),
      });
    }

    const code = String(req.query.code || "");
    if (!code) return redirect(res, { social: "error", provider, message: "A rede não retornou código de autorização." });

    let accounts: any[] = [];
    if (provider === "instagram" || provider === "facebook") {
      accounts = await exchangeMeta(code, provider, oauthState.user_id, oauthState.requested_scopes || []);
    } else if (provider === "tiktok") {
      accounts = await exchangeTikTok(code, oauthState.user_id, oauthState.requested_scopes || []);
    } else if (provider === "linkedin") {
      accounts = await exchangeLinkedIn(code, oauthState.user_id, oauthState.requested_scopes || []);
    } else if (provider === "youtube") {
      accounts = await exchangeYouTube(code, oauthState.user_id, oauthState.requested_scopes || []);
    }

    return redirect(res, { social: "connected", provider, count: accounts.length });
  } catch (error: any) {
    console.error("[social-callback]", oauthState?.provider, error?.data || error);
    return redirect(res, {
      social: "error",
      provider: oauthState?.provider || null,
      message: String(error?.data?.error?.message || error?.message || "Falha ao concluir autorização.").slice(0, 180),
    });
  }
}
