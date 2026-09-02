import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NO_CAPTION_FORMATS = new Set(["stories", "story", "status"]);

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const { user } = await getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (error || data?.role !== "admin") {
    json(res, 403, { ok: false, message: "A Central de Conteúdo está restrita a administradores." });
    return null;
  }
  return user;
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Resposta da IA não contém JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function channelGuidance(provider: string, format: string) {
  const key = `${provider}:${format}`.toLowerCase();
  if (key.includes("instagram:reel")) return "Legenda de Reel: complemente o vídeo sem repetir o roteiro. Abertura curta, contexto útil, CTA natural e 3 a 8 hashtags relevantes.";
  if (key.includes("instagram:carrossel")) return "Legenda de carrossel: amplie a tese, não transcreva os cards. Use parágrafos curtos, fechamento com CTA e 3 a 8 hashtags relevantes.";
  if (key.includes("instagram:post")) return "Legenda de post: direta, elegante e contextual. Explique o insight sem duplicar o texto da arte e encerre com CTA coerente.";
  if (key.includes("tiktok:")) return "Legenda curta e nativa para TikTok, com linguagem natural, CTA simples e poucas hashtags realmente pertinentes.";
  if (key.includes("youtube:short")) return "Descrição curta de YouTube Short, contextualizando o tema e com CTA discreto. Evite excesso de hashtags.";
  if (key.includes("youtube:youtube_long") || key.includes("youtube:video")) return "Descrição de YouTube com resumo útil, contexto, CTA e organização em parágrafos. Não invente links nem dados.";
  if (key.includes("linkedin:post")) return "Texto de LinkedIn profissional e humano, com abertura forte, desenvolvimento em parágrafos curtos, insight prático e CTA para conversa. Use no máximo 3 hashtags.";
  if (key.includes("linkedin:artigo")) return "Texto de apoio para artigo no LinkedIn: síntese executiva que convide à leitura, sem repetir o artigo inteiro. Use no máximo 3 hashtags.";
  return "Crie uma legenda nativa para o canal e formato, útil, clara, profissional e coerente com o conteúdo.";
}

async function callOpenAI(system: string, user: string) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada na Vercel.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 600)}`);
  const payload = await response.json();
  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer) throw new Error("A IA não retornou uma legenda.");
  return parseJsonObject(String(answer));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const orderId = String(req.body?.production_order_id || "").trim();
    const instructions = String(req.body?.instructions || "").trim().slice(0, 3000);
    if (!orderId) return json(res, 400, { ok: false, message: "production_order_id é obrigatório." });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("marketing_production_orders")
      .select("id,content_id,variant_id,provider,format,title")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.variant_id) throw new Error("Esta ordem não está vinculada a uma versão editorial.");

    const format = String(order.format || "").toLowerCase();
    const required = !NO_CAPTION_FORMATS.has(format);
    if (!required) {
      return json(res, 200, { ok: true, required: false, caption: null, hashtags: [], message: "Este formato não precisa de legenda externa." });
    }

    const [contentRes, variantRes, settingsRes] = await Promise.all([
      supabaseAdmin.from("marketing_content_items").select("title,theme,thesis,objective,audience,segment,content_pillar,cta,head_recommendation").eq("id", order.content_id).maybeSingle(),
      supabaseAdmin.from("marketing_content_variants").select("id,title,hook,body,caption,script,cta,hashtags,creative_brief,ai_generation_metadata").eq("id", order.variant_id).maybeSingle(),
      supabaseAdmin.from("marketing_content_settings").select("setting_type,name,payload").eq("active", true).order("setting_type"),
    ]);
    if (contentRes.error) throw contentRes.error;
    if (variantRes.error) throw variantRes.error;
    const content = contentRes.data || {};
    const variant = variantRes.data || {};
    const settings = settingsRes.data || [];

    const system = `Você é o Max Content, redator e estrategista de conteúdo da Consulmax Consórcios.\n\nRegras obrigatórias:\n- Escreva sempre em português do Brasil.\n- A legenda deve ser nativa para a plataforma e o formato.\n- Não repita literalmente o texto da arte ou do roteiro; complemente a peça.\n- Posicionamento premium, consultivo, moderno, claro e profissional.\n- Não invente números, taxas, resultados, garantias, contemplação, rentabilidade ou economia.\n- Não use sensacionalismo.\n- CTA deve ser natural e coerente com o objetivo.\n- Hashtags devem ser específicas e moderadas, nunca genéricas em excesso.\n- Responda apenas JSON válido no formato {"caption":"...","hashtags":["..."]}.\n\nCONFIGURAÇÕES EDITORIAIS ATIVAS:\n${JSON.stringify(settings).slice(0, 16000)}`;

    const result = await callOpenAI(system, `Gere a legenda final desta publicação.\n\nCANAL: ${order.provider}\nFORMATO: ${order.format}\nREGRA DO CANAL: ${channelGuidance(String(order.provider), format)}\n\nCONTEÚDO-MÃE:\n${JSON.stringify(content)}\n\nVERSÃO EDITORIAL:\n${JSON.stringify({ title: variant.title, hook: variant.hook, body: variant.body, script: variant.script, cta: variant.cta, creative_brief: variant.creative_brief })}\n\nINSTRUÇÕES ADICIONAIS:\n${instructions || "Nenhuma."}`);

    const caption = String(result?.caption || "").trim().slice(0, 8000);
    if (!caption) throw new Error("A IA retornou uma legenda vazia.");
    const hashtags = Array.isArray(result?.hashtags)
      ? result.hashtags.map((tag: any) => String(tag).trim().replace(/^#+/, "")).filter(Boolean).slice(0, 12)
      : [];

    const metadata = {
      ...(variant.ai_generation_metadata || {}),
      caption_generated_at: new Date().toISOString(),
      caption_generator: "max_caption_v1",
      caption_provider: order.provider,
      caption_format: order.format,
    };
    const { error: updateError } = await supabaseAdmin
      .from("marketing_content_variants")
      .update({ caption, hashtags, ai_generation_metadata: metadata })
      .eq("id", order.variant_id);
    if (updateError) throw updateError;

    return json(res, 200, { ok: true, required: true, caption, hashtags, variant_id: order.variant_id });
  } catch (error: any) {
    console.error("[marketing-caption]", error);
    return json(res, 500, { ok: false, message: "Não foi possível gerar a legenda agora.", detail: String(error?.message || error).slice(0, 700) });
  }
}
