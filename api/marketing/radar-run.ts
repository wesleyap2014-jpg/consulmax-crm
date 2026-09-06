import type { VercelRequest, VercelResponse } from "@vercel/node";
import { json, supabaseAdmin } from "../_supabase";
import { decryptSecret, fetchJson, requireAdmin } from "./_social";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const RADAR_WINDOW_DAYS = Math.max(7, Number(process.env.MARKETING_RADAR_WINDOW_DAYS || 30));
const RADAR_POST_LIMIT = Math.min(50, Math.max(6, Number(process.env.MARKETING_RADAR_POST_LIMIT || 24)));

type MarketProfile = {
  id: string;
  provider: string;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  profile_type: string;
  segment: string | null;
  active: boolean;
  metadata?: Record<string, any> | null;
};

type Observation = {
  id?: string;
  market_profile_id: string;
  provider_post_id: string | null;
  post_url: string | null;
  published_at: string | null;
  observed_at: string;
  format: string | null;
  topic: string | null;
  hook: string | null;
  cta: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  followers_snapshot: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  performance_index: number | null;
  analysis: Record<string, any>;
  raw_public_metrics: Record<string, any>;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeInstagramUsername(profile: MarketProfile) {
  const fromUrl = (() => {
    try {
      if (!profile.profile_url) return "";
      const url = new URL(profile.profile_url);
      if (!url.hostname.toLowerCase().includes("instagram.com")) return "";
      return url.pathname.split("/").filter(Boolean)[0] || "";
    } catch {
      return "";
    }
  })();
  return String(fromUrl || profile.handle || "").trim().replace(/^@+/, "").split(/[/?#]/)[0];
}

function inferFormat(media: any) {
  const permalink = String(media?.permalink || "").toLowerCase();
  const type = String(media?.media_type || "").toUpperCase();
  if (permalink.includes("/reel/")) return "reel";
  if (type === "CAROUSEL_ALBUM") return "carrossel";
  if (type === "VIDEO") return "video";
  if (type === "IMAGE") return "imagem";
  return String(media?.media_type || "post").toLowerCase();
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferTopic(caption: string) {
  const text = caption.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["capital de giro", /capital de giro|fluxo de caixa|caixa da empresa/],
    ["alavancagem patrimonial", /alavanc|patrim[oô]nio|equity|im[oó]vel pr[oó]prio/],
    ["lance e contemplação", /lance|contempla|assembleia|embutido/],
    ["imóveis", /im[oó]vel|imobili[aá]r|casa|apartamento|terreno|constru[cç][aã]o/],
    ["veículos", /ve[ií]culo|carro|autom[oó]vel|moto|caminh[aã]o|frota/],
    ["planejamento financeiro", /planejamento|organiza[cç][aã]o financeira|finan[cç]as|investimento/],
    ["consórcio", /cons[oó]rcio|carta de cr[eé]dito|cr[eé]dito contemplado/],
    ["empreendedorismo", /empresa|empres[aá]rio|empreendedor|neg[oó]cio|vendas/],
  ];
  return rules.find(([, regex]) => regex.test(text))?.[0] || "outros";
}

function inferHook(caption: string) {
  const text = cleanText(caption);
  const first = text.slice(0, 220);
  if (!first) return { style: "sem_texto", text: null };
  if (/\?/.test(first)) return { style: "pergunta", text: first };
  if (/\b(n[aã]o|pare|esque[cç]a|mito|erro|ningu[eé]m|verdade)\b/i.test(first)) return { style: "quebra_de_crenca", text: first };
  if (/\b\d+[\d.,]*%?|r\$\s?\d/i.test(first)) return { style: "numero_ou_dado", text: first };
  if (/\b(como|aprenda|descubra|veja|entenda|saiba)\b/i.test(first)) return { style: "promessa_aprendizado", text: first };
  if (/\b(eu|quando eu|certa vez|hoje|ontem|um cliente)\b/i.test(first)) return { style: "historia", text: first };
  return { style: "direto", text: first };
}

function inferCta(caption: string) {
  const text = caption.toLowerCase();
  if (/comenta|coment[aá]rio|me conta|responde aqui/.test(text)) return "comentario";
  if (/direct|dm|me chama|chama no|fale comigo|fale com a gente|whatsapp/.test(text)) return "conversa";
  if (/link na bio|acesse o link|clique no link/.test(text)) return "link";
  if (/compartilh|envie para|manda para/.test(text)) return "compartilhar";
  if (/salv[ea]|guarde este/.test(text)) return "salvar";
  if (/siga|segue|acompanhe/.test(text)) return "seguir";
  return "sem_cta";
}

function inferStructure(caption: string) {
  const text = cleanText(caption);
  if (!text) return "visual_sem_legenda";
  const paragraphs = String(caption || "").split(/\n\s*\n/).filter((part) => part.trim()).length;
  if (paragraphs >= 5) return "gancho_contexto_desenvolvimento_cta";
  if (paragraphs >= 3) return "gancho_desenvolvimento_cta";
  if (text.length <= 180) return "curto_direto";
  return "texto_linear";
}

async function isAuthorized(req: VercelRequest, res: VercelResponse) {
  const authorization = String(req.headers.authorization || "");
  const cronSecret = String(process.env.CRON_SECRET || "");
  const userAgent = String(req.headers["user-agent"] || "");
  if ((cronSecret && authorization === `Bearer ${cronSecret}`) || userAgent.startsWith("vercel-cron/1.0")) return true;
  return Boolean(await requireAdmin(req, res));
}

async function loadMetaDiscoveryContext() {
  const envToken = String(process.env.META_RADAR_PAGE_ACCESS_TOKEN || "");
  const envIgId = String(process.env.META_RADAR_IG_USER_ID || "");
  if (envToken && envIgId) return { accessToken: envToken, igUserId: envIgId, source: "env" };

  const { data: accounts, error } = await supabaseAdmin
    .from("marketing_social_accounts")
    .select("id,provider_account_id,display_name,scopes,status,metadata")
    .eq("provider", "facebook")
    .eq("status", "connected")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const account of accounts || []) {
    const scopes = Array.isArray(account.scopes) ? account.scopes.map(String) : [];
    if (!scopes.includes("pages_read_engagement") || !scopes.includes("instagram_basic")) continue;

    const { data: credential } = await supabaseAdmin
      .from("marketing_social_credentials")
      .select("access_token_ciphertext")
      .eq("social_account_id", account.id)
      .maybeSingle();
    const accessToken = decryptSecret(credential?.access_token_ciphertext || null);
    if (!accessToken) continue;

    try {
      const pageId = String(account.provider_account_id || account.metadata?.page_id || "");
      if (!pageId) continue;
      const linked = await fetchJson(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=instagram_business_account{id,username}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const igUserId = String(linked?.instagram_business_account?.id || "");
      if (igUserId) return { accessToken, igUserId, source: `facebook:${account.id}` };
    } catch (error) {
      console.warn("[radar-run] página Meta sem Instagram Business Discovery disponível", account.id, error);
    }
  }

  throw new Error("Para monitorar perfis do Instagram, conecte uma Página do Facebook vinculada ao Instagram da Consulmax com as permissões pages_read_engagement e instagram_basic.");
}

async function collectInstagram(profile: MarketProfile, context: Awaited<ReturnType<typeof loadMetaDiscoveryContext>>, observedAt: string) {
  const username = normalizeInstagramUsername(profile);
  if (!username) throw new Error("Usuário do Instagram não informado.");

  const mediaFields = "id,caption,media_type,permalink,timestamp,like_count,comments_count";
  const discoveryFields = `business_discovery.username(${username}){id,username,name,biography,followers_count,follows_count,media_count,media.limit(${RADAR_POST_LIMIT}){${mediaFields}}}`;
  const payload = await fetchJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(context.igUserId)}?fields=${encodeURIComponent(discoveryFields)}`,
    { headers: { Authorization: `Bearer ${context.accessToken}` } },
  );
  const target = payload?.business_discovery;
  if (!target) throw new Error(`A Meta não retornou o perfil @${username}. Confirme se ele é uma conta profissional pública.`);

  const followers = Number(target.followers_count || 0) || null;
  const media = Array.isArray(target?.media?.data) ? target.media.data : [];
  const engagementRates = media.map((item: any) => {
    const weighted = Number(item?.like_count || 0) + Number(item?.comments_count || 0) * 3;
    return followers && followers > 0 ? (weighted / followers) * 1000 : weighted;
  });
  const baseline = Math.max(0.0001, median(engagementRates.filter((value) => value > 0)) || 1);

  const observations: Observation[] = media.map((item: any, index: number) => {
    const caption = String(item?.caption || "");
    const hook = inferHook(caption);
    const likes = Number(item?.like_count || 0);
    const comments = Number(item?.comments_count || 0);
    const weighted = likes + comments * 3;
    const rate = followers && followers > 0 ? (weighted / followers) * 1000 : weighted;
    const performanceIndex = clamp((rate / baseline) * 100, 0, 500);
    const cta = inferCta(caption);
    const format = inferFormat(item);

    return {
      market_profile_id: profile.id,
      provider_post_id: item?.id ? String(item.id) : `${username}-${index}-${item?.timestamp || observedAt}`,
      post_url: item?.permalink || null,
      published_at: item?.timestamp || null,
      observed_at: observedAt,
      format,
      topic: inferTopic(caption),
      hook: hook.text,
      cta,
      transcript: caption || null,
      duration_seconds: null,
      followers_snapshot: followers,
      views: null,
      likes,
      comments,
      shares: null,
      saves: null,
      performance_index: Number(performanceIndex.toFixed(4)),
      analysis: {
        hook_style: hook.style,
        structure: inferStructure(caption),
        caption_length: caption.length,
        hashtags_count: (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length,
        baseline_engagement_per_1000: Number(baseline.toFixed(4)),
        engagement_per_1000: Number(rate.toFixed(4)),
        resolved_username: username,
        discovery_source: context.source,
      },
      raw_public_metrics: {
        followers_count: followers,
        follows_count: Number(target.follows_count || 0) || null,
        profile_media_count: Number(target.media_count || 0) || null,
        like_count: likes,
        comments_count: comments,
      },
    };
  });

  return {
    username: String(target.username || username),
    displayName: String(target.name || profile.display_name || username),
    followers,
    mediaCount: Number(target.media_count || 0) || null,
    observations,
  };
}

async function saveProfileSync(profile: MarketProfile, patch: Record<string, any>) {
  const metadata = { ...(profile.metadata || {}), ...patch };
  const { error } = await supabaseAdmin.from("marketing_market_profiles").update({ metadata, updated_at: new Date().toISOString() }).eq("id", profile.id);
  if (error) throw error;
}

function pulseStage(score: number, trend: number, sampleSize: number) {
  if (sampleSize <= 4 && score >= 58) return "emergente";
  if (score >= 72 && trend >= 0.05) return "quente";
  if (trend >= 0.15 && score >= 55) return "aquecendo";
  if (score >= 62 && trend <= -0.12) return "saturando";
  if (score <= 38 && trend < 0) return "esfriando";
  return "estavel";
}

async function rebuildPulse(providers: string[], generatedAt: string) {
  const periodEnd = new Date(generatedAt);
  const periodStart = new Date(periodEnd.getTime() - RADAR_WINDOW_DAYS * 86400000);
  const recentCut = new Date(periodEnd.getTime() - 7 * 86400000);
  const { data, error } = await supabaseAdmin
    .from("marketing_market_observations")
    .select("market_profile_id,provider_post_id,published_at,observed_at,format,topic,performance_index,analysis")
    .gte("observed_at", periodStart.toISOString())
    .order("observed_at", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const latestByPost = new Map<string, any>();
  for (const row of data || []) {
    const key = `${row.market_profile_id}:${row.provider_post_id || row.observed_at}`;
    if (!latestByPost.has(key)) latestByPost.set(key, row);
  }
  const rows = [...latestByPost.values()].filter((row) => Number.isFinite(Number(row.performance_index)));

  const dimensions: Array<{ type: "general" | "topic" | "format" | "hook" | "structure"; value: (row: any) => string | null }> = [
    { type: "general", value: () => "mercado" },
    { type: "format", value: (row) => row.format || null },
    { type: "topic", value: (row) => row.topic || null },
    { type: "hook", value: (row) => row.analysis?.hook_style || null },
    { type: "structure", value: (row) => row.analysis?.structure || null },
  ];

  const pulseRows: any[] = [];
  for (const provider of providers) {
    const providerRows = rows.filter((row) => provider === "instagram" ? true : false);
    const candidates: any[] = [];

    for (const dimension of dimensions) {
      const groups = new Map<string, any[]>();
      for (const row of providerRows) {
        const value = cleanText(dimension.value(row));
        if (!value) continue;
        const bucket = groups.get(value) || [];
        bucket.push(row);
        groups.set(value, bucket);
      }

      for (const [value, bucket] of groups) {
        if (bucket.length < 3) continue;
        const profiles = new Set(bucket.map((row) => row.market_profile_id)).size;
        const allAvg = bucket.reduce((sum, row) => sum + Number(row.performance_index || 0), 0) / bucket.length;
        const recent = bucket.filter((row) => new Date(row.published_at || row.observed_at) >= recentCut);
        const older = bucket.filter((row) => new Date(row.published_at || row.observed_at) < recentCut);
        const recentAvg = recent.length ? recent.reduce((sum, row) => sum + Number(row.performance_index || 0), 0) / recent.length : allAvg;
        const olderAvg = older.length ? older.reduce((sum, row) => sum + Number(row.performance_index || 0), 0) / older.length : allAvg;
        const trend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
        const score = clamp(50 + (allAvg - 100) * 0.28 + clamp(trend, -1, 1) * 18);
        const confidence = clamp(bucket.length * 9 + profiles * 13, 0, 100);
        if (confidence < 35) continue;

        candidates.push({
          provider,
          dimension_type: dimension.type,
          dimension_value: value,
          score: Number(score.toFixed(2)),
          confidence: Number(confidence.toFixed(2)),
          stage: pulseStage(score, trend, bucket.length),
          sample_size: bucket.length,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          evidence: {
            source: "marketing_market_observations",
            profiles,
            avg_performance_index: Number(allAvg.toFixed(2)),
            recent_avg_performance_index: Number(recentAvg.toFixed(2)),
            previous_avg_performance_index: Number(olderAvg.toFixed(2)),
            trend_pct: Number((trend * 100).toFixed(2)),
            window_days: RADAR_WINDOW_DAYS,
          },
          generated_at: generatedAt,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    const general = candidates.filter((item) => item.dimension_type === "general").slice(0, 1);
    const topical = candidates.filter((item) => item.dimension_type !== "general").slice(0, 14);
    pulseRows.push(...general, ...topical);
  }

  if (providers.length) {
    const { error: deleteError } = await supabaseAdmin.from("marketing_algorithm_pulses").delete().in("provider", providers);
    if (deleteError) throw deleteError;
  }
  if (pulseRows.length) {
    const { error: insertError } = await supabaseAdmin.from("marketing_algorithm_pulses").insert(pulseRows);
    if (insertError) throw insertError;
  }
  return pulseRows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(String(req.method || ""))) return json(res, 405, { ok: false, message: "Method not allowed" });
  if (!(await isAuthorized(req, res))) return;

  const startedAt = new Date().toISOString();
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from("marketing_market_profiles")
      .select("id,provider,handle,display_name,profile_url,profile_type,segment,active,metadata")
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const activeProfiles = (profiles || []) as MarketProfile[];
    if (!activeProfiles.length) return json(res, 200, { ok: true, profiles: 0, observations: 0, pulses: 0, message: "Nenhum perfil ativo no Radar." });

    let metaContext: Awaited<ReturnType<typeof loadMetaDiscoveryContext>> | null = null;
    const results: any[] = [];
    let observationCount = 0;

    for (const profile of activeProfiles) {
      try {
        if (profile.provider !== "instagram") throw new Error(`Coleta automática para ${profile.provider} ainda não está habilitada.`);
        if (!metaContext) metaContext = await loadMetaDiscoveryContext();
        const collected = await collectInstagram(profile, metaContext, startedAt);
        if (collected.observations.length) {
          const { error: insertError } = await supabaseAdmin.from("marketing_market_observations").insert(collected.observations);
          if (insertError) throw insertError;
          observationCount += collected.observations.length;
        }
        await saveProfileSync(profile, {
          radar_last_sync_at: startedAt,
          radar_last_status: "ok",
          radar_last_error: null,
          radar_resolved_username: collected.username,
          radar_followers_snapshot: collected.followers,
          radar_profile_media_count: collected.mediaCount,
          radar_posts_collected: collected.observations.length,
          radar_source: metaContext.source,
        });
        results.push({ id: profile.id, provider: profile.provider, handle: profile.handle, resolved_username: collected.username, ok: true, posts: collected.observations.length });
      } catch (profileError: any) {
        const message = String(profileError?.data?.error?.message || profileError?.message || "Falha na coleta do perfil.").slice(0, 500);
        await saveProfileSync(profile, { radar_last_sync_at: startedAt, radar_last_status: "error", radar_last_error: message });
        results.push({ id: profile.id, provider: profile.provider, handle: profile.handle, ok: false, error: message });
      }
    }

    const successfulProviders = Array.from(new Set(results.filter((item) => item.ok).map((item) => item.provider))).filter((provider) => ["instagram", "facebook", "tiktok", "linkedin", "youtube"].includes(provider));
    const pulses = successfulProviders.length ? await rebuildPulse(successfulProviders, startedAt) : [];

    return json(res, 200, {
      ok: true,
      started_at: startedAt,
      profiles: activeProfiles.length,
      successful_profiles: results.filter((item) => item.ok).length,
      failed_profiles: results.filter((item) => !item.ok).length,
      observations: observationCount,
      pulses: pulses.length,
      results,
    });
  } catch (error: any) {
    console.error("[radar-run]", error?.data || error);
    return json(res, Number(error?.status || 500), { ok: false, message: error?.data?.error?.message || error?.message || "Falha ao executar o Radar de Mercado." });
  }
}
