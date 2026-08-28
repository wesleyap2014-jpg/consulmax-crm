import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin, json } from "../_supabase";
import { decryptSecret, fetchJson, requireAdmin } from "./_social";

const INSTAGRAM_GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v21.0";
const MEDIA_BUCKET = "marketing-content-assets";
const SIGNED_URL_SECONDS = 6 * 60 * 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAccount(accountId?: string | null) {
  let query = supabaseAdmin
    .from("marketing_social_accounts")
    .select("id,provider,provider_account_id,username,status,scopes,capabilities")
    .eq("provider", "instagram")
    .eq("status", "connected");
  if (accountId) query = query.eq("id", accountId);
  else query = query.order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1);
  const { data: account, error } = await query.maybeSingle();
  if (error) throw error;
  if (!account) throw new Error("Nenhuma conta do Instagram conectada foi encontrada.");
  if (!account?.capabilities?.publish) throw new Error("A conta conectada não concedeu permissão de publicação no Instagram.");

  const { data: credential, error: credentialError } = await supabaseAdmin
    .from("marketing_social_credentials")
    .select("access_token_ciphertext")
    .eq("social_account_id", account.id)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential?.access_token_ciphertext) throw new Error("Credencial do Instagram não encontrada.");
  const accessToken = decryptSecret(credential.access_token_ciphertext);
  if (!accessToken) throw new Error("Token do Instagram indisponível.");
  return { account, accessToken };
}

async function graphPost(path: string, accessToken: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Instagram respondeu HTTP ${response.status}.`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function waitContainer(containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const status = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(containerId)}?fields=status_code,status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const code = String(status?.status_code || "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") return status;
    if (["ERROR", "EXPIRED"].includes(code)) throw new Error(status?.status || `Container do Instagram terminou com status ${code}.`);
    await sleep(2000);
  }
  throw new Error("O Instagram ainda está processando a mídia. Tente publicar novamente em alguns instantes.");
}

async function signedAssetUrl(filePath: string) {
  const { data, error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).createSignedUrl(filePath, SIGNED_URL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Não foi possível gerar URL temporária para a mídia.");
  return data.signedUrl;
}

function assetType(asset: any) {
  const mime = String(asset?.mime_type || "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (asset?.kind === "video") return "video";
  if (asset?.kind === "image") return "image";
  return "other";
}

function buildCaption(variant: any) {
  const base = String(variant?.caption || variant?.body || variant?.title || "").trim();
  const tags = Array.isArray(variant?.hashtags) ? variant.hashtags.map((tag: any) => String(tag).trim()).filter(Boolean) : [];
  const normalized = tags.map((tag: string) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`);
  return [base, normalized.length ? normalized.join(" ") : ""].filter(Boolean).join("\n\n").slice(0, 2200);
}

async function createSingleContainer(igId: string, accessToken: string, asset: any, caption: string, format: string, carouselItem = false) {
  const url = await signedAssetUrl(asset.file_path);
  const type = assetType(asset);
  if (type === "other") throw new Error(`Arquivo ${asset.file_name || asset.file_path} não é imagem nem vídeo suportado.`);

  const params: Record<string, string> = {};
  if (carouselItem) params.is_carousel_item = "true";

  if (format === "stories") {
    params.media_type = "STORIES";
    if (type === "video") params.video_url = url;
    else params.image_url = url;
  } else if (type === "video") {
    params.media_type = "REELS";
    params.video_url = url;
    if (!carouselItem) params.share_to_feed = "true";
  } else {
    params.image_url = url;
  }

  if (!carouselItem && format !== "stories" && caption) params.caption = caption;
  const created = await graphPost(`${encodeURIComponent(igId)}/media`, accessToken, params);
  if (!created?.id) throw new Error("Instagram não retornou o ID do container de mídia.");
  if (type === "video") await waitContainer(String(created.id), accessToken);
  return String(created.id);
}

async function publishCreation(igId: string, creationId: string, accessToken: string) {
  const result = await graphPost(`${encodeURIComponent(igId)}/media_publish`, accessToken, { creation_id: creationId });
  if (!result?.id) throw new Error("Instagram não retornou o ID da publicação.");
  return String(result.id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });

  let publicationId: string | null = null;
  const variantId = String(req.body?.variant_id || "").trim();
  if (!variantId) return json(res, 400, { ok: false, message: "variant_id é obrigatório." });

  try {
    const { data: variant, error: variantError } = await supabaseAdmin
      .from("marketing_content_variants")
      .select("id,content_id,social_account_id,provider,format,title,body,caption,hashtags,status")
      .eq("id", variantId)
      .maybeSingle();
    if (variantError) throw variantError;
    if (!variant) throw new Error("Versão de conteúdo não encontrada.");
    if (variant.provider !== "instagram") throw new Error("Esta versão não pertence ao Instagram.");
    if (!["aprovado", "approved", "agendado", "programado"].includes(String(variant.status))) {
      throw new Error("A versão precisa estar aprovada antes de ser publicada.");
    }

    const requestedAccountId = String(req.body?.account_id || variant.social_account_id || "").trim() || null;
    const { account, accessToken } = await loadAccount(requestedAccountId);
    const igId = String(account.provider_account_id);

    let { data: assets, error: assetsError } = await supabaseAdmin
      .from("marketing_content_assets")
      .select("id,content_id,variant_id,kind,file_path,file_name,mime_type,metadata,created_at")
      .eq("variant_id", variant.id)
      .order("created_at", { ascending: true });
    if (assetsError) throw assetsError;

    if (!assets?.length) {
      const fallback = await supabaseAdmin
        .from("marketing_content_assets")
        .select("id,content_id,variant_id,kind,file_path,file_name,mime_type,metadata,created_at")
        .eq("content_id", variant.content_id)
        .is("variant_id", null)
        .order("created_at", { ascending: true });
      if (fallback.error) throw fallback.error;
      assets = fallback.data || [];
    }
    if (!assets?.length) throw new Error("Esta versão ainda não possui mídia anexada. Envie a imagem ou vídeo antes de publicar.");

    const now = new Date().toISOString();
    const { data: publication, error: publicationError } = await supabaseAdmin
      .from("marketing_publications")
      .insert({
        variant_id: variant.id,
        social_account_id: account.id,
        started_at: now,
        status: "publishing",
        retry_count: 0,
        provider_response: {},
        created_by: user.id,
      })
      .select("id")
      .single();
    if (publicationError) throw publicationError;
    publicationId = publication.id;

    await supabaseAdmin
      .from("marketing_content_variants")
      .update({ social_account_id: account.id, status: "publicando" })
      .eq("id", variant.id);

    const format = String(variant.format || "").toLowerCase();
    const caption = buildCaption(variant);
    let creationId: string;

    if (format === "carrossel" || format === "carousel") {
      if (assets.length < 2) throw new Error("Carrossel precisa de pelo menos 2 mídias anexadas.");
      const children: string[] = [];
      for (const asset of assets.slice(0, 10)) {
        children.push(await createSingleContainer(igId, accessToken, asset, "", format, true));
      }
      const parent = await graphPost(`${encodeURIComponent(igId)}/media`, accessToken, {
        media_type: "CAROUSEL",
        children: children.join(","),
        ...(caption ? { caption } : {}),
      });
      if (!parent?.id) throw new Error("Instagram não retornou o container do carrossel.");
      creationId = String(parent.id);
      await waitContainer(creationId, accessToken).catch(() => null);
    } else {
      creationId = await createSingleContainer(igId, accessToken, assets[0], caption, format, false);
    }

    const providerPostId = await publishCreation(igId, creationId, accessToken);
    let providerPostUrl: string | null = null;
    try {
      const publishedMedia = await fetchJson(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(providerPostId)}?fields=id,permalink`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      providerPostUrl = publishedMedia?.permalink || null;
    } catch {
      providerPostUrl = null;
    }

    const publishedAt = new Date().toISOString();
    await supabaseAdmin.from("marketing_publications").update({
      published_at: publishedAt,
      status: "published",
      provider_post_id: providerPostId,
      provider_post_url: providerPostUrl,
      provider_response: { creation_id: creationId, media_id: providerPostId },
      error_code: null,
      error_message: null,
    }).eq("id", publicationId);

    await supabaseAdmin.from("marketing_content_variants").update({
      status: "publicado",
      published_at: publishedAt,
      provider_post_id: providerPostId,
      provider_post_url: providerPostUrl,
      social_account_id: account.id,
    }).eq("id", variant.id);

    await supabaseAdmin.from("marketing_social_accounts").update({ last_sync_at: publishedAt }).eq("id", account.id);

    return json(res, 200, {
      ok: true,
      publication_id: publicationId,
      variant_id: variant.id,
      account_id: account.id,
      username: account.username,
      provider_post_id: providerPostId,
      provider_post_url: providerPostUrl,
      published_at: publishedAt,
    });
  } catch (error: any) {
    console.error("[instagram-publish]", error?.data || error);
    if (publicationId) {
      await supabaseAdmin.from("marketing_publications").update({
        status: "failed",
        error_code: String(error?.data?.error?.code || error?.status || "instagram_publish_error"),
        error_message: String(error?.data?.error?.message || error?.message || "Falha ao publicar no Instagram").slice(0, 1000),
        provider_response: error?.data || {},
      }).eq("id", publicationId);
    }
    await supabaseAdmin.from("marketing_content_variants").update({ status: "aprovado" }).eq("id", variantId).eq("status", "publicando");
    return json(res, Number(error?.status || 500), {
      ok: false,
      message: error?.data?.error?.message || error?.message || "Não foi possível publicar no Instagram.",
    });
  }
}
