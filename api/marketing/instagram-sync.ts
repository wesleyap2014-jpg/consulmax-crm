import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin, json } from "../_supabase";
import { decryptSecret, fetchJson, requireAdmin } from "./_social";

const INSTAGRAM_GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v21.0";

async function loadInstagramAccount(accountId?: string) {
  let query = supabaseAdmin
    .from("marketing_social_accounts")
    .select("id,provider,provider_account_id,username,display_name,status,scopes,capabilities,metadata,token_expires_at,last_sync_at")
    .eq("provider", "instagram")
    .eq("status", "connected");

  if (accountId) query = query.eq("id", accountId);
  else query = query.order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1);

  const { data, error } = accountId ? await query.maybeSingle() : await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Nenhuma conta do Instagram conectada foi encontrada.");

  const { data: credential, error: credentialError } = await supabaseAdmin
    .from("marketing_social_credentials")
    .select("access_token_ciphertext")
    .eq("social_account_id", data.id)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential?.access_token_ciphertext) throw new Error("A credencial segura do Instagram não foi encontrada.");

  const accessToken = decryptSecret(credential.access_token_ciphertext);
  if (!accessToken) throw new Error("Não foi possível decifrar o token do Instagram.");
  return { account: data, accessToken };
}

function compactMedia(item: any) {
  return {
    id: item?.id || null,
    caption: item?.caption || null,
    media_type: item?.media_type || null,
    media_product_type: item?.media_product_type || null,
    permalink: item?.permalink || null,
    thumbnail_url: item?.thumbnail_url || null,
    timestamp: item?.timestamp || null,
    username: item?.username || null,
    like_count: typeof item?.like_count === "number" ? item.like_count : null,
    comments_count: typeof item?.comments_count === "number" ? item.comments_count : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (!["GET", "POST"].includes(String(req.method || ""))) return json(res, 405, { ok: false, message: "Method not allowed" });

  try {
    const accountId = String(req.method === "GET" ? req.query.account_id || "" : req.body?.account_id || "").trim() || undefined;
    const { account, accessToken } = await loadInstagramAccount(accountId);
    const igId = String(account.provider_account_id);

    const profileFields = "id,user_id,username,name,profile_picture_url,account_type,media_count,followers_count,follows_count";
    let profile: any;
    try {
      profile = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igId)}?fields=${encodeURIComponent(profileFields)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      profile = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igId)}?fields=id,user_id,username,name,profile_picture_url,account_type`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    const mediaFields = "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,username,like_count,comments_count";
    let mediaPayload: any;
    try {
      mediaPayload = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igId)}/media?fields=${encodeURIComponent(mediaFields)}&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      mediaPayload = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igId)}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,username&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    const recentMedia = (mediaPayload?.data || []).map(compactMedia);
    const now = new Date().toISOString();
    const nextMetadata = {
      ...(account.metadata || {}),
      instagram_profile: profile || {},
      recent_media: recentMedia,
      recent_media_count: recentMedia.length,
      sync_source: "instagram_graph_api",
      synced_at: now,
    };

    const { error: updateError } = await supabaseAdmin
      .from("marketing_social_accounts")
      .update({
        username: profile?.username || account.username,
        display_name: profile?.name || profile?.username || account.display_name,
        account_type: profile?.account_type || null,
        avatar_url: profile?.profile_picture_url || null,
        metadata: nextMetadata,
        last_sync_at: now,
        status: "connected",
      })
      .eq("id", account.id);
    if (updateError) throw updateError;

    return json(res, 200, {
      ok: true,
      account_id: account.id,
      username: profile?.username || account.username,
      profile,
      media_count: recentMedia.length,
      recent_media: recentMedia.slice(0, 12),
      token_expires_at: account.token_expires_at,
      capabilities: account.capabilities,
      synced_at: now,
    });
  } catch (error: any) {
    console.error("[instagram-sync]", error?.data || error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      message: error?.data?.error?.message || error?.message || "Não foi possível sincronizar a conta do Instagram.",
    });
  }
}
