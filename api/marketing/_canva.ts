import { createHash, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  addSeconds,
  decryptSecret,
  encryptSecret,
  fetchJson,
  json,
  requireAdmin,
  supabaseAdmin,
} from "./_social.js";

export type CanvaConnection = {
  id: string;
  provider: "canva";
  provider_user_id: string | null;
  provider_team_id: string | null;
  display_name: string | null;
  status: string;
  scopes: string[];
  capabilities: Record<string, any>;
  metadata: Record<string, any>;
  token_expires_at: string | null;
  last_sync_at: string | null;
  connected_by: string | null;
};

const CANVA_API = "https://api.canva.com/rest/v1";
const CANVA_AUTH = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN = `${CANVA_API}/oauth/token`;
const APP_BASE_URL = String(
  process.env.CANVA_OAUTH_BASE_URL ||
    process.env.SOCIAL_OAUTH_BASE_URL ||
    "https://crm.consulmaxconsorcios.com.br",
).replace(/\/$/, "");

export const CANVA_SCOPES = Array.from(
  new Set(
    [
      "profile:read",
      "design:meta:read",
      "design:content:read",
      "design:content:write",
      "asset:read",
      "asset:write",
      "brandtemplate:meta:read",
      "brandtemplate:content:read",
      "brandtemplate:content:write",
      ...String(process.env.CANVA_EXTRA_SCOPES || "")
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ],
  ),
);

export function canvaConfig() {
  const clientId = String(process.env.CANVA_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  const missing: string[] = [];
  if (!clientId) missing.push("CANVA_CLIENT_ID");
  if (!clientSecret) missing.push("CANVA_CLIENT_SECRET");
  return {
    clientId,
    clientSecret,
    configured: missing.length === 0,
    missing,
    scopes: CANVA_SCOPES,
    callbackUrl: `${APP_BASE_URL}/api/marketing/canva-callback`,
    returnUrl: `${APP_BASE_URL}/marketing/conteudo?tab=producao`,
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function createCanvaOauthState(userId: string) {
  const state = randomBytes(48).toString("base64url");
  const verifier = randomBytes(72).toString("base64url");
  const config = canvaConfig();
  const { error } = await supabaseAdmin.from("marketing_design_oauth_states").insert({
    state_hash: hash(state),
    provider: "canva",
    user_id: userId,
    code_verifier_ciphertext: encryptSecret(verifier),
    requested_scopes: config.scopes,
    return_path: "/marketing/conteudo?tab=producao",
  });
  if (error) throw error;
  return { state, verifier, challenge: pkceChallenge(verifier) };
}

export async function consumeCanvaOauthState(state: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("marketing_design_oauth_states")
    .select("id,user_id,code_verifier_ciphertext,requested_scopes,expires_at,used_at")
    .eq("provider", "canva")
    .eq("state_hash", hash(state))
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { error: updateError } = await supabaseAdmin
    .from("marketing_design_oauth_states")
    .update({ used_at: now })
    .eq("id", data.id)
    .is("used_at", null);
  if (updateError) throw updateError;
  return {
    ...data,
    code_verifier: decryptSecret(data.code_verifier_ciphertext) || "",
  };
}

export function canvaAuthorizationUrl(input: { state: string; challenge: string }) {
  const config = canvaConfig();
  const url = new URL(CANVA_AUTH);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  return url.toString();
}

function basicAuth() {
  const config = canvaConfig();
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(CANVA_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error_description || `Canva OAuth HTTP ${response.status}`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return payload;
}

export async function exchangeCanvaCode(code: string, codeVerifier: string) {
  const config = canvaConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.callbackUrl,
    }),
  );
}

export async function refreshCanvaToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

function parseScopes(value: any, fallback = CANVA_SCOPES) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

export async function saveCanvaConnection(input: {
  userId: string;
  teamId: string;
  displayName?: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | string | null;
  capabilities?: Record<string, any>;
  providerPayload?: any;
}) {
  const now = new Date().toISOString();
  const row = {
    provider: "canva",
    provider_user_id: input.userId,
    provider_team_id: input.teamId,
    display_name: input.displayName || "Canva",
    status: "connected",
    scopes: input.scopes,
    capabilities: input.capabilities || {},
    metadata: {
      integration_mode: "canva_connect_api",
      last_profile_sync_at: now,
    },
    token_expires_at: addSeconds(input.expiresIn),
    last_sync_at: now,
    connected_by: input.userId.startsWith("auth:") ? input.userId.slice(5) : null,
  };

  const { data: existing } = await supabaseAdmin
    .from("marketing_design_connections")
    .select("id")
    .eq("provider", "canva")
    .eq("provider_user_id", input.userId)
    .eq("provider_team_id", input.teamId)
    .maybeSingle();

  let connectionId = existing?.id as string | undefined;
  if (connectionId) {
    const { error } = await supabaseAdmin
      .from("marketing_design_connections")
      .update({ ...row, connected_by: undefined, updated_at: now })
      .eq("id", connectionId);
    if (error) throw error;
  } else {
    const insertRow = { ...row } as any;
    if (input.userId.startsWith("auth:")) {
      insertRow.provider_user_id = input.providerPayload?.canva_user_id || input.userId;
      insertRow.connected_by = input.userId.slice(5);
    }
    const { data, error } = await supabaseAdmin
      .from("marketing_design_connections")
      .insert(insertRow)
      .select("id")
      .single();
    if (error) throw error;
    connectionId = data.id;
  }

  const { error: credentialError } = await supabaseAdmin
    .from("marketing_design_credentials")
    .upsert(
      {
        design_connection_id: connectionId,
        access_token_ciphertext: encryptSecret(input.accessToken),
        refresh_token_ciphertext: encryptSecret(input.refreshToken || null),
        encryption_version: 1,
        provider_payload_ciphertext: encryptSecret(input.providerPayload ? JSON.stringify(input.providerPayload) : null),
        updated_at: now,
      },
      { onConflict: "design_connection_id" },
    );
  if (credentialError) throw credentialError;
  return connectionId as string;
}

export async function upsertCanvaConnection(input: {
  authUserId: string;
  canvaUserId: string;
  canvaTeamId: string;
  displayName?: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | string | null;
  capabilities?: Record<string, any>;
  providerPayload?: any;
}) {
  const now = new Date().toISOString();
  const row = {
    provider: "canva",
    provider_user_id: input.canvaUserId,
    provider_team_id: input.canvaTeamId,
    display_name: input.displayName || "Canva",
    status: "connected",
    scopes: input.scopes,
    capabilities: input.capabilities || {},
    metadata: {
      integration_mode: "canva_connect_api",
      last_profile_sync_at: now,
    },
    token_expires_at: addSeconds(input.expiresIn),
    last_sync_at: now,
    connected_by: input.authUserId,
    updated_at: now,
  };
  const { data: connection, error } = await supabaseAdmin
    .from("marketing_design_connections")
    .upsert(row, { onConflict: "provider,provider_user_id,provider_team_id" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: credentialError } = await supabaseAdmin
    .from("marketing_design_credentials")
    .upsert(
      {
        design_connection_id: connection.id,
        access_token_ciphertext: encryptSecret(input.accessToken),
        refresh_token_ciphertext: encryptSecret(input.refreshToken || null),
        encryption_version: 1,
        provider_payload_ciphertext: encryptSecret(input.providerPayload ? JSON.stringify(input.providerPayload) : null),
        updated_at: now,
      },
      { onConflict: "design_connection_id" },
    );
  if (credentialError) throw credentialError;
  return connection.id as string;
}

export async function getCanvaConnection() {
  const { data, error } = await supabaseAdmin
    .from("marketing_design_connections")
    .select("id,provider,provider_user_id,provider_team_id,display_name,status,scopes,capabilities,metadata,token_expires_at,last_sync_at,connected_by")
    .eq("provider", "canva")
    .neq("status", "disconnected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as CanvaConnection | null;
}

async function connectionCredential(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_design_credentials")
    .select("access_token_ciphertext,refresh_token_ciphertext")
    .eq("design_connection_id", connectionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getValidCanvaAccessToken() {
  const connection = await getCanvaConnection();
  if (!connection) throw new Error("Canva ainda não está conectado ao CRM.");
  const credentials = await connectionCredential(connection.id);
  if (!credentials) throw new Error("Credenciais do Canva não foram encontradas.");
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 5 * 60 * 1000;
  if (stillValid) {
    const accessToken = decryptSecret(credentials.access_token_ciphertext);
    if (!accessToken) throw new Error("Access token do Canva indisponível.");
    return { connection, accessToken };
  }

  const refreshToken = decryptSecret(credentials.refresh_token_ciphertext);
  if (!refreshToken) throw new Error("Sessão do Canva expirou e não há refresh token. Reconecte a conta.");
  const refreshed = await refreshCanvaToken(refreshToken);
  const accessToken = String(refreshed.access_token || "");
  if (!accessToken) throw new Error("O Canva não retornou um novo access token.");
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("marketing_design_credentials")
    .update({
      access_token_ciphertext: encryptSecret(accessToken),
      refresh_token_ciphertext: encryptSecret(refreshed.refresh_token || refreshToken),
      updated_at: now,
    })
    .eq("design_connection_id", connection.id);
  await supabaseAdmin
    .from("marketing_design_connections")
    .update({
      status: "connected",
      token_expires_at: addSeconds(refreshed.expires_in),
      scopes: parseScopes(refreshed.scope, connection.scopes),
      last_sync_at: now,
      updated_at: now,
    })
    .eq("id", connection.id);
  return {
    connection: {
      ...connection,
      status: "connected",
      token_expires_at: addSeconds(refreshed.expires_in),
      scopes: parseScopes(refreshed.scope, connection.scopes),
    },
    accessToken,
  };
}

export async function canvaFetch(path: string, init: RequestInit = {}) {
  const { accessToken, connection } = await getValidCanvaAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${CANVA_API}${path}`, { ...init, headers });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error?.message || `Canva API HTTP ${response.status}`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return { payload, connection };
}

export async function cleanupCanvaOauthStates() {
  await supabaseAdmin
    .from("marketing_design_oauth_states")
    .delete()
    .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
}

export async function canvaStatusPayload() {
  const config = canvaConfig();
  const connection = await getCanvaConnection();
  const { data: mappings, error } = await supabaseAdmin
    .from("marketing_canva_template_mappings")
    .select("id,brand_kit_setting_id,format,template_family,canva_brand_template_id,canva_source_design_id,dataset_schema,enabled,metadata,updated_at")
    .order("format", { ascending: true })
    .order("template_family", { ascending: true });
  if (error) throw error;
  return {
    configured: config.configured,
    missing: config.missing,
    callback_url: config.callbackUrl,
    scopes: config.scopes,
    connection,
    mappings: mappings || [],
    mapped_count: (mappings || []).filter((item: any) => item.canva_brand_template_id || item.canva_source_design_id).length,
    total_mappings: (mappings || []).length,
  };
}

export { APP_BASE_URL, CANVA_API, fetchJson, json, requireAdmin, supabaseAdmin };