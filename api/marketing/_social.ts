import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

export type SocialProvider = "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "whatsapp";

type ProviderConfig = {
  provider: SocialProvider;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  configured: boolean;
  missing: string[];
};

const SOCIAL_BASE_URL = String(process.env.SOCIAL_OAUTH_BASE_URL || "https://crm.consulmaxconsorcios.com.br").replace(/\/$/, "");
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const INSTAGRAM_GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || META_GRAPH_VERSION;

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}

function splitScopes(value?: string) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function providerConfig(provider: SocialProvider): ProviderConfig {
  if (provider === "instagram") {
    const clientId = firstEnv(["INSTAGRAM_APP_ID", "INSTAGRAM_CLIENT_ID"]);
    const clientSecret = firstEnv(["INSTAGRAM_APP_SECRET", "INSTAGRAM_CLIENT_SECRET"]);
    const scopes = Array.from(new Set([
      "instagram_business_basic",
      "instagram_business_content_publish",
      ...splitScopes(process.env.INSTAGRAM_EXTRA_SCOPES),
    ]));
    const missing: string[] = [];
    if (!clientId) missing.push("INSTAGRAM_APP_ID");
    if (!clientSecret) missing.push("INSTAGRAM_APP_SECRET");
    return {
      provider,
      clientId,
      clientSecret,
      authUrl: "https://www.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes,
      configured: !missing.length,
      missing,
    };
  }

  if (provider === "facebook") {
    const clientId = firstEnv(["META_SOCIAL_APP_ID", "META_APP_ID", "FACEBOOK_APP_ID"]);
    const clientSecret = firstEnv(["META_SOCIAL_APP_SECRET", "META_APP_SECRET", "FACEBOOK_APP_SECRET"]);
    const scopes = Array.from(new Set([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_engagement",
      ...splitScopes(process.env.META_SOCIAL_EXTRA_SCOPES),
    ]));
    const missing: string[] = [];
    if (!clientId) missing.push("META_SOCIAL_APP_ID");
    if (!clientSecret) missing.push("META_SOCIAL_APP_SECRET");
    return {
      provider,
      clientId,
      clientSecret,
      authUrl: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
      tokenUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
      scopes,
      configured: !missing.length,
      missing,
    };
  }

  if (provider === "tiktok") {
    const clientId = firstEnv(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_ID"]);
    const clientSecret = firstEnv(["TIKTOK_CLIENT_SECRET"]);
    const scopes = splitScopes(process.env.TIKTOK_SOCIAL_SCOPES || "user.info.basic,video.list");
    const missing: string[] = [];
    if (!clientId) missing.push("TIKTOK_CLIENT_KEY");
    if (!clientSecret) missing.push("TIKTOK_CLIENT_SECRET");
    return {
      provider,
      clientId,
      clientSecret,
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes,
      configured: !missing.length,
      missing,
    };
  }

  if (provider === "linkedin") {
    const clientId = firstEnv(["LINKEDIN_CLIENT_ID"]);
    const clientSecret = firstEnv(["LINKEDIN_CLIENT_SECRET"]);
    const scopes = Array.from(new Set([
      "openid",
      "profile",
      "email",
      "w_member_social",
      ...splitScopes(process.env.LINKEDIN_EXTRA_SCOPES),
    ]));
    const missing: string[] = [];
    if (!clientId) missing.push("LINKEDIN_CLIENT_ID");
    if (!clientSecret) missing.push("LINKEDIN_CLIENT_SECRET");
    return {
      provider,
      clientId,
      clientSecret,
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes,
      configured: !missing.length,
      missing,
    };
  }

  if (provider === "youtube") {
    const clientId = firstEnv(["GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID"]);
    const clientSecret = firstEnv(["GOOGLE_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET"]);
    const scopes = Array.from(new Set([
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
      ...splitScopes(process.env.YOUTUBE_EXTRA_SCOPES),
    ]));
    const missing: string[] = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    return {
      provider,
      clientId,
      clientSecret,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes,
      configured: !missing.length,
      missing,
    };
  }

  return {
    provider,
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    scopes: [],
    configured: Boolean(firstEnv(["META_WHATSAPP_TOKEN", "WHATSAPP_TOKEN"]) && process.env.META_WHATSAPP_PHONE_NUMBER_ID),
    missing: [
      ...(!firstEnv(["META_WHATSAPP_TOKEN", "WHATSAPP_TOKEN"]) ? ["META_WHATSAPP_TOKEN"] : []),
      ...(!process.env.META_WHATSAPP_PHONE_NUMBER_ID ? ["META_WHATSAPP_PHONE_NUMBER_ID"] : []),
    ],
  };
}

export function callbackUrl() {
  return `${SOCIAL_BASE_URL}/api/marketing/social-callback`;
}

export function returnUrl(params?: Record<string, string | number | null | undefined>) {
  const url = new URL(`${SOCIAL_BASE_URL}/marketing/conteudo`);
  url.searchParams.set("tab", "config");
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const { user } = await getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (error || data?.role !== "admin") {
    json(res, 403, { ok: false, message: "A Central de Contas está restrita a administradores." });
    return null;
  }
  return user;
}

export function randomState() {
  return randomBytes(32).toString("base64url");
}

export function hashState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createOauthState(provider: SocialProvider, userId: string, scopes: string[]) {
  const state = randomState();
  const { error } = await supabaseAdmin.from("marketing_social_oauth_states").insert({
    state_hash: hashState(state),
    provider,
    user_id: userId,
    requested_scopes: scopes,
    return_path: "/marketing/conteudo?tab=config",
  });
  if (error) throw error;
  return state;
}

export async function consumeOauthState(state: string) {
  const now = new Date().toISOString();
  const stateHash = hashState(state);
  const { data, error } = await supabaseAdmin
    .from("marketing_social_oauth_states")
    .select("id,provider,user_id,requested_scopes,expires_at,used_at")
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { error: updateError } = await supabaseAdmin.from("marketing_social_oauth_states").update({ used_at: now }).eq("id", data.id).is("used_at", null);
  if (updateError) throw updateError;
  return data as { id: string; provider: SocialProvider; user_id: string; requested_scopes: string[]; expires_at: string; used_at: string | null };
}

function encryptionKey() {
  const source = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!source) throw new Error("Chave de cifragem social não disponível no backend.");
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value?: string | null) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value?: string | null) {
  if (!value) return null;
  const [version, ivRaw, tagRaw, dataRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw new Error("Credencial social cifrada em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} em ${new URL(url).hostname}`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function parseGrantedScopes(value: any, fallback: string[] = []) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

export function capabilities(provider: SocialProvider, scopes: string[]) {
  const has = (scope: string) => scopes.includes(scope);
  if (provider === "instagram") return {
    read: has("instagram_business_basic") || has("instagram_basic"),
    publish: has("instagram_business_content_publish") || has("instagram_content_publish"),
    analytics: has("instagram_business_manage_insights") || has("instagram_manage_insights"),
    comments: has("instagram_business_manage_comments") || has("instagram_manage_comments"),
    messages: has("instagram_business_manage_messages"),
  };
  if (provider === "facebook") return {
    read: has("pages_read_engagement"),
    publish: has("pages_manage_posts"),
    analytics: has("pages_read_engagement"),
    comments: has("pages_manage_engagement"),
    messages: false,
  };
  if (provider === "tiktok") return {
    read: has("video.list") || has("user.info.basic"),
    publish: has("video.publish"),
    analytics: has("video.list"),
    comments: false,
    messages: false,
  };
  if (provider === "linkedin") return {
    read: has("r_member_social") || has("r_organization_social") || has("openid"),
    publish: has("w_member_social") || has("w_organization_social"),
    analytics: has("r_member_postAnalytics") || has("r_organization_social"),
    comments: has("w_member_social_feed") || has("w_organization_social_feed"),
    messages: false,
  };
  if (provider === "youtube") return {
    read: scopes.some((scope) => scope.includes("youtube.readonly")),
    publish: scopes.some((scope) => scope.includes("youtube.upload") || scope.endsWith("/youtube")),
    analytics: scopes.some((scope) => scope.includes("yt-analytics")),
    comments: scopes.some((scope) => scope.includes("youtube.force-ssl") || scope.endsWith("/youtube")),
    messages: false,
  };
  return { read: true, publish: false, analytics: true, comments: false, messages: true };
}

export async function saveSocialAccount(input: {
  provider: SocialProvider;
  providerAccountId: string;
  username?: string | null;
  displayName?: string | null;
  accountType?: string | null;
  avatarUrl?: string | null;
  editorialRole?: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  connectedBy: string;
  metadata?: Record<string, any>;
  providerPayload?: any;
}) {
  const accountRow = {
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    username: input.username || null,
    display_name: input.displayName || null,
    account_type: input.accountType || null,
    avatar_url: input.avatarUrl || null,
    editorial_role: input.editorialRole || null,
    status: "connected",
    scopes: input.scopes,
    capabilities: capabilities(input.provider, input.scopes),
    metadata: input.metadata || {},
    token_expires_at: input.expiresAt || null,
    last_sync_at: new Date().toISOString(),
    connected_by: input.connectedBy,
  };

  const { data: account, error } = await supabaseAdmin
    .from("marketing_social_accounts")
    .upsert(accountRow, { onConflict: "provider,provider_account_id" })
    .select("id,provider,provider_account_id,username,display_name")
    .single();
  if (error) throw error;

  const credentialRow = {
    social_account_id: account.id,
    access_token_ciphertext: encryptSecret(input.accessToken),
    refresh_token_ciphertext: encryptSecret(input.refreshToken || null),
    encryption_version: 1,
    provider_payload_ciphertext: encryptSecret(input.providerPayload ? JSON.stringify(input.providerPayload) : null),
    updated_at: new Date().toISOString(),
  };
  const { error: credentialError } = await supabaseAdmin
    .from("marketing_social_credentials")
    .upsert(credentialRow, { onConflict: "social_account_id" });
  if (credentialError) throw credentialError;
  return account;
}

export function addSeconds(seconds?: number | string | null) {
  const amount = Number(seconds || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Date(Date.now() + amount * 1000).toISOString();
}

export { INSTAGRAM_GRAPH_VERSION, META_GRAPH_VERSION, SOCIAL_BASE_URL, json, supabaseAdmin };
